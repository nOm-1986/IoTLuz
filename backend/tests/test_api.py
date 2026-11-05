"""Endpoints: autenticación, validación, órdenes y consultas."""

import csv
import io

import jwt
import pytest

from app.config import EJEMPLO_ADMIN_PASSWORD, EJEMPLO_JWT_SECRET, Settings, verificar_secretos

from .conftest import BASE, conectar, publicar_todo

PROTEGIDOS = [
    ("get", "/api/estado", None),
    ("get", "/api/lecturas", None),
    ("get", "/api/lecturas.csv", None),
    ("get", "/api/eventos", None),
    ("post", "/api/orden", {"modo": "ON"}),
    ("post", "/api/umbral", {"valor": 10}),
    ("post", "/api/tiempo", {"segundos": 10}),
]


# ------------------------------------------------------------ autenticación
def test_salud_es_publica(client):
    r = client.get("/api/salud")
    assert r.status_code == 200
    assert r.json() == {"api": "ok", "base_datos": "ok", "mqtt_conectado": False}


@pytest.mark.parametrize(("metodo", "ruta", "cuerpo"), PROTEGIDOS)
def test_sin_token_401(client, metodo, ruta, cuerpo):
    r = client.request(metodo, ruta, json=cuerpo)
    assert r.status_code == 401


@pytest.mark.parametrize(("metodo", "ruta", "cuerpo"), PROTEGIDOS)
def test_token_invalido_401(client, metodo, ruta, cuerpo):
    malo = jwt.encode({"sub": "admin", "exp": 9999999999}, "otro-secreto-" * 4, algorithm="HS256")
    r = client.request(metodo, ruta, json=cuerpo, headers={"Authorization": f"Bearer {malo}"})
    assert r.status_code == 401


def test_token_expirado_401(client, settings):
    viejo = jwt.encode({"sub": "admin", "exp": 1}, settings.jwt_secret, algorithm="HS256")
    r = client.get("/api/estado", headers={"Authorization": f"Bearer {viejo}"})
    assert r.status_code == 401
    assert r.json()["detail"] == "Token expirado"


def test_login_correcto_e_incorrecto(client):
    assert client.post("/api/login", json={"usuario": "admin", "clave": "mal"}).status_code == 401
    assert client.post("/api/login", json={"usuario": "otro", "clave": "clave-de-pruebas-larga"}).status_code == 401
    r = client.post("/api/login", json={"usuario": "admin", "clave": "clave-de-pruebas-larga"})
    assert r.status_code == 200 and r.json()["token"]


def test_login_rate_limit(client):
    for _ in range(5):
        assert client.post("/api/login", json={"usuario": "admin", "clave": "mal"}).status_code == 401
    r = client.post("/api/login", json={"usuario": "admin", "clave": "clave-de-pruebas-larga"})
    assert r.status_code == 429
    assert int(r.headers["Retry-After"]) > 0


def test_secretos_de_ejemplo_bloquean_produccion(caplog):
    base = dict(_env_file=None, database_url="sqlite+pysqlite://")
    ejemplo = dict(base, jwt_secret=EJEMPLO_JWT_SECRET, admin_password=EJEMPLO_ADMIN_PASSWORD)
    verificar_secretos(Settings(**ejemplo, env="development"))  # solo avisa
    assert "INSEGURO" in caplog.text
    with pytest.raises(RuntimeError):
        verificar_secretos(Settings(**ejemplo, env="production"))
    with pytest.raises(RuntimeError):  # demasiado cortos
        verificar_secretos(Settings(**base, env="production", jwt_secret="corto", admin_password="corta"))
    verificar_secretos(Settings(**base, env="production", jwt_secret="x" * 40, admin_password="y" * 16))


# --------------------------------------------------------------- validación
@pytest.mark.parametrize(
    ("ruta", "cuerpo"),
    [
        ("/api/orden", {"modo": "on"}),
        ("/api/orden", {"modo": "TOGGLE"}),
        ("/api/orden", {}),
        ("/api/umbral", {"valor": 0}),
        ("/api/umbral", {"valor": 1024}),
        ("/api/umbral", {"valor": "500"}),
        ("/api/umbral", {"valor": 5.5}),
        ("/api/tiempo", {"segundos": 0}),
        ("/api/tiempo", {"segundos": 3601}),
        ("/api/tiempo", {"segundos": 10, "extra": 1}),
    ],
)
def test_validacion_422(client, headers, app, ruta, cuerpo):
    conectar(app.state.servicio)
    assert client.post(ruta, json=cuerpo, headers=headers).status_code == 422
    assert app.state.servicio._cliente.publicados == []


@pytest.mark.parametrize(
    ("ruta", "cuerpo"),
    [("/api/orden", {"modo": "ON"}), ("/api/umbral", {"valor": 500}), ("/api/tiempo", {"segundos": 30})],
)
def test_orden_sin_broker_503(client, headers, ruta, cuerpo):
    assert client.post(ruta, json=cuerpo, headers=headers).status_code == 503


@pytest.mark.parametrize(
    ("ruta", "cuerpo", "tema", "payload"),
    [
        ("/api/orden", {"modo": "AUTO"}, "modo/set", "AUTO"),
        ("/api/umbral", {"valor": 1}, "umbral/set", "1"),
        ("/api/umbral", {"valor": 1023}, "umbral/set", "1023"),
        ("/api/tiempo", {"segundos": 3600}, "tiempo/set", "3600"),
    ],
)
def test_ordenes_publican(client, headers, app, ruta, cuerpo, tema, payload):
    conectar(app.state.servicio)
    r = client.post(ruta, json=cuerpo, headers=headers)
    assert r.status_code == 200
    assert app.state.servicio._cliente.publicados == [(BASE + tema, payload, 1, False)]


def test_publicacion_fallida_503(client, headers, app):
    conectar(app.state.servicio)
    app.state.servicio._cliente.rc_publicar = 4
    assert client.post("/api/orden", json={"modo": "ON"}, headers=headers).status_code == 503


# ---------------------------------------------------------------- consultas
def test_estado(client, headers, app):
    srv = app.state.servicio
    conectar(srv)
    publicar_todo(srv, retenido=False)
    r = client.get("/api/estado", headers=headers).json()
    assert r["mqtt_conectado"] is True
    assert r["arduino_en_linea"] is True
    assert r["ultima_actualizacion"]
    assert r["snapshot"]["luz"] == 512


def test_lecturas_eventos_y_csv(client, headers, app):
    srv = app.state.servicio
    publicar_todo(srv, retenido=False, ldr="100")
    srv.guardar_lectura_si_procede()
    srv.procesar_mensaje("ldr", "200", retenido=False)
    srv.procesar_mensaje("estado", "ON", retenido=False)
    srv.guardar_lectura_si_procede()

    lect = client.get("/api/lecturas?minutos=30&limite=10", headers=headers).json()
    assert [l["luz"] for l in lect] == [100, 200]  # orden ascendente
    assert lect[0]["ts"].endswith("+00:00")
    assert client.get("/api/lecturas?limite=1", headers=headers).json()[0]["luz"] == 200
    assert client.get("/api/lecturas?minutos=0", headers=headers).status_code == 422

    ev = client.get("/api/eventos?limite=5", headers=headers).json()
    assert [(e["tipo"], e["valor"]) for e in ev] == [("estado", "ON"), ("conexion", "en_linea")]

    r = client.get("/api/lecturas.csv", headers=headers)
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("text/csv")
    assert "attachment" in r.headers["content-disposition"]
    filas = list(csv.reader(io.StringIO(r.text)))
    assert filas[0] == ["id", "ts", "luz", "pir", "estado", "modo", "umbral", "tiempo_s", "minutos", "energia_wh"]
    assert [f[2] for f in filas[1:]] == ["100", "200"]


def test_cors(client):
    r = client.options(
        "/api/estado",
        headers={"Origin": "http://localhost:5173", "Access-Control-Request-Method": "GET"},
    )
    assert r.headers.get("access-control-allow-origin") == "http://localhost:5173"
    r = client.options(
        "/api/estado",
        headers={"Origin": "http://malicioso.example", "Access-Control-Request-Method": "GET"},
    )
    assert "access-control-allow-origin" not in r.headers

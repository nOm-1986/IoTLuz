"""WebSocket: autenticación por primer mensaje, snapshot inicial y difusión desde el hilo MQTT."""

import contextlib
import threading
import time

import jwt
import pytest
from starlette.websockets import WebSocketDisconnect

from app.ws import CIERRE_TOKEN_EXPIRADO, CIERRE_TOKEN_INVALIDO

from .conftest import conectar


def _token(headers):
    return headers["Authorization"].split()[1]


@contextlib.contextmanager
def abrir(client, token):
    """Abre /ws y se autentica enviando el token como primer mensaje (como hace el navegador)."""
    with client.websocket_connect("/ws") as ws:
        ws.send_json({"token": token})
        yield ws


def _codigo_de_cierre(ws) -> int:
    with pytest.raises(WebSocketDisconnect) as e:
        ws.receive_json()
    return e.value.code


@pytest.fixture
def espera_corta(app):
    app.state.difusor.espera_auth_s = 0.2


@pytest.mark.parametrize(
    "primer_mensaje",
    [{}, {"token": None}, {"token": 123}, {"token": "basura"}, ["no", "es", "un", "objeto"]],
)
def test_ws_token_ausente_o_invalido_cierra_4401(client, primer_mensaje):
    with client.websocket_connect("/ws") as ws:
        ws.send_json(primer_mensaje)
        assert _codigo_de_cierre(ws) == CIERRE_TOKEN_INVALIDO


def test_ws_primer_mensaje_no_json_cierra_4401(client):
    with client.websocket_connect("/ws") as ws:
        ws.send_text("esto no es json")
        assert _codigo_de_cierre(ws) == CIERRE_TOKEN_INVALIDO


def test_ws_sin_mensaje_cierra_4401_al_agotar_la_espera(client, espera_corta):
    with client.websocket_connect("/ws") as ws:
        assert _codigo_de_cierre(ws) == CIERRE_TOKEN_INVALIDO


def test_ws_token_en_la_url_no_sirve(client, headers, espera_corta):
    # El token ya no se acepta en la URL (se filtraba a los logs).
    with client.websocket_connect(f"/ws?token={_token(headers)}") as ws:
        assert _codigo_de_cierre(ws) == CIERRE_TOKEN_INVALIDO


def test_ws_token_expirado_cierra_4402(client, settings):
    viejo = jwt.encode({"sub": "admin", "exp": 1}, settings.jwt_secret, algorithm="HS256")
    with abrir(client, viejo) as ws:
        assert _codigo_de_cierre(ws) == CIERRE_TOKEN_EXPIRADO


def test_ws_usuario_desconocido_cierra_4401(client, settings):
    otro = jwt.encode({"sub": "intruso", "exp": int(time.time()) + 60}, settings.jwt_secret, algorithm="HS256")
    with abrir(client, otro) as ws:
        assert _codigo_de_cierre(ws) == CIERRE_TOKEN_INVALIDO


def test_ws_snapshot_inicial_y_cambios_desde_otro_hilo(client, headers, app):
    srv = app.state.servicio
    srv.procesar_mensaje("ldr", "100", retenido=True)
    with abrir(client, _token(headers)) as ws:
        inicial = ws.receive_json()
        assert inicial["snapshot"]["luz"] == 100
        assert inicial["arduino_en_linea"] is False
        assert set(inicial) == {"snapshot", "mqtt_conectado", "arduino_en_linea", "ultima_actualizacion"}

        # Simula el hilo de paho: el cambio debe llegar al navegador.
        hilo = threading.Thread(target=srv.procesar_mensaje, args=("ldr", "321", False))
        hilo.start()
        hilo.join()
        msg = ws.receive_json()
        assert msg["snapshot"]["luz"] == 321
        assert msg["arduino_en_linea"] is True


def test_ws_notifica_conexion_al_broker(client, headers, app):
    with abrir(client, _token(headers)) as ws:
        assert ws.receive_json()["mqtt_conectado"] is False
        threading.Thread(target=conectar, args=(app.state.servicio,)).start()
        assert ws.receive_json()["mqtt_conectado"] is True


def test_ws_se_cierra_al_caducar_el_token(client, settings):
    corto = jwt.encode({"sub": "admin", "exp": int(time.time()) + 2}, settings.jwt_secret, algorithm="HS256")
    with abrir(client, corto) as ws:
        ws.receive_json()
        assert _codigo_de_cierre(ws) == CIERRE_TOKEN_EXPIRADO


def test_ws_varios_clientes(client, headers, app):
    tok = _token(headers)
    with abrir(client, tok) as a, abrir(client, tok) as b:
        a.receive_json()
        b.receive_json()
        for _ in range(50):  # esperar a que ambos estén registrados
            if app.state.difusor.num_clientes == 2:
                break
            time.sleep(0.01)
        app.state.servicio.procesar_mensaje("pir", "1", retenido=False)
        assert a.receive_json()["snapshot"]["pir"] is True
        assert b.receive_json()["snapshot"]["pir"] is True

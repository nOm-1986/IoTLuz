"""WebSocket: autenticación, snapshot inicial y difusión desde el hilo MQTT."""

import threading
import time

import jwt
import pytest
from starlette.websockets import WebSocketDisconnect

from .conftest import conectar


def _token(headers):
    return headers["Authorization"].split()[1]


def test_ws_sin_token_rechazado(client):
    with pytest.raises(WebSocketDisconnect) as e, client.websocket_connect("/ws"):
        pass
    assert e.value.code == 4401


def test_ws_token_invalido_rechazado(client):
    with pytest.raises(WebSocketDisconnect), client.websocket_connect("/ws?token=basura"):
        pass


def test_ws_token_expirado_rechazado(client, settings):
    viejo = jwt.encode({"sub": "admin", "exp": 1}, settings.jwt_secret, algorithm="HS256")
    with pytest.raises(WebSocketDisconnect), client.websocket_connect(f"/ws?token={viejo}"):
        pass


def test_ws_snapshot_inicial_y_cambios_desde_otro_hilo(client, headers, app):
    srv = app.state.servicio
    srv.procesar_mensaje("ldr", "100", retenido=True)
    with client.websocket_connect(f"/ws?token={_token(headers)}") as ws:
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
    with client.websocket_connect(f"/ws?token={_token(headers)}") as ws:
        assert ws.receive_json()["mqtt_conectado"] is False
        threading.Thread(target=conectar, args=(app.state.servicio,)).start()
        assert ws.receive_json()["mqtt_conectado"] is True


def test_ws_se_cierra_al_caducar_el_token(client, settings):
    corto = jwt.encode({"sub": "admin", "exp": int(time.time()) + 2}, settings.jwt_secret, algorithm="HS256")
    with client.websocket_connect(f"/ws?token={corto}") as ws:
        ws.receive_json()
        with pytest.raises(WebSocketDisconnect) as e:
            ws.receive_json()
        assert e.value.code == 4402


def test_ws_varios_clientes(client, headers, app):
    tok = _token(headers)
    with client.websocket_connect(f"/ws?token={tok}") as a, client.websocket_connect(f"/ws?token={tok}") as b:
        a.receive_json()
        b.receive_json()
        for _ in range(50):  # esperar a que ambos estén registrados
            if app.state.difusor.num_clientes == 2:
                break
            time.sleep(0.01)
        app.state.servicio.procesar_mensaje("pir", "1", retenido=False)
        assert a.receive_json()["snapshot"]["pir"] is True
        assert b.receive_json()["snapshot"]["pir"] is True

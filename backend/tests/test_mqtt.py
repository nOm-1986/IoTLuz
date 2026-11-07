"""Parseo de mensajes MQTT, retenidos, en línea y persistencia de lecturas y eventos."""

from sqlalchemy import select

from app.estado import Snapshot
from app.models import Evento, Lectura

from .conftest import BASE, FALLO, VALORES_COMPLETOS, conectar, publicar_todo


def _eventos(servicio):
    with servicio.sesiones() as ses:
        return [(e.tipo, e.valor) for e in ses.scalars(select(Evento).order_by(Evento.id))]


def _lecturas(servicio):
    with servicio.sesiones() as ses:
        return list(ses.scalars(select(Lectura)))


# ------------------------------------------------------------------ parseo
def test_parseo_de_los_8_temas(servicio):
    publicar_todo(servicio, retenido=False, pir="1", estado=" on ")
    assert servicio.snapshot.valores() == {
        "estado": "ON",
        "modo": "AUTO",
        "luz": 512,
        "pir": True,
        "umbral": 300,
        "tiempo_s": 60,
        "minutos": 12.5,
        "energia_wh": 1.75,
    }
    assert servicio.snapshot.completo()


def test_valores_invalidos_se_ignoran(reloj):
    snap = Snapshot()
    for tema, valor in [
        ("estado", "QUIZA"), ("modo", "MEDIO"), ("ldr", "1024"), ("ldr", "-1"), ("ldr", "abc"),
        ("pir", "2"), ("umbral", "0"), ("umbral", "1024"), ("minutos", "-3"), ("energia_wh", "nan"),
        ("desconocido", "1"), ("modo/set", "ON"),
    ]:
        assert snap.procesar(tema, valor, False, reloj()) is None, (tema, valor)
    assert all(v is None for v in snap.valores().values())


def test_mensaje_desde_paho_con_prefijo(servicio):
    from types import SimpleNamespace

    msg = SimpleNamespace(topic=BASE + "ldr", payload=b"77", retain=False)
    servicio._on_message(None, None, msg)
    otro = SimpleNamespace(topic="otro/prefijo/ldr", payload=b"5", retain=False)
    servicio._on_message(None, None, otro)
    assert servicio.snapshot.valores()["luz"] == 77


def test_suscripcion_solo_a_los_8_temas(servicio):
    conectar(servicio)
    temas = [t for t, _ in servicio._cliente.suscripciones]
    assert sorted(temas) == sorted(BASE + t for t in VALORES_COMPLETOS)
    assert not any(t.endswith("#") or t.endswith("/set") for t in temas)
    assert servicio.conectado


def test_conexion_rechazada_no_marca_conectado(servicio):
    servicio._on_connect(servicio._cliente, None, None, FALLO)
    assert not servicio.conectado
    assert servicio._cliente.suscripciones == []


def test_desconexion(servicio):
    conectar(servicio)
    servicio._on_disconnect(servicio._cliente, None, None, FALLO)
    assert not servicio.conectado


# --------------------------------------------------------------- retenidos
def test_retenidos_actualizan_pero_no_ponen_en_linea(servicio):
    publicar_todo(servicio, retenido=True)
    assert servicio.snapshot.completo()
    assert not servicio.arduino_en_linea()
    assert servicio.estado_actual()["ultima_actualizacion"] is None
    assert _eventos(servicio) == []


def test_en_linea_y_timeout(servicio, reloj):
    servicio.procesar_mensaje("ldr", "100", retenido=False)
    assert servicio.arduino_en_linea()
    reloj.avanzar(60)
    assert servicio.arduino_en_linea()
    reloj.avanzar(1)
    assert not servicio.arduino_en_linea()


# ----------------------------------------------------------------- eventos
def test_eventos_de_estado_y_modo(servicio):
    publicar_todo(servicio, retenido=True)  # carga inicial: sin eventos
    servicio.procesar_mensaje("estado", "OFF", retenido=False)  # igual: sin evento
    servicio.procesar_mensaje("estado", "ON", retenido=False)
    servicio.procesar_mensaje("modo", "ON", retenido=False)
    servicio.procesar_mensaje("ldr", "10", retenido=False)  # otros temas no generan eventos
    assert _eventos(servicio) == [("conexion", "en_linea"), ("estado", "ON"), ("modo", "ON")]


def test_cambio_retenido_no_genera_evento(servicio):
    servicio.procesar_mensaje("estado", "OFF", retenido=True)
    servicio.procesar_mensaje("estado", "ON", retenido=True)
    assert _eventos(servicio) == []


def test_eventos_de_conexion(servicio, reloj):
    servicio.procesar_mensaje("ldr", "10", retenido=False)
    reloj.avanzar(61)
    assert servicio.revisar_conexion_arduino() is True
    assert servicio.revisar_conexion_arduino() is False  # sin transición nueva
    servicio.procesar_mensaje("ldr", "11", retenido=False)
    assert _eventos(servicio) == [
        ("conexion", "en_linea"),
        ("conexion", "fuera_de_linea"),
        ("conexion", "en_linea"),
    ]


# ---------------------------------------------------------------- lecturas
def test_no_guarda_si_fuera_de_linea(servicio):
    publicar_todo(servicio, retenido=True)
    assert servicio.guardar_lectura_si_procede() is False
    assert _lecturas(servicio) == []


def test_no_guarda_si_snapshot_incompleto(servicio, caplog):
    servicio.procesar_mensaje("ldr", "10", retenido=False)
    with caplog.at_level("DEBUG", logger="iotluz.mqtt"):
        assert servicio.guardar_lectura_si_procede() is False
    assert _lecturas(servicio) == []
    # Lo descarta la comprobación, no un INSERT fallido por columnas NULL.
    assert "snapshot incompleto" in caplog.text
    assert "Error de base de datos" not in caplog.text


def test_guarda_lectura_completa_en_linea(servicio, reloj):
    publicar_todo(servicio, retenido=False, pir="1")
    assert servicio.guardar_lectura_si_procede() is True
    [l] = _lecturas(servicio)
    assert (l.luz, l.pir, l.estado, l.modo, l.umbral, l.tiempo_s, l.minutos, l.energia_wh) == (
        512, True, "OFF", "AUTO", 300, 60, 12.5, 1.75,
    )


def test_notifica_a_los_oyentes(servicio):
    recibidos = []
    servicio.suscribir_cambios(recibidos.append)
    servicio.procesar_mensaje("ldr", "42", retenido=False)
    assert recibidos[-1]["snapshot"]["luz"] == 42
    assert recibidos[-1]["arduino_en_linea"] is True

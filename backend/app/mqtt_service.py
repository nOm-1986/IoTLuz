"""Servicio MQTT (paho-mqtt v2 en su propio hilo) + persistencia periódica."""

from __future__ import annotations

import logging
import ssl
import threading
import time
from collections.abc import Callable
from datetime import UTC, datetime
from typing import Any

import paho.mqtt.client as mqtt
from paho.mqtt.enums import CallbackAPIVersion
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session, sessionmaker

from .config import Settings
from .estado import TEMAS, Snapshot
from .models import Evento, Lectura

log = logging.getLogger("iotluz.mqtt")

# Temas a los que se suscribe el Arduino (el backend publica aquí).
SUBTEMA_ORDEN = {"modo": "modo/set", "umbral": "umbral/set", "tiempo": "tiempo/set"}


class MqttNoConectado(Exception):
    """Se intentó publicar sin conexión con el broker."""


def _ahora() -> datetime:
    return datetime.now(UTC)


class ServicioMqtt:
    def __init__(
        self,
        settings: Settings,
        sesiones: sessionmaker[Session],
        cliente_factory: Callable[[], Any] | None = None,
        reloj: Callable[[], datetime] = _ahora,
    ) -> None:
        self.s = settings
        self.sesiones = sesiones
        self.reloj = reloj
        self.snapshot = Snapshot()
        self._lock = threading.Lock()
        self._conectado = False
        self._en_linea_anterior = False
        self._oyentes: list[Callable[[dict], None]] = []
        self._parar = threading.Event()
        self._hilo: threading.Thread | None = None
        self._cliente = (cliente_factory or self._crear_cliente_paho)()
        self._cliente.on_connect = self._on_connect
        self._cliente.on_disconnect = self._on_disconnect
        self._cliente.on_message = self._on_message
        self._iniciado_mqtt = False

    # ------------------------------------------------------------------ cliente
    def _crear_cliente_paho(self) -> mqtt.Client:
        c = mqtt.Client(
            callback_api_version=CallbackAPIVersion.VERSION2,
            client_id=self.s.mqtt_client_id or "",
            protocol=mqtt.MQTTv311,
        )
        if self.s.mqtt_user:
            c.username_pw_set(self.s.mqtt_user, self.s.mqtt_pass)
        if self.s.mqtt_tls:
            # Verifica el certificado del broker con las CA del sistema.
            c.tls_set_context(ssl.create_default_context())
        c.reconnect_delay_set(min_delay=1, max_delay=60)
        return c

    @property
    def temas_suscritos(self) -> list[str]:
        return [self.s.mqtt_base + t for t in TEMAS]

    @property
    def conectado(self) -> bool:
        with self._lock:
            return self._conectado

    def iniciar(self) -> None:
        if self.s.mqtt_host and self.s.mqtt_base:
            log.info(
                "Conectando al broker %s:%s (TLS=%s) con prefijo '%s'...",
                self.s.mqtt_host, self.s.mqtt_port, self.s.mqtt_tls, self.s.mqtt_base,
            )
            # connect_async + loop_start: si el broker no responde, el hilo de paho reintenta solo.
            self._cliente.connect_async(self.s.mqtt_host, self.s.mqtt_port, keepalive=60)
            self._cliente.loop_start()
            self._iniciado_mqtt = True
        else:
            log.warning("MQTT_HOST o MQTT_BASE vacíos: el servicio MQTT no se conectará.")
        self._parar.clear()
        self._hilo = threading.Thread(target=self._bucle_periodico, name="guardado-lecturas", daemon=True)
        self._hilo.start()

    def detener(self) -> None:
        self._parar.set()
        if self._iniciado_mqtt:
            try:
                self._cliente.disconnect()
            finally:
                self._cliente.loop_stop()
        if self._hilo:
            self._hilo.join(timeout=5)

    # ---------------------------------------------------------------- callbacks
    def _on_connect(self, client, userdata, flags, reason_code, properties=None) -> None:
        if reason_code.is_failure:
            log.error("El broker rechazó la conexión: %s (revisa MQTT_USER/MQTT_PASS)", reason_code)
            return
        with self._lock:
            self._conectado = True
        temas = self.temas_suscritos
        client.subscribe([(t, 1) for t in temas])
        log.info("Conectado al broker MQTT. Suscrito a %d temas bajo '%s'.", len(temas), self.s.mqtt_base)
        self._notificar()

    def _on_disconnect(self, client, userdata, flags, reason_code, properties=None) -> None:
        with self._lock:
            estaba_conectado, self._conectado = self._conectado, False
        if not estaba_conectado:  # paho puede avisar más de una vez de la misma caída
            log.debug("Desconexión repetida ignorada (%s).", reason_code)
            return
        if self._parar.is_set():
            log.info("Desconectado del broker MQTT.")
        else:
            log.warning("Conexión con el broker perdida (%s). Reintentando automáticamente...", reason_code)
        self._notificar()

    def _on_message(self, client, userdata, msg) -> None:
        if not msg.topic.startswith(self.s.mqtt_base):
            return
        tema = msg.topic[len(self.s.mqtt_base):]
        texto = msg.payload.decode("utf-8", errors="replace")
        log.debug("MQTT <- %s = %r%s", msg.topic, texto, " (retenido)" if msg.retain else "")
        self.procesar_mensaje(tema, texto, bool(msg.retain))

    # ------------------------------------------------------------------ lógica
    def procesar_mensaje(self, tema: str, texto: str, retenido: bool) -> None:
        res = self.snapshot.procesar(tema, texto, retenido, self.reloj())
        if res is None:
            return
        for tipo, valor in res.eventos:
            self._guardar_evento(tipo, valor)
        self.revisar_conexion_arduino()
        self._notificar()

    def arduino_en_linea(self) -> bool:
        return self.snapshot.en_linea(self.reloj(), self.s.arduino_timeout_s)

    def revisar_conexion_arduino(self) -> bool:
        """Registra un evento si el Arduino pasó de en línea a fuera de línea o viceversa."""
        en_linea = self.arduino_en_linea()
        with self._lock:
            if en_linea == self._en_linea_anterior:
                return False
            self._en_linea_anterior = en_linea
        valor = "en_linea" if en_linea else "fuera_de_linea"
        log.info("Arduino %s.", "EN LÍNEA" if en_linea else "FUERA DE LÍNEA")
        self._guardar_evento("conexion", valor)
        return True

    def guardar_lectura_si_procede(self) -> bool:
        if not self.arduino_en_linea():
            log.debug("Lectura no guardada: Arduino fuera de línea.")
            return False
        if not self.snapshot.completo():
            log.debug("Lectura no guardada: snapshot incompleto.")
            return False
        v = self.snapshot.valores()
        try:
            with self.sesiones.begin() as ses:
                ses.add(Lectura(ts=self.reloj(), **v))
        except SQLAlchemyError as e:
            log.error("Error de base de datos al guardar la lectura: %s", e)
            return False
        log.debug("Lectura guardada: %s", v)
        return True

    def _guardar_evento(self, tipo: str, valor: str) -> None:
        try:
            with self.sesiones.begin() as ses:
                ses.add(Evento(ts=self.reloj(), tipo=tipo, valor=valor))
            log.info("Evento: %s = %s", tipo, valor)
        except SQLAlchemyError as e:
            log.error("Error de base de datos al guardar el evento %s=%s: %s", tipo, valor, e)

    def _bucle_periodico(self) -> None:
        proximo = time.monotonic() + self.s.intervalo_guardado_s
        while not self._parar.wait(1.0):
            try:
                if self.revisar_conexion_arduino():
                    self._notificar()
                if time.monotonic() >= proximo:
                    proximo = time.monotonic() + self.s.intervalo_guardado_s
                    self.guardar_lectura_si_procede()
            except Exception:  # noqa: BLE001 - el hilo no debe morir
                log.exception("Error inesperado en el hilo de guardado")

    # -------------------------------------------------------------- publicación
    def publicar(self, orden: str, valor: str | int) -> str:
        """Publica una orden (retain=False, qos=1). Devuelve el tema usado."""
        if not self.conectado:
            raise MqttNoConectado("Sin conexión con el broker MQTT")
        tema = self.s.mqtt_base + SUBTEMA_ORDEN[orden]
        info = self._cliente.publish(tema, str(valor), qos=1, retain=False)
        if info.rc != mqtt.MQTT_ERR_SUCCESS:
            raise MqttNoConectado(f"No se pudo publicar (rc={info.rc})")
        log.info("MQTT -> %s = %s", tema, valor)
        return tema

    # ---------------------------------------------------------------- estado
    def estado_actual(self) -> dict:
        u = self.snapshot.ultima_actualizacion
        return {
            "snapshot": self.snapshot.valores(),
            "mqtt_conectado": self.conectado,
            "arduino_en_linea": self.arduino_en_linea(),
            "ultima_actualizacion": u.isoformat() if u else None,
        }

    def suscribir_cambios(self, oyente: Callable[[dict], None]) -> None:
        self._oyentes.append(oyente)

    def _notificar(self) -> None:
        if not self._oyentes:
            return
        estado = self.estado_actual()
        for o in list(self._oyentes):
            try:
                o(estado)
            except Exception:  # noqa: BLE001
                log.exception("Error notificando un cambio de estado")

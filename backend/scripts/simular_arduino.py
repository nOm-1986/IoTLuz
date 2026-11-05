"""Simulador del Arduino para pruebas manuales (no necesitas el hardware).

Publica en los 8 temas del Arduino usando las credenciales MQTT del archivo .env, y
responde a las órdenes modo/set, umbral/set y tiempo/set igual que el Arduino real.

Uso (desde la carpeta backend, con el venv activo):
    python scripts/simular_arduino.py                    # cada 5 s, sin retain
    python scripts/simular_arduino.py --intervalo 30 --duracion 120
    python scripts/simular_arduino.py --retain           # como el Arduino real (¡pisa sus retenidos!)

Dentro de Docker:
    docker compose exec backend python scripts/simular_arduino.py --duracion 60

Si el Arduino real está conectado a la vez, ambos responderán a las órdenes.
"""

from __future__ import annotations

import argparse
import logging
import random
import ssl
import sys
import threading
import time
import uuid
from pathlib import Path

import paho.mqtt.client as mqtt
from paho.mqtt.enums import CallbackAPIVersion

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.config import Settings  # noqa: E402

log = logging.getLogger("simulador")
POTENCIA_W = 5.0  # potencia estimada de la tira LED para la energía simulada


class ArduinoSimulado:
    def __init__(self, base: str, retain: bool, responder: bool) -> None:
        self.base = base
        self.retain = retain
        self.responder = responder
        self.lock = threading.Lock()
        self.modo = "AUTO"
        self.estado = "OFF"
        self.ldr = 500
        self.pir = False
        self.umbral = 400
        self.tiempo = 10
        self.minutos = 0.0
        self.ultimo_mov = 0.0
        self.cliente: mqtt.Client | None = None

    # ------------------------------------------------------------ publicación
    def _pub(self, tema: str, valor) -> None:
        assert self.cliente is not None
        self.cliente.publish(self.base + tema, str(valor), qos=1, retain=self.retain)

    def publicar_todo(self) -> None:
        with self.lock:
            datos = {
                "estado": self.estado,
                "modo": self.modo,
                "ldr": self.ldr,
                "pir": "1" if self.pir else "0",
                "umbral": self.umbral,
                "tiempo": self.tiempo,
                "minutos": f"{self.minutos:.2f}",
                "energia_wh": f"{self.minutos / 60 * POTENCIA_W:.3f}",
            }
        for tema, valor in datos.items():
            self._pub(tema, valor)
        log.info("Publicado: %s", datos)

    # --------------------------------------------------------------- lógica
    def _calcular_estado(self, ahora: float) -> str:
        if self.modo != "AUTO":
            return self.modo
        if self.ldr < self.umbral and ahora - self.ultimo_mov <= self.tiempo:
            return "ON"
        return "OFF"

    def paso(self, dt: float) -> bool:
        """Avanza la simulación. Devuelve True si cambió el estado de la luz."""
        ahora = time.monotonic()
        with self.lock:
            self.ldr = max(0, min(1023, self.ldr + random.randint(-60, 60)))
            self.pir = random.random() < 0.3
            if self.pir:
                self.ultimo_mov = ahora
            if self.estado == "ON":
                self.minutos += dt / 60
            nuevo = self._calcular_estado(ahora)
            cambio = nuevo != self.estado
            self.estado = nuevo
        return cambio

    # --------------------------------------------------------------- órdenes
    def on_message(self, client, userdata, msg) -> None:
        orden = msg.topic[len(self.base):]
        valor = msg.payload.decode(errors="replace").strip()
        log.info("Orden recibida: %s = %s", orden, valor)
        with self.lock:
            try:
                if orden == "modo/set" and valor in ("ON", "OFF", "AUTO"):
                    self.modo = valor
                elif orden == "umbral/set" and 1 <= int(valor) <= 1023:
                    self.umbral = int(valor)
                elif orden == "tiempo/set" and 1 <= int(valor) <= 3600:
                    self.tiempo = int(valor)
                else:
                    log.warning("Orden ignorada: %s = %s", orden, valor)
                    return
            except ValueError:
                log.warning("Valor no numérico: %s = %s", orden, valor)
                return
            self.estado = self._calcular_estado(time.monotonic())
        self.publicar_todo()  # el Arduino real confirma al instante

    def on_connect(self, client, userdata, flags, reason_code, properties=None) -> None:
        if reason_code.is_failure:
            log.error("Conexión rechazada: %s", reason_code)
            return
        log.info("Simulador conectado al broker.")
        if self.responder:
            client.subscribe([(self.base + t, 1) for t in ("modo/set", "umbral/set", "tiempo/set")])


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--intervalo", type=float, default=5, help="segundos entre publicaciones (por defecto 5)")
    p.add_argument("--duracion", type=float, default=0, help="segundos a ejecutar; 0 = hasta Ctrl+C")
    p.add_argument("--retain", action="store_true", help="publicar con retain=true como el Arduino real")
    p.add_argument("--no-responder", action="store_true", help="no responder a las órdenes */set")
    args = p.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    s = Settings()  # type: ignore[call-arg]
    if not (s.mqtt_host and s.mqtt_base):
        sys.exit("Faltan MQTT_HOST o MQTT_BASE en el archivo .env")

    sim = ArduinoSimulado(s.mqtt_base, args.retain, not args.no_responder)
    c = mqtt.Client(
        callback_api_version=CallbackAPIVersion.VERSION2,
        client_id=f"simulador-{uuid.uuid4().hex[:8]}",
        protocol=mqtt.MQTTv311,
    )
    if s.mqtt_user:
        c.username_pw_set(s.mqtt_user, s.mqtt_pass)
    if s.mqtt_tls:
        c.tls_set_context(ssl.create_default_context())
    c.on_connect = sim.on_connect
    c.on_message = sim.on_message
    sim.cliente = c
    log.info("Conectando a %s:%s con prefijo '%s'...", s.mqtt_host, s.mqtt_port, s.mqtt_base)
    c.connect(s.mqtt_host, s.mqtt_port, keepalive=60)
    c.loop_start()

    fin = time.monotonic() + args.duracion if args.duracion else float("inf")
    try:
        time.sleep(1)
        sim.publicar_todo()
        while time.monotonic() < fin:
            time.sleep(min(args.intervalo, max(0, fin - time.monotonic())))
            sim.paso(args.intervalo)
            sim.publicar_todo()
    except KeyboardInterrupt:
        pass
    finally:
        c.disconnect()
        c.loop_stop()
        log.info("Simulador detenido.")


if __name__ == "__main__":
    main()

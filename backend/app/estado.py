"""Snapshot en memoria del último valor de cada tema MQTT (sin dependencias de red)."""

from __future__ import annotations

import logging
import threading
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

log = logging.getLogger("iotluz.estado")


def _enum(*validos: str) -> Callable[[str], str]:
    def conv(t: str) -> str:
        v = t.strip().upper()
        if v not in validos:
            raise ValueError(f"se esperaba uno de {validos}")
        return v

    return conv


def _entero(minimo: int, maximo: int | None = None) -> Callable[[str], int]:
    def conv(t: str) -> int:
        v = int(t.strip())
        if v < minimo or (maximo is not None and v > maximo):
            raise ValueError(f"fuera de rango [{minimo}, {maximo}]")
        return v

    return conv


def _decimal_no_negativo(t: str) -> float:
    v = float(t.strip())
    if v != v or v < 0 or v == float("inf"):  # NaN, negativo o infinito
        raise ValueError("debe ser un número >= 0")
    return v


def _pir(t: str) -> bool:
    v = t.strip()
    if v not in ("0", "1"):
        raise ValueError("se esperaba '0' o '1'")
    return v == "1"


# tema relativo -> (clave del snapshot, conversor que lanza ValueError si el valor no es válido)
TEMAS: dict[str, tuple[str, Callable[[str], Any]]] = {
    "estado": ("estado", _enum("ON", "OFF")),
    "modo": ("modo", _enum("AUTO", "ON", "OFF")),
    "ldr": ("luz", _entero(0, 1023)),
    "pir": ("pir", _pir),
    "umbral": ("umbral", _entero(1, 1023)),
    "tiempo": ("tiempo_s", _entero(0)),
    "minutos": ("minutos", _decimal_no_negativo),
    "energia_wh": ("energia_wh", _decimal_no_negativo),
}
CLAVES = [clave for clave, _ in TEMAS.values()]
TEMAS_CON_EVENTO = ("estado", "modo")


@dataclass
class Resultado:
    clave: str
    valor: Any
    eventos: list[tuple[str, str]] = field(default_factory=list)


class Snapshot:
    """Último valor conocido de cada tema. Seguro para usar desde varios hilos."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._valores: dict[str, Any] = dict.fromkeys(CLAVES)
        self._ultimo_vivo: datetime | None = None

    def procesar(self, tema: str, texto: str, retenido: bool, ahora: datetime) -> Resultado | None:
        """Aplica un mensaje. Devuelve None si el tema o el valor no son válidos."""
        if tema not in TEMAS:
            log.debug("Tema ignorado: %s", tema)
            return None
        clave, conv = TEMAS[tema]
        try:
            valor = conv(texto)
        except (ValueError, TypeError) as e:
            log.warning("Valor inválido en '%s': %r (%s)", tema, texto, e)
            return None

        with self._lock:
            anterior = self._valores[clave]
            self._valores[clave] = valor
            if not retenido:
                self._ultimo_vivo = ahora

        res = Resultado(clave=clave, valor=valor)
        # Solo cambios "en vivo" respecto a un valor anterior conocido generan evento.
        if tema in TEMAS_CON_EVENTO and not retenido and anterior is not None and anterior != valor:
            res.eventos.append((tema, valor))
        return res

    def en_linea(self, ahora: datetime, timeout_s: float) -> bool:
        with self._lock:
            u = self._ultimo_vivo
        return u is not None and (ahora - u).total_seconds() <= timeout_s

    @property
    def ultima_actualizacion(self) -> datetime | None:
        with self._lock:
            return self._ultimo_vivo

    def completo(self) -> bool:
        with self._lock:
            return all(v is not None for v in self._valores.values())

    def valores(self) -> dict[str, Any]:
        with self._lock:
            return dict(self._valores)

"""WebSocket hacia el navegador: envía el estado al conectar y en cada cambio."""

from __future__ import annotations

import asyncio
import contextlib
import logging
import time

import anyio
import jwt
from fastapi import WebSocket, WebSocketDisconnect

from .auth import decodificar_token

log = logging.getLogger("iotluz.ws")

# Códigos de cierre (4000-4999 son de la aplicación).
CIERRE_TOKEN_INVALIDO = 4401
CIERRE_TOKEN_EXPIRADO = 4402


class _Conexion:
    """Cada navegador guarda solo el último estado pendiente: un cliente lento no bloquea a los demás."""

    def __init__(self, ws: WebSocket) -> None:
        self.ws = ws
        self.pendiente: dict | None = None
        self.hay_datos = asyncio.Event()

    def poner(self, estado: dict) -> None:
        self.pendiente = estado
        self.hay_datos.set()


class Difusor:
    def __init__(self) -> None:
        self.loop: asyncio.AbstractEventLoop | None = None
        self._conexiones: set[_Conexion] = set()

    @property
    def num_clientes(self) -> int:
        return len(self._conexiones)

    def al_cambiar(self, estado: dict) -> None:
        """Llamado desde el hilo MQTT: pasa el estado al loop de FastAPI de forma segura."""
        loop = self.loop
        if loop is None or loop.is_closed() or not self._conexiones:
            return
        asyncio.run_coroutine_threadsafe(self._difundir(estado), loop)

    async def _difundir(self, estado: dict) -> None:
        for c in list(self._conexiones):
            c.poner(estado)

    async def atender(self, ws: WebSocket, token: str | None, estado_inicial) -> None:
        settings = ws.app.state.settings
        try:
            datos = decodificar_token(settings, token or "")
        except jwt.InvalidTokenError:
            # Se rechaza el handshake (el navegador recibe un 403).
            await ws.close(code=CIERRE_TOKEN_INVALIDO)
            log.info("WebSocket rechazado: token ausente o inválido.")
            return

        await ws.accept()
        con = _Conexion(ws)
        self._conexiones.add(con)
        log.info("Cliente WebSocket conectado (%d en total).", self.num_clientes)
        con.poner(estado_inicial())
        restante = max(0.0, datos["exp"] - time.time())

        try:
            async with anyio.create_task_group() as tg:

                async def enviar() -> None:
                    try:
                        while True:
                            await con.hay_datos.wait()
                            con.hay_datos.clear()
                            estado, con.pendiente = con.pendiente, None
                            if estado is not None:
                                await ws.send_json(estado)
                    except (WebSocketDisconnect, RuntimeError):
                        pass
                    tg.cancel_scope.cancel()

                async def recibir() -> None:
                    # Lee (y descarta) lo que mande el navegador; termina al cerrarse la conexión.
                    try:
                        while True:
                            await ws.receive_text()
                    except (WebSocketDisconnect, RuntimeError):
                        pass
                    tg.cancel_scope.cancel()

                async def caducar() -> None:
                    await anyio.sleep(restante)
                    log.info("Token caducado: cerrando WebSocket.")
                    with contextlib.suppress(Exception):
                        await ws.close(code=CIERRE_TOKEN_EXPIRADO)
                    tg.cancel_scope.cancel()

                tg.start_soon(enviar)
                tg.start_soon(recibir)
                tg.start_soon(caducar)
        finally:
            self._conexiones.discard(con)
            log.info("Cliente WebSocket desconectado (%d en total).", self.num_clientes)

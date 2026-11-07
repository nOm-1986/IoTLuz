"""API de IoTLuz (FastAPI)."""

from __future__ import annotations

import asyncio
import csv
import io
import logging
from collections.abc import Callable, Iterator
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, FastAPI, HTTPException, Query, Request, WebSocket, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, ConfigDict, Field

from . import db
from .auth import LimitadorLogin, credenciales_validas, crear_token, usuario_actual
from .config import Settings, get_settings, verificar_secretos
from .mqtt_service import MqttNoConectado, ServicioMqtt
from .ws import Difusor

log = logging.getLogger("iotluz.api")


# ------------------------------------------------------------------ esquemas
class _Estricto(BaseModel):
    model_config = ConfigDict(extra="forbid")


class LoginIn(_Estricto):
    usuario: str = Field(min_length=1, max_length=100)
    clave: str = Field(min_length=1, max_length=200)


class OrdenIn(_Estricto):
    modo: Literal["ON", "OFF", "AUTO"]


class UmbralIn(_Estricto):
    valor: Annotated[int, Field(strict=True, ge=1, le=1023)]


class TiempoIn(_Estricto):
    segundos: Annotated[int, Field(strict=True, ge=1, le=3600)]


# --------------------------------------------------------------- aplicación
def configurar_logs(nivel: str) -> None:
    logging.basicConfig(
        level=nivel.upper(),
        format="%(asctime)s %(levelname)-7s [%(name)s] %(message)s",
    )
    logging.getLogger("iotluz").setLevel(nivel.upper())


def create_app(
    settings: Settings | None = None,
    cliente_mqtt_factory: Callable[[], Any] | None = None,
) -> FastAPI:
    s = settings or get_settings()
    configurar_logs(s.log_level)
    verificar_secretos(s)

    engine = db.crear_engine(s.database_url)
    sesiones = db.crear_sesiones(engine)
    servicio = ServicioMqtt(s, sesiones, cliente_factory=cliente_mqtt_factory)
    difusor = Difusor()
    servicio.suscribir_cambios(difusor.al_cambiar)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        try:
            db.crear_tablas(engine)
            log.info("Tablas de la base de datos verificadas.")
        except Exception as e:  # noqa: BLE001 - la API debe arrancar igualmente
            log.error("Error de base de datos al crear las tablas: %s", e)
        difusor.loop = asyncio.get_running_loop()
        servicio.iniciar()
        yield
        servicio.detener()
        difusor.loop = None
        engine.dispose()

    app = FastAPI(title="IoTLuz", lifespan=lifespan, docs_url="/api/docs", openapi_url="/api/openapi.json")
    app.state.settings = s
    app.state.engine = engine
    app.state.sesiones = sesiones
    app.state.servicio = servicio
    app.state.limitador = LimitadorLogin()

    if s.lista_cors:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=s.lista_cors,
            allow_methods=["GET", "POST"],
            allow_headers=["Authorization", "Content-Type"],
        )

    app.include_router(_rutas_publicas())
    app.include_router(_rutas_protegidas(), dependencies=[Depends(usuario_actual)])

    @app.websocket("/ws")
    async def websocket(ws: WebSocket) -> None:
        await difusor.atender(ws, servicio.estado_actual)

    app.state.difusor = difusor
    return app


def _servicio(request: Request) -> ServicioMqtt:
    return request.app.state.servicio


def _rutas_publicas() -> APIRouter:
    r = APIRouter(prefix="/api")

    @r.post("/login")
    def login(datos: LoginIn, request: Request) -> dict:
        s: Settings = request.app.state.settings
        lim: LimitadorLogin = request.app.state.limitador
        ip = request.client.host if request.client else "desconocida"
        espera = lim.segundos_bloqueo(ip)
        if espera:
            raise HTTPException(
                status.HTTP_429_TOO_MANY_REQUESTS,
                "Demasiados intentos fallidos. Inténtalo más tarde.",
                headers={"Retry-After": str(espera)},
            )
        if not credenciales_validas(s, datos.usuario, datos.clave):
            lim.registrar_fallo(ip)
            log.warning("Login fallido para '%s' desde %s", datos.usuario, ip)
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Usuario o clave incorrectos")
        lim.reiniciar(ip)
        log.info("Login correcto desde %s", ip)
        return {"token": crear_token(s, datos.usuario), "expira_en_horas": s.jwt_horas}

    @r.get("/salud")
    def salud(request: Request) -> JSONResponse:
        db_ok = db.db_disponible(request.app.state.engine)
        cuerpo = {
            "api": "ok",
            "base_datos": "ok" if db_ok else "error",
            "mqtt_conectado": _servicio(request).conectado,
        }
        return JSONResponse(cuerpo, status_code=200 if db_ok else 503)

    return r


def _rutas_protegidas() -> APIRouter:
    r = APIRouter(prefix="/api")

    @r.get("/estado")
    def estado(request: Request) -> dict:
        return _servicio(request).estado_actual()

    @r.get("/lecturas")
    def lecturas(
        request: Request,
        minutos: Annotated[int, Query(ge=1, le=60 * 24 * 31)] = 120,
        limite: Annotated[int, Query(ge=1, le=20000)] = 2000,
    ) -> list[dict]:
        with request.app.state.sesiones() as ses:
            return [db.lectura_a_dict(l) for l in db.lecturas_recientes(ses, minutos, limite)]

    @r.get("/lecturas.csv")
    def lecturas_csv(request: Request) -> StreamingResponse:
        sesiones = request.app.state.sesiones

        def generar() -> Iterator[str]:
            buf = io.StringIO()
            w = csv.writer(buf)
            w.writerow(db.COLUMNAS_CSV)
            with sesiones() as ses:
                for i, l in enumerate(db.todas_las_lecturas(ses), 1):
                    d = db.lectura_a_dict(l)
                    w.writerow([d[c] for c in db.COLUMNAS_CSV])
                    if i % 500 == 0:
                        yield buf.getvalue()
                        buf.seek(0)
                        buf.truncate()
            yield buf.getvalue()

        nombre = f"lecturas_{datetime.now(UTC):%Y%m%d_%H%M%S}.csv"
        return StreamingResponse(
            generar(),
            media_type="text/csv; charset=utf-8",
            headers={"Content-Disposition": f'attachment; filename="{nombre}"'},
        )

    @r.get("/eventos")
    def eventos(request: Request, limite: Annotated[int, Query(ge=1, le=1000)] = 50) -> list[dict]:
        with request.app.state.sesiones() as ses:
            return [db.evento_a_dict(e) for e in db.eventos_recientes(ses, limite)]

    def _publicar(request: Request, orden: str, valor: str | int) -> dict:
        try:
            tema = _servicio(request).publicar(orden, valor)
        except MqttNoConectado as e:
            raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(e)) from None
        return {"ok": True, "tema": tema, "valor": str(valor)}

    @r.post("/orden")
    def orden(datos: OrdenIn, request: Request) -> dict:
        return _publicar(request, "modo", datos.modo)

    @r.post("/umbral")
    def umbral(datos: UmbralIn, request: Request) -> dict:
        return _publicar(request, "umbral", datos.valor)

    @r.post("/tiempo")
    def tiempo(datos: TiempoIn, request: Request) -> dict:
        return _publicar(request, "tiempo", datos.segundos)

    return r


app = create_app()

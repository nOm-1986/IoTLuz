"""Motor de base de datos, sesiones y consultas."""

from __future__ import annotations

import logging
from collections.abc import Iterator
from datetime import UTC, datetime, timedelta

from sqlalchemy import Engine, create_engine, select, text
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from .models import Base, Evento, Lectura

log = logging.getLogger("iotluz.db")


def crear_engine(url: str) -> Engine:
    if url.startswith("sqlite"):
        # Usado en las pruebas (SQLite en memoria compartida entre hilos).
        return create_engine(url, connect_args={"check_same_thread": False}, poolclass=StaticPool)
    return create_engine(url, pool_pre_ping=True)


def crear_tablas(engine: Engine) -> None:
    Base.metadata.create_all(engine)


def crear_sesiones(engine: Engine) -> sessionmaker[Session]:
    return sessionmaker(engine, expire_on_commit=False)


def db_disponible(engine: Engine) -> bool:
    try:
        with engine.connect() as con:
            con.execute(text("SELECT 1"))
        return True
    except Exception as e:  # noqa: BLE001
        log.error("Base de datos no disponible: %s", e)
        return False


def a_utc(ts: datetime) -> datetime:
    """SQLite devuelve fechas sin zona; las tratamos como UTC."""
    return ts.replace(tzinfo=UTC) if ts.tzinfo is None else ts.astimezone(UTC)


def lectura_a_dict(l: Lectura) -> dict:
    return {
        "id": l.id,
        "ts": a_utc(l.ts).isoformat(),
        "luz": l.luz,
        "pir": l.pir,
        "estado": l.estado,
        "modo": l.modo,
        "umbral": l.umbral,
        "tiempo_s": l.tiempo_s,
        "minutos": l.minutos,
        "energia_wh": l.energia_wh,
    }


def evento_a_dict(e: Evento) -> dict:
    return {"id": e.id, "ts": a_utc(e.ts).isoformat(), "tipo": e.tipo, "valor": e.valor}


def lecturas_recientes(ses: Session, minutos: int, limite: int) -> list[Lectura]:
    """Las `limite` lecturas más recientes de los últimos `minutos`, en orden ascendente."""
    desde = datetime.now(UTC) - timedelta(minutes=minutos)
    filas = ses.scalars(
        select(Lectura).where(Lectura.ts >= desde).order_by(Lectura.ts.desc(), Lectura.id.desc()).limit(limite)
    ).all()
    return list(reversed(filas))


def eventos_recientes(ses: Session, limite: int) -> list[Evento]:
    return list(ses.scalars(select(Evento).order_by(Evento.ts.desc(), Evento.id.desc()).limit(limite)).all())


COLUMNAS_CSV = ["id", "ts", "luz", "pir", "estado", "modo", "umbral", "tiempo_s", "minutos", "energia_wh"]


def todas_las_lecturas(ses: Session) -> Iterator[Lectura]:
    yield from ses.scalars(select(Lectura).order_by(Lectura.ts, Lectura.id).execution_options(yield_per=1000))

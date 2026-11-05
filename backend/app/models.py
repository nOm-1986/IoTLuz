"""Modelos de la base de datos."""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import DateTime, String
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


def ahora_utc() -> datetime:
    return datetime.now(UTC)


class Base(DeclarativeBase):
    pass


class Lectura(Base):
    __tablename__ = "lecturas"

    id: Mapped[int] = mapped_column(primary_key=True)
    ts: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True, default=ahora_utc)
    luz: Mapped[int]
    pir: Mapped[bool]
    estado: Mapped[str] = mapped_column(String(8))
    modo: Mapped[str] = mapped_column(String(8))
    umbral: Mapped[int]
    tiempo_s: Mapped[int]
    minutos: Mapped[float]
    energia_wh: Mapped[float]


class Evento(Base):
    __tablename__ = "eventos"

    id: Mapped[int] = mapped_column(primary_key=True)
    ts: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True, default=ahora_utc)
    tipo: Mapped[str] = mapped_column(String(16))  # "estado" | "modo" | "conexion"
    valor: Mapped[str] = mapped_column(String(32))

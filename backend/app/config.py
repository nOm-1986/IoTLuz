"""Configuración por variables de entorno (archivo .env en la raíz del proyecto)."""

from __future__ import annotations

import logging
from functools import lru_cache
from pathlib import Path

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

log = logging.getLogger("iotluz.config")

RAIZ = Path(__file__).resolve().parents[2]

# Valores de ejemplo de .env.example: si siguen puestos, se avisa (o se aborta en producción).
EJEMPLO_JWT_SECRET = "cambia-este-secreto-jwt"
EJEMPLO_ADMIN_PASSWORD = "cambia-esta-clave"
MIN_JWT_SECRET = 32
MIN_ADMIN_PASSWORD = 12


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(RAIZ / ".env", Path(".env")),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    env: str = "development"
    log_level: str = "INFO"

    mqtt_host: str = ""
    mqtt_port: int = 8883
    mqtt_tls: bool = True
    mqtt_user: str = ""
    mqtt_pass: str = ""
    mqtt_base: str = ""
    mqtt_client_id: str = ""

    database_url: str

    intervalo_guardado_s: int = 30
    arduino_timeout_s: int = 60

    admin_user: str = "admin"
    admin_password: str = EJEMPLO_ADMIN_PASSWORD
    jwt_secret: str = EJEMPLO_JWT_SECRET
    jwt_horas: int = 12

    cors_origins: str = ""

    @field_validator("mqtt_base")
    @classmethod
    def _base_con_barra(cls, v: str) -> str:
        v = v.strip()
        if v and not v.endswith("/"):
            v += "/"
        return v

    @property
    def lista_cors(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def es_produccion(self) -> bool:
        return self.env.strip().lower() == "production"


def verificar_secretos(s: Settings) -> None:
    """Avisa si los secretos son de ejemplo o cortos; en producción se niega a arrancar."""
    problemas: list[str] = []
    if s.jwt_secret == EJEMPLO_JWT_SECRET:
        problemas.append("JWT_SECRET conserva el valor de ejemplo")
    elif len(s.jwt_secret) < MIN_JWT_SECRET:
        problemas.append(f"JWT_SECRET es demasiado corto (mínimo {MIN_JWT_SECRET} caracteres)")
    if s.admin_password == EJEMPLO_ADMIN_PASSWORD:
        problemas.append("ADMIN_PASSWORD conserva el valor de ejemplo")
    elif len(s.admin_password) < MIN_ADMIN_PASSWORD:
        problemas.append(f"ADMIN_PASSWORD es demasiado corta (mínimo {MIN_ADMIN_PASSWORD} caracteres)")

    for p in problemas:
        log.warning("¡INSEGURO! %s. Cámbialo en el archivo .env.", p)
    if problemas and s.es_produccion:
        raise RuntimeError("Secretos inseguros con ENV=production: " + "; ".join(problemas))


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]

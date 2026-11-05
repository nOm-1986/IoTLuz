import os
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

import pytest

# Antes de importar la app: valores de prueba (tienen prioridad sobre cualquier .env local).
os.environ.update(
    {
        "ENV": "test",
        "DATABASE_URL": "sqlite+pysqlite://",
        "MQTT_HOST": "",
        "MQTT_BASE": "pruebas/sala/luz/",
        "ADMIN_USER": "admin",
        "ADMIN_PASSWORD": "clave-de-pruebas-larga",
        "JWT_SECRET": "s" * 48,
        "CORS_ORIGINS": "http://localhost:5173",
    }
)

from fastapi.testclient import TestClient  # noqa: E402

from app.config import Settings  # noqa: E402
from app.db import crear_engine, crear_sesiones, crear_tablas  # noqa: E402
from app.main import create_app  # noqa: E402
from app.mqtt_service import ServicioMqtt  # noqa: E402

BASE = "pruebas/sala/luz/"
OK = SimpleNamespace(is_failure=False)
FALLO = SimpleNamespace(is_failure=True)


class FakeCliente:
    """Cliente MQTT simulado: registra suscripciones y publicaciones."""

    def __init__(self) -> None:
        self.suscripciones: list[tuple[str, int]] = []
        self.publicados: list[tuple[str, str, int, bool]] = []
        self.rc_publicar = 0
        self.on_connect = self.on_disconnect = self.on_message = None

    def connect_async(self, *a, **k): ...
    def loop_start(self): ...
    def loop_stop(self): ...
    def disconnect(self): ...

    def subscribe(self, temas):
        self.suscripciones.extend(temas)

    def publish(self, tema, payload, qos=0, retain=False):
        self.publicados.append((tema, payload, qos, retain))
        return SimpleNamespace(rc=self.rc_publicar)


class Reloj:
    def __init__(self) -> None:
        self.t = datetime(2026, 1, 1, 12, 0, tzinfo=UTC)

    def __call__(self) -> datetime:
        return self.t

    def avanzar(self, segundos: float) -> None:
        self.t += timedelta(seconds=segundos)


VALORES_COMPLETOS = {
    "estado": "OFF",
    "modo": "AUTO",
    "ldr": "512",
    "pir": "0",
    "umbral": "300",
    "tiempo": "60",
    "minutos": "12.5",
    "energia_wh": "1.75",
}


def publicar_todo(servicio: ServicioMqtt, retenido: bool, **cambios: str) -> None:
    for tema, valor in {**VALORES_COMPLETOS, **cambios}.items():
        servicio.procesar_mensaje(tema, valor, retenido)


@pytest.fixture
def settings() -> Settings:
    return Settings(
        _env_file=None,
        env="test",
        database_url="sqlite+pysqlite://",
        mqtt_host="",
        mqtt_base=BASE,
        admin_user="admin",
        admin_password="clave-de-pruebas-larga",
        jwt_secret="s" * 48,
        intervalo_guardado_s=3600,
        arduino_timeout_s=60,
        cors_origins="http://localhost:5173",
    )


@pytest.fixture
def reloj() -> Reloj:
    return Reloj()


@pytest.fixture
def servicio(settings, reloj):
    engine = crear_engine(settings.database_url)
    crear_tablas(engine)
    srv = ServicioMqtt(settings, crear_sesiones(engine), cliente_factory=FakeCliente, reloj=reloj)
    yield srv
    engine.dispose()


@pytest.fixture
def app(settings):
    return create_app(settings, cliente_mqtt_factory=FakeCliente)


@pytest.fixture
def client(app):
    with TestClient(app) as c:
        yield c


@pytest.fixture
def headers(client) -> dict[str, str]:
    r = client.post("/api/login", json={"usuario": "admin", "clave": "clave-de-pruebas-larga"})
    assert r.status_code == 200
    return {"Authorization": f"Bearer {r.json()['token']}"}


def conectar(servicio: ServicioMqtt) -> None:
    """Simula que el broker aceptó la conexión."""
    servicio._on_connect(servicio._cliente, None, None, OK)

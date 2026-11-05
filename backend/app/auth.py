"""Autenticación: un único administrador, JWT y límite de intentos fallidos."""

from __future__ import annotations

import hmac
import math
import threading
import time
from collections import defaultdict, deque
from datetime import UTC, datetime, timedelta

import jwt
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from .config import Settings

ALGORITMO = "HS256"


def credenciales_validas(s: Settings, usuario: str, clave: str) -> bool:
    ok_u = hmac.compare_digest(usuario.encode(), s.admin_user.encode())
    ok_c = hmac.compare_digest(clave.encode(), s.admin_password.encode())
    return ok_u and ok_c


def crear_token(s: Settings, usuario: str) -> str:
    ahora = datetime.now(UTC)
    payload = {"sub": usuario, "iat": ahora, "exp": ahora + timedelta(hours=s.jwt_horas)}
    return jwt.encode(payload, s.jwt_secret, algorithm=ALGORITMO)


def decodificar_token(s: Settings, token: str) -> dict:
    """Devuelve el contenido del token o lanza jwt.InvalidTokenError (o ExpiredSignatureError)."""
    datos = jwt.decode(token, s.jwt_secret, algorithms=[ALGORITMO], options={"require": ["exp", "sub"]})
    if datos["sub"] != s.admin_user:
        raise jwt.InvalidTokenError("usuario desconocido")
    return datos


def verificar_token(s: Settings, token: str) -> str:
    """Devuelve el usuario del token o lanza jwt.InvalidTokenError."""
    return decodificar_token(s, token)["sub"]


class LimitadorLogin:
    """Rate limit sencillo en memoria: N fallos por IP en una ventana deslizante."""

    def __init__(self, max_fallos: int = 5, ventana_s: float = 900) -> None:
        self.max_fallos = max_fallos
        self.ventana_s = ventana_s
        self._fallos: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def _limpiar(self, ip: str, ahora: float) -> deque[float]:
        d = self._fallos[ip]
        while d and ahora - d[0] > self.ventana_s:
            d.popleft()
        return d

    def segundos_bloqueo(self, ip: str) -> int:
        """0 si puede intentarlo; si no, segundos hasta poder reintentar."""
        ahora = time.monotonic()
        with self._lock:
            d = self._limpiar(ip, ahora)
            if len(d) < self.max_fallos:
                return 0
            return max(1, math.ceil(self.ventana_s - (ahora - d[0])))

    def registrar_fallo(self, ip: str) -> None:
        with self._lock:
            self._limpiar(ip, time.monotonic()).append(time.monotonic())

    def reiniciar(self, ip: str) -> None:
        with self._lock:
            self._fallos.pop(ip, None)


_bearer = HTTPBearer(auto_error=False)


def _no_autorizado(detalle: str) -> HTTPException:
    return HTTPException(status.HTTP_401_UNAUTHORIZED, detalle, headers={"WWW-Authenticate": "Bearer"})


def usuario_actual(
    request: Request, cred: HTTPAuthorizationCredentials | None = Depends(_bearer)
) -> str:
    if cred is None or cred.scheme.lower() != "bearer":
        raise _no_autorizado("Falta el token")
    try:
        return verificar_token(request.app.state.settings, cred.credentials)
    except jwt.ExpiredSignatureError:
        raise _no_autorizado("Token expirado") from None
    except jwt.InvalidTokenError:
        raise _no_autorizado("Token inválido") from None

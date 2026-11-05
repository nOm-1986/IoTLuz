FROM python:3.14-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /srv

RUN useradd --system --uid 10001 --no-create-home iotluz

COPY requirements.txt .
# --no-compile: con python:3.14-slim (3.14.10) el bytecode que genera pip salía corrupto
# ("bad marshal data"). Sin .pyc precompilados el arranque es apenas más lento.
RUN pip install --no-compile -r requirements.txt

COPY app ./app
COPY scripts ./scripts

USER iotluz
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD python -c "import urllib.request,sys; urllib.request.urlopen('http://127.0.0.1:8000/api/salud', timeout=4)" || exit 1

# --proxy-headers: la IP real del cliente llega desde Caddy (necesario para el rate limit del login).
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers"]

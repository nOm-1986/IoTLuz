Quiero que construyas un sistema IoT completo, primero para ejecutarlo en local (Windows 11) y después para desplegarlo en un droplet de DigitalOcean. Antes de escribir código, propón un plan corto por etapas y espera mi OK. Después trabaja por etapas, probando cada una antes de pasar a la siguiente.

## 1. Contexto

Tengo un nodo sensor (Arduino UNO R4 WiFi con PIR, LDR y relé que enciende una tira LED). Ya funciona y se comunica por MQTT con un broker privado en EMQX Cloud Serverless. EMQX Serverless solo acepta TLS (puerto 8883) y autenticación por usuario y contraseña.

Necesito un backend, un frontend y una base de datos para: guardar el historial de lecturas, mostrar un panel en tiempo real y enviar órdenes al Arduino.

## 2. Stack (obligatorio)

- Backend: Python 3.11+ con FastAPI.
- Cliente MQTT: paho-mqtt v2 (hilo propio con loop_start). NO uses aiomqtt ni asyncio-mqtt: en Windows fallan con el event loop por defecto.
- Base de datos: PostgreSQL, con SQLAlchemy 2.x y el driver psycopg 3 (postgresql+psycopg). Las tablas se crean al iniciar, sin Alembic.
- Frontend: React con Vite y Recharts, gestionado con Bun (bun install, bun run dev, bun run build). Bun es solo para el frontend; el backend sigue siendo Python.
- Autenticación: un único usuario administrador definido por variables de entorno, con login que devuelve un JWT (PyJWT). Todos los endpoints y el WebSocket requieren el token, salvo /api/login y /api/salud.
- Tiempo real: WebSocket de FastAPI desde el backend hacia el navegador. El navegador NUNCA se conecta directamente a EMQX ni conoce sus credenciales.

## 3. Protocolo MQTT que ya usa mi Arduino

Prefijo de temas (configurable en MQTT_BASE, siempre terminado en "/"), por ejemplo: mi-prefijo/sala/luz/

El Arduino PUBLICA (mensajes de texto plano, con retain=true), cada 30 segundos y además al instante cuando cambia algo:
BASE+"estado" valor "ON" u "OFF"
BASE+"modo" valor "AUTO", "ON" u "OFF"
BASE+"ldr" entero 0 a 1023 (más bajo = más oscuro)
BASE+"pir" "1" o "0"
BASE+"umbral" entero 1 a 1023
BASE+"tiempo" entero, segundos que la luz permanece encendida tras el último movimiento
BASE+"minutos" decimal, minutos acumulados con la luz encendida
BASE+"energia_wh" decimal, energía estimada en Wh

El Arduino se SUSCRIBE a (el backend publica con retain=false, qos=1):
BASE+"modo/set" "ON", "OFF" o "AUTO"
BASE+"umbral/set" entero 1 a 1023
BASE+"tiempo/set" entero de 1 a 3600 (segundos)

El backend debe suscribirse SOLO a los 8 temas de publicación (no a BASE+"#"), para no recibir sus propias órdenes.

Detalles importantes:

- Los mensajes con retain=true que llegan justo al suscribirse (msg.retain == True) son valores viejos: actualizan el estado en memoria, pero NO deben marcar al Arduino como "en línea".
- El Arduino se considera "en línea" si recibió un mensaje no retenido en los últimos ARDUINO_TIMEOUT_S segundos (por defecto 60).

## 4. Backend: requisitos

Estructura sugerida (puedes mejorarla): backend/app/{config.py, db.py, models.py, mqtt_service.py, auth.py, main.py}, requirements.txt, .env.example, tests/.

Configuración por variables de entorno (pydantic-settings, archivo .env): MQTT_HOST, MQTT_PORT (8883), MQTT_TLS (true), MQTT_USER, MQTT_PASS, MQTT_BASE, MQTT_CLIENT_ID, DATABASE_URL, INTERVALO_GUARDADO_S (30), ADMIN_USER, ADMIN_PASSWORD, JWT_SECRET, JWT_HORAS (12), CORS_ORIGINS, ARDUINO_TIMEOUT_S (60). Nunca pongas secretos en el código ni en git: incluye .gitignore y un .env.example con valores de ejemplo. Si JWT_SECRET o ADMIN_PASSWORD conservan el valor de ejemplo, el backend debe avisar claramente en el log (y negarse a arrancar si ENV=production).

Modelo de datos:

- lecturas: id, ts (timestamptz, indexado), luz (int), pir (bool), estado (str), modo (str), umbral (int), tiempo_s (int), minutos (float), energia_wh (float).
- eventos: id, ts (timestamptz, indexado), tipo ("estado", "modo" o "conexion"), valor (str).

Lógica:

- El servicio MQTT mantiene en memoria un snapshot con el último valor de cada tema.
- Un hilo periódico guarda una fila en "lecturas" cada INTERVALO_GUARDADO_S segundos con el snapshot actual, solo si el Arduino está en línea y el snapshot está completo.
- Cuando cambian "estado" o "modo" respecto al valor anterior (no en la carga inicial de retenidos), guarda un registro en "eventos". También registra cuando el Arduino pasa de en línea a fuera de línea y al revés.
- Cada cambio del snapshot se envía por WebSocket a todos los clientes conectados (el hilo MQTT debe usar asyncio.run_coroutine_threadsafe con el loop de FastAPI).
- Si no hay conexión al broker, la API debe seguir funcionando y reportar mqtt_conectado=false. El cliente MQTT reconecta solo (reconnect_delay_set).

Endpoints (prefijo /api):
POST /login {usuario, clave} -> {token}
GET /salud público; devuelve estado de la API, base de datos y MQTT
GET /estado snapshot actual + mqtt_conectado + arduino_en_linea + ultima_actualizacion
GET /lecturas?minutos=120&limite=2000 lecturas recientes, en orden ascendente
GET /lecturas.csv exportación completa en CSV, con cabecera, para descargar
GET /eventos?limite=50
POST /orden {modo: "ON"|"OFF"|"AUTO"} -> publica en BASE+"modo/set"
POST /umbral {valor: 1..1023} -> publica en BASE+"umbral/set"
POST /tiempo {segundos: 1..3600} -> publica en BASE+"tiempo/set"
WS /ws?token=... envía el snapshot al conectar y en cada cambio
Valida todas las entradas con Pydantic (Literal, rangos). Devuelve 503 si se intenta enviar una orden sin conexión al broker.

## 5. Frontend: requisitos

React + Vite + Recharts, gestionado con Bun. Interfaz en español, limpia y legible en móvil y en escritorio.

- Pantalla de login. El token se guarda en memoria o en sessionStorage, y se renueva el login al expirar.
- Panel con: valor actual del LDR frente al umbral (barra o medidor), PIR (hay movimiento o no), estado de la lámpara, modo actual, minutos encendida y energía en Wh, e indicadores de "Broker conectado" y "Arduino en línea".
- Controles: tres botones ON, OFF y AUTO (el activo resaltado), un deslizador para el umbral (1 a 1023) y otro para el tiempo de encendido (1 a 3600 s) que envían el valor al soltar. Los botones deben reflejar lo que confirma el Arduino por el WebSocket, no solo lo que se pidió.
- Gráfica de la luz (LDR) en el tiempo, con la línea del umbral, y selector de ventana (30 min, 2 h, 24 h) que consulta /api/lecturas.
- Tabla de los últimos eventos.
- Botón "Descargar CSV" que usa /api/lecturas.csv (con el token en la cabecera).
- WebSocket con reconexión automática y datos en vivo; si se cae, mostrar el aviso.
- En desarrollo, el servidor de Vite hace proxy de /api y /ws al backend (puerto 8000). En producción el frontend usa rutas relativas.

## 6. Ejecución local en Windows (documentar en README)

Guía paso a paso para PowerShell: instalar PostgreSQL y crear la base de datos y el usuario, crear el entorno virtual de Python (py -m venv .venv, incluyendo cómo habilitar el script de activación), instalar dependencias, copiar .env.example a .env y completarlo, arrancar con uvicorn app.main:app --reload --port 8000, e instalar y arrancar el frontend con Bun. Incluye cómo comprobar que llegan los mensajes (GET /api/estado, logs del backend) y una sección de problemas comunes (TLS, credenciales de EMQX, puerto 8883 bloqueado, PostgreSQL no inicia).

## 7. Despliegue en un droplet de DigitalOcean (Ubuntu 24.04)

Primero deja todo funcionando en local; luego prepara el despliegue con estos criterios:

- Backend como servicio systemd con uvicorn (usuario no root), entorno virtual propio y archivo de entorno con permisos 600.
- PostgreSQL instalado en el mismo droplet, accesible solo por localhost, con una copia de seguridad diaria con pg_dump (cron o timer) y rotación.
- El frontend se compila con Bun (bun run build) y lo sirve Caddy como archivos estáticos, con proxy inverso de /api y /ws hacia uvicorn. Si tengo un dominio, Caddy obtiene el HTTPS automáticamente; si no, documenta cómo usar solo HTTP para pruebas y advierte del riesgo.
- Firewall (ufw): solo 22, 80 y 443. Acceso por SSH con llave y sin contraseña.
- Un script deploy.sh (o instrucciones equivalentes) para actualizar: git pull, instalar dependencias, compilar el frontend, reiniciar el servicio.
- Documenta todo en DEPLOY.md, con comandos exactos y cómo ver logs (journalctl) y cómo revertir.

## 8. Calidad y seguridad

- Sin secretos en el repositorio. Contraseña del admin y JWT_SECRET largos y aleatorios.
- CORS limitado a CORS_ORIGINS.
- Limita los intentos de login fallidos (rate limit sencillo en memoria).
- Pruebas con pytest para: el parseo de los mensajes MQTT (incluyendo retenidos), el guardado de lecturas y eventos, los endpoints protegidos (sin token = 401) y la validación de /orden, /umbral y /tiempo. Usa SQLite en memoria para las pruebas, y un cliente MQTT simulado (no necesito un broker real para los tests).
- Una prueba manual documentada con MQTTX o con un script, que publique en los 8 temas y verifique que el panel se actualiza.
- Logs claros en español: conexión al broker, mensajes recibidos (a nivel debug), errores de base de datos.

## 9. Entregables

Un repositorio con: backend/, frontend/, README.md (local en Windows), DEPLOY.md (droplet), .env.example, .gitignore y los tests. Al terminar cada etapa, resume qué hiciste, cómo lo probaste y qué falta. Si algo es ambiguo, pregúntame; no inventes valores de configuración ni credenciales.

Etapas sugeridas:

1. Backend con base de datos y endpoints (probado con mensajes simulados).
2. Servicio MQTT y WebSocket.
3. Frontend.
4. README local y pruebas.
5. Despliegue y DEPLOY.md.

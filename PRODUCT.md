# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
Una sola persona administradora (el dueño del sistema) que controla la iluminación de una sala de su casa. Usa el panel tanto desde el móvil, dentro de la sala y a menudo con poca luz, para consultas rápidas y cambiar el modo, como desde el ordenador para revisar la gráfica, los eventos y exportar datos. Ambos usos pesan igual.

## Product Purpose
IoTLuz conecta un Arduino UNO R4 WiFi (sensor de movimiento PIR, sensor de luz LDR y un relé que enciende una tira LED) con un panel web. Permite ver en tiempo real si la luz está encendida, cuánta luz ambiente hay y si hay movimiento; enviar órdenes (modo ON/OFF/AUTO, umbral de oscuridad, tiempo encendida tras el movimiento); y consultar el historial. El éxito es poder saber y cambiar el estado de la luz en segundos, con la certeza de que el Arduino aplicó la orden.

## Positioning
El panel no da por hecha una orden: solo la muestra como aplicada cuando el propio Arduino publica el nuevo valor. Es un sistema propio, privado y de una sola sala, no una plataforma domótica genérica.

## Operating Context
- El Arduino publica por MQTT (EMQX Cloud, TLS) cada 30 s y al instante cuando algo cambia; se considera en línea si envió un mensaje en vivo en los últimos 60 s.
- Backend FastAPI + PostgreSQL guarda una lectura cada 30 s y los eventos de estado, modo y conexión; el navegador recibe el estado por WebSocket y nunca habla con el broker.
- Se despliega con Docker (Caddy sirve el frontend); primero en local (Windows 11) y después en un droplet.

## Capabilities and Constraints
- Lecturas: luz 0–1023 (más bajo = más oscuro), movimiento sí/no, estado ON/OFF, modo AUTO/ON/OFF, umbral 1–1023, tiempo 1–3600 s, minutos acumulados encendida, energía estimada en Wh.
- Órdenes: modo, umbral y tiempo. Las órdenes deben esperar la confirmación del Arduino.
- Un único usuario administrador con login (JWT); sin registro ni varios usuarios.
- Interfaz en español.
- CSP estricta (script-src 'self'): fuentes y scripts deben servirse desde el propio sitio.

## Brand Commitments
- Nombre: IoTLuz.
- Temas claro y oscuro, elegibles por el usuario (por defecto, el del sistema operativo).
- Referencias visuales elegidas por el usuario en `referencias/` (login.png, controles.png); inspiración de estilo, sin copiar marcas ni textos.

## Evidence on Hand
Datos reales del propio sistema (lecturas, eventos). No hay testimonios, clientes ni cifras comerciales, y no deben inventarse. La potencia de la tira LED con que se estima la energía no está documentada en el panel.

## Product Principles
1. La verdad del dispositivo manda: lo confirmado por el Arduino se distingue siempre de lo solicitado.
2. El estado de la luz se entiende en un vistazo, en el móvil y en el escritorio.
3. Lenguaje de la sala, no del sistema: se habla de luz, oscuridad y movimiento antes que de brokers o valores crudos.
4. Privado y local: nada de servicios externos en el navegador.

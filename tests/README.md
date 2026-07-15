# Pruebas de lógica de integración

Verifica, **sin necesidad de Docker/RabbitMQ/Postgres**, la lógica crítica del
ecosistema usando dobles de prueba (mocks) sobre el código real:

- Contrato de eventos (`shared/events.js`): estructura mínima y validación.
- **Message Translator** (servicio de notificaciones): evento → notificación.
- **Reintentos → Dead Letter Queue** (`shared/amqp.js`): re-encolado con
  `x-retry` y envío a DLQ al agotar reintentos; mensaje corrupto → DLQ directo.

## Ejecutar
```bash
cd services/notifications && npm install   # una sola vez (deps del translator)
cd ../.. && node tests/verify.js
```
Resultado esperado: `RESULTADO: 12 verificaciones OK`.

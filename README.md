# CampusConnect 360 — Plantilla (esqueleto del proyecto)

Punto de partida del Proyecto Integrador (Integración de Sistemas, Progreso 3).
**El andamiaje está completo y verificado; tú implementas la lógica de negocio.**

Esta plantilla NO es el proyecto terminado: cada servicio tiene sus endpoints y
sus handlers de eventos marcados con `TODO`. La idea es repartir esos TODO entre
el equipo (ver `IMPLEMENTAR.md`) para que cada integrante tenga autoría y commits
propios.

---

## ✅ Qué YA está hecho (andamiaje — normalmente no se toca)

- **`shared/`** — núcleo común reutilizable (copiado a cada servicio):
  `logger` (logs JSON), `events` (estructura y validación de eventos),
  `amqp` (RabbitMQ: topic exchange, Pub/Sub, reintentos y **Dead Letter Queue**),
  `db` (PostgreSQL + tabla de idempotencia `processed_events`),
  `http` (correlationId, identidad por headers, `requireRole`, Swagger).
- **`gateway/`** — API Gateway con login JWT, autorización por rol, enrutado
  `/api/<servicio>/*`, inyección de identidad y health agregado. **Funciona tal cual.**
- **`infra/`, `docker-compose.yml`** — RabbitMQ, PostgreSQL (5 bases separadas),
  los 5 servicios, el gateway y el frontend. Un comando levanta todo.
- **`frontends/`** — 4 portales (Académico, Financiero, Docente, Dashboard) ya
  construidos; consumen el gateway. Quedan operativos cuando implementes el backend.
- En cada servicio: imports, middlewares, `/health`, el **wiring de mensajería**
  en `start()` (qué cola consume y a qué eventos se enlaza) y el arranque.

## 🛠️ Qué te toca implementar (busca los `TODO`)

En `services/<servicio>/src/index.js`:
1. **`DDL`** — descomenta/adapta el esquema de la base de tu servicio.
2. **Endpoints REST** — hoy responden `501 Not Implemented`; implementa la lógica.
3. **Handlers de eventos** (`onEvent` / `onPaymentConfirmed`) — consumir, ser
   **idempotente** (`db.markProcessed`) y publicar los eventos que correspondan.
4. **Message Translator** (solo Notificaciones): `eventToNotification`.

Lista completa y repartible en **`IMPLEMENTAR.md`**.

---

## ▶️ Cómo levantar el entorno

```bash
docker compose up --build
```

| Qué | URL |
|-----|-----|
| Portales | http://localhost:8090 |
| API Gateway | http://localhost:8080 |
| Swagger por servicio | http://localhost:8080/api/<servicio>/docs |
| RabbitMQ | http://localhost:15672 (guest/guest) |

> La plantilla **arranca** aunque no hayas implementado nada (los endpoints
> responden `501`). Vas viendo el sistema cobrar vida a medida que completas TODOs.

## 👤 Usuarios de prueba
Todos con clave `campus123`: `secretaria`, `finanzas`, `docente`, `bienestar`,
`director`, `admin`.

## 🔌 Eventos del ecosistema
`StudentEnrolled`, `PaymentConfirmed`, `AttendanceRecorded`, `IncidentReported`,
`StudentStatusUpdated`, `NotificationSent`, `NotificationFailed`.
Estructura: `eventId`, `eventType`, `occurredAt`, `correlationId`, `entityId`, `data`.

## 📁 Estructura
Igual que el proyecto de referencia, con los `index.js` de cada servicio en
modo esqueleto. Ver `docs/ARQUITECTURA.md` para el diseño completo y
`postman/` para el contrato de la API (sirve de guía de implementación).

## 🤖 Uso de IA
La plantilla y el andamiaje se apoyaron en IA generativa (permitido por la
consigna). La **implementación de la lógica de negocio la realiza el equipo**,
lo que garantiza autoría real y commits por integrante (ver `IMPLEMENTAR.md`).

# CampusConnect 360

**Ecosistema funcional de integración para una red de colegios.**
Proyecto Integrador — Integración de Sistemas (Progreso 3).

Sistema **event-driven** de microservicios que simula un día de operación de una
red educativa: registro de estudiantes, pagos, asistencia/incidentes,
notificaciones automáticas, dashboard directivo y un escenario de falla
controlada. Todos los flujos son **operables desde interfaces web**; el gateway,
la mensajería y las bases están completamente implementados.

---

## Arranque

### Un clic (Windows)
```bat
start.bat
```
Verifica Docker, construye y levanta todo, espera al gateway, ofrece cargar
datos semilla y abre los portales en el navegador.

### Manual (cualquier SO)
```bash
docker compose up --build -d      # levanta el ecosistema completo
bash scripts/seed.sh              # (opcional) datos semilla de demostración
docker compose down               # detener todo
```

| Qué | URL |
|-----|-----|
| Portales | http://localhost:8090 |
| API Gateway | http://localhost:8080 |
| Swagger por servicio | http://localhost:8080/api/&lt;servicio&gt;/docs |
| RabbitMQ (consola) | http://localhost:15672 · guest/guest |

### Usuarios de prueba (clave `campus123`)
`secretaria`, `finanzas`, `docente`, `bienestar`, `director`, `admin`.
Cada portal pide el actor que le corresponde.

---

## Arquitectura

Nadie llama directo a otro servicio: **la única integración es por eventos**
(RabbitMQ). Cada servicio es dueño de **su propia base** (Database per Service).

```
  ACTORES              PORTALES (:8090)        GATEWAY (:8080)         SERVICIOS + BD
  --------             ----------------        ---------------         --------------
  Secretaria      ->  Portal Academico    -,                      ,-> academic      + academicdb
  Finanzas        ->  Portal Financiero    +-> JWT + enrutado  ---+-> payments      + paymentsdb
  Docente/Bienest ->  Portal Docente       |   /api/<svc>/*       +-> attendance    + attendancedb
  Direccion/Admin ->  Dashboard           -'   inyecta identidad  +-> notifications + notificationsdb
                                                                  '-> analytics     + analyticsdb
                                RabbitMQ  -- topic exchange `campus.events` + DLX -- conecta todo
```

### Flujo "un día de operación"
| Acción (portal) | Servicio | Evento publicado | Reaccionan |
|---|---|---|---|
| Registrar estudiante + matrícula | academic | `StudentEnrolled` | notifications, analytics |
| Confirmar pago | payments | `PaymentConfirmed` | academic (a *solvent*), notifications, analytics |
| academic marca solvente | academic | `StudentStatusUpdated` | analytics |
| Registrar asistencia / incidente | attendance | `AttendanceRecorded` / `IncidentReported` | notifications, analytics |
| Entrega de notificación (simulada) | notifications | `NotificationSent` / `NotificationFailed` | analytics |
| Ver indicadores | analytics (CQRS) | — | Dashboard en vivo |

---

## Servicios

| Servicio | Puerto | Responsabilidad | Publica | Consume |
|---|---|---|---|---|
| **academic** | 3001 | Estudiantes y matrículas | StudentEnrolled, StudentStatusUpdated | PaymentConfirmed (Point-to-Point) |
| **payments** | 3002 | Obligaciones y pagos | PaymentConfirmed | — |
| **attendance** | 3003 | Asistencia e incidentes/bienestar | AttendanceRecorded, IncidentReported | — |
| **notifications** | 3004 | Notificaciones (Message Translator) | NotificationSent, NotificationFailed | los 4 eventos de negocio (Pub/Sub) |
| **analytics** | 3005 | Modelo de lectura CQRS (`event_store`) | — | los 7 eventos (Pub/Sub, fan-out) |
| **gateway** | 8080 | Entrada única, login JWT, autorización por rol | — | — |

---

## Eventos (7)
`StudentEnrolled`, `PaymentConfirmed`, `AttendanceRecorded`, `IncidentReported`,
`StudentStatusUpdated`, `NotificationSent`, `NotificationFailed`.

Estructura mínima (`shared/events.js`):
`eventId`, `eventType`, `occurredAt`, `correlationId`, `entityId`, `data`.

---

## Patrones de integración aplicados

| Patrón | Evidencia en el código |
|---|---|
| API Gateway | `gateway/` — entrada única, JWT, proxy `/api/<svc>/*` |
| Publish/Subscribe | notifications **y** analytics consumen el mismo evento (fan-out) |
| Point-to-Point | cola `academic.payment-confirmed` (un único consumidor) |
| Message Channel | topic exchange `campus.events` + colas por servicio |
| Event Message | `buildEvent()` — eventos con estructura mínima común |
| Message Translator | `eventToNotification()` en notifications |
| Idempotent Receiver | tabla `processed_events` / `ON CONFLICT (event_id)` |
| Dead Letter Channel | `campus.dlx` a `<cola>.dlq` al agotar reintentos |
| CQRS / vista analítica | `event_store` alimenta el dashboard |
| Health Check | `/health` por servicio + agregado en el gateway |
| Logs / Trazabilidad | logs JSON con `correlationId` de extremo a extremo |

---

## Resiliencia (escenario de falla controlada)
Desde el **Dashboard, Panel de resiliencia**:
1. **Activar caída**: notifications simula proveedor caído.
2. Genera un evento (ej. registra asistencia): falla, **reintentos**, **DLQ**.
3. **Restaurar servicio** y **Reprocesar DLQ**: los mensajes se reinyectan.

Mecanismos: reintentos con cabecera `x-retry`, Dead Letter Queue, idempotencia,
reprocesamiento manual, health checks y reconexión automática a RabbitMQ.

---

## Seguridad
JWT emitido por el gateway (`/auth/login`, TTL 8h). El gateway valida el token e
inyecta `x-user-id` / `x-user-role`; los servicios autorizan por rol
(`requireRole`). En producción solo el gateway sería la entrada pública.

## Observabilidad
Logs JSON estructurados con `correlationId`, health checks por servicio y
agregado, y trazabilidad global de eventos en analytics (`GET /events`).

---

## Pruebas
Verificación de la lógica de integración **sin broker ni BD reales** (usa dobles
de prueba para amqplib):
```bash
node tests/verify.js
```
Cubre: contrato de eventos, Message Translator y reintentos hacia DLQ.

---

## Estructura
```
gateway/            API Gateway (JWT, proxy, health agregado)
services/           academic · payments · attendance · notifications · analytics
  <svc>/src/index.js   endpoints REST + handlers de eventos
  <svc>/src/lib/       copia del núcleo compartido
  <svc>/src/openapi.js contrato Swagger/OpenAPI del servicio
shared/             núcleo común (logger, events, amqp+DLQ, db+idempotencia, http)
frontends/          4 portales (académico, financiero, docente, dashboard) + común
infra/postgres/     init de las 5 bases
scripts/seed.sh     datos semilla vía gateway (ejercita APIs y eventos)
tests/verify.js     verificación de lógica sin dependencias externas
docs/ARQUITECTURA.md documento de arquitectura
docker-compose.yml  orquestación completa
start.bat           arranque en un clic (Windows)
```

## Documentación
- **Swagger/OpenAPI** por servicio: `/api/<servicio>/docs` (vía gateway).
- **Arquitectura**: `docs/ARQUITECTURA.md`.
- **Postman**: `postman/` (respaldo técnico; la demo principal es por los portales).

## Uso de IA
Se usó IA generativa como apoyo (código base, frontends, documentación y
pruebas). El equipo comprende, adapta, ejecuta y defiende toda la solución; la
distribución por Historias de Usuario garantiza autoría real por integrante.

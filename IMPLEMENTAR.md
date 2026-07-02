# Lista de implementación (TODOs repartibles)

Cada fila es una unidad de trabajo independiente. Sirve de base para las
Historias de Usuario de la Fase 3 y para repartir commits entre el equipo.
Estado inicial: todos los endpoints responden `501`; los handlers de eventos
solo registran un aviso.

## Servicio ACADÉMICO (`services/academic`)
| # | Tarea | Detalle |
|---|-------|---------|
| A1 | `DDL` | Definir tablas `students` (+ secuencia STU-####) y `enrollments`. |
| A2 | `POST /students` | Validar, insertar estudiante + matrícula, publicar `StudentEnrolled`, responder 201. |
| A3 | `GET /students` | Listar estudiantes. |
| A4 | `GET /students/:id` | Ficha + matrículas (404 si no existe). |
| A5 | `onPaymentConfirmed` | Idempotente: `markProcessed` → `financial_status='solvent'` → publicar `StudentStatusUpdated`. |

## Servicio de PAGOS (`services/payments`)
| # | Tarea | Detalle |
|---|-------|---------|
| P1 | `DDL` | Definir tabla `payments`. |
| P2 | `POST /payments` | Crear obligación (status `pending`). |
| P3 | `GET /payments` | Listar con filtros `?status=` y `?studentId=`. |
| P4 | `POST /payments/:id/confirm` | Confirmar (solo si `pending`, 409 si no) y publicar `PaymentConfirmed`. |

## Servicio de ASISTENCIA / BIENESTAR (`services/attendance`)
| # | Tarea | Detalle |
|---|-------|---------|
| T1 | `DDL` | Definir tablas `attendance` e `incidents`. |
| T2 | `POST /attendance` | Registrar asistencia + publicar `AttendanceRecorded`. |
| T3 | `POST /incidents` | Registrar incidente + publicar `IncidentReported`. |
| T4 | `GET /attendance` | Listar (filtro `?studentId=`). |
| T5 | `GET /incidents` | Listar (filtro `?studentId=`). |

## Servicio de NOTIFICACIONES (`services/notifications`)
| # | Tarea | Detalle |
|---|-------|---------|
| N1 | `DDL` | Definir tabla `notifications`. |
| N2 | `eventToNotification` | **Message Translator**: evento → `{channel, recipient, subject, body}`. |
| N3 | `onEvent` | Idempotente; `deliver`; INSERT; publicar `NotificationSent` / `NotificationFailed`; `throw` ante fallo (→ reintento/DLQ). |
| N4 | `GET /notifications` | Listar notificaciones emitidas. |
| — | `/admin/fail-mode`, `/admin/reprocess-dlq` | **Ya implementados** (andamiaje de resiliencia). |

## Servicio de ANALÍTICA / CQRS (`services/analytics`)
| # | Tarea | Detalle |
|---|-------|---------|
| Q1 | `DDL` | Definir `event_store` (+ índices). |
| Q2 | `onEvent` | Proyección CQRS: INSERT con `ON CONFLICT (event_id) DO NOTHING`. |
| Q3 | `GET /metrics` | Indicadores (COUNT por tipo de evento). |
| Q4 | `GET /students/:id/events` | Historial por estudiante. |
| Q5 | `GET /events` | Flujo reciente (trazabilidad global, `?limit=`). |

## Transversal (ya hecho — no requiere implementación)
Gateway + JWT, `shared/` (mensajería con DLQ, BD, idempotencia, logs),
`docker-compose`, frontends, health checks, colección Postman.

> **Sugerencia de defensa:** quien implemente un servicio debe poder explicar su
> DDL, sus endpoints, los eventos que publica/consume y cómo logra idempotencia
> y resiliencia. El andamiaje (`shared/`) es común: convendría que al menos una
> persona del equipo lo domine para preguntas sobre mensajería y DLQ.

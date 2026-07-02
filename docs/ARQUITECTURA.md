# Documento de Arquitectura — CampusConnect 360

> Documento de respaldo del Proyecto Integrador (Integración de Sistemas,
> Progreso 3). Extensión objetivo: ≤ 10 páginas al exportar. Este archivo es la
> versión de trabajo; la versión final formateada (APA/UDLA) se genera a partir
> de aquí.

## 1. Descripción del problema
Una red de colegios gestiona estudiantes, matrículas, pagos, asistencia,
notificaciones e incidentes en sistemas dispersos. Los datos se duplican, los
pagos no se reflejan a tiempo en lo académico, las notificaciones son manuales,
no hay consolidación en tiempo real ni trazabilidad, y falta una capa estándar
de APIs, seguridad y monitoreo.

## 2. Alcance de la solución
Ecosistema funcional que simula un día de operación: registro de estudiante,
confirmación de pago, registro de asistencia/incidente, notificaciones
automáticas, dashboard directivo y un escenario de falla controlada. Cubre
APIs, API Gateway, mensajería, eventos, integración de datos (CQRS),
seguridad JWT, resiliencia, observabilidad y contenerización. **Fuera de
alcance:** integración con sistemas externos reales, pagos reales, envío real
de correos/SMS (se simulan).

## 3. Actores del ecosistema
Secretaría Académica, Área Financiera, Docente, Bienestar Estudiantil,
Dirección y Administrador del sistema. Cada actor tiene un rol que el gateway
usa para autorizar acciones.

## 4. Diagrama de arquitectura
Frontends (Nginx) → API Gateway (JWT) → 5 microservicios, cada uno con su
base PostgreSQL; integración entre servicios exclusivamente por RabbitMQ
(exchange topic `campus.events` + DLX). Ver diagrama ASCII en el `README.md`
(sección 1); el diagrama formal se incluirá como imagen en la versión final.

## 5. Diagrama de flujo de eventos
```
StudentEnrolled    → notifications, analytics
PaymentConfirmed   → academic, notifications, analytics      (Publish/Subscribe)
AttendanceRecorded → notifications, analytics
IncidentReported   → notifications, analytics
StudentStatusUpdated → analytics
NotificationSent / NotificationFailed → analytics
```

## 6. Servicios implementados
Académico (3001), Pagos (3002), Asistencia/Bienestar (3003),
Notificaciones (3004), Analítica/CQRS (3005) y API Gateway (8080). Cada
servicio es autónomo, con su propio DDL, su base y su `package.json`.

## 7. Contratos de APIs
Documentados con Swagger/OpenAPI por servicio (`/api/<servicio>/docs`).
Resumen en `README.md` y colección de respaldo en `postman/`.

## 8. Contratos de eventos
Estructura mínima común (`shared/events.js`):
`eventId`, `eventType`, `occurredAt`, `correlationId`, `entityId`, `data`.
7 tipos de evento definidos en `EVENT_TYPES`.

## 9. Patrones de integración aplicados
API Gateway, Publish/Subscribe, Point-to-Point, Message Channel, Event
Message, Message Translator, Idempotent Receiver, Dead Letter Channel,
CQRS / vista analítica, Health Check, Logs/Trazabilidad. (Tabla de evidencias
en `README.md`, sección 7.)

## 10. Decisiones arquitectónicas
- **Node.js + Express** por servicio: ligero, un dueño por microservicio,
  facilita repartir commits y defender autoría.
- **RabbitMQ topic exchange**: enrutamiento por `eventType`, habilita
  Pub/Sub y Point-to-Point con la misma infraestructura.
- **Database per Service**: aislamiento de datos; la única integración es por
  eventos.
- **Núcleo `shared/` copiado a cada servicio**: cada microservicio es
  autocontenible (se puede construir y defender por separado).
- **CQRS en Analítica**: separa el modelo de lectura (indicadores) de los
  modelos transaccionales.

## 11. Seguridad
Autenticación con **JWT** emitido por el gateway (`/auth/login`, TTL 8h). El
gateway valida el token, inyecta `x-user-id`/`x-user-role` a los servicios y
autoriza por rol (`requireRole`). Los servicios no exponen puertos públicos en
producción (solo el gateway sería el punto de entrada).

## 12. Resiliencia y manejo de errores
- **Reintentos** con cabecera `x-retry` antes de descartar.
- **Dead Letter Channel**: `campus.dlx` → `<cola>.dlq` al agotar reintentos.
- **Idempotent Receiver**: tabla `processed_events` evita reprocesar.
- **Reprocesamiento manual**: endpoint admin para reinyectar la DLQ.
- **Reconexión** automática a RabbitMQ y reintentos de `init` de BD.
- **Escenario de falla controlada**: `fail-mode` en Notificaciones.

## 13. Observabilidad
Logs JSON estructurados con `correlationId`; health checks por servicio y
agregado en el gateway; trazabilidad de eventos en Analítica (`/events`).

## 14. Integración de datos y dashboard
El servicio Analítica consume todos los eventos y los materializa en
`event_store` (CQRS). El dashboard directivo consulta `/metrics`, pagos
pendientes y trazabilidad, refrescando cada 3 s.

## 15. Limitaciones conocidas
Entrega de notificaciones simulada; sin orquestación de sagas; sin paginación
avanzada; seguridad de nivel demo (secreto JWT en claro para desarrollo);
métricas calculadas por COUNT (no materializadas).

## 16. Mejoras futuras
Saga/orquestación para flujos compuestos, outbox pattern para publicación
transaccional, métricas con Prometheus/Grafana, paginación y filtros,
secret manager, y notificaciones reales (correo/SMS).

## 17. Declaración de uso de IA y recursos externos
Ver `README.md`, sección 10. IA generativa usada como apoyo para código base,
frontends, documentación y pruebas; el grupo comprende, adapta y defiende todo.
La distribución por Historias de Usuario garantiza autoría real por integrante.

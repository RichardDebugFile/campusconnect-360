'use strict';
// ============================================================================
// Servicio de ANALÍTICA (CQRS) — ESQUELETO (plantilla)
//   Publica: (nada)
//   Consume: los 7 eventos (Publish/Subscribe — segundo suscriptor, fan-out)
//
// Mantiene un MODELO DE LECTURA (event_store) que alimenta el dashboard.
// ============================================================================
const express = require('express');
const cors = require('cors');
const log = require('./lib/logger');
const db = require('./lib/db');
const mq = require('./lib/amqp');
const { validateEvent, EVENT_TYPES } = require('./lib/events');
const { correlation, identity, mountDocs } = require('./lib/http');
const openapi = require('./openapi');

const PORT = process.env.PORT || 3005;
const app = express();
app.use(cors());
app.use(express.json());
app.use(correlation);
app.use(identity);

// --- TODO(analytics): define el modelo de lectura (event_store) ----------------
const DDL = `
  -- CREATE TABLE IF NOT EXISTS event_store (
  --   event_id       TEXT PRIMARY KEY,
  --   event_type     TEXT NOT NULL,
  --   entity_id      TEXT,
  --   correlation_id TEXT,
  --   occurred_at    TIMESTAMPTZ,
  --   payload        JSONB,
  --   received_at    TIMESTAMPTZ NOT NULL DEFAULT now()
  -- );
  -- CREATE INDEX IF NOT EXISTS idx_event_entity ON event_store(entity_id);
  -- CREATE INDEX IF NOT EXISTS idx_event_type   ON event_store(event_type);
  SELECT 1;
`;

// TODO(analytics): PROYECCIÓN CQRS.
//   1. validateEvent(event); si no es válido, lanza.
//   2. INSERT INTO event_store (...) VALUES (...) ON CONFLICT (event_id) DO NOTHING.
//      (El ON CONFLICT da idempotencia natural por event_id.)
async function onEvent(event) {
  log.warn('TODO: implementar onEvent (proyección CQRS)', { eventId: event.eventId });
}

// ---------- API REST (modelo de lectura) ----------
app.get('/health', async (req, res) => {
  res.json({ service: 'analytics', db: await db.isHealthy(), broker: mq.isConnected(), ts: new Date().toISOString() });
});

// TODO(analytics): Indicadores consolidados para el dashboard.
//   COUNT por event_type: totalStudents (StudentEnrolled), paymentsConfirmed,
//   attendanceRecorded, incidentsReported, statusUpdates, notificationsSent,
//   notificationsFailed, y eventsProcessed (COUNT total).
app.get('/metrics', async (req, res) => {
  res.status(501).json({ error: 'TODO: implementar GET /metrics' });
});

// TODO(analytics): Historial de eventos por estudiante (entity_id), orden asc.
app.get('/students/:id/events', async (req, res) => {
  res.status(501).json({ error: 'TODO: implementar GET /students/:id/events' });
});

// TODO(analytics): Flujo reciente de eventos (trazabilidad global, ?limit=).
app.get('/events', async (req, res) => {
  res.status(501).json({ error: 'TODO: implementar GET /events' });
});

// ---------- Arranque y wiring (ANDAMIAJE — no tocar) ----------
async function start() {
  await db.init(DDL);
  await mq.connect();
  // Publish/Subscribe: analítica es el OTRO suscriptor (junto a notificaciones) -> fan-out.
  await mq.consume({
    queue: 'analytics.events',
    bindings: [
      EVENT_TYPES.StudentEnrolled,
      EVENT_TYPES.PaymentConfirmed,
      EVENT_TYPES.AttendanceRecorded,
      EVENT_TYPES.IncidentReported,
      EVENT_TYPES.StudentStatusUpdated,
      EVENT_TYPES.NotificationSent,
      EVENT_TYPES.NotificationFailed,
    ],
    handler: onEvent,
    deadLetter: true,
    maxRetries: 3,
  });
  mountDocs(app, openapi);
  app.listen(PORT, () => log.info(`Analytics service escuchando en :${PORT}`));
}

start().catch((e) => { log.error('Fallo al arrancar', { err: e.message }); process.exit(1); });

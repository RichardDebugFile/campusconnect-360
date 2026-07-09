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

// --- HU-Q1: modelo de lectura (event_store) ------------------------------------
// Proyección CQRS: una sola tabla append-only que materializa TODOS los eventos
// del ecosistema. event_id es PK -> idempotencia natural por ON CONFLICT.
const DDL = `
  CREATE TABLE IF NOT EXISTS event_store (
    event_id       TEXT PRIMARY KEY,
    event_type     TEXT NOT NULL,
    entity_id      TEXT,
    correlation_id TEXT,
    occurred_at    TIMESTAMPTZ,
    payload        JSONB,
    received_at    TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS idx_event_entity ON event_store(entity_id);
  CREATE INDEX IF NOT EXISTS idx_event_type   ON event_store(event_type);
`;

// HU-Q1: PROYECCIÓN CQRS (Idempotent Receiver).
//   1. Valida el evento entrante; si el formato es inválido, lanza -> reintento/DLQ.
//   2. Inserta en event_store con ON CONFLICT (event_id) DO NOTHING
//      => cada evento queda registrado UNA sola vez (idempotencia por event_id).
async function onEvent(event) {
  const check = validateEvent(event);
  if (!check.valid) {
    throw new Error(`Evento con formato inválido: ${check.reason}`);
  }
  const res = await db.query(
    `INSERT INTO event_store (event_id, event_type, entity_id, correlation_id, occurred_at, payload)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (event_id) DO NOTHING`,
    [
      event.eventId,
      event.eventType,
      event.entityId || null,
      event.correlationId || null,
      event.occurredAt || null,
      JSON.stringify(event.data || {}),
    ]
  );
  if (res.rowCount > 0) {
    log.info('Evento materializado en el modelo de lectura', {
      eventId: event.eventId, eventType: event.eventType, correlationId: event.correlationId,
    });
  } else {
    log.info('Evento duplicado ignorado (idempotencia)', { eventId: event.eventId });
  }
}

// ---------- API REST (modelo de lectura) ----------
app.get('/health', async (req, res) => {
  res.json({ service: 'analytics', db: await db.isHealthy(), broker: mq.isConnected(), ts: new Date().toISOString() });
});

// HU-Q2: Indicadores consolidados para el dashboard.
//   COUNT por event_type (con 0 por defecto) + total general (eventsProcessed).
app.get('/metrics', async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT event_type, COUNT(*)::int AS n FROM event_store GROUP BY event_type'
    );
    const by = Object.fromEntries(rows.map((r) => [r.event_type, r.n]));
    const eventsProcessed = rows.reduce((acc, r) => acc + r.n, 0);
    res.json({
      totalStudents: by[EVENT_TYPES.StudentEnrolled] || 0,
      paymentsConfirmed: by[EVENT_TYPES.PaymentConfirmed] || 0,
      attendanceRecorded: by[EVENT_TYPES.AttendanceRecorded] || 0,
      incidentsReported: by[EVENT_TYPES.IncidentReported] || 0,
      statusUpdates: by[EVENT_TYPES.StudentStatusUpdated] || 0,
      notificationsSent: by[EVENT_TYPES.NotificationSent] || 0,
      notificationsFailed: by[EVENT_TYPES.NotificationFailed] || 0,
      eventsProcessed,
    });
  } catch (err) {
    log.error('Error en GET /metrics', { err: err.message });
    res.status(500).json({ error: err.message });
  }
});

// HU-Q2: Historial de eventos de un estudiante (entity_id), orden cronológico asc.
app.get('/students/:id/events', async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT event_id, event_type, entity_id, correlation_id, occurred_at, payload, received_at
       FROM event_store WHERE entity_id = $1 ORDER BY occurred_at ASC`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    log.error('Error en GET /students/:id/events', { err: err.message });
    res.status(500).json({ error: err.message });
  }
});

// HU-Q2: Flujo reciente de eventos (trazabilidad global, ?limit=, más nuevos primero).
app.get('/events', async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 500);
    const { rows } = await db.query(
      `SELECT event_id, event_type, entity_id, correlation_id, occurred_at, payload, received_at
       FROM event_store ORDER BY received_at DESC LIMIT $1`,
      [limit]
    );
    res.json(rows);
  } catch (err) {
    log.error('Error en GET /events', { err: err.message });
    res.status(500).json({ error: err.message });
  }
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

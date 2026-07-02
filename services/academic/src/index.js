'use strict';
// ============================================================================
// Servicio ACADÉMICO — ESQUELETO (plantilla)
// ----------------------------------------------------------------------------
// El ANDAMIAJE está completo y verificado (no lo cambies salvo que sepas qué
// haces): imports, middlewares, health, wiring de mensajería en start() y el
// arranque. Tu trabajo es IMPLEMENTAR la LÓGICA DE NEGOCIO marcada con TODO.
//
// Responsabilidad: estudiantes y matrículas.
//   Publica: StudentEnrolled, StudentStatusUpdated
//   Consume: PaymentConfirmed (Point-to-Point)
// ============================================================================
const express = require('express');
const cors = require('cors');
const log = require('./lib/logger');
const db = require('./lib/db');
const mq = require('./lib/amqp');
const { buildEvent, validateEvent, EVENT_TYPES } = require('./lib/events');
const { correlation, identity, requireRole, mountDocs } = require('./lib/http');
const openapi = require('./openapi');

const PORT = process.env.PORT || 3001;
const app = express();
app.use(cors());
app.use(express.json());
app.use(correlation);
app.use(identity);

// --- TODO(academic): define el esquema de tu servicio --------------------------
// Descomenta y adapta el modelo de datos de tu dominio. Mientras no definas
// tablas, el SELECT 1 evita que db.init falle al arrancar.
const DDL = `
  -- CREATE SEQUENCE IF NOT EXISTS student_seq START 1;
  -- CREATE TABLE IF NOT EXISTS students (
  --   id               TEXT PRIMARY KEY DEFAULT ('STU-' || lpad(nextval('student_seq')::text, 4, '0')),
  --   first_name       TEXT NOT NULL,
  --   last_name        TEXT NOT NULL,
  --   grade            TEXT NOT NULL,
  --   school_id        TEXT NOT NULL,
  --   academic_status  TEXT NOT NULL DEFAULT 'active',
  --   financial_status TEXT NOT NULL DEFAULT 'pending',
  --   created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
  -- );
  -- CREATE TABLE IF NOT EXISTS enrollments ( ... );
  SELECT 1;
`;

// ---------- API REST ----------

// Health check (observabilidad) — ANDAMIAJE, listo para usar.
app.get('/health', async (req, res) => {
  res.json({ service: 'academic', db: await db.isHealthy(), broker: mq.isConnected(), ts: new Date().toISOString() });
});

// TODO(academic): Registrar estudiante + matrícula y publicar StudentEnrolled.
//   1. Validar body (firstName, lastName, grade, schoolId) -> 400 si falta.
//   2. INSERT en students (+ enrollments).
//   3. buildEvent(EVENT_TYPES.StudentEnrolled, { entityId, correlationId: req.correlationId, data }).
//   4. await mq.publish(event).
//   5. Responder 201 con el estudiante y { eventId }.
app.post('/students', requireRole('secretaria', 'admin'), async (req, res) => {
  res.status(501).json({ error: 'TODO: implementar POST /students' });
});

// TODO(academic): Listar estudiantes (SELECT * FROM students).
app.get('/students', requireRole('secretaria', 'admin', 'finanzas', 'docente', 'director'), async (req, res) => {
  res.status(501).json({ error: 'TODO: implementar GET /students' });
});

// TODO(academic): Ficha del estudiante por id (404 si no existe) + sus matrículas.
app.get('/students/:id', async (req, res) => {
  res.status(501).json({ error: 'TODO: implementar GET /students/:id' });
});

// ---------- Consumidor: PaymentConfirmed (Idempotent Receiver) ----------
// TODO(academic): Procesar PaymentConfirmed de forma idempotente.
//   1. validateEvent(event); si no es válido, lanza (=> reintento/DLQ).
//   2. db.markProcessed(eventId, eventType); si ya procesado, return (idempotencia).
//   3. UPDATE students SET financial_status='solvent' WHERE id = event.entityId.
//   4. Publicar StudentStatusUpdated (buildEvent + mq.publish).
async function onPaymentConfirmed(event) {
  log.warn('TODO: implementar onPaymentConfirmed', { eventId: event.eventId });
}

// ---------- Arranque y wiring de mensajería (ANDAMIAJE — no tocar) ----------
async function start() {
  await db.init(DDL);
  await mq.connect();
  // Point-to-Point: cola consumida únicamente por este servicio.
  await mq.consume({
    queue: 'academic.payment-confirmed',
    bindings: [EVENT_TYPES.PaymentConfirmed],
    handler: onPaymentConfirmed,
  });
  mountDocs(app, openapi);
  app.listen(PORT, () => log.info(`Academic service escuchando en :${PORT}`));
}

start().catch((e) => { log.error('Fallo al arrancar', { err: e.message }); process.exit(1); });

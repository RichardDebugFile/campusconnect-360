'use strict';
// ============================================================================
// Servicio de PAGOS — ESQUELETO (plantilla)
//   Publica: PaymentConfirmed
//   Consume: (nada)
// Implementa la LÓGICA marcada con TODO. El andamiaje ya está listo.
// ============================================================================
const express = require('express');
const cors = require('cors');
const log = require('./lib/logger');
const db = require('./lib/db');
const mq = require('./lib/amqp');
const { buildEvent, EVENT_TYPES } = require('./lib/events');
const { correlation, identity, requireRole, mountDocs } = require('./lib/http');
const openapi = require('./openapi');

const PORT = process.env.PORT || 3002;
const app = express();
app.use(cors());
app.use(express.json());
app.use(correlation);
app.use(identity);

// --- TODO(payments): define el esquema de tu servicio --------------------------
const DDL = `
  -- CREATE TABLE IF NOT EXISTS payments (
  --   id           SERIAL PRIMARY KEY,
  --   student_id   TEXT NOT NULL,
  --   concept      TEXT NOT NULL,
  --   amount       NUMERIC(10,2) NOT NULL,
  --   status       TEXT NOT NULL DEFAULT 'pending',
  --   created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  --   confirmed_at TIMESTAMPTZ
  -- );
  SELECT 1;
`;

app.get('/health', async (req, res) => {
  res.json({ service: 'payments', db: await db.isHealthy(), broker: mq.isConnected(), ts: new Date().toISOString() });
});

// TODO(payments): Crear obligación/deuda.
//   1. Validar body (studentId, concept, amount) -> 400 si falta.
//   2. INSERT en payments (status='pending') RETURNING *.
//   3. Responder 201 con la fila creada.
app.post('/payments', requireRole('finanzas', 'admin'), async (req, res) => {
  res.status(501).json({ error: 'TODO: implementar POST /payments' });
});

// TODO(payments): Listar pagos con filtros opcionales ?status= y ?studentId=.
app.get('/payments', requireRole('finanzas', 'admin', 'director'), async (req, res) => {
  res.status(501).json({ error: 'TODO: implementar GET /payments' });
});

// TODO(payments): Confirmar pago y publicar PaymentConfirmed.
//   1. UPDATE payments SET status='confirmed', confirmed_at=now()
//      WHERE id=:id AND status='pending' RETURNING *  (409 si no aplica).
//   2. buildEvent(EVENT_TYPES.PaymentConfirmed, { entityId: student_id, correlationId, data }).
//   3. await mq.publish(event); responder con { payment, eventId }.
app.post('/payments/:id/confirm', requireRole('finanzas', 'admin'), async (req, res) => {
  res.status(501).json({ error: 'TODO: implementar POST /payments/:id/confirm' });
});

// ---------- Arranque (ANDAMIAJE — no tocar) ----------
async function start() {
  await db.init(DDL);
  await mq.connect();
  mountDocs(app, openapi);
  app.listen(PORT, () => log.info(`Payments service escuchando en :${PORT}`));
}

start().catch((e) => { log.error('Fallo al arrancar', { err: e.message }); process.exit(1); });

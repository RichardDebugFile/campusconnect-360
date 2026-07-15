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

// --- P1: modelo de obligaciones de pago ---------------------------------------
const DDL = `
  CREATE TABLE IF NOT EXISTS payments (
    id           SERIAL PRIMARY KEY,
    student_id   TEXT NOT NULL,
    concept      TEXT NOT NULL,
    amount       NUMERIC(10,2) NOT NULL,
    status       TEXT NOT NULL DEFAULT 'pending',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    confirmed_at TIMESTAMPTZ
  );
  CREATE INDEX IF NOT EXISTS idx_payments_student_id ON payments(student_id);
  CREATE INDEX IF NOT EXISTS idx_payments_status     ON payments(status);
`;

app.get('/health', async (req, res) => {
  res.json({ service: 'payments', db: await db.isHealthy(), broker: mq.isConnected(), ts: new Date().toISOString() });
});

// P2: crea una obligación/deuda en estado 'pending'.
app.post('/payments', requireRole('finanzas', 'admin'), async (req, res) => {
  const { studentId, concept, amount } = req.body || {};
  if (!studentId || !concept || amount == null) {
    return res.status(400).json({ error: 'studentId, concept y amount son obligatorios' });
  }
  if (isNaN(Number(amount)) || Number(amount) < 0) {
    return res.status(400).json({ error: 'amount debe ser un número no negativo' });
  }
  try {
    const r = await db.query(
      `INSERT INTO payments (student_id, concept, amount) VALUES ($1, $2, $3) RETURNING *`,
      [studentId, concept, amount]
    );
    return res.status(201).json(r.rows[0]);
  } catch (err) {
    log.error('Error al crear obligación de pago', { correlationId: req.correlationId, err: err.message });
    return res.status(500).json({ error: 'No se pudo registrar el pago' });
  }
});

// P3: lista pagos con filtros opcionales ?status= y ?studentId=.
app.get('/payments', requireRole('finanzas', 'admin', 'director'), async (req, res) => {
  const { status, studentId } = req.query;
  const conds = [];
  const params = [];
  if (status) { params.push(status); conds.push(`status = $${params.length}`); }
  if (studentId) { params.push(studentId); conds.push(`student_id = $${params.length}`); }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  try {
    const r = await db.query(`SELECT * FROM payments ${where} ORDER BY created_at DESC`, params);
    return res.json(r.rows);
  } catch (err) {
    log.error('Error al listar pagos', { correlationId: req.correlationId, err: err.message });
    return res.status(500).json({ error: 'No se pudieron consultar los pagos' });
  }
});

// P4: confirma un pago 'pending' (409 si no aplica) y publica PaymentConfirmed.
app.post('/payments/:id/confirm', requireRole('finanzas', 'admin'), async (req, res) => {
  try {
    const r = await db.query(
      `UPDATE payments SET status='confirmed', confirmed_at=now()
       WHERE id=$1 AND status='pending' RETURNING *`,
      [req.params.id]
    );
    if (!r.rowCount) {
      return res.status(409).json({ error: 'Pago inexistente o ya confirmado' });
    }
    const payment = r.rows[0];
    const event = buildEvent(EVENT_TYPES.PaymentConfirmed, {
      entityId: payment.student_id,
      correlationId: req.correlationId,
      data: { paymentId: payment.id, concept: payment.concept, amount: Number(payment.amount) },
    });
    await mq.publish(event);
    log.info('Pago confirmado y evento publicado', {
      paymentId: payment.id, studentId: payment.student_id,
      eventId: event.eventId, correlationId: req.correlationId,
    });
    return res.json({ payment, eventId: event.eventId });
  } catch (err) {
    log.error('Error al confirmar pago', {
      paymentId: req.params.id, correlationId: req.correlationId, err: err.message,
    });
    return res.status(500).json({ error: 'No se pudo confirmar el pago' });
  }
});

// ---------- Arranque (ANDAMIAJE — no tocar) ----------
async function start() {
  await db.init(DDL);
  await mq.connect();
  mountDocs(app, openapi);
  app.listen(PORT, () => log.info(`Payments service escuchando en :${PORT}`));
}

start().catch((e) => { log.error('Fallo al arrancar', { err: e.message }); process.exit(1); });

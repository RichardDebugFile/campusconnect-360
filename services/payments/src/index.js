'use strict';
// ============================================================================
// Servicio de PAGOS - CampusConnect 360
//   HU-P1: gestion de obligaciones (DDL + POST/GET /payments).
//   HU-P2: confirmacion de pago con publicacion de PaymentConfirmed.
//   Publica: PaymentConfirmed  (lo consumen Academico, Notifications, Analytics)
//   Consume: (nada)
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

// ---------------------------------------------------------------------------
// HU-P1 - Modelo de datos
// CHECKs a nivel BD para que un estado o un monto invalido no puedan colarse
// aunque la capa de aplicacion tenga un bug. Indices para los filtros que
// expone GET /payments.
// ---------------------------------------------------------------------------
const DDL = `
  CREATE TABLE IF NOT EXISTS payments (
    id           SERIAL PRIMARY KEY,
    student_id   TEXT NOT NULL,
    concept      TEXT NOT NULL,
    amount       NUMERIC(10,2) NOT NULL CHECK (amount >= 0),
    status       TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'confirmed')),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    confirmed_at TIMESTAMPTZ
  );
  CREATE INDEX IF NOT EXISTS idx_payments_student_id ON payments(student_id);
  CREATE INDEX IF NOT EXISTS idx_payments_status     ON payments(status);
`;

// ---------------------------------------------------------------------------
// Validaciones reutilizables. Centralizarlas aca deja los handlers limpios.
// ---------------------------------------------------------------------------
const ALLOWED_STATUSES = ['pending', 'confirmed'];
const MAX_AMOUNT = 100000;   // tope defensivo para deudas academicas
const MAX_CONCEPT_LEN = 200;

function validatePaymentPayload(body) {
  const errors = [];
  const studentId = typeof body?.studentId === 'string' ? body.studentId.trim() : '';
  const concept   = typeof body?.concept   === 'string' ? body.concept.trim()   : '';
  const amountRaw = body?.amount;

  if (!studentId) errors.push('studentId es obligatorio');
  if (!concept)   errors.push('concept es obligatorio');
  else if (concept.length > MAX_CONCEPT_LEN) errors.push(`concept excede ${MAX_CONCEPT_LEN} caracteres`);

  const amount = Number(amountRaw);
  if (amountRaw == null || Number.isNaN(amount)) errors.push('amount debe ser numerico');
  else if (amount < 0)          errors.push('amount no puede ser negativo');
  else if (amount > MAX_AMOUNT) errors.push(`amount excede el maximo permitido (${MAX_AMOUNT})`);
  else if (!/^-?\d+(\.\d{1,2})?$/.test(String(amountRaw))) errors.push('amount admite maximo 2 decimales');

  return { errors, clean: { studentId, concept, amount: Number(amount.toFixed(2)) } };
}

function parsePositiveInt(raw) {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------
app.get('/health', async (req, res) => {
  res.json({
    service: 'payments',
    db: await db.isHealthy(),
    broker: mq.isConnected(),
    ts: new Date().toISOString(),
  });
});

// ---------------------------------------------------------------------------
// HU-P1 - POST /payments
// Crea una obligacion en estado 'pending'. Solo finanzas/admin.
// ---------------------------------------------------------------------------
app.post('/payments', requireRole('finanzas', 'admin'), async (req, res) => {
  const { errors, clean } = validatePaymentPayload(req.body);
  if (errors.length) {
    return res.status(400).json({ error: 'Datos invalidos', details: errors });
  }
  try {
    const r = await db.query(
      `INSERT INTO payments (student_id, concept, amount)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [clean.studentId, clean.concept, clean.amount]
    );
    const payment = r.rows[0];
    log.info('Obligacion de pago creada', {
      paymentId: payment.id,
      studentId: payment.student_id,
      amount: Number(payment.amount),
      userId: req.userId,
      correlationId: req.correlationId,
    });
    return res.status(201).json(payment);
  } catch (err) {
    log.error('Fallo al crear obligacion', {
      correlationId: req.correlationId,
      err: err.message,
    });
    return res.status(500).json({ error: 'No se pudo registrar la obligacion' });
  }
});

// ---------------------------------------------------------------------------
// HU-P1 - GET /payments
// Lista con filtros ?status= y ?studentId=. Paginacion opcional.
// Roles: finanzas/admin operan la cartera; director puede consultar.
// ---------------------------------------------------------------------------
app.get('/payments', requireRole('finanzas', 'admin', 'director'), async (req, res) => {
  const { status, studentId } = req.query;

  if (status && !ALLOWED_STATUSES.includes(String(status))) {
    return res.status(400).json({
      error: `status invalido; permitidos: ${ALLOWED_STATUSES.join(', ')}`,
    });
  }

  const limit  = Math.min(Math.max(Number(req.query.limit)  || 100, 1), 500);
  const offset = Math.max(Number(req.query.offset) || 0, 0);

  const conds = [];
  const params = [];
  if (status)    { params.push(status);    conds.push(`status = $${params.length}`); }
  if (studentId) { params.push(studentId); conds.push(`student_id = $${params.length}`); }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

  params.push(limit);
  params.push(offset);

  try {
    const r = await db.query(
      `SELECT * FROM payments
       ${where}
       ORDER BY created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    return res.json(r.rows);
  } catch (err) {
    log.error('Fallo al listar pagos', {
      correlationId: req.correlationId,
      err: err.message,
    });
    return res.status(500).json({ error: 'No se pudieron consultar los pagos' });
  }
});

// ---------------------------------------------------------------------------
// HU-P2 - POST /payments/:id/confirm
// Confirma un pago pendiente y publica PaymentConfirmed.
// La actualizacion condicional (WHERE ... AND status='pending') actua como
// candado optimista: si dos requests llegan a la vez, solo una devuelve fila.
// ---------------------------------------------------------------------------
app.post('/payments/:id/confirm', requireRole('finanzas', 'admin'), async (req, res) => {
  const id = parsePositiveInt(req.params.id);
  if (!id) {
    return res.status(400).json({ error: 'id debe ser un entero positivo' });
  }

  try {
    const r = await db.query(
      `UPDATE payments
          SET status = 'confirmed',
              confirmed_at = now()
        WHERE id = $1
          AND status = 'pending'
        RETURNING *`,
      [id]
    );

    if (!r.rowCount) {
      // Cubre los dos casos: no existe o ya estaba confirmado (HU-P2).
      return res.status(409).json({ error: 'Pago inexistente o ya confirmado' });
    }

    const payment = r.rows[0];

    // Evento con contrato compartido: entityId = estudiante (Academico lo usa
    // para marcarlo 'solvent'), data lleva paymentId/concept/amount para
    // Notifications y Analytics.
    const event = buildEvent(EVENT_TYPES.PaymentConfirmed, {
      entityId: payment.student_id,
      correlationId: req.correlationId,
      data: {
        paymentId: payment.id,
        concept: payment.concept,
        amount: Number(payment.amount),
      },
    });

    await mq.publish(event);

    log.info('Pago confirmado y evento publicado', {
      paymentId: payment.id,
      studentId: payment.student_id,
      eventId: event.eventId,
      userId: req.userId,
      correlationId: req.correlationId,
    });

    return res.json({ payment, eventId: event.eventId });
  } catch (err) {
    log.error('Fallo al confirmar pago', {
      paymentId: req.params.id,
      correlationId: req.correlationId,
      err: err.message,
    });
    return res.status(500).json({ error: 'No se pudo confirmar el pago' });
  }
});

// ---------------------------------------------------------------------------
// Arranque (andamiaje compartido)
// ---------------------------------------------------------------------------
async function start() {
  await db.init(DDL);
  await mq.connect();
  mountDocs(app, openapi);
  app.listen(PORT, () => log.info(`Payments service escuchando en :${PORT}`));
}

start().catch((e) => {
  log.error('Fallo al arrancar', { err: e.message });
  process.exit(1);
});

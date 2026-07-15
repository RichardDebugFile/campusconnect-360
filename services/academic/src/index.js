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

// --- HU-A1: modelo de estudiantes y matrículas --------------------------------
const DDL = `
  CREATE SEQUENCE IF NOT EXISTS student_seq START 1;
  CREATE TABLE IF NOT EXISTS students (
    id               TEXT PRIMARY KEY DEFAULT ('STU-' || lpad(nextval('student_seq')::text, 4, '0')),
    first_name       TEXT NOT NULL,
    last_name        TEXT NOT NULL,
    grade            TEXT NOT NULL,
    school_id        TEXT NOT NULL,
    academic_status  TEXT NOT NULL DEFAULT 'active',
    financial_status TEXT NOT NULL DEFAULT 'pending',
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE TABLE IF NOT EXISTS enrollments (
    id          BIGSERIAL PRIMARY KEY,
    student_id  TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    grade       TEXT NOT NULL,
    school_id   TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'active',
    enrolled_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS idx_enrollments_student_id ON enrollments(student_id);
`;

// ---------- API REST ----------

// Health check (observabilidad) — ANDAMIAJE, listo para usar.
app.get('/health', async (req, res) => {
  res.json({ service: 'academic', db: await db.isHealthy(), broker: mq.isConnected(), ts: new Date().toISOString() });
});

// HU-A1: registra estudiante + matrícula y publica StudentEnrolled.
app.post('/students', requireRole('secretaria', 'admin'), async (req, res) => {
  const fields = ['firstName', 'lastName', 'grade', 'schoolId'];
  const values = Object.fromEntries(fields.map((field) => [
    field,
    typeof req.body[field] === 'string' ? req.body[field].trim() : '',
  ]));
  const missing = fields.filter((field) => !values[field]);

  if (missing.length) {
    return res.status(400).json({
      error: 'Faltan campos obligatorios',
      fields: missing,
    });
  }

  let client;
  try {
    client = await db.pool.connect();
    await client.query('BEGIN');
    const studentResult = await client.query(
      `INSERT INTO students (first_name, last_name, grade, school_id)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [values.firstName, values.lastName, values.grade, values.schoolId]
    );
    const student = studentResult.rows[0];
    const enrollmentResult = await client.query(
      `INSERT INTO enrollments (student_id, grade, school_id)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [student.id, student.grade, student.school_id]
    );
    const enrollment = enrollmentResult.rows[0];
    const event = buildEvent(EVENT_TYPES.StudentEnrolled, {
      entityId: student.id,
      correlationId: req.correlationId,
      data: {
        firstName: student.first_name,
        lastName: student.last_name,
        grade: student.grade,
        schoolId: student.school_id,
        enrollmentId: enrollment.id,
      },
    });

    await mq.publish(event);
    await client.query('COMMIT');
    return res.status(201).json({
      student: { ...student, enrollments: [enrollment] },
      eventId: event.eventId,
    });
  } catch (err) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    log.error('Error al registrar estudiante', {
      correlationId: req.correlationId,
      err: err.message,
    });
    return res.status(500).json({ error: 'No se pudo registrar el estudiante' });
  } finally {
    if (client) client.release();
  }
});

// HU-A1: lista estudiantes para los portales autorizados.
app.get('/students', requireRole('secretaria', 'admin', 'finanzas', 'docente', 'director'), async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM students ORDER BY created_at ASC, id ASC');
    return res.json(rows);
  } catch (err) {
    log.error('Error al listar estudiantes', { correlationId: req.correlationId, err: err.message });
    return res.status(500).json({ error: 'No se pudieron consultar los estudiantes' });
  }
});

// HU-A1: devuelve la ficha del estudiante y todas sus matrículas.
app.get('/students/:id', async (req, res) => {
  try {
    const studentResult = await db.query('SELECT * FROM students WHERE id = $1', [req.params.id]);
    if (!studentResult.rowCount) {
      return res.status(404).json({ error: 'Estudiante no encontrado' });
    }
    const enrollmentResult = await db.query(
      'SELECT * FROM enrollments WHERE student_id = $1 ORDER BY enrolled_at ASC, id ASC',
      [req.params.id]
    );
    return res.json({ ...studentResult.rows[0], enrollments: enrollmentResult.rows });
  } catch (err) {
    log.error('Error al consultar estudiante', {
      studentId: req.params.id,
      correlationId: req.correlationId,
      err: err.message,
    });
    return res.status(500).json({ error: 'No se pudo consultar el estudiante' });
  }
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

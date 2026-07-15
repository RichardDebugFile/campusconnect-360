'use strict';
// ============================================================================
// Servicio de ASISTENCIA / BIENESTAR — ESQUELETO (plantilla)
//   Publica: AttendanceRecorded, IncidentReported
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

const PORT = process.env.PORT || 3003;
const app = express();
app.use(cors());
app.use(express.json());
app.use(correlation);
app.use(identity);

// --- T1: modelo de asistencia e incidentes/bienestar --------------------------
const DDL = `
  CREATE TABLE IF NOT EXISTS attendance (
    id         SERIAL PRIMARY KEY,
    student_id TEXT NOT NULL,
    status     TEXT NOT NULL,
    note       TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE TABLE IF NOT EXISTS incidents (
    id          SERIAL PRIMARY KEY,
    student_id  TEXT NOT NULL,
    type        TEXT NOT NULL,
    severity    TEXT NOT NULL DEFAULT 'low',
    description TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS idx_attendance_student_id ON attendance(student_id);
  CREATE INDEX IF NOT EXISTS idx_incidents_student_id  ON incidents(student_id);
`;

app.get('/health', async (req, res) => {
  res.json({ service: 'attendance', db: await db.isHealthy(), broker: mq.isConnected(), ts: new Date().toISOString() });
});

// T2: registra asistencia y publica AttendanceRecorded.
app.post('/attendance', requireRole('docente', 'admin'), async (req, res) => {
  const { studentId, status, note } = req.body || {};
  if (!studentId || !status) {
    return res.status(400).json({ error: 'studentId y status son obligatorios' });
  }
  try {
    const r = await db.query(
      `INSERT INTO attendance (student_id, status, note) VALUES ($1, $2, $3) RETURNING *`,
      [studentId, status, note || null]
    );
    const attendance = r.rows[0];
    const event = buildEvent(EVENT_TYPES.AttendanceRecorded, {
      entityId: studentId,
      correlationId: req.correlationId,
      data: { attendanceId: attendance.id, status, note: note || null },
    });
    await mq.publish(event);
    return res.status(201).json({ attendance, eventId: event.eventId });
  } catch (err) {
    log.error('Error al registrar asistencia', { correlationId: req.correlationId, err: err.message });
    return res.status(500).json({ error: 'No se pudo registrar la asistencia' });
  }
});

// T3: registra un incidente/novedad de bienestar y publica IncidentReported.
app.post('/incidents', requireRole('docente', 'bienestar', 'admin'), async (req, res) => {
  const { studentId, type, severity, description } = req.body || {};
  if (!studentId || !type) {
    return res.status(400).json({ error: 'studentId y type son obligatorios' });
  }
  try {
    const r = await db.query(
      `INSERT INTO incidents (student_id, type, severity, description) VALUES ($1, $2, $3, $4) RETURNING *`,
      [studentId, type, severity || 'low', description || null]
    );
    const incident = r.rows[0];
    const event = buildEvent(EVENT_TYPES.IncidentReported, {
      entityId: studentId,
      correlationId: req.correlationId,
      data: { incidentId: incident.id, type, severity: incident.severity, description: description || null },
    });
    await mq.publish(event);
    return res.status(201).json({ incident, eventId: event.eventId });
  } catch (err) {
    log.error('Error al registrar incidente', { correlationId: req.correlationId, err: err.message });
    return res.status(500).json({ error: 'No se pudo registrar el incidente' });
  }
});

// T4: lista asistencia (filtro opcional ?studentId=).
app.get('/attendance', requireRole('docente', 'bienestar', 'admin', 'director'), async (req, res) => {
  const { studentId } = req.query;
  try {
    const r = studentId
      ? await db.query('SELECT * FROM attendance WHERE student_id=$1 ORDER BY created_at DESC', [studentId])
      : await db.query('SELECT * FROM attendance ORDER BY created_at DESC LIMIT 200');
    return res.json(r.rows);
  } catch (err) {
    log.error('Error al listar asistencia', { correlationId: req.correlationId, err: err.message });
    return res.status(500).json({ error: 'No se pudo consultar la asistencia' });
  }
});

// T5: lista incidentes (filtro opcional ?studentId=).
app.get('/incidents', requireRole('docente', 'bienestar', 'admin', 'director'), async (req, res) => {
  const { studentId } = req.query;
  try {
    const r = studentId
      ? await db.query('SELECT * FROM incidents WHERE student_id=$1 ORDER BY created_at DESC', [studentId])
      : await db.query('SELECT * FROM incidents ORDER BY created_at DESC LIMIT 200');
    return res.json(r.rows);
  } catch (err) {
    log.error('Error al listar incidentes', { correlationId: req.correlationId, err: err.message });
    return res.status(500).json({ error: 'No se pudieron consultar los incidentes' });
  }
});

// ---------- Arranque (ANDAMIAJE — no tocar) ----------
async function start() {
  await db.init(DDL);
  await mq.connect();
  mountDocs(app, openapi);
  app.listen(PORT, () => log.info(`Attendance service escuchando en :${PORT}`));
}

start().catch((e) => { log.error('Fallo al arrancar', { err: e.message }); process.exit(1); });

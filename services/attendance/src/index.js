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

// --- TODO(attendance): define el esquema de tu servicio ------------------------
const DDL = `
  -- CREATE TABLE IF NOT EXISTS attendance (
  --   id SERIAL PRIMARY KEY, student_id TEXT NOT NULL, status TEXT NOT NULL,
  --   note TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  -- );
  -- CREATE TABLE IF NOT EXISTS incidents (
  --   id SERIAL PRIMARY KEY, student_id TEXT NOT NULL, type TEXT NOT NULL,
  --   severity TEXT NOT NULL DEFAULT 'low', description TEXT,
  --   created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  -- );
  SELECT 1;
`;

app.get('/health', async (req, res) => {
  res.json({ service: 'attendance', db: await db.isHealthy(), broker: mq.isConnected(), ts: new Date().toISOString() });
});

// TODO(attendance): Registrar asistencia y publicar AttendanceRecorded.
//   1. Validar (studentId, status). 2. INSERT en attendance.
//   3. buildEvent(EVENT_TYPES.AttendanceRecorded, {...}) + mq.publish. 4. 201.
app.post('/attendance', requireRole('docente', 'admin'), async (req, res) => {
  res.status(501).json({ error: 'TODO: implementar POST /attendance' });
});

// TODO(attendance): Registrar incidente y publicar IncidentReported.
//   1. Validar (studentId, type). 2. INSERT en incidents.
//   3. buildEvent(EVENT_TYPES.IncidentReported, {...}) + mq.publish. 4. 201.
app.post('/incidents', requireRole('docente', 'bienestar', 'admin'), async (req, res) => {
  res.status(501).json({ error: 'TODO: implementar POST /incidents' });
});

// TODO(attendance): Listar asistencia (filtro opcional ?studentId=).
app.get('/attendance', requireRole('docente', 'bienestar', 'admin', 'director'), async (req, res) => {
  res.status(501).json({ error: 'TODO: implementar GET /attendance' });
});

// TODO(attendance): Listar incidentes (filtro opcional ?studentId=).
app.get('/incidents', requireRole('docente', 'bienestar', 'admin', 'director'), async (req, res) => {
  res.status(501).json({ error: 'TODO: implementar GET /incidents' });
});

// ---------- Arranque (ANDAMIAJE — no tocar) ----------
async function start() {
  await db.init(DDL);
  await mq.connect();
  mountDocs(app, openapi);
  app.listen(PORT, () => log.info(`Attendance service escuchando en :${PORT}`));
}

start().catch((e) => { log.error('Fallo al arrancar', { err: e.message }); process.exit(1); });

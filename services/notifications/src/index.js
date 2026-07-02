'use strict';
// ============================================================================
// Servicio de NOTIFICACIONES — ESQUELETO (plantilla)
//   Publica: NotificationSent, NotificationFailed
//   Consume: StudentEnrolled, PaymentConfirmed, AttendanceRecorded, IncidentReported
//            (Publish/Subscribe — esta cola es uno de los suscriptores)
//
// El andamiaje del ESCENARIO DE FALLA CONTROLADA (FAIL_MODE, deliver, endpoints
// /admin/*) ya está listo. Implementa la LÓGICA marcada con TODO:
//   - eventToNotification (Message Translator)
//   - onEvent (handler idempotente con manejo de error -> reintento/DLQ)
// ============================================================================
const express = require('express');
const cors = require('cors');
const log = require('./lib/logger');
const db = require('./lib/db');
const mq = require('./lib/amqp');
const { buildEvent, validateEvent, EVENT_TYPES } = require('./lib/events');
const { correlation, identity, requireRole, mountDocs } = require('./lib/http');
const openapi = require('./openapi');

const PORT = process.env.PORT || 3004;
const app = express();
app.use(cors());
app.use(express.json());
app.use(correlation);
app.use(identity);

// Bandera para SIMULAR caída del proveedor (escenario de falla) — ANDAMIAJE.
let FAIL_MODE = false;

// --- TODO(notifications): define el esquema de tu servicio ---------------------
const DDL = `
  -- CREATE TABLE IF NOT EXISTS notifications (
  --   id SERIAL PRIMARY KEY, event_id TEXT NOT NULL, event_type TEXT NOT NULL,
  --   channel TEXT NOT NULL, recipient TEXT NOT NULL, subject TEXT NOT NULL,
  --   body TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'sent',
  --   created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  -- );
  SELECT 1;
`;

// TODO(notifications): MESSAGE TRANSLATOR.
// Transforma un evento de negocio en un modelo de NOTIFICACIÓN distinto:
//   { channel, recipient, subject, body }
// Sugerencia: switch sobre event.eventType (StudentEnrolled -> email de bienvenida,
// AttendanceRecorded -> sms, etc.). Devuelve un default razonable para otros tipos.
function eventToNotification(event) {
  // return { channel: 'email', recipient: `rep-${event.entityId}@colegio.edu`,
  //          subject: '...', body: '...' };
  throw new Error('TODO: implementar eventToNotification (Message Translator)');
}

// Simula el envío hacia un proveedor externo — ANDAMIAJE del escenario de falla.
async function deliver(notification) {
  if (FAIL_MODE) {
    throw new Error('Proveedor de notificaciones no disponible (simulado)');
  }
  // Aquí iría la integración real (email/SMS/webhook). Simulado.
  return true;
}

// TODO(notifications): Handler idempotente de eventos.
//   1. validateEvent(event); si no es válido, lanza.
//   2. db.markProcessed(eventId, eventType); si ya procesado, return (idempotencia).
//   3. n = eventToNotification(event).
//   4. try { await deliver(n); INSERT status='sent'; publicar NotificationSent }
//      catch { INSERT status='failed'; publicar NotificationFailed; throw err }
//      (el throw activa reintentos -> DLQ en shared/amqp).
async function onEvent(event) {
  log.warn('TODO: implementar onEvent', { eventId: event.eventId });
}

// ---------- API REST ----------
app.get('/health', async (req, res) => {
  res.json({ service: 'notifications', db: await db.isHealthy(), broker: mq.isConnected(), failMode: FAIL_MODE, ts: new Date().toISOString() });
});

// TODO(notifications): Listar notificaciones emitidas.
app.get('/notifications', requireRole('admin', 'director', 'secretaria', 'finanzas', 'docente'), async (req, res) => {
  res.status(501).json({ error: 'TODO: implementar GET /notifications' });
});

// --- Endpoints de resiliencia (ANDAMIAJE — listos para la demo de falla) ---
app.post('/admin/fail-mode', requireRole('admin'), (req, res) => {
  FAIL_MODE = !!(req.body && req.body.enabled);
  log.warn('Fail-mode cambiado', { failMode: FAIL_MODE });
  res.json({ failMode: FAIL_MODE });
});

app.post('/admin/reprocess-dlq', requireRole('admin'), async (req, res) => {
  try {
    const moved = await mq.reprocessDlq('notifications.events');
    res.json({ reprocessed: moved });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------- Arranque y wiring (ANDAMIAJE — no tocar) ----------
async function start() {
  await db.init(DDL);
  await mq.connect();
  // Publish/Subscribe: esta cola es uno de los suscriptores de los eventos de negocio.
  await mq.consume({
    queue: 'notifications.events',
    bindings: [
      EVENT_TYPES.StudentEnrolled,
      EVENT_TYPES.PaymentConfirmed,
      EVENT_TYPES.AttendanceRecorded,
      EVENT_TYPES.IncidentReported,
    ],
    handler: onEvent,
    deadLetter: true,
    maxRetries: 3,
  });
  mountDocs(app, openapi);
  app.listen(PORT, () => log.info(`Notifications service escuchando en :${PORT}`));
}

if (require.main === module) {
  start().catch((e) => { log.error('Fallo al arrancar', { err: e.message }); process.exit(1); });
}

// Exportado para pruebas unitarias.
module.exports = { eventToNotification, onEvent, deliver };

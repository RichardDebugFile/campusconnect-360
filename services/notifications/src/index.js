'use strict';
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

let FAIL_MODE = false;

const DDL = `
  CREATE TABLE IF NOT EXISTS notifications (
    id SERIAL PRIMARY KEY,
    event_id TEXT NOT NULL UNIQUE,
    event_type TEXT NOT NULL,
    channel TEXT NOT NULL,
    recipient TEXT NOT NULL,
    subject TEXT NOT NULL,
    body TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'sent',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE INDEX IF NOT EXISTS idx_notifications_created_at
    ON notifications (created_at DESC);

  CREATE INDEX IF NOT EXISTS idx_notifications_status
    ON notifications (status);
`;

function eventToNotification(event) {
  const data = event.data || {};
  const studentName = [data.firstName, data.lastName].filter(Boolean).join(' ') || `estudiante ${event.entityId}`;
  const email = data.representativeEmail || data.email || `rep-${event.entityId}@colegio.edu`;
  const phone = data.representativePhone || data.phone || `rep-${event.entityId}`;

  switch (event.eventType) {
    case EVENT_TYPES.StudentEnrolled:
      return {
        channel: 'email',
        recipient: email,
        subject: 'Matrícula registrada correctamente',
        body: `La matrícula de ${studentName} fue registrada correctamente${data.grade ? ` en el grado ${data.grade}` : ''}. Bienvenido a CampusConnect 360.`,
      };

    case EVENT_TYPES.PaymentConfirmed:
      return {
        channel: 'email',
        recipient: email,
        subject: 'Pago confirmado',
        body: `Se confirmó el pago relacionado con ${studentName}${data.amount ? ` por un valor de ${data.amount}` : ''}.`,
      };

    case EVENT_TYPES.AttendanceRecorded:
      return {
        channel: 'sms',
        recipient: phone,
        subject: 'Registro de asistencia',
        body: `Asistencia de ${studentName}: ${data.status || data.attendanceStatus || 'registrada'}.`,
      };

    case EVENT_TYPES.IncidentReported:
      return {
        channel: 'email',
        recipient: email,
        subject: 'Nuevo incidente reportado',
        body: `Se registró un incidente relacionado con ${studentName}${data.description ? `: ${data.description}` : '.'}`,
      };

    default:
      return {
        channel: 'email',
        recipient: email,
        subject: 'Nueva notificación de CampusConnect 360',
        body: `Se recibió una actualización relacionada con ${studentName}.`,
      };
  }
}

async function deliver(notification) {
  if (FAIL_MODE) {
    throw new Error('Proveedor de notificaciones no disponible (simulado)');
  }
  return true;
}

async function saveNotification(event, notification, status) {
  await db.query(
    `INSERT INTO notifications
      (event_id, event_type, channel, recipient, subject, body, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (event_id) DO UPDATE SET
       event_type = EXCLUDED.event_type,
       channel = EXCLUDED.channel,
       recipient = EXCLUDED.recipient,
       subject = EXCLUDED.subject,
       body = EXCLUDED.body,
       status = EXCLUDED.status,
       updated_at = now()`,
    [
      event.eventId,
      event.eventType,
      notification.channel,
      notification.recipient,
      notification.subject,
      notification.body,
      status,
    ]
  );
}

async function onEvent(event) {
  const validation = validateEvent(event);
  if (!validation.valid) {
    throw new Error(`Evento inválido: ${validation.reason}`);
  }

  const firstProcessing = await db.markProcessed(event.eventId, event.eventType);
  if (!firstProcessing) {
    log.info('Evento duplicado ignorado', {
      eventId: event.eventId,
      eventType: event.eventType,
      correlationId: event.correlationId,
    });
    return;
  }

  const notification = eventToNotification(event);

  try {
    await deliver(notification);
    await saveNotification(event, notification, 'sent');

    const notificationSent = buildEvent(EVENT_TYPES.NotificationSent, {
      entityId: event.entityId,
      correlationId: event.correlationId,
      data: {
        sourceEventId: event.eventId,
        sourceEventType: event.eventType,
        channel: notification.channel,
        recipient: notification.recipient,
        subject: notification.subject,
      },
    });

    await mq.publish(notificationSent);
    log.info('Notificación enviada', {
      eventId: event.eventId,
      eventType: event.eventType,
      correlationId: event.correlationId,
      channel: notification.channel,
    });
  } catch (err) {
    await saveNotification(event, notification, 'failed');

    const notificationFailed = buildEvent(EVENT_TYPES.NotificationFailed, {
      entityId: event.entityId,
      correlationId: event.correlationId,
      data: {
        sourceEventId: event.eventId,
        sourceEventType: event.eventType,
        channel: notification.channel,
        recipient: notification.recipient,
        reason: err.message,
      },
    });

    try {
      await mq.publish(notificationFailed);
    } catch (publishError) {
      log.error('No se pudo publicar NotificationFailed', {
        eventId: event.eventId,
        correlationId: event.correlationId,
        err: publishError.message,
      });
    }

    await db.query('DELETE FROM processed_events WHERE event_id = $1', [event.eventId]);

    log.error('Fallo al entregar la notificación', {
      eventId: event.eventId,
      eventType: event.eventType,
      correlationId: event.correlationId,
      err: err.message,
    });
    throw err;
  }
}

app.get('/health', async (req, res) => {
  res.json({
    service: 'notifications',
    db: await db.isHealthy(),
    broker: mq.isConnected(),
    failMode: FAIL_MODE,
    ts: new Date().toISOString(),
  });
});

app.get('/notifications', requireRole('admin', 'director', 'secretaria', 'finanzas', 'docente'), async (req, res) => {
  try {
    const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 100, 1), 500);
    const values = [];
    const conditions = [];

    if (req.query.status) {
      values.push(req.query.status);
      conditions.push(`status = $${values.length}`);
    }

    if (req.query.channel) {
      values.push(req.query.channel);
      conditions.push(`channel = $${values.length}`);
    }

    values.push(limit);
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await db.query(
      `SELECT id, event_id, event_type, channel, recipient, subject, body, status, created_at, updated_at
       FROM notifications
       ${where}
       ORDER BY created_at DESC
       LIMIT $${values.length}`,
      values
    );

    res.json(result.rows);
  } catch (err) {
    log.error('Error al listar notificaciones', {
      correlationId: req.correlationId,
      err: err.message,
    });
    res.status(500).json({ error: 'No se pudieron consultar las notificaciones' });
  }
});

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

async function start() {
  await db.init(DDL);
  await mq.connect();
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
  start().catch((e) => {
    log.error('Fallo al arrancar', { err: e.message });
    process.exit(1);
  });
}

module.exports = { eventToNotification, onEvent, deliver };

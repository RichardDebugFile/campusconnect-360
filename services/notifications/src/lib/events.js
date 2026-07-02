'use strict';
const crypto = require('crypto');

/**
 * Catálogo de eventos de negocio del ecosistema.
 * Patrón EIP: Event Message (mensaje de evento bien estructurado).
 */
const EVENT_TYPES = Object.freeze({
  StudentEnrolled: 'StudentEnrolled',
  PaymentConfirmed: 'PaymentConfirmed',
  AttendanceRecorded: 'AttendanceRecorded',
  IncidentReported: 'IncidentReported',
  StudentStatusUpdated: 'StudentStatusUpdated',
  NotificationSent: 'NotificationSent',
  NotificationFailed: 'NotificationFailed',
});

/**
 * Construye un evento con la estructura mínima exigida por la consigna:
 * eventId, eventType, occurredAt, correlationId, id de la entidad principal,
 * datos relevantes y un id de correlación/trazabilidad.
 */
function buildEvent(eventType, { entityId, correlationId, data = {} }) {
  if (!EVENT_TYPES[eventType]) {
    throw new Error(`Tipo de evento desconocido: ${eventType}`);
  }
  return {
    eventId: `evt-${crypto.randomUUID()}`,
    eventType,
    occurredAt: new Date().toISOString(),
    correlationId: correlationId || `corr-${crypto.randomUUID()}`,
    entityId,
    data,
  };
}

/**
 * Validación estructural de un evento entrante (defensa contra "formato inválido").
 * Devuelve { valid, reason }.
 */
function validateEvent(evt) {
  if (!evt || typeof evt !== 'object') return { valid: false, reason: 'no es objeto' };
  for (const f of ['eventId', 'eventType', 'occurredAt', 'correlationId', 'entityId']) {
    if (!evt[f]) return { valid: false, reason: `falta campo ${f}` };
  }
  if (!EVENT_TYPES[evt.eventType]) {
    return { valid: false, reason: `eventType inválido: ${evt.eventType}` };
  }
  return { valid: true };
}

module.exports = { EVENT_TYPES, buildEvent, validateEvent };

'use strict';
/*
 * Verificación de la LÓGICA de integración sin broker ni base de datos reales.
 * Prueba el código REAL del proyecto (shared/ y el servicio de notificaciones)
 * usando dobles de prueba (fakes) para amqplib. Sirve para validar viabilidad
 * antes de levantar el stack completo con Docker.
 *
 *   node tests/verify.js
 */
const assert = require('assert');
const Module = require('module');

let pass = 0;
const ok = (name) => { pass++; console.log(`  \u2713 ${name}`); };

// --- Fake amqplib: intercepta require('amqplib') ANTES de resolverlo ---------
const sent = [];        // mensajes re-encolados (reintentos)
const nacked = [];      // mensajes mandados a DLQ (nack requeue=false)
const acked = [];       // mensajes confirmados
let consumeCb = null;   // callback registrado por consume()

const fakeChannel = {
  prefetch: async () => {},
  assertQueue: async () => {},
  bindQueue: async () => {},
  assertExchange: async () => {},
  consume: (queue, cb) => { consumeCb = cb; },
  sendToQueue: (q, content, opts) => sent.push({ q, headers: opts.headers }),
  ack: (msg) => acked.push(msg),
  nack: (msg, all, requeue) => nacked.push({ msg, requeue }),
  publish: () => true,
  close: async () => {},
};
const fakeConnection = {
  createChannel: async () => fakeChannel,
  createConfirmChannel: async () => fakeChannel,
  on: () => {},
  close: async () => {},
};
const fakeAmqp = { connect: async () => fakeConnection };

const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'amqplib') return fakeAmqp;
  return origLoad.apply(this, arguments);
};

// =============================================================================
(async () => {
  console.log('\n[1] Contrato de eventos (shared/events.js)');
  const { EVENT_TYPES, buildEvent, validateEvent } = require('../shared/events');

  const evt = buildEvent('StudentEnrolled', {
    entityId: 'STU-0001',
    correlationId: 'corr-1',
    data: { grade: '8vo EGB' },
  });
  assert.ok(evt.eventId, 'tiene eventId');
  assert.strictEqual(evt.eventType, 'StudentEnrolled');
  assert.ok(evt.occurredAt, 'tiene occurredAt');
  assert.strictEqual(evt.correlationId, 'corr-1');
  assert.strictEqual(evt.entityId, 'STU-0001');
  assert.deepStrictEqual(evt.data, { grade: '8vo EGB' });
  ok('buildEvent produce la estructura mínima exigida');

  assert.strictEqual(validateEvent(evt).valid, true);
  ok('validateEvent acepta un evento bien formado');

  assert.strictEqual(validateEvent({ eventType: 'X' }).valid, false);
  ok('validateEvent rechaza un tipo desconocido');

  assert.strictEqual(validateEvent({ eventId: 'e', eventType: 'StudentEnrolled' }).valid, false);
  ok('validateEvent rechaza un evento incompleto');

  assert.throws(() => buildEvent('NoExiste', { entityId: 'x' }));
  ok('buildEvent rechaza tipos fuera de EVENT_TYPES');

  // ---------------------------------------------------------------------------
  console.log('\n[2] Message Translator (servicio de notificaciones)');
  const { eventToNotification } = require('../services/notifications/src/index');

  const nEnroll = eventToNotification(buildEvent('StudentEnrolled', {
    entityId: 'STU-0007', correlationId: 'c', data: { grade: '9no' },
  }));
  assert.strictEqual(nEnroll.channel, 'email');
  assert.strictEqual(nEnroll.recipient, 'rep-STU-0007@colegio.edu');
  ok('StudentEnrolled -> email de bienvenida al representante');

  const nAtt = eventToNotification(buildEvent('AttendanceRecorded', {
    entityId: 'STU-0007', correlationId: 'c', data: { status: 'present' },
  }));
  assert.strictEqual(nAtt.channel, 'sms');
  ok('AttendanceRecorded -> canal SMS (transforma modelo evento->notificación)');

  const nPay = eventToNotification(buildEvent('PaymentConfirmed', {
    entityId: 'STU-0007', correlationId: 'c', data: { concept: 'Matrícula', amount: 250 },
  }));
  assert.ok(nPay.body.includes('250'), 'incluye el monto en el cuerpo');
  ok('PaymentConfirmed -> incluye concepto y monto en la notificación');

  // ---------------------------------------------------------------------------
  console.log('\n[3] Reintentos -> Dead Letter Queue (shared/amqp.js, canal mock)');
  const mq = require('../shared/amqp');
  await mq.connect();

  // handler que SIEMPRE falla -> debe reintentar maxRetries y luego ir a DLQ
  let calls = 0;
  await mq.consume({
    queue: 'test.queue',
    bindings: ['StudentEnrolled'],
    handler: async () => { calls++; throw new Error('fallo simulado'); },
    deadLetter: true,
    maxRetries: 3,
    retryDelayMs: 0,
  });
  assert.ok(typeof consumeCb === 'function', 'consume registró un callback');

  // Simula la entrega del mismo mensaje, re-encolándolo según x-retry, como hace RabbitMQ
  const baseEvent = buildEvent('StudentEnrolled', { entityId: 'STU-9', correlationId: 'c', data: {} });
  function deliver(retry) {
    return consumeCb({
      content: Buffer.from(JSON.stringify(baseEvent)),
      properties: { headers: retry ? { 'x-retry': retry } : {}, correlationId: 'c', messageId: baseEvent.eventId, type: baseEvent.eventType },
    });
  }
  // intento inicial (retry 0) + 3 reintentos
  for (let r = 0; r <= 3; r++) { await deliver(r); await new Promise((res) => setTimeout(res, 5)); }

  assert.strictEqual(calls, 4, 'el handler se intentó 1 + 3 veces');
  ok('reintenta exactamente maxRetries veces antes de rendirse');

  assert.strictEqual(sent.length, 3, 'hubo 3 re-encolados con x-retry incremental');
  assert.deepStrictEqual(sent.map((s) => s.headers['x-retry']), [1, 2, 3]);
  ok('cada reintento incrementa la cabecera x-retry (1,2,3)');

  assert.strictEqual(nacked.length, 1, 'al agotar reintentos hace nack');
  assert.strictEqual(nacked[0].requeue, false, 'nack con requeue=false -> va al DLX/DLQ');
  ok('al agotar reintentos manda el mensaje a la Dead Letter Queue');

  // mensaje no parseable -> DLQ directo, sin reintentar
  nacked.length = 0;
  await consumeCb({ content: Buffer.from('no-es-json'), properties: { headers: {} } });
  assert.strictEqual(nacked.length, 1, 'mensaje corrupto -> DLQ directo');
  ok('un mensaje no parseable va directo a DLQ (no se reintenta)');

  console.log(`\nRESULTADO: ${pass} verificaciones OK\n`);
  Module._load = origLoad;
  process.exit(0);
})().catch((e) => { console.error('\nFALLO EN VERIFICACIÓN:', e.message, '\n', e.stack); process.exit(1); });

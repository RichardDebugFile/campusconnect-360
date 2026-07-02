'use strict';
const amqp = require('amqplib');
const log = require('./logger');

/**
 * Capa de mensajería sobre RabbitMQ (amqplib).
 * Implementa varios patrones de integración (EIP):
 *  - Message Channel:  exchange 'campus.events' (topic) + colas por servicio.
 *  - Publish/Subscribe: varias colas se enlazan al mismo evento (fan-out por routing key).
 *  - Point-to-Point:    cada cola es consumida por un único servicio lógico.
 *  - Dead Letter Channel: exchange 'campus.dlx' + cola '<servicio>.dlq'.
 *  - Reintentos:        re-encolado con cabecera 'x-retry' antes de mandar a DLQ.
 */
const EXCHANGE = 'campus.events';
const DLX = 'campus.dlx';

let connection = null;
let pubChannel = null;
let connected = false;

const AMQP_URL = process.env.AMQP_URL || 'amqp://guest:guest@rabbitmq:5672';
const RECONNECT_MS = 5000;

async function connect() {
  try {
    connection = await amqp.connect(AMQP_URL);
    connection.on('error', (e) => log.error('AMQP connection error', { err: e.message }));
    connection.on('close', () => {
      connected = false;
      log.warn('AMQP conexión cerrada, reintentando...');
      setTimeout(connect, RECONNECT_MS);
    });
    pubChannel = await connection.createChannel();
    await pubChannel.assertExchange(EXCHANGE, 'topic', { durable: true });
    await pubChannel.assertExchange(DLX, 'topic', { durable: true });
    connected = true;
    log.info('AMQP conectado', { url: AMQP_URL.replace(/\/\/.*@/, '//***@') });
    return connection;
  } catch (err) {
    log.warn('AMQP no disponible, reintentando...', { err: err.message });
    setTimeout(connect, RECONNECT_MS);
  }
}

/** Publica un evento de negocio en el topic exchange usando eventType como routing key. */
async function publish(event) {
  if (!pubChannel) throw new Error('Canal AMQP no inicializado');
  const ok = pubChannel.publish(
    EXCHANGE,
    event.eventType,
    Buffer.from(JSON.stringify(event)),
    {
      persistent: true,
      contentType: 'application/json',
      messageId: event.eventId,
      correlationId: event.correlationId,
      timestamp: Date.now(),
      type: event.eventType,
    }
  );
  log.info('Evento publicado', {
    eventType: event.eventType,
    eventId: event.eventId,
    correlationId: event.correlationId,
  });
  return ok;
}

/**
 * Suscribe una cola a uno o más eventos.
 * @param {object} opts
 *   queue: nombre de la cola
 *   bindings: string[] de routing keys (eventTypes)
 *   handler: async (event, raw) => void   (lanzar excepción = fallo procesable)
 *   deadLetter: boolean  -> habilita DLQ (default true)
 *   maxRetries: number   -> reintentos antes de DLQ (default 3)
 *   prefetch: number     -> mensajes en vuelo (default 10)
 */
async function consume({ queue, bindings, handler, deadLetter = true, maxRetries = 3, prefetch = 10, retryDelayMs = 1500 }) {
  if (!connection) {
    // espera a que la conexión exista
    setTimeout(() => consume({ queue, bindings, handler, deadLetter, maxRetries, prefetch, retryDelayMs }), RECONNECT_MS);
    return;
  }
  const ch = await connection.createChannel();
  await ch.prefetch(prefetch);

  const queueArgs = {};
  if (deadLetter) {
    const dlq = `${queue}.dlq`;
    await ch.assertQueue(dlq, { durable: true });
    await ch.bindQueue(dlq, DLX, queue); // DLX enruta por nombre de cola origen
    queueArgs['x-dead-letter-exchange'] = DLX;
    queueArgs['x-dead-letter-routing-key'] = queue;
  }
  await ch.assertQueue(queue, { durable: true, arguments: queueArgs });
  for (const rk of bindings) {
    await ch.bindQueue(queue, EXCHANGE, rk);
  }

  log.info('Consumidor listo', { queue, bindings });

  ch.consume(queue, async (msg) => {
    if (!msg) return;
    let event;
    try {
      event = JSON.parse(msg.content.toString());
    } catch (e) {
      // Mensaje no parseable -> directo a DLQ (no tiene sentido reintentar)
      log.error('Mensaje no parseable -> DLQ', { queue });
      return ch.nack(msg, false, false);
    }

    const retry = (msg.properties.headers && msg.properties.headers['x-retry']) || 0;
    try {
      await handler(event, msg);
      ch.ack(msg);
    } catch (err) {
      if (retry < maxRetries) {
        log.warn('Fallo al procesar, reintentando', {
          queue, eventId: event.eventId, retry: retry + 1, maxRetries, err: err.message,
        });
        // Reintento: re-encola SOLO en esta cola (no re-dispara a otros suscriptores)
        setTimeout(() => {
          ch.sendToQueue(queue, msg.content, {
            persistent: true,
            headers: { ...(msg.properties.headers || {}), 'x-retry': retry + 1 },
            correlationId: msg.properties.correlationId,
            messageId: msg.properties.messageId,
            type: msg.properties.type,
          });
          ch.ack(msg);
        }, retryDelayMs);
      } else {
        log.error('Reintentos agotados -> Dead Letter Queue', {
          queue, eventId: event.eventId, err: err.message,
        });
        ch.nack(msg, false, false); // requeue=false -> va al DLX -> <queue>.dlq
      }
    }
  });

  return ch;
}

/** Reprocesa manualmente los mensajes de una DLQ devolviéndolos a su cola original. */
async function reprocessDlq(queue, limit = 50) {
  if (!connection) throw new Error('Sin conexión AMQP');
  const ch = await connection.createChannel();
  const dlq = `${queue}.dlq`;
  let moved = 0;
  for (let i = 0; i < limit; i++) {
    const msg = await ch.get(dlq, { noAck: false });
    if (!msg) break;
    ch.sendToQueue(queue, msg.content, {
      persistent: true,
      headers: { 'x-retry': 0, 'x-reprocessed': true },
      correlationId: msg.properties.correlationId,
      messageId: msg.properties.messageId,
      type: msg.properties.type,
    });
    ch.ack(msg);
    moved++;
  }
  await ch.close();
  log.info('DLQ reprocesada', { queue, moved });
  return moved;
}

function isConnected() {
  return connected;
}

module.exports = { connect, publish, consume, reprocessDlq, isConnected, EXCHANGE, DLX };

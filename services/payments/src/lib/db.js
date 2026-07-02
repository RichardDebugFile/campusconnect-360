'use strict';
const { Pool } = require('pg');
const log = require('./logger');

/**
 * Acceso a PostgreSQL. Cada servicio usa su PROPIA base de datos
 * (DATABASE_URL distinto por servicio) => persistencia separada.
 */
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (e) => log.error('PG pool error', { err: e.message }));

async function query(text, params) {
  return pool.query(text, params);
}

/** Ejecuta el DDL del servicio + tabla de idempotencia, con reintentos al arrancar. */
async function init(ddl) {
  const idempotencyDDL = `
    CREATE TABLE IF NOT EXISTS processed_events (
      event_id     TEXT PRIMARY KEY,
      event_type   TEXT NOT NULL,
      processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );`;
  const attempts = 10;
  for (let i = 1; i <= attempts; i++) {
    try {
      await pool.query(ddl);
      await pool.query(idempotencyDDL);
      log.info('Esquema de BD listo');
      return;
    } catch (err) {
      log.warn('BD no lista, reintentando', { intento: i, err: err.message });
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
  throw new Error('No se pudo inicializar la BD');
}

/**
 * Idempotent Receiver: registra el evento como procesado.
 * Devuelve true si es la PRIMERA vez (debe procesarse),
 * false si ya fue procesado (debe ignorarse).
 */
async function markProcessed(eventId, eventType) {
  try {
    const res = await pool.query(
      'INSERT INTO processed_events (event_id, event_type) VALUES ($1,$2) ON CONFLICT (event_id) DO NOTHING RETURNING event_id',
      [eventId, eventType]
    );
    return res.rowCount > 0;
  } catch (err) {
    log.error('Error en markProcessed', { eventId, err: err.message });
    throw err;
  }
}

async function isHealthy() {
  try {
    await pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}

module.exports = { pool, query, init, markProcessed, isHealthy };

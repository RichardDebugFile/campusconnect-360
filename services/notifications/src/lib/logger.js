'use strict';
/**
 * Logger JSON estructurado y minimalista (sin dependencias).
 * Cada línea es un objeto JSON => fácil de filtrar por correlationId.
 * Observabilidad: traza el flujo de un evento entre servicios.
 */
const SERVICE = process.env.SERVICE_NAME || 'service';

function log(level, msg, meta = {}) {
  const line = {
    ts: new Date().toISOString(),
    level,
    service: SERVICE,
    msg,
    ...meta,
  };
  // stdout para que Docker capture los logs
  process.stdout.write(JSON.stringify(line) + '\n');
}

module.exports = {
  info: (msg, meta) => log('info', msg, meta),
  warn: (msg, meta) => log('warn', msg, meta),
  error: (msg, meta) => log('error', msg, meta),
  debug: (msg, meta) => (process.env.DEBUG ? log('debug', msg, meta) : null),
};

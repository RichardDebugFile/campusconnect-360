'use strict';
const crypto = require('crypto');
const swaggerUi = require('swagger-ui-express');

/**
 * Propaga un id de correlación de extremo a extremo (trazabilidad).
 * Lo toma del header 'x-correlation-id' (inyectado por el gateway) o lo crea.
 */
function correlation(req, res, next) {
  req.correlationId = req.headers['x-correlation-id'] || `corr-${crypto.randomUUID()}`;
  res.setHeader('x-correlation-id', req.correlationId);
  next();
}

/**
 * El gateway valida el JWT y reenvía la identidad en headers.
 * Los servicios confían en el gateway (autenticación terminada en el borde).
 */
function identity(req, res, next) {
  req.user = {
    id: req.headers['x-user-id'] || null,
    role: req.headers['x-user-role'] || null,
  };
  next();
}

/** Autorización básica por rol. */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !req.user.role) {
      return res.status(401).json({ error: 'No autenticado' });
    }
    if (roles.length && !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'No autorizado para este rol' });
    }
    next();
  };
}

/** Monta Swagger UI en /docs a partir de un documento OpenAPI. */
function mountDocs(app, openapiDoc) {
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(openapiDoc));
  app.get('/openapi.json', (req, res) => res.json(openapiDoc));
}

module.exports = { correlation, identity, requireRole, mountDocs };

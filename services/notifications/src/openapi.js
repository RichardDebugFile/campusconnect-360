'use strict';
module.exports = {
  openapi: '3.0.3',
  info: { title: 'Servicio de Notificaciones - CampusConnect 360', version: '1.0.0' },
  paths: {
    '/health': { get: { summary: 'Health check', responses: { 200: { description: 'OK' } } } },
    '/notifications': {
      get: { summary: 'Listar notificaciones emitidas', responses: { 200: { description: 'Lista' } } },
    },
    '/admin/fail-mode': {
      post: {
        summary: 'Activar/desactivar caída simulada del proveedor (demo de resiliencia)',
        requestBody: {
          content: { 'application/json': { schema: { type: 'object', properties: { enabled: { type: 'boolean' } } } } },
        },
        responses: { 200: { description: 'Estado actualizado' } },
      },
    },
    '/admin/reprocess-dlq': {
      post: { summary: 'Reprocesar mensajes de la Dead Letter Queue', responses: { 200: { description: 'Reprocesados' } } },
    },
  },
};

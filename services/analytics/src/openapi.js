'use strict';
module.exports = {
  openapi: '3.0.3',
  info: { title: 'Servicio de Analítica (CQRS) - CampusConnect 360', version: '1.0.0' },
  paths: {
    '/health': { get: { summary: 'Health check', responses: { 200: { description: 'OK' } } } },
    '/metrics': { get: { summary: 'Indicadores consolidados del ecosistema', responses: { 200: { description: 'Métricas' } } } },
    '/events': {
      get: {
        summary: 'Flujo reciente de eventos (trazabilidad)',
        parameters: [{ name: 'limit', in: 'query', schema: { type: 'integer', default: 50 } }],
        responses: { 200: { description: 'Eventos' } },
      },
    },
    '/students/{id}/events': {
      get: {
        summary: 'Historial de eventos de un estudiante',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Historial' } },
      },
    },
  },
};

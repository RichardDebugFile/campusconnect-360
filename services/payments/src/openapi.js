'use strict';
module.exports = {
  openapi: '3.0.3',
  info: { title: 'Servicio de Pagos - CampusConnect 360', version: '1.0.0' },
  paths: {
    '/health': { get: { summary: 'Health check', responses: { 200: { description: 'OK' } } } },
    '/payments': {
      get: {
        summary: 'Listar pagos (filtros: status, studentId)',
        parameters: [
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['pending', 'confirmed'] } },
          { name: 'studentId', in: 'query', schema: { type: 'string' } },
        ],
        responses: { 200: { description: 'Lista de pagos' } },
      },
      post: {
        summary: 'Crear obligación de pago / deuda simulada',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['studentId', 'concept', 'amount'],
                properties: {
                  studentId: { type: 'string', example: 'STU-0001' },
                  concept: { type: 'string', example: 'Matrícula 2026' },
                  amount: { type: 'number', example: 150.0 },
                },
              },
            },
          },
        },
        responses: { 201: { description: 'Obligación creada' } },
      },
    },
    '/payments/{id}/confirm': {
      post: {
        summary: 'Confirmar pago (publica PaymentConfirmed)',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: { 200: { description: 'Pago confirmado' }, 409: { description: 'Inexistente o ya confirmado' } },
      },
    },
  },
};

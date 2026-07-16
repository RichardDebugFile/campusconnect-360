'use strict';
// Contrato OpenAPI del servicio de Pagos.
// Cubre HU-P1 (crear/listar obligaciones) y HU-P2 (confirmar pago).
module.exports = {
  openapi: '3.0.3',
  info: {
    title: 'Servicio de Pagos - CampusConnect 360',
    version: '1.1.0',
    description:
      'Gestiona obligaciones de pago (pending/confirmed) y publica el evento ' +
      'PaymentConfirmed que dispara la solvencia del estudiante en Academico.',
  },
  tags: [
    { name: 'Salud', description: 'Health check del servicio' },
    { name: 'Pagos', description: 'Obligaciones y confirmaciones' },
  ],
  components: {
    schemas: {
      Payment: {
        type: 'object',
        properties: {
          id:           { type: 'integer', example: 1 },
          student_id:   { type: 'string',  example: 'STU-0001' },
          concept:      { type: 'string',  example: 'Matricula 2026' },
          amount:       { type: 'number',  example: 150.00 },
          status:       { type: 'string',  enum: ['pending', 'confirmed'] },
          created_at:   { type: 'string',  format: 'date-time' },
          confirmed_at: { type: 'string',  format: 'date-time', nullable: true },
        },
      },
      NewPayment: {
        type: 'object',
        required: ['studentId', 'concept', 'amount'],
        properties: {
          studentId: { type: 'string', example: 'STU-0001' },
          concept:   { type: 'string', example: 'Matricula 2026', maxLength: 200 },
          amount:    { type: 'number', example: 150.00, minimum: 0, maximum: 100000 },
        },
      },
      Error: {
        type: 'object',
        properties: {
          error:   { type: 'string' },
          details: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  },
  paths: {
    '/health': {
      get: {
        tags: ['Salud'],
        summary: 'Health check',
        responses: { 200: { description: 'OK' } },
      },
    },
    '/payments': {
      get: {
        tags: ['Pagos'],
        summary: 'Listar obligaciones (filtros y paginacion)',
        parameters: [
          { name: 'status',    in: 'query', schema: { type: 'string', enum: ['pending', 'confirmed'] } },
          { name: 'studentId', in: 'query', schema: { type: 'string' } },
          { name: 'limit',     in: 'query', schema: { type: 'integer', minimum: 1, maximum: 500, default: 100 } },
          { name: 'offset',    in: 'query', schema: { type: 'integer', minimum: 0, default: 0 } },
        ],
        responses: {
          200: {
            description: 'Lista de pagos',
            content: {
              'application/json': {
                schema: { type: 'array', items: { $ref: '#/components/schemas/Payment' } },
              },
            },
          },
          400: { description: 'Filtro invalido', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
      post: {
        tags: ['Pagos'],
        summary: 'Crear obligacion (queda en estado pending)',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/NewPayment' } } },
        },
        responses: {
          201: { description: 'Obligacion creada', content: { 'application/json': { schema: { $ref: '#/components/schemas/Payment' } } } },
          400: { description: 'Datos invalidos', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          403: { description: 'Rol no autorizado' },
        },
      },
    },
    '/payments/{id}/confirm': {
      post: {
        tags: ['Pagos'],
        summary: 'Confirmar pago (publica PaymentConfirmed)',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer', minimum: 1 } }],
        responses: {
          200: {
            description: 'Pago confirmado',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    payment: { $ref: '#/components/schemas/Payment' },
                    eventId: { type: 'string', example: 'evt-uuid' },
                  },
                },
              },
            },
          },
          400: { description: 'id invalido' },
          409: { description: 'Pago inexistente o ya confirmado' },
        },
      },
    },
  },
};

'use strict';

module.exports = {
  openapi: '3.0.3',
  info: {
    title: 'Servicio de Notificaciones - CampusConnect 360',
    version: '1.0.0',
  },
  paths: {
    '/health': {
      get: {
        summary: 'Consultar el estado del servicio',
        responses: {
          200: { description: 'Estado del servicio' },
        },
      },
    },
    '/notifications': {
      get: {
        summary: 'Listar notificaciones emitidas',
        parameters: [
          {
            name: 'status',
            in: 'query',
            required: false,
            schema: { type: 'string', enum: ['sent', 'failed'] },
          },
          {
            name: 'channel',
            in: 'query',
            required: false,
            schema: { type: 'string', enum: ['email', 'sms'] },
          },
          {
            name: 'limit',
            in: 'query',
            required: false,
            schema: { type: 'integer', minimum: 1, maximum: 500, default: 100 },
          },
        ],
        responses: {
          200: {
            description: 'Listado de notificaciones',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/Notification' },
                },
              },
            },
          },
          500: { description: 'Error al consultar las notificaciones' },
        },
      },
    },
    '/admin/fail-mode': {
      post: {
        summary: 'Activar o desactivar la falla simulada del proveedor',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['enabled'],
                properties: {
                  enabled: { type: 'boolean' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Estado de falla actualizado' },
        },
      },
    },
    '/admin/reprocess-dlq': {
      post: {
        summary: 'Reprocesar mensajes de la Dead Letter Queue',
        responses: {
          200: { description: 'Mensajes reprocesados' },
          500: { description: 'No se pudo reprocesar la cola' },
        },
      },
    },
  },
  components: {
    schemas: {
      Notification: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          event_id: { type: 'string' },
          event_type: { type: 'string' },
          channel: { type: 'string', enum: ['email', 'sms'] },
          recipient: { type: 'string' },
          subject: { type: 'string' },
          body: { type: 'string' },
          status: { type: 'string', enum: ['sent', 'failed'] },
          created_at: { type: 'string', format: 'date-time' },
          updated_at: { type: 'string', format: 'date-time' },
        },
      },
    },
  },
};

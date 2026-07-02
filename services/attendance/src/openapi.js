'use strict';
module.exports = {
  openapi: '3.0.3',
  info: { title: 'Servicio de Asistencia/Bienestar - CampusConnect 360', version: '1.0.0' },
  paths: {
    '/health': { get: { summary: 'Health check', responses: { 200: { description: 'OK' } } } },
    '/attendance': {
      get: {
        summary: 'Listar asistencia (filtro: studentId)',
        parameters: [{ name: 'studentId', in: 'query', schema: { type: 'string' } }],
        responses: { 200: { description: 'Lista' } },
      },
      post: {
        summary: 'Registrar asistencia (publica AttendanceRecorded)',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['studentId', 'status'],
                properties: {
                  studentId: { type: 'string', example: 'STU-0001' },
                  status: { type: 'string', enum: ['present', 'absent', 'late'], example: 'present' },
                  note: { type: 'string' },
                },
              },
            },
          },
        },
        responses: { 201: { description: 'Asistencia registrada' } },
      },
    },
    '/incidents': {
      get: {
        summary: 'Listar incidentes (filtro: studentId)',
        parameters: [{ name: 'studentId', in: 'query', schema: { type: 'string' } }],
        responses: { 200: { description: 'Lista' } },
      },
      post: {
        summary: 'Registrar incidente/novedad (publica IncidentReported)',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['studentId', 'type'],
                properties: {
                  studentId: { type: 'string', example: 'STU-0001' },
                  type: { type: 'string', example: 'conducta' },
                  severity: { type: 'string', enum: ['low', 'medium', 'high'], example: 'medium' },
                  description: { type: 'string' },
                },
              },
            },
          },
        },
        responses: { 201: { description: 'Incidente registrado' } },
      },
    },
  },
};

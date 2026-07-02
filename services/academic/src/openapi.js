'use strict';
module.exports = {
  openapi: '3.0.3',
  info: { title: 'Servicio Académico - CampusConnect 360', version: '1.0.0' },
  paths: {
    '/health': { get: { summary: 'Health check', responses: { 200: { description: 'OK' } } } },
    '/students': {
      get: {
        summary: 'Listar estudiantes',
        responses: { 200: { description: 'Lista de estudiantes' } },
      },
      post: {
        summary: 'Registrar estudiante y matrícula (publica StudentEnrolled)',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['firstName', 'lastName', 'grade', 'schoolId'],
                properties: {
                  firstName: { type: 'string', example: 'María' },
                  lastName: { type: 'string', example: 'Pérez' },
                  grade: { type: 'string', example: '8vo EGB' },
                  schoolId: { type: 'string', example: 'SCH-001' },
                },
              },
            },
          },
        },
        responses: { 201: { description: 'Estudiante creado' }, 400: { description: 'Datos inválidos' } },
      },
    },
    '/students/{id}': {
      get: {
        summary: 'Ficha del estudiante (estado académico y financiero)',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Ficha' }, 404: { description: 'No encontrado' } },
      },
    },
  },
};

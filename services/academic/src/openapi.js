'use strict';
module.exports = {
  openapi: '3.0.3',
  info: { title: 'Servicio Académico - CampusConnect 360', version: '1.0.0' },
  components: {
    schemas: {
      Enrollment: {
        type: 'object',
        properties: {
          id: { type: 'integer', example: 1 },
          student_id: { type: 'string', example: 'STU-0001' },
          grade: { type: 'string', example: '8vo EGB' },
          school_id: { type: 'string', example: 'SCH-001' },
          status: { type: 'string', example: 'active' },
          enrolled_at: { type: 'string', format: 'date-time' },
        },
      },
      Student: {
        type: 'object',
        properties: {
          id: { type: 'string', pattern: '^STU-[0-9]{4,}$', example: 'STU-0001' },
          first_name: { type: 'string', example: 'María' },
          last_name: { type: 'string', example: 'Pérez' },
          grade: { type: 'string', example: '8vo EGB' },
          school_id: { type: 'string', example: 'SCH-001' },
          academic_status: { type: 'string', example: 'active' },
          financial_status: { type: 'string', example: 'pending' },
          created_at: { type: 'string', format: 'date-time' },
          enrollments: {
            type: 'array',
            items: { $ref: '#/components/schemas/Enrollment' },
          },
        },
      },
    },
  },
  paths: {
    '/health': { get: { summary: 'Health check', responses: { 200: { description: 'OK' } } } },
    '/students': {
      get: {
        summary: 'Listar estudiantes',
        responses: {
          200: {
            description: 'Lista de estudiantes',
            content: {
              'application/json': {
                schema: { type: 'array', items: { $ref: '#/components/schemas/Student' } },
              },
            },
          },
          401: { description: 'No autenticado' },
          403: { description: 'Rol no autorizado' },
          500: { description: 'Error interno' },
        },
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
        responses: {
          201: { description: 'Estudiante creado y evento publicado' },
          400: { description: 'Datos inválidos' },
          401: { description: 'No autenticado' },
          403: { description: 'Rol no autorizado' },
          500: { description: 'Error interno' },
        },
      },
    },
    '/students/{id}': {
      get: {
        summary: 'Ficha del estudiante (estado académico y financiero)',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: {
            description: 'Ficha con matrículas',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/Student' } },
            },
          },
          404: { description: 'No encontrado' },
          500: { description: 'Error interno' },
        },
      },
    },
  },
};

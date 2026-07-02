-- ============================================================================
-- CampusConnect 360 - Inicialización del clúster PostgreSQL
-- ----------------------------------------------------------------------------
-- Crea una base de datos SEPARADA por cada servicio principal. Esto evidencia
-- el requisito de "Bases de datos o esquemas separados para los servicios"
-- (Database per Service). Cada microservicio solo conoce su propia conexión
-- (DATABASE_URL) y NUNCA accede a las tablas de otro servicio directamente:
-- la única vía de integración entre servicios es la mensajería (RabbitMQ).
--
-- Este script lo ejecuta automáticamente la imagen oficial de postgres porque
-- se monta en /docker-entrypoint-initdb.d/ (ver docker-compose.yml).
-- El esquema/tablas de cada base lo crea el propio servicio al arrancar
-- (db.init(ddl) en shared/db.js), de modo que cada equipo es dueño de su DDL.
-- ============================================================================

CREATE DATABASE academicdb;
CREATE DATABASE paymentsdb;
CREATE DATABASE attendancedb;
CREATE DATABASE notificationsdb;
CREATE DATABASE analyticsdb;

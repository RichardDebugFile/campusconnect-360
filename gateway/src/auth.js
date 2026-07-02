'use strict';
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'campusconnect-dev-secret';
const JWT_TTL = process.env.JWT_TTL || '8h';

/**
 * Usuarios de prueba (seed). En producción vendrían de un IdP / base de usuarios.
 * Cada rol habilita acciones distintas en los servicios (autorización básica).
 */
const USERS = [
  { username: 'secretaria', password: 'campus123', role: 'secretaria', name: 'Secretaría Académica' },
  { username: 'finanzas',   password: 'campus123', role: 'finanzas',   name: 'Área Financiera' },
  { username: 'docente',    password: 'campus123', role: 'docente',    name: 'Docente' },
  { username: 'bienestar',  password: 'campus123', role: 'bienestar',  name: 'Bienestar Estudiantil' },
  { username: 'director',   password: 'campus123', role: 'director',   name: 'Dirección' },
  { username: 'admin',      password: 'campus123', role: 'admin',      name: 'Administrador' },
];

function login(username, password) {
  const u = USERS.find((x) => x.username === username && x.password === password);
  if (!u) return null;
  const token = jwt.sign({ sub: u.username, role: u.role, name: u.name }, JWT_SECRET, { expiresIn: JWT_TTL });
  return { token, role: u.role, name: u.name };
}

function verify(token) {
  return jwt.verify(token, JWT_SECRET);
}

module.exports = { login, verify, USERS };

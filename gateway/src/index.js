'use strict';
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const axios = require('axios');
const { createProxyMiddleware } = require('http-proxy-middleware');
const log = require('./lib/logger');
const auth = require('./auth');

const PORT = process.env.PORT || 8080;

// Destinos de los servicios (configurables por variables de entorno)
const TARGETS = {
  academic: process.env.ACADEMIC_URL || 'http://academic:3001',
  payments: process.env.PAYMENTS_URL || 'http://payments:3002',
  attendance: process.env.ATTENDANCE_URL || 'http://attendance:3003',
  notifications: process.env.NOTIFICATIONS_URL || 'http://notifications:3004',
  analytics: process.env.ANALYTICS_URL || 'http://analytics:3005',
};

const app = express();
app.use(cors());

// correlationId de extremo a extremo
app.use((req, res, next) => {
  req.correlationId = req.headers['x-correlation-id'] || `corr-${crypto.randomUUID()}`;
  next();
});

// ---------- Autenticación ----------
app.post('/auth/login', express.json(), (req, res) => {
  const { username, password } = req.body || {};
  const result = auth.login(username, password);
  if (!result) return res.status(401).json({ error: 'Credenciales inválidas' });
  log.info('Login exitoso', { username, role: result.role });
  res.json(result);
});

// Middleware: valida JWT y deja la identidad en req.auth
function requireAuth(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Falta token Bearer' });
  try {
    req.auth = auth.verify(token);
    next();
  } catch {
    res.status(401).json({ error: 'Token inválido o expirado' });
  }
}

// ---------- Health agregado (observabilidad) ----------
app.get('/health', async (req, res) => {
  const out = { gateway: 'up', services: {} };
  await Promise.all(
    Object.entries(TARGETS).map(async ([name, url]) => {
      try {
        const r = await axios.get(`${url}/health`, { timeout: 2000 });
        out.services[name] = r.data;
      } catch (e) {
        out.services[name] = { status: 'down', error: e.message };
      }
    })
  );
  res.json(out);
});

// Índice de documentación
app.get('/', (req, res) => {
  res.json({
    name: 'CampusConnect 360 - API Gateway',
    login: 'POST /auth/login',
    routes: Object.keys(TARGETS).map((s) => `/api/${s}/*`),
    docs: Object.keys(TARGETS).map((s) => `/api/${s}/docs`),
    health: '/health',
  });
});

// ---------- Proxy hacia los servicios ----------
// Inyecta identidad (x-user-id, x-user-role) y x-correlation-id en cada petición.
function makeProxy(name, target) {
  return createProxyMiddleware({
    target,
    changeOrigin: true,
    pathRewrite: { [`^/api/${name}`]: '' },
    onProxyReq: (proxyReq, req) => {
      if (req.auth) {
        proxyReq.setHeader('x-user-id', req.auth.sub);
        proxyReq.setHeader('x-user-role', req.auth.role);
      }
      proxyReq.setHeader('x-correlation-id', req.correlationId);
    },
    onError: (err, req, res) => {
      log.error('Proxy error', { name, err: err.message });
      if (!res.headersSent) res.status(502).json({ error: `Servicio ${name} no disponible` });
    },
  });
}

// Las rutas /docs y /health de cada servicio no exigen token (documentación / monitoreo)
for (const [name, target] of Object.entries(TARGETS)) {
  app.use(`/api/${name}/docs`, makeProxy(name, target));
  app.use(`/api/${name}/openapi.json`, makeProxy(name, target));
  app.use(`/api/${name}`, requireAuth, makeProxy(name, target));
}

app.listen(PORT, () => log.info(`API Gateway escuchando en :${PORT}`));

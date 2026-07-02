// Cliente API del frontend. Habla con el API Gateway (única entrada centralizada).
const GATEWAY = window.GATEWAY_URL || 'http://localhost:8080';

const Auth = {
  get token() { return sessionStorage.getItem('cc_token'); },
  get role() { return sessionStorage.getItem('cc_role'); },
  get name() { return sessionStorage.getItem('cc_name'); },
  set(data) {
    sessionStorage.setItem('cc_token', data.token);
    sessionStorage.setItem('cc_role', data.role);
    sessionStorage.setItem('cc_name', data.name);
  },
  clear() { sessionStorage.clear(); },
};

async function login(username, password) {
  const r = await fetch(`${GATEWAY}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!r.ok) throw new Error('Credenciales inválidas');
  const data = await r.json();
  Auth.set(data);
  return data;
}

async function api(method, path, body) {
  const r = await fetch(`${GATEWAY}/api${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${Auth.token}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  const data = text ? JSON.parse(text) : null;
  if (!r.ok) throw new Error((data && data.error) || `Error ${r.status}`);
  return data;
}

function toast(msg, kind) {
  const t = document.createElement('div');
  t.className = 'toast';
  if (kind === 'err') t.style.borderColor = '#ef4444';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3200);
}

function badge(v) {
  return `<span class="badge ${v}">${v}</span>`;
}

// Pantalla de login reutilizable. defaultUser preselecciona el rol del portal.
function renderLogin(rootId, title, defaultUser, onReady) {
  const root = document.getElementById(rootId);
  if (Auth.token) { onReady(); return; }
  root.innerHTML = `
    <div class="login card">
      <h2>${title}</h2>
      <label>Usuario</label>
      <input id="u" value="${defaultUser}" />
      <label>Contraseña</label>
      <input id="p" type="password" value="campus123" />
      <button id="btn">Ingresar</button>
      <p class="muted">Usuarios: secretaria, finanzas, docente, bienestar, director, admin · clave: campus123</p>
    </div>`;
  document.getElementById('btn').onclick = async () => {
    try {
      await login(document.getElementById('u').value.trim(), document.getElementById('p').value);
      onReady();
    } catch (e) { toast(e.message, 'err'); }
  };
}

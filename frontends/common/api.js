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
  t.className = 'toast' + (kind === 'err' ? ' err' : '');
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3200);
}

function badge(v) {
  return `<span class="badge ${v}">${v}</span>`;
}

// Pantalla de login reutilizable.
//   defaultUser   preselecciona el usuario esperado por el portal.
//   allowedRoles  (opcional) roles que pueden operar ESTE portal. Si hay una
//                 sesión activa con un rol distinto, se pide reingresar con el
//                 actor correcto (evita el 403 "No autorizado para este rol"
//                 al reutilizar el token de otro portal en la misma pestaña).
function renderLogin(rootId, title, defaultUser, onReady, allowedRoles) {
  const root = document.getElementById(rootId);
  const allowed = Array.isArray(allowedRoles) && allowedRoles.length ? allowedRoles : null;
  const roleOk = !allowed || (Auth.role && allowed.includes(Auth.role));

  if (Auth.token && roleOk) { onReady(); return; }

  // Aviso cuando ya hay sesión pero con un rol que no corresponde a este portal.
  const mismatch = Auth.token && allowed && !roleOk
    ? `<p class="muted">Sesión actual: <b>${Auth.role}</b> — este portal requiere
        ${allowed.map(r => `<b>${r}</b>`).join(' o ')}. Ingresa con el actor correcto.</p>`
    : '';

  root.innerHTML = `
    <div class="login card">
      <h2>${title}</h2>
      ${mismatch}
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

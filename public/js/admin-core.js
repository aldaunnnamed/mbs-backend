/* ================================================================
   MBS Admin — Core (auth, API, sidebar, utils)
================================================================ */

/* ── Auth ───────────────────────────────────────────────────── */
// Claves separadas del frontend de cliente — no interfieren entre sí
const ADMIN_TOKEN_KEY = 'mbs_admin_token';
const ADMIN_USER_KEY  = 'mbs_admin_user';

const AdminAuth = (() => {
  const check = () => {
    let token = localStorage.getItem(ADMIN_TOKEN_KEY);
    let user  = JSON.parse(localStorage.getItem(ADMIN_USER_KEY) || 'null');

    // Migración automática: si ya había sesión admin en mbs_token/mbs_user, la mueve a la clave nueva
    if ((!token || !user) || (user && !['admin','superadmin'].includes(user.rol))) {
      const oldToken = localStorage.getItem('mbs_token');
      const oldUser  = JSON.parse(localStorage.getItem('mbs_user') || 'null');
      if (oldToken && oldUser && ['admin','superadmin'].includes(oldUser.rol)) {
        token = oldToken;
        user  = oldUser;
        localStorage.setItem(ADMIN_TOKEN_KEY, token);
        localStorage.setItem(ADMIN_USER_KEY, JSON.stringify(user));
      }
    }

    if (!token || !user || !['admin', 'superadmin'].includes(user.rol)) {
      localStorage.removeItem(ADMIN_TOKEN_KEY);
      localStorage.removeItem(ADMIN_USER_KEY);
      window.location.href = '/admin/login.html';
      return null;
    }
    return user;
  };
  const logout = () => {
    localStorage.removeItem(ADMIN_TOKEN_KEY);
    localStorage.removeItem(ADMIN_USER_KEY);
    window.location.href = '/admin/login.html';
  };
  return { check, logout };
})();

/* ── API helper ─────────────────────────────────────────────── */
const AdminAPI = (() => {
  const BASE = '/api';
  const hdrs = () => ({
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + (localStorage.getItem(ADMIN_TOKEN_KEY) || '')
  });
  const req = async (method, url, body) => {
    const opts = { method, headers: hdrs() };
    if (body !== undefined) opts.body = JSON.stringify(body);
    try {
      const r = await fetch(BASE + url, opts);
      return r.json();
    } catch (e) {
      return { ok: false, mensaje: 'Error de conexión' };
    }
  };
  return {
    get:  (u)     => req('GET',    u),
    post: (u, b)  => req('POST',   u, b),
    put:  (u, b)  => req('PUT',    u, b),
    del:  (u)     => req('DELETE', u),
  };
})();

/* ── Toast ──────────────────────────────────────────────────── */
const Toast = (() => {
  let c;
  const ensure = () => {
    if (!c) {
      c = document.getElementById('toast-container');
      if (!c) {
        c = document.createElement('div');
        c.id = 'toast-container';
        Object.assign(c.style, {
          position:'fixed', bottom:'20px', right:'20px',
          zIndex:'9999', display:'flex', flexDirection:'column', gap:'8px'
        });
        document.body.appendChild(c);
      }
    }
  };
  const show = (msg, type = 'info') => {
    ensure();
    const cols = { success:'#22C55E', error:'#EF4444', info:'#3B82F6', warning:'#F97316' };
    const el = document.createElement('div');
    el.style.cssText = `background:#fff;border-left:4px solid ${cols[type]||cols.info};border-radius:6px;
      padding:10px 14px;box-shadow:0 4px 12px rgba(0,0,0,.15);font-size:13px;
      max-width:300px;animation:slideIn .2s ease;font-family:Inter,sans-serif;`;
    el.textContent = msg;
    c.appendChild(el);
    setTimeout(() => { el.style.transition='opacity .3s'; el.style.opacity='0'; setTimeout(()=>el.remove(),300); }, 3200);
  };
  return { show };
})();

/* ── Sidebar init ───────────────────────────────────────────── */
const Sidebar = (() => {
  const init = (user) => {
    const path = window.location.pathname;

    // Active link
    document.querySelectorAll('.sb-link[href]').forEach(a => {
      const href = a.getAttribute('href');
      if (!href) return;
      const match = href === path
        || (href !== '/admin/' && href !== '/admin/index.html' && path.includes(href.replace('/admin/','').replace('.html','')));
      if (match) a.classList.add('active');
    });

    // User info
    if (user) {
      const ini = ((user.nombre||'M')[0] + (user.apellidos||'B')[0]).toUpperCase();
      document.querySelectorAll('.js-ini').forEach(e => e.textContent = ini);
      document.querySelectorAll('.js-name').forEach(e => e.textContent = user.nombre || 'Admin');
      document.querySelectorAll('.js-email').forEach(e => e.textContent = user.email || '');
    }

    // Mobile toggle
    const tog = document.getElementById('sb-toggle');
    const ov  = document.getElementById('sb-overlay');
    const sb  = document.getElementById('ap-sidebar');
    if (tog && sb) {
      tog.addEventListener('click', () => { sb.classList.toggle('open'); ov?.classList.toggle('open'); });
      ov?.addEventListener('click', () => { sb.classList.remove('open'); ov.classList.remove('open'); });
    }
  };
  return { init };
})();

/* ── Formatters ─────────────────────────────────────────────── */
const fmt = {
  money: n => '$' + (parseFloat(n)||0).toLocaleString('es-MX',{minimumFractionDigits:2,maximumFractionDigits:2}),
  num:   n => (parseInt(n)||0).toLocaleString('es-MX'),
  date:  s => { if (!s) return '—'; const d=new Date(s); return d.toLocaleDateString('es-MX',{day:'2-digit',month:'short',year:'numeric'}); },
  short: s => { if (!s) return '—'; const d=new Date(s); return d.toLocaleDateString('es-MX',{day:'2-digit',month:'short'}); }
};

/* ── Status badge ───────────────────────────────────────────── */
const badge = (st) => {
  const m = {
    nuevo:         ['bdg--r', '● Nuevo'],
    en_preparacion:['bdg--o', '⚙ En prep.'],
    enviado:       ['bdg--b', '🚚 Enviado'],
    entregado:     ['bdg--g', '✓ Entregado'],
    cancelado:     ['bdg--gr','✕ Cancelado'],
    activo:        ['bdg--g', 'Activo'],
    inactivo:      ['bdg--gr','Inactivo'],
    sin_stock:     ['bdg--r', 'Sin stock'],
    stock_bajo:    ['bdg--o', 'Stock bajo'],
    ok:            ['bdg--g', 'OK'],
    critico:       ['bdg--r', 'Crítico'],
    bajo:          ['bdg--o', 'Bajo'],
  };
  const [cls, lbl] = m[st] || ['bdg--gr', st];
  return `<span class="bdg ${cls}">${lbl}</span>`;
};

/* ── Modal ──────────────────────────────────────────────────── */
const Mo = {
  open:  id => document.getElementById(id)?.classList.add('open'),
  close: id => document.getElementById(id)?.classList.remove('open'),
};

/* ── Bar chart ──────────────────────────────────────────────── */
function drawBarChart(canvas, values, labels) {
  const W = canvas.offsetWidth;
  const H = canvas.offsetHeight;
  if (!W || !H) return;
  const dpr = window.devicePixelRatio || 1;
  canvas.width  = W * dpr;
  canvas.height = H * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  const pad = { top: 28, right: 14, bottom: 34, left: 50 };
  const cW = W - pad.left - pad.right;
  const cH = H - pad.top - pad.bottom;
  const maxV = Math.max(...values, 1);
  const steps = 4;
  const nice = Math.ceil(maxV / steps / 1000) * 1000 * steps || 12000;

  ctx.clearRect(0, 0, W, H);

  // Grid & Y labels
  for (let i = 0; i <= steps; i++) {
    const y = pad.top + cH - (cH * i / steps);
    ctx.strokeStyle = '#E2E8F0'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(pad.left + cW, y); ctx.stroke();
    ctx.fillStyle = '#94A3B8';
    ctx.font = '10px Inter,sans-serif'; ctx.textAlign = 'right';
    const v = nice * i / steps;
    ctx.fillText('$' + (v>=1000 ? (v/1000).toFixed(0)+'k' : v), pad.left - 5, y + 3);
  }

  const n = values.length;
  const slotW = cW / n;
  const bW = Math.max(10, Math.min(36, slotW * 0.55));
  const peakIdx = values.indexOf(Math.max(...values));

  values.forEach((v, i) => {
    const bH = Math.max(2, (v / nice) * cH);
    const x = pad.left + slotW * i + (slotW - bW) / 2;
    const y = pad.top + cH - bH;
    const r = Math.min(4, bW / 2);

    ctx.fillStyle = i === peakIdx ? '#F97316' : '#93C5FD';
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + bW - r, y);
    ctx.arcTo(x+bW, y, x+bW, y+r, r);
    ctx.lineTo(x+bW, y+bH);
    ctx.lineTo(x, y+bH);
    ctx.arcTo(x, y+r, x+r, y, r);  // simplified — just close
    ctx.lineTo(x, y+r);
    ctx.arcTo(x, y, x+r, y, r);
    ctx.closePath();
    ctx.fill();

    // Value on top
    if (v > 0) {
      ctx.fillStyle = i === peakIdx ? '#F97316' : '#94A3B8';
      ctx.font = 'bold 9px Inter,sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('$'+(v>=1000?(v/1000).toFixed(0)+'k':v), x+bW/2, y-5);
    }

    // X label
    ctx.fillStyle = '#64748B';
    ctx.font = '10px Inter,sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(labels[i], x + bW/2, pad.top + cH + 16);
  });
}

/* ── Global init ────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  const user = AdminAuth.check();
  if (!user) return;
  Sidebar.init(user);
});

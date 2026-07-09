/* ================================================================
   MBS COMUNICACIONES — JS Global
   API helper, sesión, carrito, toast, navbar
================================================================ */

const API = (() => {
  const BASE = '/api';

  const authHeaders = () => {
    const token = Session.getToken();
    const sessionKey = Session.getSessionKey();
    const headers = {};
    if (token) headers['Authorization'] = 'Bearer ' + token;
    if (sessionKey) headers['x-session-key'] = sessionKey;
    return headers;
  };

  const _request = async (endpoint, options = {}) => {
    try {
      const res = await fetch(BASE + endpoint, {
        ...options,
        headers: { ...options.headers, ...authHeaders() }
      });
      const ct = res.headers.get('content-type') || '';
      const data = ct.includes('application/json')
        ? await res.json()
        : { ok: false, mensaje: await res.text() };
      if (!res.ok) return { ok: false, mensaje: data.mensaje || `Error ${res.status}`, ...data };
      return data;
    } catch (_) {
      return { ok: false, mensaje: 'Error de conexión' };
    }
  };

  const get  = (endpoint)       => _request(endpoint);
  const post = (endpoint, body) => _request(endpoint, { method: 'POST',   headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const put  = (endpoint, body) => _request(endpoint, { method: 'PUT',    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const del  = (endpoint)       => _request(endpoint, { method: 'DELETE' });

  return { get, post, put, del };
})();

/* ── Sesión ──────────────────────────────────────────────────── */
const Session = (() => {
  const KEY_TOKEN   = 'mbs_token';
  const KEY_USER    = 'mbs_user';
  const KEY_SESSION = 'mbs_session';

  const getToken   = ()  => localStorage.getItem(KEY_TOKEN);
  const getUser    = ()  => JSON.parse(localStorage.getItem(KEY_USER) || 'null');
  const isLoggedIn = ()  => !!getToken();

  const getSessionKey = () => {
    let key = sessionStorage.getItem(KEY_SESSION);
    if (!key) {
      key = 'sess_' + Math.random().toString(36).substr(2, 12);
      sessionStorage.setItem(KEY_SESSION, key);
    }
    return key;
  };

  const login = (token, user) => {
    localStorage.setItem(KEY_TOKEN, token);
    localStorage.setItem(KEY_USER, JSON.stringify(user));
    // Fusionar carrito anónimo al carrito del usuario
    fetch('/api/carrito/fusionar', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + token,
        'x-session-key': sessionStorage.getItem(KEY_SESSION) || '',
        'Content-Type': 'application/json',
      },
    }).catch(() => {});
  };

  const logout = () => {
    localStorage.removeItem(KEY_TOKEN);
    localStorage.removeItem(KEY_USER);
    window.location.href = '/';
  };

  return { getToken, getUser, isLoggedIn, getSessionKey, login, logout };
})();

/* ── Toast notifications ─────────────────────────────────────── */
const Toast = (() => {
  let container;

  const init = () => {
    container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      document.body.appendChild(container);
    }
  };

  const show = (msg, type = 'info', duration = 3000) => {
    if (!container) init();
    const icons = { success: '✓', error: '✕', info: 'ℹ' };
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.innerHTML = `<span>${icons[type] || 'ℹ'}</span><span>${msg}</span>`;
    container.appendChild(el);
    setTimeout(() => {
      el.style.opacity = '0';
      el.style.transform = 'translateX(40px)';
      el.style.transition = '.3s ease';
      setTimeout(() => el.remove(), 300);
    }, duration);
  };

  return { show };
})();

/* ── Carrito (contador en navbar) ────────────────────────────── */
const Cart = (() => {
  const updateBadge = async () => {
    const badge = document.querySelector('.navbar__cart-badge');
    if (!badge) return;
    try {
      const data = await API.get('/carrito');
      const total = data.items ? data.items.reduce((s, i) => s + i.r_cantidad, 0) : 0;
      badge.textContent = total;
      badge.style.display = total > 0 ? 'flex' : 'none';
    } catch (_) {}
  };

  const add = async (producto_id, variante_id, cantidad = 1) => {
    const data = await API.post('/carrito/agregar', { producto_id, variante_id, cantidad });
    if (data.ok) {
      Toast.show('Producto añadido al carrito', 'success');
      updateBadge();
    } else {
      Toast.show(data.mensaje || 'Error al agregar', 'error');
    }
    return data;
  };

  return { updateBadge, add };
})();

/* ── Notificaciones del cliente (campana en navbar) ─────────── */
const NavbarNotif = (() => {
  let _open = false;
  let _interval = null;

  const ICONOS = {
    pedido_confirmado:    '📦',
    pedido_en_preparacion:'🔧',
    pedido_listo:         '✅',
    pedido_enviado:       '🚚',
    pedido_entregado:     '🎉',
    pedido_cancelado:     '❌',
    pago_confirmado:      '💳',
    soporte_enviado:      '📩',
    soporte_pedido:       '🆘',
  };

  const timeAgo = (dateStr) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1)  return 'Ahora';
    if (m < 60) return `Hace ${m} min`;
    const h = Math.floor(m / 60);
    if (h < 24) return `Hace ${h} h`;
    return `Hace ${Math.floor(h / 24)} días`;
  };

  const load = async () => {
    const badge = document.getElementById('navbar-notif-badge');
    const body  = document.getElementById('navbar-notif-body');
    if (!badge || !body) return;

    try {
      const data = await API.get('/usuarios/notificaciones');
      if (!data.ok) return;

      const notifs  = data.notificaciones || [];
      const unread  = notifs.filter(n => !n.leida).length;

      badge.textContent  = unread > 9 ? '9+' : unread;
      badge.style.display = unread > 0 ? 'flex' : 'none';

      if (!notifs.length) {
        body.innerHTML = '<div class="nn-empty">Sin notificaciones</div>';
        return;
      }

      body.innerHTML = notifs.map(n => `
        <div class="nn-item${n.leida ? '' : ' unread'}"
             onclick="NavbarNotif.markOne(${n.id}, this, '${(n.url || '').replace(/'/g, '')}')"
             data-id="${n.id}">
          <span class="nn-icon">${ICONOS[n.tipo] || '🔔'}</span>
          <div class="nn-content">
            <div class="nn-titulo">${n.titulo}</div>
            ${n.mensaje ? `<div class="nn-msg">${n.mensaje}</div>` : ''}
            <div class="nn-time">${timeAgo(n.created_at)}</div>
          </div>
          ${!n.leida ? '<span class="nn-dot"></span>' : ''}
        </div>
      `).join('');
    } catch (_) {}
  };

  const toggle = () => {
    const panel = document.getElementById('navbar-notif-panel');
    if (!panel) return;
    _open = !_open;
    panel.style.display = _open ? 'flex' : 'none';
    if (_open) load();
  };

  const markOne = async (id, el, url) => {
    try {
      await API.put(`/usuarios/notificaciones/${id}/leer`, {});
      el.classList.remove('unread');
      el.querySelector('.nn-dot')?.remove();
      // decrementar badge
      const badge = document.getElementById('navbar-notif-badge');
      if (badge) {
        const n = Math.max(0, (parseInt(badge.textContent) || 0) - 1);
        badge.textContent  = n > 9 ? '9+' : n;
        badge.style.display = n > 0 ? 'flex' : 'none';
      }
    } catch (_) {}
    if (url && url !== 'undefined' && url !== '') window.location.href = url;
  };

  const markAll = async () => {
    try {
      await API.put('/usuarios/notificaciones/todas/leidas', {});
      document.querySelectorAll('.nn-item.unread').forEach(el => {
        el.classList.remove('unread');
        el.querySelector('.nn-dot')?.remove();
      });
      const badge = document.getElementById('navbar-notif-badge');
      if (badge) badge.style.display = 'none';
    } catch (_) {}
  };

  const init = () => {
    load();
    if (_interval) clearInterval(_interval);
    _interval = setInterval(load, 60000);

    // Cerrar panel al hacer clic fuera
    document.addEventListener('click', (e) => {
      const wrap = document.getElementById('navbar-notif-wrap');
      if (wrap && !wrap.contains(e.target) && _open) {
        _open = false;
        const panel = document.getElementById('navbar-notif-panel');
        if (panel) panel.style.display = 'none';
      }
    });
  };

  return { init, toggle, markOne, markAll, load };
})();

/* ── Moneda dual MXN / USD ───────────────────────────────────── */
const Currency = (() => {
  let _rate = null;   // MXN por 1 USD
  let _mode = localStorage.getItem('mbs_currency') || 'MXN';

  const fetchRate = async () => {
    try {
      const r = await fetch('https://api.exchangerate-api.com/v4/latest/USD');
      const data = await r.json();
      _rate = data.rates?.MXN || 17.5;
    } catch (_) {
      _rate = 17.5; // fallback
    }
  };

  const format = (mxn) => {
    const n = parseFloat(mxn || 0);
    if (_mode === 'USD' && _rate) {
      return 'US$' + (n / _rate).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    return '$' + n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const setMode = (mode) => {
    _mode = mode === 'USD' ? 'USD' : 'MXN';
    localStorage.setItem('mbs_currency', _mode);
    // Actualizar todos los precios visibles con data-mxn
    document.querySelectorAll('[data-mxn]').forEach(el => {
      el.textContent = format(el.dataset.mxn);
    });
    // Actualizar el botón toggle
    const btn = document.getElementById('currency-toggle');
    if (btn) {
      btn.dataset.mode = _mode;
      btn.textContent = _mode === 'USD' ? '🇺🇸 USD' : '🇲🇽 MXN';
    }
    // Disparar evento para que páginas con lógica compleja recalculen
    window.dispatchEvent(new CustomEvent('mbs:currency', { detail: { mode: _mode } }));
  };

  const init = async () => {
    await fetchRate();
    // Si ya estaba en USD, actualizar precios tras obtener la tasa
    if (_mode === 'USD') setMode('USD');
    const btn = document.getElementById('currency-toggle');
    if (btn) {
      btn.dataset.mode = _mode;
      btn.textContent = _mode === 'USD' ? '🇺🇸 USD' : '🇲🇽 MXN';
    }
  };

  return { format, setMode, init };
})();

/* ── Skeleton card (placeholder de carga) ────────────────────── */
function skeletonCard() {
  return `<div class="product-card product-card--skeleton">
    <div class="pc__img sk"></div>
    <div class="pc__body">
      <div class="sk sk--line" style="width:60%;height:10px;margin-bottom:6px"></div>
      <div class="sk sk--line" style="width:90%;height:14px;margin-bottom:8px"></div>
      <div class="sk sk--line" style="width:40%;height:18px"></div>
    </div>
  </div>`;
}

/* ── Navbar dinámica ─────────────────────────────────────────── */
const Navbar = (() => {
  const init = () => {
    const user = Session.getUser();
    const actionsEl = document.getElementById('navbar-actions');
    if (!actionsEl) return;

    if (Session.isLoggedIn() && user) {
      const initials = (user.nombre[0] + (user.apellidos?.[0] || '')).toUpperCase();
      const avatarHtml = user.foto_url
        ? `<div class="navbar__user-avatar" id="navbar-avatar" style="padding:0;overflow:hidden"><img src="${user.foto_url}" style="width:100%;height:100%;object-fit:cover;border-radius:50%" alt="${initials}"></div>`
        : `<div class="navbar__user-avatar" id="navbar-avatar">${initials}</div>`;
      actionsEl.innerHTML = `
        <button id="currency-toggle" class="currency-toggle" data-mode="MXN"
          onclick="Currency.setMode(this.dataset.mode === 'MXN' ? 'USD' : 'MXN')">
          🇲🇽 MXN
        </button>
        <div class="navbar__notif-wrap" id="navbar-notif-wrap">
          <button class="navbar__notif-btn" id="navbar-notif-btn" onclick="NavbarNotif.toggle()" title="Notificaciones">
            🔔<span class="navbar__notif-badge" id="navbar-notif-badge" style="display:none">0</span>
          </button>
          <div class="navbar__notif-panel" id="navbar-notif-panel" style="display:none">
            <div class="navbar__notif-hd">
              <span>Notificaciones</span>
              <button class="navbar__notif-mark-all" onclick="NavbarNotif.markAll()">Marcar todas como leídas</button>
            </div>
            <div class="navbar__notif-body" id="navbar-notif-body">
              <div class="nn-empty">Cargando...</div>
            </div>
          </div>
        </div>
        <a href="/pages/carrito.html" class="navbar__cart" title="Carrito">
          🛒
          <span class="navbar__cart-badge" style="display:none">0</span>
        </a>
        <div class="navbar__user">
          ${avatarHtml}
          <span class="navbar__user-name hide-mobile">${user.nombre}</span>
          <span style="color:rgba(255,255,255,.5);font-size:.8rem">▾</span>
          <div class="navbar__dropdown">
            <a href="/pages/mi-cuenta.html">👤 Mi cuenta</a>
            <a href="/pages/mis-pedidos.html">📦 Mis pedidos</a>
            <hr>
            <div class="logout" onclick="Session.logout()">🚪 Cerrar sesión</div>
          </div>
        </div>
      `;
      Cart.updateBadge();
      NavbarNotif.init();
    } else {
      actionsEl.innerHTML = `
        <button id="currency-toggle" class="currency-toggle" data-mode="MXN"
          onclick="Currency.setMode(this.dataset.mode === 'MXN' ? 'USD' : 'MXN')">
          🇲🇽 MXN
        </button>
        <a href="/pages/carrito.html" class="navbar__cart" title="Carrito">
          🛒
          <span class="navbar__cart-badge" style="display:none">0</span>
        </a>
        <a href="/pages/login.html" class="navbar__btn-login btn">Iniciar sesión</a>
      `;
      Cart.updateBadge();
    }

    // Resaltar link activo
    const path = window.location.pathname;
    document.querySelectorAll('.navbar__nav a').forEach(a => {
      if (a.getAttribute('href') === path) a.classList.add('active');
    });
  };

  return { init };
})();


/* ── Menú móvil (hamburguesa) ────────────────────────────────── */
const MobileMenu = (() => {
  const init = () => {
    const btn = document.querySelector('.navbar__hamburger');
    const nav = document.querySelector('.navbar__nav');
    if (!btn || !nav) return;

    const close = () => {
      btn.classList.remove('open');
      nav.classList.remove('open');
      btn.setAttribute('aria-expanded', 'false');
    };

    btn.addEventListener('click', () => {
      const open = nav.classList.toggle('open');
      btn.classList.toggle('open', open);
      btn.setAttribute('aria-expanded', String(open));
    });

    // Cerrar el menú al elegir un link
    nav.querySelectorAll('a').forEach(a => a.addEventListener('click', close));

    // Cerrar al hacer click fuera del navbar
    document.addEventListener('click', e => {
      if (!nav.classList.contains('open')) return;
      if (!nav.contains(e.target) && !btn.contains(e.target)) close();
    });

    // Buscador dentro del menú móvil
    const mobileSearch = document.getElementById('navbar-search-mobile');
    if (mobileSearch) {
      mobileSearch.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
          const q = e.target.value.trim();
          if (q) window.location.href = '/pages/catalogo.html?busqueda=' + encodeURIComponent(q);
        }
      });
    }
  };

  return { init };
})();

/* ── Autocompletado de búsqueda en navbar ────────────────────── */
const NavbarSearch = (() => {
  const MIN_CHARS = 2;
  const DELAY_MS  = 280;
  let _timer = null;

  /* Crea (o reutiliza) el panel dropdown dentro del .navbar__search */
  const getDropdown = (input) => {
    const wrap = input.closest('.navbar__search');
    if (!wrap) return null;
    let dd = wrap.querySelector('.ns-dropdown');
    if (!dd) {
      dd = document.createElement('div');
      dd.className = 'ns-dropdown';
      wrap.appendChild(dd);
    }
    return dd;
  };

  const closeAll = () => {
    document.querySelectorAll('.ns-dropdown').forEach(d => {
      d.style.display = 'none';
      d.innerHTML = '';
    });
  };

  /* Resalta el término buscado dentro del texto */
  const hl = (text, q) => {
    if (!q) return text;
    const re = new RegExp('(' + q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi');
    return text.replace(re, '<mark class="ns-hl">$1</mark>');
  };

  const priceMXN = (n) =>
    '$' + parseFloat(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 });

  const render = (dd, productos, q) => {
    if (!productos.length) {
      dd.innerHTML = `<div class="ns-empty">Sin resultados para <strong>${q}</strong></div>`;
      dd.style.display = 'block';
      return;
    }

    const items = productos.map(p => {
      const nombre = p.r_nombre || p.nombre || '—';
      const precio = p.r_precio_venta || p.precio_venta || 0;
      const img    = p.r_imagen_principal || p.imagen_principal || '';
      const cat    = p.r_categoria || p.categoria_nombre || '';
      const id     = p.r_id || p.id;

      return `
        <a class="ns-item" href="/pages/producto.html?id=${id}">
          <div class="ns-img">
            ${img
              ? `<img src="${img}" alt="" loading="lazy">`
              : '<span class="ns-img--ph">📦</span>'}
          </div>
          <div class="ns-info">
            <div class="ns-name">${hl(nombre, q)}</div>
            ${cat ? `<div class="ns-meta">${cat}</div>` : ''}
          </div>
          <div class="ns-price">${priceMXN(precio)}</div>
        </a>`;
    });

    dd.innerHTML = items.join('') +
      `<a class="ns-ver-todos" href="/pages/catalogo.html?busqueda=${encodeURIComponent(q)}">
        Ver todos los resultados →
      </a>`;
    dd.style.display = 'block';
  };

  const search = async (input, q) => {
    if (q.length < MIN_CHARS) { closeAll(); return; }
    const dd = getDropdown(input);
    if (!dd) return;
    dd.innerHTML = '<div class="ns-loading">Buscando...</div>';
    dd.style.display = 'block';
    try {
      const data = await API.get('/productos?busqueda=' + encodeURIComponent(q) + '&limite=6');
      const productos = data.productos || [];
      render(dd, productos, q);
    } catch (_) {
      dd.innerHTML = '<div class="ns-empty">Error al buscar</div>';
    }
  };

  const init = () => {
    document.querySelectorAll('.navbar__search input').forEach(input => {
      input.addEventListener('input', e => {
        clearTimeout(_timer);
        const q = e.target.value.trim();
        _timer = setTimeout(() => search(input, q), DELAY_MS);
      });
      input.addEventListener('keydown', e => {
        if (e.key === 'Escape') closeAll();
        if (e.key === 'Enter') {
          const q = e.target.value.trim();
          if (q) { closeAll(); window.location.href = '/pages/catalogo.html?busqueda=' + encodeURIComponent(q); }
        }
      });
    });
    document.addEventListener('click', e => {
      if (!e.target.closest('.navbar__search')) closeAll();
    });
  };

  return { init };
})();


/* -- Configuracion dinamica del sitio -- */
const SiteConfig = (() => {
  async function init() {
    try {
      const r = await API.get('/config/publica');
      if (!r.ok || !r.configuracion || !r.configuracion.length) return;

      const cfg = {};
      r.configuracion.forEach(c => { cfg[c.clave] = c.valor; });

      // Footer: columna contacto (posicion 0=direccion, 1=telefono, 2=email)
      const contactSpans = document.querySelectorAll('.footer__contact-item span:last-child');
      if (contactSpans[0] && cfg.direccion) contactSpans[0].textContent = cfg.direccion;
      if (contactSpans[1] && cfg.telefono)  contactSpans[1].textContent = cfg.telefono;
      if (contactSpans[2] && cfg.email)     contactSpans[2].textContent = cfg.email;

      // Footer: WhatsApp
      const waLink = document.querySelector('.footer__whatsapp');
      if (waLink && cfg.whatsapp) {
        const num = cfg.whatsapp.replace(/\D/g, '');
        waLink.href = 'https://wa.me/' + num;
      }

      // Footer: redes sociales (orden: LinkedIn, Facebook, Instagram)
      const toUrl = v => {
        if (!v || v === '#') return '#';
        return /^https?:\/\//i.test(v) ? v : 'https://' + v;
      };
      const socialLinks = document.querySelectorAll('.footer__social a');
      if (socialLinks[0] && cfg.linkedin)  { socialLinks[0].href = toUrl(cfg.linkedin);  socialLinks[0].target = '_blank'; }
      if (socialLinks[1] && cfg.facebook)  { socialLinks[1].href = toUrl(cfg.facebook);  socialLinks[1].target = '_blank'; }
      if (socialLinks[2] && cfg.instagram) { socialLinks[2].href = toUrl(cfg.instagram); socialLinks[2].target = '_blank'; }

      // Footer: tagline / slogan
      const tagline = document.querySelector('.footer__tagline');
      if (tagline) {
        const partes = [cfg.slogan, cfg.direccion].filter(Boolean);
        if (partes.length) tagline.textContent = partes.join('. ') + '.';
      }

      // Boton WhatsApp flotante
      const waFloat = document.querySelector('a.whatsapp-float, a[href*="wa.me"]:not(.footer__whatsapp)');
      if (waFloat && cfg.whatsapp) {
        const num = cfg.whatsapp.replace(/\D/g, '');
        waFloat.href = 'https://wa.me/' + num;
      }

      // Nombre del sitio en footer
      const brand = document.querySelector('.footer__brand-name');
      if (brand && cfg.sitio_nombre) brand.textContent = cfg.sitio_nombre;

      // Copyright
      const copy = document.querySelector('.footer__bottom span');
      if (copy && cfg.sitio_nombre) {
        const year = new Date().getFullYear();
        copy.textContent = '\u00a9 ' + year + ' ' + cfg.sitio_nombre + ' \u00b7 Todos los derechos reservados';
      }

      // Logo del navbar (si fue subido desde admin)
      if (cfg.logo_url) {
        const logoEls = document.querySelectorAll('.navbar__logo-text');
        if (logoEls.length) {
          const probe = new Image();
          probe.onload = () => {
            logoEls.forEach(el => {
              el.style.display = 'none';
              const img = document.createElement('img');
              img.src = cfg.logo_url;
              img.alt = cfg.sitio_nombre || 'MBS';
              img.style.cssText = 'max-height:36px;max-width:120px;object-fit:contain;vertical-align:middle';
              el.parentNode.insertBefore(img, el);
            });
          };
          probe.src = cfg.logo_url;
        }
      }

    } catch (_) { /* falla silenciosa; footer estatico permanece */ }
  }

  return { init };
})();

/* -- Inicializacion global -- */
document.addEventListener('DOMContentLoaded', () => {
  Navbar.init();
  MobileMenu.init();
  NavbarSearch.init();
  Currency.init();
  SiteConfig.init();
});
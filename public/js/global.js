/* ================================================================
   MBS COMUNICACIONES — JS Global
   API helper, sesión, carrito, toast, navbar
================================================================ */

const API = (() => {
  const BASE = '/api';

  const get = async (endpoint) => {
    const res = await fetch(BASE + endpoint, {
      headers: authHeaders()
    });
    return res.json();
  };

  const post = async (endpoint, body) => {
    const res = await fetch(BASE + endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(body)
    });
    return res.json();
  };

  const put = async (endpoint, body) => {
    const res = await fetch(BASE + endpoint, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(body)
    });
    return res.json();
  };

  const del = async (endpoint) => {
    const res = await fetch(BASE + endpoint, {
      method: 'DELETE',
      headers: authHeaders()
    });
    return res.json();
  };

  const authHeaders = () => {
    const token = Session.getToken();
    const sessionKey = Session.getSessionKey();
    const headers = {};
    if (token) headers['Authorization'] = 'Bearer ' + token;
    if (sessionKey) headers['x-session-key'] = sessionKey;
    return headers;
  };

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

/* ── Navbar dinámica ─────────────────────────────────────────── */
const Navbar = (() => {
  const init = () => {
    const user = Session.getUser();
    const actionsEl = document.getElementById('navbar-actions');
    if (!actionsEl) return;

    if (Session.isLoggedIn() && user) {
      const initials = (user.nombre[0] + (user.apellidos?.[0] || '')).toUpperCase();
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
          <div class="navbar__user-avatar">${initials}</div>
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
      const nombre = p.r_nombre       const nombre = p.r_nombre || p.nombre || '—';
      const precio = p.r_precio_venta || p.precio_venta || 0;
      const img    = p.r_imagen_principal || p.imagen_principal || '';
      const cat    = p.r_categoria || p.categoria_nombre || '';

      return `
        <a class="ns-item" href="/pages/producto.html?id=${p.r_id || p.id}">
          <div class="ns-item__img">
            ${img
              ? `<img src="${img}" alt="" loading="lazy">`
              : '<span class="ns-item__ph">📦</span>'}
          </div>
          <div class="ns-item__info">
            <div class="ns-item__name">${hl(nombre, q)}</div>
            <div class="ns-item__cat">${cat}</div>
          </div>
          <div class="ns-item__price">${priceMXN(precio)}</div>
        </a>`;
    }).join('');

    dd.innerHTML = items +
      `<a class="ns-footer" href="/pages/catalogo.html?busqueda=${encodeURIComponent(q)}">Ver todos los resultados →</a>`;
    dd.style.display = 'block';
  };

  const search = async (input, q) => {
    const dd = getDropdown(input);
    if (!dd) return;
    if (q.length < MIN_CHARS) { dd.style.display = 'none'; return; }
    dd.innerHTML = '<div class="ns-loading">Buscando...</div>';
    dd.style.display = 'block';
    try {
      const r = await API.get('/productos?busqueda=' + encodeURIComponent(q) + '&por_pagina=6');
      render(dd, r.productos || [], q);
    } catch { dd.style.display = 'none'; }
  };

  const init = () => {
    const inputs = document.querySelectorAll('#navbar-search, #navbar-search-mobile');
    inputs.forEach(input => {
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

/* ── Inicialización global ───────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  Navbar.init();
  MobileMenu.init();
  NavbarSearch.init();
  Currency.init();

  // Mostrar logo del sitio si fue subido desde el panel admin
  const logoEls = document.querySelectorAll('.navbar__logo-text');
  if (logoEls.length) {
    const probe = new Image();
    probe.onload = () => {
      logoEls.forEach(el => {
        el.outerHTML = '<img src="/uploads/logo/logo.png" class="navbar__logo-img" alt="MBS Comunicaciones" style="height:38px;object-fit:contain;max-width:140px;vertical-align:middle">';
      });
    };
    // 5-min cache bust para que el cambio de logo se refleje rápido
    probe.src = '/uploads/logo/logo.png?' + Math.floor(Date.now() / 300000);
  }
});
era
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.navbar__search')) closeAll();
    });
  };

  return { init };
})();

/* ── Conversor de moneda MXN / USD ──────────────────────────── */
const Currency = (() => {
  let _rate = null;        // tipo de cambio USD→MXN
  let _mode = 'MXN';       // moneda activa
  const FALLBACK_RATE = 17.5; // respaldo si falla la API

  const fetchRate = async () => {
    try {
      // API pública gratuita de tipo de cambio
      const res = await fetch(
        'https://api.exchangerate-api.com/v4/latest/USD',
        { signal: AbortSignal.timeout(4000) }
      );
      const data = await res.json();
      _rate = data.rates?.MXN || FALLBACK_RATE;
    } catch (_) {
      _rate = FALLBACK_RATE;
    }
  };

  const init = async () => {
    // Intentar desde localStorage primero (cache de 1 hora)
    const cached = localStorage.getItem('mbs_fx');
    if (cached) {
      try {
        const { rate, ts } = JSON.parse(cached);
        if (Date.now() - ts < 3600000) { // 1 hora
          _rate = rate;
          return;
        }
      } catch (_) {}
    }
    await fetchRate();
    if (_rate) {
      localStorage.setItem('mbs_fx', JSON.stringify({ rate: _rate, ts: Date.now() }));
    }
  };

  const format = (mxn) => {
    const n = parseFloat(mxn) || 0;
    if (_mode === 'USD' && _rate) {
      const usd = n / _rate;
      return 'USD $' + usd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    return '$' + n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const setMode = (mode) => {
    _mode = mode;
    localStorage.setItem('mbs_currency', mode);
    // Actualizar todos los precios visibles en la página
    document.querySelectorAll('[data-mxn]').forEach(el => {
      el.textContent = format(el.dataset.mxn);
    });
    // Actualizar el botón
    const btn = document.getElementById('currency-toggle');
    if (btn) {
      btn.textContent  = _mode === 'MXN' ? '🇲🇽 MXN' : '🇺🇸 USD';
      btn.dataset.mode = _mode;
    }
    // Disparar evento para que otras partes de la página puedan reaccionar
    document.dispatchEvent(new CustomEvent('currencyChange', { detail: { mode: _mode, rate: _rate } }));
  };

  const getMode = () => _mode;
  const getRate = () => _rate || FALLBACK_RATE;

  return { init, format, setMode, getMode, getRate };
})();

/* ── Formato de precio ───────────────────────────────────────── */
const formatPrice = (n) => Currency.format(n);

/* ── Skeleton helpers ────────────────────────────────────────── */
const skeletonCard = () => `
  <div class="product-card">
    <div class="product-card__img skeleton" style="aspect-ratio:1"></div>
    <div class="product-card__body">
      <div class="skeleton mb-8" style="height:12px;width:60%"></div>
      <div class="skeleton mb-8" style="height:16px;width:90%"></div>
      <div class="skeleton mb-8" style="height:12px;width:40%"></div>
      <div class="skeleton mb-16" style="height:24px;width:50%"></div>
      <div class="skeleton" style="height:40px;border-radius:6px"></div>
    </div>
  </div>`;

/* ── Footer links resolver ───────────────────────────────────── */
const FooterLinks = (() => {
  const MAP = {
    'Sobre MBS':               '/pages/sobre-nosotros.html',
    'Preguntas frecuentes':    '/pages/faq.html',
    'Política de envíos':      '/pages/politica-envios.html',
    'Garantía y devoluciones': '/pages/garantia.html',
    'Aviso de privacidad':     '/pages/privacidad.html',
    'Términos':                '/pages/terminos.html',
    'Términos y condiciones':  '/pages/terminos.html',
    'Contacto':                '/pages/contacto.html',
  };

  const resolve = () => {
    document.querySelectorAll('footer a[href="#"]').forEach(a => {
      const key = a.textContent.trim();
      if (MAP[key]) a.href = MAP[key];
    });
  };

  const loadSocial = async () => {
    try {
      const r = await fetch('/api/config/publica').then(x => x.json()).catch(() => null);
      if (!r?.ok) return;
      const cfg = {};
      (r.configuracion || []).forEach(c => { cfg[c.clave] = c.valor; });
      document.querySelectorAll('footer .footer__social a').forEach(a => {
        const title = a.title?.toLowerCase();
        if (title === 'facebook'  && cfg.social_facebook)  { a.href = cfg.social_facebook;  a.target = '_blank'; }
        if (title === 'instagram' && cfg.social_instagram) { a.href = cfg.social_instagram; a.target = '_blank'; }
        if (title === 'linkedin'  && cfg.social_linkedin)  { a.href = cfg.social_linkedin;  a.target = '_blank'; }
        if (title === 'whatsapp') {
          const wa = cfg.contacto_whatsapp || '527713455929';
          a.href = 'https://wa.me/' + wa.replace(/\D/g, '');
          a.target = '_blank';
        }
      });
    } catch (_) {}
  };

  return { resolve, loadSocial };
})();

/* ── Init global ─────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', async () => {
  // Restaurar moneda guardada
  const savedCurrency = localStorage.getItem('mbs_currency') || 'MXN';
  await Currency.init();
  Navbar.init();
  MobileMenu.init();
  NavbarSearch.init();
  // Aplicar moneda guardada después de inicializar
  if (savedCurrency !== 'MXN') {
    Currency.setMode(savedCurrency);
  }
  // Resolver links del footer y redes sociales
  FooterLinks.resolve();
  FooterLinks.loadSocial();

  // Hero search (homepage)
  const heroSearch = document.getElementById('hero-search');
  if (heroSearch) {
    heroSearch.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        const q = e.target.value.trim();
        if (q) window.location.href = '/pages/catalogo.html?busqueda=' + encodeURIComponent(q);
      }
    });
    heroSearch.setAttribute('placeholder', 'Buscar producto o SKU... ↵');
  }
});

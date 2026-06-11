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

/* ================================================================
   MBS — Catálogo JS
================================================================ */
document.addEventListener('DOMContentLoaded', async () => {

  // ── Estado ─────────────────────────────────────────────────
  const state = {
    pagina: 1,
    por_pagina: 9,
    orden: 'relevancia',
    categoria_ids: [],
    marca_id: null,
    precio_min: 0,
    precio_max: 15000,
    solo_stock: false,
    busqueda: null,
    total: 0,
    vista: 'grid',   // 'grid' | 'list'
  };

  // ── Leer parámetros de la URL ───────────────────────────────
  const params = new URLSearchParams(window.location.search);
  if (params.get('categoria'))  state.categoria_ids = [params.get('categoria')];
  if (params.get('busqueda'))   state.busqueda     = params.get('busqueda');
  if (params.get('marca'))      state.marca_id     = params.get('marca');
  if (params.get('pagina'))     state.pagina       = parseInt(params.get('pagina'));

  // ── Referencias DOM ────────────────────────────────────────
  const grid        = document.getElementById('products-grid');
  const emptyState  = document.getElementById('empty-state');
  const countEl     = document.getElementById('catalog-count');
  const paginEl     = document.getElementById('pagination');
  const sortSel     = document.getElementById('sort-select');
  const activeChips = document.getElementById('active-filters-chips');

  // ── Cargar filtros ─────────────────────────────────────────
  const loadFilters = async () => {
    // Categorías
    const cats = await API.get('/productos/categorias');
    const catContainer = document.getElementById('filter-categorias');
    if (catContainer && cats.ok) {
      catContainer.innerHTML = cats.categorias.map(c => `
        <div class="filter-option">
          <label>
            <input type="checkbox" name="categoria" value="${c.id}"
              ${state.categoria_ids.includes(String(c.id)) ? 'checked' : ''}>
            ${c.nombre}
          </label>
          <span class="filter-option__count">—</span>
        </div>`).join('');
    }

    // Marcas
    const mks = await API.get('/productos/marcas');
    const mksContainer = document.getElementById('filter-marcas');
    if (mksContainer && mks.ok) {
      mksContainer.innerHTML = mks.marcas.map(m => `
        <div class="filter-option">
          <label>
            <input type="checkbox" name="marca" value="${m.id}"
              ${state.marca_id == m.id ? 'checked' : ''}>
            ${m.nombre}
          </label>
        </div>`).join('');
    }

    // Selección única para marca: el backend solo soporta un marca_id a la
    // vez, así que al marcar una se desmarcan las demás. Las categorías sí
    // permiten selección múltiple (filtro OR).
    mksContainer?.querySelectorAll('[name="marca"]').forEach(cb => {
      cb.addEventListener('change', () => {
        if (cb.checked) {
          mksContainer.querySelectorAll('[name="marca"]').forEach(other => {
            if (other !== cb) other.checked = false;
          });
        }
      });
    });

    // Prellenar búsqueda si viene por URL
    if (state.busqueda) {
      const inp = document.getElementById('search-input');
      if (inp) inp.value = state.busqueda;
    }
  };

  // ── Construir query string ─────────────────────────────────
  const buildQuery = () => {
    const q = new URLSearchParams();
    if (state.categoria_ids.length) q.set('categoria_id', state.categoria_ids.join(','));
    if (state.marca_id)     q.set('marca_id',     state.marca_id);
    if (state.busqueda)     q.set('busqueda',      state.busqueda);
    if (state.solo_stock)   q.set('solo_stock',    'true');
    q.set('precio_min',  state.precio_min);
    q.set('precio_max',  state.precio_max);
    q.set('orden',       state.orden);
    q.set('pagina',      state.pagina);
    q.set('por_pagina',  state.por_pagina);
    return q.toString();
  };

  // ── Cargar productos ───────────────────────────────────────
  const loadProducts = async () => {
    // Skeletons
    grid.innerHTML = Array(state.por_pagina).fill(skeletonCard()).join('');
    emptyState.classList.remove('visible');

    try {
      const data = await API.get('/productos?' + buildQuery());

      if (!data.ok) throw new Error(data.mensaje);

      state.total = data.total || 0;
      countEl.textContent = state.total + ' productos';

      if (!data.productos || data.productos.length === 0) {
        grid.innerHTML = '';
        emptyState.classList.add('visible');
        renderPagination();
        return;
      }

      grid.innerHTML = data.productos.map(p => buildProductCard(p)).join('');
      renderPagination();
      renderActiveFilters();
      attachCardEvents();

    } catch (err) {
      console.error('Error cargando productos:', err);
      grid.innerHTML = '<p class="text-muted" style="padding:32px">Error al cargar productos.</p>';
    }
  };

  // ── Construir tarjeta ──────────────────────────────────────
  const buildProductCard = (p) => {
    const badgeMap   = { nuevo:'badge-orange', oferta:'badge-amber', top_venta:'badge-navy', liquidacion:'badge-red' };
    const badgeLabel = { nuevo:'NUEVO', oferta:'OFERTA', top_venta:'TOP VENTA', liquidacion:'LIQUIDACIÓN' };
    const nombre  = p.r_nombre   || p.nombre;
    const sku     = p.r_sku      || p.sku;
    const precio  = p.r_precio_venta || p.precio_venta;
    const antes   = p.r_precio_antes  || p.precio_antes;
    const cat     = p.r_categoria     || p.categoria;
    const slug    = p.r_slug          || p.slug;
    const id      = p.r_id            || p.id;
    const stock   = p.r_stock_actual  ?? p.stock_actual;

    const badgeHtml = p.badge
      ? `<span class="badge ${badgeMap[p.badge]} product-card__badge">${badgeLabel[p.badge]}</span>` : '';

    const stockHtml = stock > 0
      ? `<span class="stock-badge in-stock">En stock</span>`
      : `<span class="stock-badge no-stock">Sin stock</span>`;

    const imgHtml = p.imagen_principal
      ? `<img src="${p.imagen_principal}" alt="${nombre}" loading="lazy" onerror="this.onerror=null;this.src='https://placehold.co/400x400/e2e8f0/64748b?text=${encodeURIComponent(sku)}'">`
      : `<img src="https://placehold.co/400x400/e2e8f0/64748b?text=${encodeURIComponent(sku)}" alt="${nombre}" loading="lazy">`;

    const btnHtml = stock > 0
      ? `<button class="btn btn-primary btn-full btn-add-cart" data-id="${id}">Añadir al carrito</button>`
      : `<button class="btn btn-full" style="background:var(--gray-100);color:var(--gray-600);cursor:not-allowed" disabled>Sin stock</button>`;

    return `
      <div class="product-card">
        <a href="/pages/producto.html?slug=${slug}">
          <div class="product-card__img">
            ${badgeHtml}
            <button class="product-card__fav" data-id="${id}" title="Favorito">♡</button>
            ${imgHtml}
          </div>
        </a>
        <div class="product-card__body">
          <div class="product-card__cat">${cat || ''}</div>
          <a href="/pages/producto.html?slug=${slug}">
            <div class="product-card__name">${nombre}</div>
          </a>
          <div class="product-card__sku">SKU: ${sku}</div>
          ${stockHtml}
          <div class="product-card__price" data-mxn="${precio}">
            ${Currency.format(precio)}
          </div>
          ${btnHtml}
        </div>
      </div>`;
  };

  // ── Paginación ─────────────────────────────────────────────
  const renderPagination = () => {
    if (!paginEl) return;
    const totalPags = Math.ceil(state.total / state.por_pagina);
    if (totalPags <= 1) { paginEl.innerHTML = ''; return; }

    const pages = [];
    // Siempre incluir 1, última y páginas cercanas a la actual
    for (let i = 1; i <= totalPags; i++) {
      if (i === 1 || i === totalPags ||
          (i >= state.pagina - 1 && i <= state.pagina + 1)) {
        pages.push(i);
      } else if (pages[pages.length - 1] !== '...') {
        pages.push('...');
      }
    }

    paginEl.innerHTML = `
      <div class="pagination__info">
        Mostrando ${((state.pagina-1)*state.por_pagina)+1}–${Math.min(state.pagina*state.por_pagina, state.total)} de ${state.total} productos
      </div>
      <div class="pagination__pages">
        <button class="page-btn" onclick="changePage(${state.pagina-1})"
          ${state.pagina === 1 ? 'disabled' : ''}>‹</button>
        ${pages.map(p => p === '...'
          ? `<span class="page-btn" style="cursor:default">…</span>`
          : `<button class="page-btn ${p === state.pagina ? 'active' : ''}"
               onclick="changePage(${p})">${p}</button>`
        ).join('')}
        <button class="page-btn" onclick="changePage(${state.pagina+1})"
          ${state.pagina >= totalPags ? 'disabled' : ''}>›</button>
      </div>
      <div class="pagination__perpage">
        Mostrar:
        <select onchange="changePerPage(this.value)">
          ${[9,18,27,36].map(n =>
            `<option value="${n}" ${n === state.por_pagina ? 'selected' : ''}>${n}</option>`
          ).join('')}
        </select>
      </div>`;
  };

  // ── Filtros activos (chips) ────────────────────────────────
  const renderActiveFilters = () => {
    if (!activeChips) return;
    const chips = [];
    if (state.busqueda)  chips.push({ label: state.busqueda,   key: 'busqueda' });

    document.querySelectorAll('[name="categoria"]:checked').forEach(c =>
      chips.push({ label: c.closest('label').textContent.trim(), key: 'categoria_' + c.value })
    );

    document.querySelectorAll('[name="marca"]:checked').forEach(m =>
      chips.push({ label: m.closest('label').textContent.trim(), key: 'marca_' + m.value })
    );

    if (state.solo_stock) chips.push({ label: 'Solo en stock', key: 'solo_stock' });

    const wrapper = document.getElementById('active-filters');
    if (chips.length === 0) { if (wrapper) wrapper.style.display = 'none'; return; }
    if (wrapper) wrapper.style.display = 'block';

    activeChips.innerHTML = chips.map(c =>
      `<span class="filter-chip">${c.label}
        <span class="filter-chip__remove" onclick="removeFilter('${c.key}')">✕</span>
      </span>`
    ).join('');
  };

  // ── Eventos de las tarjetas ────────────────────────────────
  const attachCardEvents = () => {
    grid.querySelectorAll('.btn-add-cart').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        btn.disabled = true;
        btn.textContent = 'Agregando...';
        await Cart.add(parseInt(id), null, 1);
        btn.disabled = false;
        btn.textContent = 'Añadir al carrito';
      });
    });

    grid.querySelectorAll('.product-card__fav').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault(); e.stopPropagation();
        if (!Session.isLoggedIn()) {
          Toast.show('Inicia sesión para guardar favoritos', 'info');
          return;
        }
        const data = await API.post('/usuarios/favoritos/' + btn.dataset.id, {});
        if (data.ok) {
          btn.classList.toggle('active', data.accion === 'agregado');
          btn.textContent = data.accion === 'agregado' ? '♥' : '♡';
          Toast.show(data.mensaje, 'success');
        }
      });
    });
  };

  // ── Aplicar filtros del panel ──────────────────────────────
  const applyFilters = () => {
    // Categoría (selección múltiple: el backend filtra con OR)
    const catsChecked = document.querySelectorAll('[name="categoria"]:checked');
    state.categoria_ids = Array.from(catsChecked).map(c => c.value);

    // Marca (el backend soporta un ID; se toma el primero marcado)
    const mksChecked = document.querySelectorAll('[name="marca"]:checked');
    state.marca_id = mksChecked.length > 0 ? mksChecked[0].value : null;

    // Precio
    const minEl = document.getElementById('price-min');
    const maxEl = document.getElementById('price-max');
    if (minEl) state.precio_min = parseInt(minEl.value) || 0;
    if (maxEl) state.precio_max = parseInt(maxEl.value) || 15000;

    // Solo en stock
    const stockToggle = document.getElementById('toggle-stock');
    if (stockToggle) state.solo_stock = stockToggle.checked;

    state.pagina = 1;
    loadProducts();
    // Cerrar panel en mobile
    document.getElementById('filters-panel')?.classList.remove('open');
  };

  // ── Funciones globales (llamadas desde HTML) ───────────────
  window.changePage = (p) => {
    if (p < 1) return;
    state.pagina = p;
    loadProducts();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  window.changePerPage = (n) => {
    state.por_pagina = parseInt(n);
    state.pagina = 1;
    loadProducts();
  };
  window.removeFilter = (key) => {
    if (key === 'busqueda')    { state.busqueda = null; const si = document.getElementById('search-input'); if (si) si.value = ''; }
    if (key === 'solo_stock')  { state.solo_stock = false; document.getElementById('toggle-stock').checked = false; }
    if (key.startsWith('categoria_')) {
      const id = key.split('_')[1];
      const el = document.querySelector(`[name="categoria"][value="${id}"]`);
      if (el) el.checked = false;
      state.categoria_ids = state.categoria_ids.filter(c => c !== id);
    }
    if (key.startsWith('marca_')) {
      const id = key.split('_')[1];
      const el = document.querySelector(`[name="marca"][value="${id}"]`);
      if (el) el.checked = false;
      const remaining = document.querySelectorAll('[name="marca"]:checked');
      state.marca_id = remaining.length > 0 ? remaining[0].value : null;
    }
    state.pagina = 1;
    loadProducts();
  };
  window.clearAllFilters = () => {
    state.categoria_ids = []; state.marca_id = null;
    state.busqueda = null; state.solo_stock = false;
    state.precio_min = 0; state.precio_max = 15000;
    state.pagina = 1;
    document.querySelectorAll('.filter-option input[type="checkbox"]').forEach(i => i.checked = false);
    const stockToggle = document.getElementById('toggle-stock');
    if (stockToggle) stockToggle.checked = false;
    const si = document.getElementById('search-input');
    if (si) si.value = '';
    loadProducts();
  };

  // ── Eventos del panel ─────────────────────────────────────
  document.getElementById('btn-apply-filters')?.addEventListener('click', applyFilters);
  document.getElementById('btn-clear-filters')?.addEventListener('click', window.clearAllFilters);
  document.getElementById('btn-mobile-filters')?.addEventListener('click', () => {
    document.getElementById('filters-panel')?.classList.add('open');
  });
  document.getElementById('btn-close-filters')?.addEventListener('click', () => {
    document.getElementById('filters-panel')?.classList.remove('open');
  });

  // ── Ordenar ────────────────────────────────────────────────
  sortSel?.addEventListener('change', () => {
    state.orden = sortSel.value;
    state.pagina = 1;
    loadProducts();
  });

  // ── Vista grid / list ──────────────────────────────────────
  document.querySelectorAll('.catalog-view-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      state.vista = btn.dataset.view;
      document.querySelectorAll('.catalog-view-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      grid.classList.toggle('list-view', state.vista === 'list');
    });
  });

  // ── Búsqueda inline ───────────────────────────────────────
  const searchInput = document.getElementById('search-input');
  searchInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      state.busqueda = searchInput.value.trim() || null;
      state.pagina = 1;
      loadProducts();
    }
  });

  // ── Init ───────────────────────────────────────────────────
  await loadFilters();
  await loadProducts();
});

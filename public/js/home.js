/* ================================================================
   MBS — Home Page JS
================================================================ */
document.addEventListener('DOMContentLoaded', async () => {

  // ── Cargar categorías ───────────────────────────────────────
  const loadCategories = async () => {
    const grid = document.getElementById('categories-grid');
    if (!grid) return;

    const icons = {
      'cables-de-fibra':   '🔌',
      'conectores':        '⊕',
      'patch-cords':       '↔',
      'equipos-activos':   '⊞',
      'herramientas':      '⚙',
      'accesorios':        '◈',
    };

    try {
      const data = await API.get('/productos/categorias');
      if (!data.ok || !data.categorias.length) return;

      grid.innerHTML = data.categorias.map(cat => `
        <a href="/pages/catalogo.html?categoria=${cat.id}" class="cat-card">
          <div class="cat-card__icon">${icons[cat.slug] || '📦'}</div>
          <div class="cat-card__name">${cat.nombre}</div>
          <div class="cat-card__sub">${cat.descripcion || ''}</div>
          <span class="cat-card__link">Ver productos →</span>
        </a>
      `).join('');
    } catch (err) {
      console.error('Error cargando categorías:', err);
    }
  };

  // ── Cargar productos más vendidos ───────────────────────────
  const loadTopProducts = async () => {
    const grid = document.getElementById('products-grid');
    if (!grid) return;

    // Mostrar skeletons mientras carga
    grid.innerHTML = Array(4).fill(skeletonCard()).join('');

    try {
      const data = await API.get('/productos?orden=relevancia&por_pagina=4&solo_stock=true');
      if (!data.ok || !data.productos.length) {
        grid.innerHTML = '<p class="text-muted">No hay productos disponibles.</p>';
        return;
      }

      grid.innerHTML = data.productos.map(p => buildProductCard(p)).join('');

      // Eventos de añadir al carrito
      grid.querySelectorAll('.btn-add-cart').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.preventDefault();
          const id = btn.dataset.id;
          btn.disabled = true;
          btn.textContent = 'Agregando...';
          await Cart.add(parseInt(id), null, 1);
          btn.disabled = false;
          btn.textContent = 'Añadir al carrito';
        });
      });

      // Eventos de favorito
      grid.querySelectorAll('.product-card__fav').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (!Session.isLoggedIn()) {
            Toast.show('Inicia sesión para guardar favoritos', 'info');
            return;
          }
          const id = btn.dataset.id;
          const data = await API.post(`/usuarios/favoritos/${id}`, {});
          if (data.ok) {
            btn.classList.toggle('active', data.accion === 'agregado');
            Toast.show(data.mensaje, 'success');
          }
        });
      });

    } catch (err) {
      console.error('Error cargando productos:', err);
      grid.innerHTML = '<p class="text-muted">Error al cargar productos.</p>';
    }
  };

  // ── Construir tarjeta de producto ───────────────────────────
  const buildProductCard = (p) => {
    const badgeMap = {
      nuevo: 'badge-orange', oferta: 'badge-amber',
      top_venta: 'badge-navy', liquidacion: 'badge-red'
    };
    const badgeLabel = { nuevo: 'NUEVO', oferta: 'OFERTA', top_venta: 'TOP VENTA', liquidacion: 'LIQUIDACIÓN' };
    const badgeHtml = p.badge
      ? `<span class="badge ${badgeMap[p.badge] || 'badge-navy'} product-card__badge">${badgeLabel[p.badge] || p.badge}</span>`
      : '';
    const imgHtml = p.imagen_principal
      ? `<img src="${p.imagen_principal}" alt="${p.r_nombre || p.nombre}" loading="lazy">`
      : `<div class="product-card__img-placeholder"><span style="font-size:2.5rem">📦</span><p>Imagen próximamente</p></div>`;
    const nombre = p.r_nombre || p.nombre;
    const sku    = p.r_sku    || p.sku;
    const precio = p.r_precio_venta || p.precio_venta;
    const antes  = p.r_precio_antes  || p.precio_antes;
    const cat    = p.r_categoria     || p.categoria;
    const slug   = p.r_slug          || p.slug;
    const id     = p.r_id            || p.id;

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
          <div class="product-card__price" data-mxn="${precio}">
            ${Currency.format(precio)}
          </div>
          <button class="btn btn-primary btn-full btn-add-cart" data-id="${id}">
            Añadir al carrito
          </button>
        </div>
      </div>`;
  };

  // ── Buscador del hero ───────────────────────────────────────
  const searchInput = document.getElementById('hero-search');
  if (searchInput) {
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const q = searchInput.value.trim();
        if (q) window.location.href = `/pages/catalogo.html?busqueda=${encodeURIComponent(q)}`;
      }
    });
  }

  // ── Init ────────────────────────────────────────────────────
  await Promise.all([loadCategories(), loadTopProducts()]);
});

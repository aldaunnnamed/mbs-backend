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
      'conectores':        '🔗',
      'patch-cords':       '↔️',
      'equipos-activos':   '📡',
      'herramientas':      '🛠️',
      'accesorios':        '📦',
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
    const badge = p.r_badge || p.badge;
    const imagenPrincipal = p.r_imagen_principal || p.imagen_principal;
    const badgeHtml = badge
      ? `<span class="badge ${badgeMap[badge] || 'badge-navy'} product-card__badge">${badgeLabel[badge] || badge}</span>`
      : '';
    const imgHtml = imagenPrincipal
      ? `<img src="${imagenPrincipal}" alt="${p.r_nombre || p.nombre}" loading="lazy">`
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
          <div class="product-card__price">
            <span data-mxn="${precio}">${Currency.format(precio)}</span>
            ${antes && antes > precio ? `<del data-mxn="${antes}">${Currency.format(antes)}</del>` : ''}
          </div>
          <button class="btn btn-primary btn-full btn-add-cart" data-id="${id}">
            Añadir al carrito
          </button>
        </div>
      </div>`;
  };

  // ── Carrusel del hero (imágenes de productos existentes) ────
  const loadHeroCarousel = async () => {
    const carousel = document.getElementById('hero-carousel');
    if (!carousel) return;

    try {
      const data = await API.get('/productos?orden=relevancia&por_pagina=8&solo_stock=true');
      if (!data.ok) return;

      const slides = (data.productos || [])
        .filter(p => p.r_imagen_principal || p.imagen_principal)
        .slice(0, 6);

      if (!slides.length) return; // deja el placeholder visible

      carousel.innerHTML = slides.map((p, i) => {
        const nombre = p.r_nombre  || p.nombre;
        const precio = p.r_precio_venta || p.precio_venta;
        const cat    = p.r_categoria    || p.categoria;
        const slug   = p.r_slug         || p.slug;
        const img    = p.r_imagen_principal || p.imagen_principal;
        return `
        <a href="/pages/producto.html?slug=${slug}" class="hero-carousel__slide ${i === 0 ? 'active' : ''}" data-i="${i}">
          <img src="${img}" alt="${nombre}" loading="${i === 0 ? 'eager' : 'lazy'}">
          <div class="hero-carousel__caption">
            ${cat ? `<span class="hero-carousel__caption-cat">${cat}</span>` : ''}
            <span class="hero-carousel__caption-name">${nombre}</span>
            <span class="hero-carousel__caption-price">${Currency.format(precio)}</span>
          </div>
        </a>`;
      }).join('') + (slides.length > 1 ? `
        <div class="hero-carousel__dots">
          ${slides.map((_, i) => `<button class="hero-carousel__dot ${i === 0 ? 'active' : ''}" data-i="${i}" aria-label="Ver producto ${i + 1}"></button>`).join('')}
        </div>` : '');

      if (slides.length <= 1) return; // sin controles ni auto-avance si solo hay una imagen

      let current = 0;
      const slideEls = carousel.querySelectorAll('.hero-carousel__slide');
      const dotEls   = carousel.querySelectorAll('.hero-carousel__dot');

      const goTo = (i) => {
        slideEls[current]?.classList.remove('active');
        dotEls[current]?.classList.remove('active');
        current = i;
        slideEls[current]?.classList.add('active');
        dotEls[current]?.classList.add('active');
      };

      let timer = setInterval(() => goTo((current + 1) % slides.length), 4500);

      dotEls.forEach(dot => {
        dot.addEventListener('click', (e) => {
          e.preventDefault();
          clearInterval(timer);
          goTo(parseInt(dot.dataset.i));
          timer = setInterval(() => goTo((current + 1) % slides.length), 4500);
        });
      });

      carousel.addEventListener('mouseenter', () => clearInterval(timer));
      carousel.addEventListener('mouseleave', () => {
        timer = setInterval(() => goTo((current + 1) % slides.length), 4500);
      });
    } catch (err) {
      console.error('Error cargando carrusel del hero:', err);
    }
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
  await Promise.all([loadCategories(), loadTopProducts(), loadHeroCarousel()]);
});

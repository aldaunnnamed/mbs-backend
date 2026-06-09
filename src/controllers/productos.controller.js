const { query } = require('../config/db');

// GET /api/productos
const listar = async (req, res) => {
  try {
    const {
      categoria_id = null, marca_id     = null,
      precio_min   = null, precio_max   = null,
      solo_stock   = 'false', busqueda  = null,
      orden        = 'relevancia',
      pagina       = 1,    por_pagina   = 9
    } = req.query;

    const result = await query(
      'SELECT * FROM fn_listar_productos(' +
      'CAST($1 AS INTEGER), CAST($2 AS INTEGER),' +
      'CAST($3 AS NUMERIC),  CAST($4 AS NUMERIC),' +
      'CAST($5 AS BOOLEAN),' +
      'CAST($6 AS CHARACTER VARYING), CAST($7 AS CHARACTER VARYING),' +
      'CAST($8 AS INTEGER),  CAST($9 AS INTEGER))',
      [
        categoria_id ? parseInt(categoria_id) : null,
        marca_id     ? parseInt(marca_id)     : null,
        precio_min   ? parseFloat(precio_min) : null,
        precio_max   ? parseFloat(precio_max) : null,
        solo_stock === 'true',
        busqueda || null,
        orden,
        parseInt(pagina),
        parseInt(por_pagina)
      ]
    );

    const total = result.rows[0]?.r_total_registros || 0;
    res.json({
      ok: true, total: parseInt(total),
      pagina: parseInt(pagina), por_pagina: parseInt(por_pagina),
      productos: result.rows
    });
  } catch (err) {
    console.error('listar productos:', err.message);
    res.status(500).json({ ok: false, mensaje: 'Error al obtener productos' });
  }
};

// GET /api/productos/:slug
const detalle = async (req, res) => {
  try {
    const result = await query(
      'SELECT * FROM fn_producto_detalle(CAST($1 AS CHARACTER VARYING))',
      [req.params.slug]
    );
    if (!result.rows.length) {
      return res.status(404).json({ ok: false, mensaje: 'Producto no encontrado' });
    }
    const prod_id = result.rows[0].r_id;
    const [imgs, specs, variantes] = await Promise.all([
      query('SELECT * FROM producto_imagenes WHERE producto_id = $1 ORDER BY orden', [prod_id]),
      query('SELECT * FROM producto_especificaciones WHERE producto_id = $1 ORDER BY orden', [prod_id]),
      query('SELECT * FROM variantes_longitud WHERE producto_id = $1 AND activa = TRUE', [prod_id])
    ]);
    res.json({ ok: true, producto: result.rows[0], imagenes: imgs.rows, specs: specs.rows, variantes: variantes.rows });
  } catch (err) {
    console.error('detalle producto:', err.message);
    res.status(500).json({ ok: false, mensaje: 'Error al obtener producto' });
  }
};

// GET /api/productos/categorias
const categorias = async (req, res) => {
  try {
    const result = await query(
      `SELECT c.*
       FROM categorias c
       WHERE c.activa = TRUE
         AND EXISTS (SELECT 1 FROM productos p WHERE p.categoria_id = c.id AND p.estado = 'activo')
       ORDER BY c.orden`
    );
    res.json({ ok: true, categorias: result.rows });
  } catch (err) {
    res.status(500).json({ ok: false, mensaje: 'Error al obtener categorias' });
  }
};

// GET /api/productos/marcas
const marcas = async (req, res) => {
  try {
    const result = await query(
      `SELECT DISTINCT ON (m.nombre) m.id, m.nombre, m.logo_url, m.activa
       FROM marcas m
       INNER JOIN productos p ON p.marca_id = m.id AND p.estado = 'activo'
       WHERE m.activa = TRUE
       ORDER BY m.nombre, m.id`
    );
    res.json({ ok: true, marcas: result.rows });
  } catch (err) {
    res.status(500).json({ ok: false, mensaje: 'Error al obtener marcas' });
  }
};

module.exports = { listar, detalle, categorias, marcas };

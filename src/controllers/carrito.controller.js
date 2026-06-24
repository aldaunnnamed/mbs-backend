const { query } = require('../config/db');

// Helper: convierte null a literal NULL tipado para evitar ambigüedad
const toInt  = v => v  ? parseInt(v)  : null;
const toStr  = v => v  || null;

// GET /api/carrito
const obtener = async (req, res) => {
  try {
    const uid = toInt(req.usuario?.id);
    const sk  = toStr(req.headers['x-session-key']);

    const result = await query(
      'SELECT * FROM fn_carrito_obtener(' +
      'CAST($1 AS INTEGER), CAST($2 AS CHARACTER VARYING))',
      [uid, sk]
    );
    res.json({ ok: true, items: result.rows });
  } catch (err) {
    console.error('obtener carrito:', err.message);
    res.status(500).json({ ok: false, mensaje: 'Error al obtener carrito' });
  }
};

// POST /api/carrito/agregar
const agregar = async (req, res) => {
  try {
    const { producto_id, variante_id, cantidad } = req.body;
    const uid = toInt(req.usuario?.id);
    const sk  = toStr(req.headers['x-session-key']);

    if (!producto_id || !cantidad) {
      return res.status(400).json({ ok: false, mensaje: 'producto_id y cantidad son requeridos' });
    }

    const result = await query(
      'SELECT * FROM fn_carrito_agregar_item(' +
      'CAST($1 AS INTEGER), CAST($2 AS CHARACTER VARYING),' +
      'CAST($3 AS INTEGER), CAST($4 AS INTEGER), CAST($5 AS INTEGER))',
      [uid, sk, parseInt(producto_id),
       variante_id ? parseInt(variante_id) : null,
       parseInt(cantidad)]
    );

    const fila = result.rows[0];
    if (!fila || fila.resultado_carrito_id === 0) {
      return res.status(400).json({ ok: false, mensaje: fila?.resultado_mensaje || 'Error' });
    }

    res.json({
      ok: true,
      mensaje: 'Producto agregado al carrito',
      carrito_id: fila.resultado_carrito_id
    });
  } catch (err) {
    console.error('agregar carrito:', err.message);
    res.status(500).json({ ok: false, mensaje: 'Error al agregar al carrito' });
  }
};

// DELETE /api/carrito/:item_id
const eliminarItem = async (req, res) => {
  try {
    const uid = toInt(req.usuario?.id);
    const sk  = toStr(req.headers['x-session-key']);

    const result = await query(
      'DELETE FROM carrito_items ci USING carritos c' +
      ' WHERE ci.id = CAST($1 AS INTEGER) AND ci.carrito_id = c.id' +
      ' AND (c.usuario_id = CAST($2 AS INTEGER) OR c.session_key = CAST($3 AS CHARACTER VARYING))',
      [parseInt(req.params.item_id), uid, sk]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ ok: false, mensaje: 'Item no encontrado en tu carrito' });
    }
    res.json({ ok: true, mensaje: 'Producto eliminado del carrito' });
  } catch (err) {
    console.error('eliminar item:', err.message);
    res.status(500).json({ ok: false, mensaje: 'Error al eliminar del carrito' });
  }
};

// PUT /api/carrito/:item_id
const actualizarCantidad = async (req, res) => {
  try {
    const { cantidad } = req.body;
    if (!cantidad || cantidad < 1) {
      return res.status(400).json({ ok: false, mensaje: 'Cantidad invalida' });
    }
    const uid = toInt(req.usuario?.id);
    const sk  = toStr(req.headers['x-session-key']);

    const result = await query(
      'UPDATE carrito_items ci SET cantidad = CAST($1 AS INTEGER)' +
      ' FROM carritos c' +
      ' WHERE ci.id = CAST($2 AS INTEGER) AND ci.carrito_id = c.id' +
      ' AND (c.usuario_id = CAST($3 AS INTEGER) OR c.session_key = CAST($4 AS CHARACTER VARYING))',
      [parseInt(cantidad), parseInt(req.params.item_id), uid, sk]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ ok: false, mensaje: 'Item no encontrado en tu carrito' });
    }
    res.json({ ok: true, mensaje: 'Cantidad actualizada' });
  } catch (err) {
    console.error('actualizar cantidad:', err.message);
    res.status(500).json({ ok: false, mensaje: 'Error al actualizar cantidad' });
  }
};


// POST /api/carrito/fusionar — fusiona carrito anónimo al usuario al hacer login
const fusionar = async (req, res) => {
  try {
    const uid = parseInt(req.usuario?.id);
    const sk  = req.headers['x-session-key'] || req.body.session_key;
    if (!uid || !sk) return res.json({ ok: true, mensaje: 'Nada que fusionar' });
    await query(
      'SELECT fn_carrito_fusionar(CAST($1 AS INTEGER), CAST($2 AS CHARACTER VARYING))',
      [uid, sk]
    );
    res.json({ ok: true, mensaje: 'Carrito fusionado' });
  } catch (err) {
    console.error('fusionar carrito:', err.message);
    res.status(500).json({ ok: false, mensaje: 'Error al fusionar carrito' });
  }
};

module.exports = { obtener, agregar, eliminarItem, actualizarCantidad, fusionar };

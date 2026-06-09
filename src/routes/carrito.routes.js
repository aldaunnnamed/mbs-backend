const router = require('express').Router();
const ctrl   = require('../controllers/carrito.controller');
const { tokenOpcional, verificarToken } = require('../middlewares/auth');

router.get ('/',              tokenOpcional, ctrl.obtener);
router.post('/agregar',       tokenOpcional, ctrl.agregar);
router.put ('/:item_id',      verificarToken, ctrl.actualizarCantidad);
router.delete('/:item_id',    tokenOpcional, ctrl.eliminarItem);

// GET /api/carrito/id — devuelve el carrito_id activo
router.get('/id', tokenOpcional, async (req, res) => {
  try {
    const { query } = require('../config/db');
    const usuario_id  = req.usuario?.id || null;
    const session_key = req.headers['x-session-key'] || null;

    const result = await query(
      'SELECT id FROM carritos WHERE ' +
      '(CAST($1 AS INTEGER) IS NOT NULL AND usuario_id = CAST($1 AS INTEGER)) OR ' +
      '(CAST($1 AS INTEGER) IS NULL AND session_key = CAST($2 AS CHARACTER VARYING)) ' +
      'ORDER BY updated_at DESC LIMIT 1',
      [usuario_id, session_key]
    );

    if (!result.rows.length) {
      return res.json({ ok: false, carrito_id: null });
    }
    res.json({ ok: true, carrito_id: result.rows[0].id });
  } catch (err) {
    console.error('carrito id:', err.message);
    res.status(500).json({ ok: false, carrito_id: null });
  }
});

module.exports = router;

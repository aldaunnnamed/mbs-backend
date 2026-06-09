const router = require('express').Router();
const ctrl   = require('../controllers/pedidos.controller');
const { verificarToken } = require('../middlewares/auth');
const { generarFacturaHTML } = require('../services/factura.service');
const { query } = require('../config/db');

router.get ('/',                verificarToken, ctrl.listar);
router.post('/',                verificarToken, ctrl.crear);
router.get ('/envios',                          ctrl.metodos_envio);
router.get ('/pagos-metodos',                   ctrl.metodos_pago);
router.get ('/:id',             verificarToken, ctrl.detalle);

// ── Descargar factura como HTML (imprimible como PDF desde el navegador)
router.get('/:id/factura', verificarToken, async (req, res) => {
  try {
    const pedidoRes = await query(
      'SELECT p.*, me.nombre AS metodo_envio_nombre, mp.nombre AS metodo_pago_nombre' +
      ' FROM pedidos p' +
      ' JOIN metodos_envio me ON me.id = p.metodo_envio_id' +
      ' JOIN metodos_pago  mp ON mp.id = p.metodo_pago_id' +
      ' WHERE p.id = CAST($1 AS INTEGER) AND p.usuario_id = CAST($2 AS INTEGER)',
      [parseInt(req.params.id), parseInt(req.usuario.id)]
    );

    if (!pedidoRes.rows.length) {
      return res.status(404).json({ ok: false, mensaje: 'Pedido no encontrado' });
    }

    const itemsRes = await query(
      'SELECT * FROM pedido_items WHERE pedido_id = CAST($1 AS INTEGER)',
      [parseInt(req.params.id)]
    );

    const html = generarFacturaHTML(pedidoRes.rows[0], itemsRes.rows);

    // Devolver HTML con cabecera para imprimir como PDF
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Disposition',
      'inline; filename="factura-' + pedidoRes.rows[0].numero + '.html"');
    res.send(html);
  } catch (err) {
    console.error('factura:', err.message);
    res.status(500).json({ ok: false, mensaje: 'Error al generar factura' });
  }
});

// ── Solicitar cancelación
router.post('/:id/cancelar', verificarToken, async (req, res) => {
  try {
    const { motivo } = req.body;

    // Verificar que el pedido pertenece al usuario y está en estado cancelable
    const pedidoRes = await query(
      'SELECT id, estado, numero FROM pedidos' +
      ' WHERE id = CAST($1 AS INTEGER) AND usuario_id = CAST($2 AS INTEGER)',
      [parseInt(req.params.id), parseInt(req.usuario.id)]
    );

    if (!pedidoRes.rows.length) {
      return res.status(404).json({ ok: false, mensaje: 'Pedido no encontrado' });
    }

    const pedido = pedidoRes.rows[0];
    const estadosCancelables = ['nuevo', 'en_preparacion'];

    if (!estadosCancelables.includes(pedido.estado)) {
      return res.status(400).json({
        ok: false,
        mensaje: 'Este pedido no puede cancelarse. Estado actual: ' + pedido.estado
      });
    }

    // Actualizar estado a cancelado
    await query(
      'SELECT fn_actualizar_estado_pedido(' +
      'CAST($1 AS INTEGER), CAST($2 AS CHARACTER VARYING),' +
      'NULL::CHARACTER VARYING, NULL::CHARACTER VARYING,' +
      'CAST($3 AS TEXT), CAST($4 AS INTEGER))',
      [
        parseInt(req.params.id),
        'cancelado',
        'Cancelado por el cliente. Motivo: ' + (motivo || 'Sin especificar'),
        parseInt(req.usuario.id)
      ]
    );

    // Devolver stock (revertir la salida de inventario)
    const itemsRes = await query(
      'SELECT producto_id, cantidad FROM pedido_items WHERE pedido_id = CAST($1 AS INTEGER)',
      [parseInt(req.params.id)]
    );

    for (const item of itemsRes.rows) {
      await query(
        'UPDATE productos SET stock_actual = stock_actual + $1 WHERE id = $2',
        [item.cantidad, item.producto_id]
      );
      await query(
        'INSERT INTO inventario_movimientos' +
        ' (producto_id, tipo, cantidad, stock_antes, stock_despues, motivo, referencia, usuario_id)' +
        ' SELECT $1, $2, $3, stock_actual - $3, stock_actual, $4, $5, $6 FROM productos WHERE id = $1',
        [item.producto_id, 'devolucion', item.cantidad,
         'Cancelacion pedido ' + pedido.numero, pedido.numero,
         parseInt(req.usuario.id)]
      );
    }

    res.json({
      ok: true,
      mensaje: 'Pedido ' + pedido.numero + ' cancelado correctamente'
    });
  } catch (err) {
    console.error('cancelar pedido:', err.message);
    res.status(500).json({ ok: false, mensaje: 'Error al cancelar el pedido' });
  }
});

// ── Contactar soporte (crea notificación para admin)
router.post('/:id/soporte', verificarToken, async (req, res) => {
  try {
    const { asunto, mensaje } = req.body;
    if (!asunto || !mensaje) {
      return res.status(400).json({ ok: false, mensaje: 'Asunto y mensaje requeridos' });
    }

    const pedidoRes = await query(
      'SELECT numero FROM pedidos WHERE id = CAST($1 AS INTEGER) AND usuario_id = CAST($2 AS INTEGER)',
      [parseInt(req.params.id), parseInt(req.usuario.id)]
    );

    if (!pedidoRes.rows.length) {
      return res.status(404).json({ ok: false, mensaje: 'Pedido no encontrado' });
    }

    const numero = pedidoRes.rows[0].numero;

    // Notificar a todos los admins
    await query(
      'INSERT INTO notificaciones (usuario_id, tipo, titulo, mensaje, url)' +
      ' SELECT id, $1, $2, $3, $4 FROM usuarios WHERE rol IN ($5, $6)',
      [
        'soporte_pedido',
        'Soporte: ' + asunto + ' — ' + numero,
        mensaje,
        '/admin/pedidos/' + req.params.id,
        'admin', 'superadmin'
      ]
    );

    // Confirmar al cliente
    await query(
      'INSERT INTO notificaciones (usuario_id, tipo, titulo, mensaje, url) VALUES ($1,$2,$3,$4,$5)',
      [
        parseInt(req.usuario.id),
        'soporte_enviado',
        'Solicitud de soporte enviada — ' + numero,
        'Tu mensaje fue recibido. Te responderemos pronto.',
        '/pages/mi-cuenta.html#pedidos'
      ]
    );

    res.json({ ok: true, mensaje: 'Solicitud de soporte enviada correctamente' });
  } catch (err) {
    console.error('soporte pedido:', err.message);
    res.status(500).json({ ok: false, mensaje: 'Error al enviar solicitud de soporte' });
  }
});

module.exports = router;

const { query } = require('../config/db');

// POST /api/pedidos
const crear = async (req, res) => {
  try {
    const { carrito_id, direccion_id, metodo_envio_id, metodo_pago_id, notas_cliente, requiere_factura } = req.body;
    if (!carrito_id || !direccion_id || !metodo_envio_id || !metodo_pago_id) {
      return res.status(400).json({ ok: false, mensaje: 'Faltan datos del pedido' });
    }
    const result = await query(
      'SELECT * FROM fn_crear_pedido(' +
      'CAST($1 AS INTEGER), CAST($2 AS INTEGER), CAST($3 AS INTEGER),' +
      'CAST($4 AS INTEGER), CAST($5 AS INTEGER),' +
      'CAST($6 AS TEXT), CAST($7 AS BOOLEAN))',
      [
        parseInt(req.usuario.id), parseInt(carrito_id),
        parseInt(direccion_id),   parseInt(metodo_envio_id),
        parseInt(metodo_pago_id),
        notas_cliente || null,
        requiere_factura ? true : false
      ]
    );
    const fila = result.rows[0];
    if (!fila || fila.r_pedido_id === 0) {
      return res.status(400).json({ ok: false, mensaje: fila?.r_mensaje || 'Error al crear pedido' });
    }
    res.status(201).json({ ok: true, mensaje: 'Pedido creado', pedido_id: fila.r_pedido_id, numero_pedido: fila.r_numero_pedido });
  } catch (err) {
    console.error('crear pedido:', err.message);
    res.status(500).json({ ok: false, mensaje: 'Error al crear pedido' });
  }
};

// GET /api/pedidos
const listar = async (req, res) => {
  try {
    const { estado = null, pagina = 1 } = req.query;
    const result = await query(
      'SELECT * FROM fn_listar_pedidos_cliente(' +
      'CAST($1 AS INTEGER), CAST($2 AS CHARACTER VARYING), CAST($3 AS INTEGER))',
      [parseInt(req.usuario.id), estado || null, parseInt(pagina)]
    );
    const total = result.rows[0]?.r_total_registros || 0;
    res.json({ ok: true, total: parseInt(total), pedidos: result.rows });
  } catch (err) {
    console.error('listar pedidos:', err.message);
    res.status(500).json({ ok: false, mensaje: 'Error al obtener pedidos' });
  }
};

// GET /api/pedidos/:id
const detalle = async (req, res) => {
  try {
    const result = await query(
      'SELECT * FROM fn_detalle_pedido(CAST($1 AS INTEGER), CAST($2 AS INTEGER))',
      [parseInt(req.params.id), parseInt(req.usuario.id)]
    );
    if (!result.rows.length) {
      return res.status(404).json({ ok: false, mensaje: 'Pedido no encontrado' });
    }
    res.json({ ok: true, pedido: result.rows });
  } catch (err) {
    console.error('detalle pedido:', err.message);
    res.status(500).json({ ok: false, mensaje: 'Error al obtener pedido' });
  }
};

// GET /api/pedidos/envios
const metodos_envio = async (req, res) => {
  try {
    const result = await query('SELECT * FROM metodos_envio WHERE activo = TRUE ORDER BY orden');
    res.json({ ok: true, metodos: result.rows });
  } catch (err) {
    res.status(500).json({ ok: false, mensaje: 'Error al obtener metodos de envio' });
  }
};

// GET /api/pedidos/pagos-metodos
const metodos_pago = async (req, res) => {
  try {
    const result = await query('SELECT id, clave, nombre, descripcion, activo FROM metodos_pago WHERE activo = TRUE');
    res.json({ ok: true, metodos: result.rows });
  } catch (err) {
    res.status(500).json({ ok: false, mensaje: 'Error al obtener metodos de pago' });
  }
};

module.exports = { crear, listar, detalle, metodos_envio, metodos_pago };

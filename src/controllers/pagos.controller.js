const { query } = require('../config/db');

// GET /api/pagos/estado/:pedido_id
const estadoPago = async (req, res) => {
  try {
    const result = await query(
      'SELECT * FROM fn_estado_pago_pedido($1)',
      [req.params.pedido_id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ ok: false, mensaje: 'Pedido no encontrado' });
    }
    res.json({ ok: true, pago: result.rows[0] });
  } catch (err) {
    res.status(500).json({ ok: false, mensaje: 'Error al consultar estado de pago' });
  }
};

// POST /api/pagos/spei/referencia
const crearReferenciaSpei = async (req, res) => {
  try {
    const { pedido_id, horas_vence = 48 } = req.body;

    // Leer configuracion SPEI de la BD
    const cfg = await query(
      "SELECT clave, valor FROM configuracion WHERE clave IN ('spei_clabe','spei_banco','spei_beneficiario')"
    );
    const config = {};
    cfg.rows.forEach(r => { config[r.clave] = r.valor; });

    if (!config.spei_clabe) {
      return res.status(503).json({ ok: false, mensaje: 'CLABE SPEI no configurada' });
    }

    const result = await query(
      'SELECT * FROM fn_crear_referencia_spei($1,$2,$3,$4,$5)',
      [pedido_id, config.spei_clabe, config.spei_banco, config.spei_beneficiario, horas_vence]
    );

    res.json({ ok: true, spei: result.rows[0] });
  } catch (err) {
    console.error('crearReferenciaSpei:', err.message);
    res.status(500).json({ ok: false, mensaje: 'Error al generar referencia SPEI' });
  }
};

// POST /api/pagos/spei/webhook  ← el banco llama a esta ruta
const webhookSpei = async (req, res) => {
  try {
    const { referencia, monto, clave_rastreo, banco_emisor } = req.body;

    const result = await query(
      'SELECT fn_confirmar_pago_spei($1,$2,$3,$4,$5)',
      [referencia, monto, clave_rastreo, banco_emisor, req.body]
    );

    res.json({ ok: true, resultado: result.rows[0] });
  } catch (err) {
    console.error('webhookSpei:', err.message);
    res.status(500).json({ ok: false, mensaje: 'Error procesando webhook SPEI' });
  }
};

// POST /api/pagos/paypal/orden
const crearOrdenPaypal = async (req, res) => {
  try {
    const { pedido_id } = req.body;
    // Aquí irá la integración real con el SDK de PayPal
    // Por ahora devuelve instrucciones
    res.json({
      ok: true,
      mensaje: 'Integración PayPal pendiente de configurar con credenciales reales',
      instrucciones: 'Configura PAYPAL_CLIENT_ID y PAYPAL_SECRET en el archivo .env'
    });
  } catch (err) {
    res.status(500).json({ ok: false, mensaje: 'Error al crear orden PayPal' });
  }
};

// POST /api/pagos/paypal/webhook  ← PayPal llama a esta ruta
const webhookPaypal = async (req, res) => {
  try {
    const { id: order_id, resource } = req.body;
    if (!order_id) {
      return res.status(400).json({ ok: false });
    }
    const result = await query(
      'SELECT fn_confirmar_pago_paypal($1,$2,$3,$4,$5,$6,$7)',
      [
        order_id,
        resource?.id,
        resource?.status,
        resource?.amount?.value,
        null,
        resource?.payer?.email_address,
        req.body
      ]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('webhookPaypal:', err.message);
    res.status(500).json({ ok: false });
  }
};

module.exports = {
  estadoPago, crearReferenciaSpei, webhookSpei,
  crearOrdenPaypal, webhookPaypal
};

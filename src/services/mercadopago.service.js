/* ================================================================
   MBS COMUNICACIONES — Mercado Pago Service
   Usa la API REST de MP (no el SDK) para mayor flexibilidad.
   Las claves se leen de la tabla `configuracion`.
================================================================ */
const { query } = require('../config/db');

const getCfg = async () => {
  const res = await query(
    `SELECT clave, valor FROM configuracion WHERE clave IN
     ('mp_mode','mp_access_token_test','mp_access_token_live',
      'mp_public_key_test','mp_public_key_live')`,
    []
  );
  const cfg = {};
  res.rows.forEach(r => { cfg[r.clave] = r.valor; });
  const mode = cfg.mp_mode || 'sandbox';
  return {
    mode,
    access_token: mode === 'live' ? cfg.mp_access_token_live : cfg.mp_access_token_test,
    public_key:   mode === 'live' ? cfg.mp_public_key_live   : cfg.mp_public_key_test,
  };
};

// Crea una Preference de Mercado Pago y devuelve la init_point (URL de pago)
const crearPreferencia = async ({ pedido_id, items, payer, back_urls, notification_url }) => {
  const { access_token, mode } = await getCfg();
  if (!access_token) throw new Error('Mercado Pago no configurado: falta el Access Token en Configuración > Pagos');

  const base = mode === 'sandbox'
    ? 'https://api.mercadopago.com'
    : 'https://api.mercadopago.com';

  const body = {
    external_reference: String(pedido_id),
    items: items.map(i => ({
      id:          String(i.producto_id || i.id),
      title:       i.nombre,
      quantity:    Number(i.cantidad) || 1,
      unit_price:  Number(i.precio_unitario || i.precio),
      currency_id: 'MXN',
    })),
    payer: payer || {},
    back_urls: back_urls || {
      success: `${process.env.APP_URL || 'http://localhost:3000'}/pages/checkout-ok.html`,
      failure: `${process.env.APP_URL || 'http://localhost:3000'}/pages/checkout-error.html`,
      pending: `${process.env.APP_URL || 'http://localhost:3000'}/pages/checkout-pendiente.html`,
    },
    auto_return: 'approved',
    notification_url,
    statement_descriptor: 'MBS COMUNICACIONES',
  };

  const resp = await fetch(`${base}/checkout/preferences`, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${access_token}`,
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Mercado Pago error ${resp.status}: ${err}`);
  }

  const data = await resp.json();
  return {
    preference_id: data.id,
    init_point:    mode === 'sandbox' ? data.sandbox_init_point : data.init_point,
    public_key:    (await getCfg()).public_key,
  };
};

// Consulta el estado de un pago por ID
const consultarPago = async (payment_id) => {
  const { access_token } = await getCfg();
  const resp = await fetch(`https://api.mercadopago.com/v1/payments/${payment_id}`, {
    headers: { 'Authorization': `Bearer ${access_token}` },
  });
  return resp.json();
};

module.exports = { crearPreferencia, consultarPago, getCfg };

/* ================================================================
   MBS COMUNICACIONES — Mercado Pago Service
   Usa la API REST de MP (no el SDK) para mayor flexibilidad.
   Las claves se leen de la tabla `configuracion`.
================================================================ */
const { query } = require('../config/db');

const getCfg = async () => {
  const res = await query(
    `SELECT clave, valor FROM configuracion WHERE clave IN
     ('mp_mode','mp_at_test','mp_at_live','mp_pk_test','mp_pk_live')`,
    []
  );
  const cfg = {};
  res.rows.forEach(r => { cfg[r.clave] = r.valor; });
  const mode = cfg.mp_mode || 'sandbox';
  return {
    mode,
    access_token: mode === 'live' ? cfg.mp_at_live  : cfg.mp_at_test,
    public_key:   mode === 'live' ? cfg.mp_pk_live  : cfg.mp_pk_test,
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
    // auto_return solo funciona con back_urls HTTPS (MP lo rechaza en localhost/HTTP)
    ...(back_urls?.success?.startsWith('https://') ? { auto_return: 'approved' } : {}),
    ...(notification_url ? { notification_url } : {}),
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

// Devuelve la public key según el modo configurado
const getPublicKey = async () => {
  const cfg = await getCfg();
  return cfg.public_key || '';
};

// Crea un pago directo con token de tarjeta (Checkout Bricks — sin redirect)
const crearPago = async ({ token, installments, payment_method_id, issuer_id, payer, amount, pedido_id }) => {
  const { access_token } = await getCfg();
  if (!access_token) throw new Error('Mercado Pago no configurado: falta el Access Token');

  const body = {
    token,
    installments:       Number(installments) || 1,
    payment_method_id,
    transaction_amount: Number(amount),
    description:        `Pedido MBS #${pedido_id}`,
    external_reference: String(pedido_id),
    payer,
  };
  if (issuer_id) body.issuer_id = issuer_id;

  console.log('[MP] POST /v1/payments body:', JSON.stringify({
    ...body, token: body.token ? '***' : undefined
  }));

  const resp = await fetch('https://api.mercadopago.com/v1/payments', {
    method:  'POST',
    headers: {
      'Content-Type':      'application/json',
      'Authorization':     `Bearer ${access_token}`,
      'X-Idempotency-Key': `mbs-${pedido_id}-${Date.now()}`,
    },
    body: JSON.stringify(body),
  });

  const respData = await resp.json().catch(() => ({}));
  console.log('[MP] response status:', resp.status, 'body:', JSON.stringify(respData));

  if (!resp.ok) {
    const mpMsg = respData.message || respData.cause?.[0]?.description || JSON.stringify(respData);
    const err   = new Error(`MP error ${resp.status}: ${mpMsg}`);
    err.mpStatus = resp.status;
    err.mpBody   = respData;
    throw err;
  }
  return respData;
};

module.exports = { crearPreferencia, consultarPago, getCfg, getPublicKey, crearPago };

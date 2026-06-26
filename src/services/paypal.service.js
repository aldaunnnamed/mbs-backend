/* ================================================================
   MBS COMUNICACIONES — PayPal Service (Orders v2)
   Las claves se leen de la tabla `configuracion` (igual que Stripe/MP).
   Fallback a .env para compatibilidad con instalaciones anteriores.
================================================================ */
const { query } = require('../config/db');

let cachedToken = null;
let cachedTokenExp = 0;

const getCfg = async () => {
  try {
    const res = await query(
      `SELECT clave, valor FROM configuracion WHERE clave IN
       ('paypal_mode','paypal_client_id_test','paypal_secret_test','paypal_webhook_id_test',
        'paypal_client_id_live','paypal_secret_live','paypal_webhook_id_live')`,
      []
    );
    const cfg = {};
    res.rows.forEach(r => { cfg[r.clave] = r.valor; });

    const mode = cfg.paypal_mode || process.env.PAYPAL_MODE || 'sandbox';
    const isLive = mode === 'live';

    return {
      mode,
      base_url: isLive ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com',
      client_id: isLive
        ? (cfg.paypal_client_id_live  || process.env.PAYPAL_CLIENT_ID || '')
        : (cfg.paypal_client_id_test  || process.env.PAYPAL_CLIENT_ID || ''),
      secret: isLive
        ? (cfg.paypal_secret_live     || process.env.PAYPAL_SECRET || '')
        : (cfg.paypal_secret_test     || process.env.PAYPAL_SECRET || ''),
      webhook_id: isLive
        ? (cfg.paypal_webhook_id_live || process.env.PAYPAL_WEBHOOK_ID || '')
        : (cfg.paypal_webhook_id_test || process.env.PAYPAL_WEBHOOK_ID || ''),
    };
  } catch (_) {
    // Si la tabla no tiene las claves aún, usar .env
    const mode = process.env.PAYPAL_MODE || 'sandbox';
    return {
      mode,
      base_url: mode === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com',
      client_id:  process.env.PAYPAL_CLIENT_ID  || '',
      secret:     process.env.PAYPAL_SECRET      || '',
      webhook_id: process.env.PAYPAL_WEBHOOK_ID  || '',
    };
  }
};

const credencialesConfiguradas = async () => {
  if (process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_SECRET) return true;
  try {
    const cfg = await getCfg();
    return !!(cfg.client_id && cfg.secret);
  } catch (_) { return false; }
};

const obtenerAccessToken = async () => {
  if (cachedToken && Date.now() < cachedTokenExp) return cachedToken;

  const { base_url, client_id, secret } = await getCfg();
  if (!client_id || !secret) throw new Error('Credenciales de PayPal no configuradas');

  const auth = Buffer.from(client_id + ':' + secret).toString('base64');
  const resp = await fetch(base_url + '/v1/oauth2/token', {
    method: 'POST',
    headers: { 'Authorization': 'Basic ' + auth, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error('PayPal OAuth error (' + resp.status + '): ' + JSON.stringify(data));
  cachedToken = data.access_token;
  cachedTokenExp = Date.now() + (data.expires_in - 60) * 1000;
  return cachedToken;
};

const crearOrden = async ({ pedidoId, numeroPedido, total, moneda, returnUrl, cancelUrl }) => {
  const { base_url } = await getCfg();
  const token = await obtenerAccessToken();
  const resp = await fetch(base_url + '/v2/checkout/orders', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      intent: 'CAPTURE',
      purchase_units: [{
        reference_id: String(pedidoId),
        invoice_id: numeroPedido,
        description: 'Pedido ' + numeroPedido + ' — MBS Comunicaciones',
        amount: { currency_code: moneda || 'MXN', value: Number(total).toFixed(2) },
      }],
      application_context: {
        brand_name: 'MBS Comunicaciones',
        landing_page: 'NO_PREFERENCE',
        user_action: 'PAY_NOW',
        return_url: returnUrl,
        cancel_url: cancelUrl,
      },
    }),
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error('PayPal crear orden error (' + resp.status + '): ' + JSON.stringify(data));
  const approvalUrl = (data.links || []).find(l => l.rel === 'approve')?.href || null;
  return { orderId: data.id, status: data.status, approvalUrl };
};

const capturarOrden = async (orderId) => {
  const { base_url } = await getCfg();
  const token = await obtenerAccessToken();
  const resp = await fetch(base_url + '/v2/checkout/orders/' + orderId + '/capture', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error('PayPal capturar orden error (' + resp.status + '): ' + JSON.stringify(data));
  return data;
};

const verificarWebhook = async (headers, body) => {
  const { base_url, webhook_id } = await getCfg();
  if (!webhook_id) return false;
  const token = await obtenerAccessToken();
  const resp = await fetch(base_url + '/v1/notifications/verify-webhook-signature', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      auth_algo:         headers['paypal-auth-algo'],
      cert_url:          headers['paypal-cert-url'],
      transmission_id:   headers['paypal-transmission-id'],
      transmission_sig:  headers['paypal-transmission-sig'],
      transmission_time: headers['paypal-transmission-time'],
      webhook_id,
      webhook_event: body,
    }),
  });
  const data = await resp.json();
  return resp.ok && data.verification_status === 'SUCCESS';
};

module.exports = { credencialesConfiguradas, obtenerAccessToken, crearOrden, capturarOrden, verificarWebhook, getCfg };

// Cliente de la API REST de PayPal (Orders v2 + verificación de webhooks)
// Credenciales y modo (sandbox/live) vienen de variables de entorno.

const BASE_URL = process.env.PAYPAL_MODE === 'live'
  ? 'https://api-m.paypal.com'
  : 'https://api-m.sandbox.paypal.com';

let cachedToken = null;
let cachedTokenExp = 0;

const credencialesConfiguradas = () =>
  !!(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_SECRET);

// OAuth2 client_credentials — el token se reutiliza hasta 60s antes de expirar
const obtenerAccessToken = async () => {
  if (cachedToken && Date.now() < cachedTokenExp) return cachedToken;

  if (!credencialesConfiguradas()) {
    throw new Error('PAYPAL_CLIENT_ID / PAYPAL_SECRET no configurados en .env');
  }

  const auth = Buffer
    .from(process.env.PAYPAL_CLIENT_ID + ':' + process.env.PAYPAL_SECRET)
    .toString('base64');

  const resp = await fetch(BASE_URL + '/v1/oauth2/token', {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + auth,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: 'grant_type=client_credentials'
  });

  const data = await resp.json();
  if (!resp.ok) {
    throw new Error('PayPal OAuth error (' + resp.status + '): ' + JSON.stringify(data));
  }

  cachedToken = data.access_token;
  cachedTokenExp = Date.now() + (data.expires_in - 60) * 1000;
  return cachedToken;
};

// Crea una orden de pago (intent CAPTURE) y devuelve el id y el link de aprobación
const crearOrden = async ({ pedidoId, numeroPedido, total, moneda, returnUrl, cancelUrl }) => {
  const token = await obtenerAccessToken();

  const resp = await fetch(BASE_URL + '/v2/checkout/orders', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + token,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      intent: 'CAPTURE',
      purchase_units: [{
        reference_id: String(pedidoId),
        invoice_id: numeroPedido,
        description: 'Pedido ' + numeroPedido + ' — MBS Comunicaciones',
        amount: {
          currency_code: moneda || 'MXN',
          value: Number(total).toFixed(2)
        }
      }],
      application_context: {
        brand_name: 'MBS Comunicaciones',
        landing_page: 'NO_PREFERENCE',
        user_action: 'PAY_NOW',
        return_url: returnUrl,
        cancel_url: cancelUrl
      }
    })
  });

  const data = await resp.json();
  if (!resp.ok) {
    throw new Error('PayPal crear orden error (' + resp.status + '): ' + JSON.stringify(data));
  }

  const approvalUrl = (data.links || []).find(l => l.rel === 'approve')?.href || null;
  return { orderId: data.id, status: data.status, approvalUrl };
};

// Captura el pago de una orden ya aprobada por el cliente
const capturarOrden = async (orderId) => {
  const token = await obtenerAccessToken();

  const resp = await fetch(BASE_URL + '/v2/checkout/orders/' + orderId + '/capture', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + token,
      'Content-Type': 'application/json'
    }
  });

  const data = await resp.json();
  if (!resp.ok) {
    throw new Error('PayPal capturar orden error (' + resp.status + '): ' + JSON.stringify(data));
  }
  return data;
};

// Verifica la firma de un webhook usando el endpoint oficial de PayPal
const verificarWebhook = async (headers, body) => {
  if (!process.env.PAYPAL_WEBHOOK_ID) return false;

  const token = await obtenerAccessToken();

  const resp = await fetch(BASE_URL + '/v1/notifications/verify-webhook-signature', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + token,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      auth_algo:         headers['paypal-auth-algo'],
      cert_url:          headers['paypal-cert-url'],
      transmission_id:   headers['paypal-transmission-id'],
      transmission_sig:  headers['paypal-transmission-sig'],
      transmission_time: headers['paypal-transmission-time'],
      webhook_id:        process.env.PAYPAL_WEBHOOK_ID,
      webhook_event:     body
    })
  });

  const data = await resp.json();
  return resp.ok && data.verification_status === 'SUCCESS';
};

module.exports = {
  credencialesConfiguradas,
  obtenerAccessToken,
  crearOrden,
  capturarOrden,
  verificarWebhook
};

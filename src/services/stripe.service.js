/* ================================================================
   MBS COMUNICACIONES — Stripe Service
   Soporta modo sandbox (test) y live.
   Las claves se leen de la tabla `configuracion` (no de .env)
   para que el admin pueda cambiarlas sin reiniciar el servidor.
================================================================ */
const { query } = require('../config/db');

// Obtiene la instancia de Stripe con la clave correcta según el modo
const getStripe = async () => {
  const res = await query(
    `SELECT clave, valor FROM configuracion WHERE clave IN
     ('stripe_mode','stripe_sk_test','stripe_sk_live')`,
    []
  );
  const cfg = {};
  res.rows.forEach(r => { cfg[r.clave] = r.valor; });

  const mode = cfg.stripe_mode || 'sandbox';
  const secretKey = mode === 'live' ? cfg.stripe_sk_live : cfg.stripe_sk_test;

  if (!secretKey) throw new Error('Stripe no configurado: falta la Secret Key en Configuración > Pagos');

  // Require dinámico para no fallar si stripe no está instalado
  const Stripe = require('stripe');
  return Stripe(secretKey);
};

// Crea un PaymentIntent y devuelve el clientSecret al frontend
const crearPaymentIntent = async ({ monto_centavos, moneda = 'mxn', metadata = {} }) => {
  const stripe = await getStripe();
  const intent = await stripe.paymentIntents.create({
    amount:   Math.round(monto_centavos),   // en centavos
    currency: moneda,
    metadata,
    automatic_payment_methods: { enabled: true },
  });
  return { client_secret: intent.client_secret, payment_intent_id: intent.id };
};

// Verifica y parsea un webhook de Stripe
const verificarWebhook = async (rawBody, signature) => {
  const res = await query(
    `SELECT clave, valor FROM configuracion WHERE clave IN
     ('stripe_mode','stripe_webhook_secret_test','stripe_webhook_secret_live')`,
    []
  );
  const cfg = {};
  res.rows.forEach(r => { cfg[r.clave] = r.valor; });

  const mode   = cfg.stripe_mode || 'sandbox';
  const secret = mode === 'live'
    ? cfg.stripe_webhook_secret_live
    : cfg.stripe_webhook_secret_test;

  if (!secret) throw new Error('Webhook secret de Stripe no configurado');

  const Stripe = require('stripe');
  // La clave secreta se necesita para instanciar pero no la usamos aquí
  const stripe = Stripe('sk_test_placeholder');
  return stripe.webhooks.constructEvent(rawBody, signature, secret);
};

module.exports = { crearPaymentIntent, verificarWebhook };

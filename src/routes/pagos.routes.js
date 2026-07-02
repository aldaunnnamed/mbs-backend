const router     = require('express').Router();
const rateLimit  = require('express-rate-limit');
const ctrl   = require('../controllers/pagos.controller');
const { verificarToken } = require('../middlewares/auth');

// 30 llamadas por IP por minuto — las pasarelas reales no se acercan a este volumen;
// limita el abuso (fuerza bruta del token SPEI, flooding) sin bloquear reintentos legítimos
const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, mensaje: 'Demasiadas solicitudes. Intenta más tarde.' },
  skip: () => process.env.NODE_ENV === 'test',
});

// Estado de pago de un pedido
router.get('/estado/:pedido_id',  verificarToken, ctrl.estadoPago);

// SPEI
router.post('/spei/referencia',   verificarToken, ctrl.crearReferenciaSpei);
router.post('/spei/webhook',      webhookLimiter, ctrl.webhookSpei);

// PayPal
router.post('/paypal/orden',      verificarToken, ctrl.crearOrdenPaypal);
router.post('/paypal/capturar',   verificarToken, ctrl.capturarOrdenPaypal);
router.post('/paypal/webhook',    webhookLimiter, ctrl.webhookPaypal);

// Stripe
router.get('/stripe/public-key',                  ctrl.getStripePublicKey);
router.post('/stripe/intent',     verificarToken, ctrl.crearIntentStripe);
router.post('/stripe/webhook',    webhookLimiter, ctrl.webhookStripe);


module.exports = router;

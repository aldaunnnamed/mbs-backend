const router = require('express').Router();
const ctrl   = require('../controllers/pagos.controller');
const { verificarToken } = require('../middlewares/auth');

// Estado de pago de un pedido
router.get('/estado/:pedido_id',  verificarToken, ctrl.estadoPago);

// SPEI
router.post('/spei/referencia',   verificarToken, ctrl.crearReferenciaSpei);
router.post('/spei/webhook',                      ctrl.webhookSpei);

// PayPal
router.post('/paypal/orden',      verificarToken, ctrl.crearOrdenPaypal);
router.post('/paypal/capturar',   verificarToken, ctrl.capturarOrdenPaypal);
router.post('/paypal/webhook',                    ctrl.webhookPaypal);

module.exports = router;

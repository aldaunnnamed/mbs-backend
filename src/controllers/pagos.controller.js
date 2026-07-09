const { query } = require('../config/db');
const paypal = require('../services/paypal.service');
const stripeSvc = require('../services/stripe.service');

// GET /api/pagos/estado/:pedido_id
const estadoPago = async (req, res) => {
  try {
    const pedidoRes = await query(
      'SELECT id FROM pedidos WHERE id = CAST($1 AS INTEGER) AND usuario_id = CAST($2 AS INTEGER)',
      [parseInt(req.params.pedido_id), parseInt(req.usuario.id)]
    );
    if (!pedidoRes.rows.length) {
      return res.status(404).json({ ok: false, mensaje: 'Pedido no encontrado' });
    }

    const result = await query(
      'SELECT * FROM fn_estado_pago_pedido(CAST($1 AS INTEGER))',
      [parseInt(req.params.pedido_id)]
    );
    const pago = result.rows[0] || {};

    // fn_estado_pago_pedido no devuelve banco/beneficiario/monto_esperado de pago_referencias
    if (pago.r_spei_referencia) {
      const refRes = await query(
        'SELECT banco, beneficiario, monto_esperado FROM pago_referencias' +
        ' WHERE pedido_id = $1 ORDER BY created_at DESC LIMIT 1',
        [parseInt(req.params.pedido_id)]
      );
      if (refRes.rows.length) {
        pago.r_spei_banco        = refRes.rows[0].banco;
        pago.r_spei_beneficiario = refRes.rows[0].beneficiario;
        pago.r_monto             = refRes.rows[0].monto_esperado;
      }
    }

    res.json({ ok: true, pago });
  } catch (err) {
    res.status(500).json({ ok: false, mensaje: 'Error al consultar estado de pago' });
  }
};

// POST /api/pagos/spei/referencia
const crearReferenciaSpei = async (req, res) => {
  try {
    const { pedido_id, horas_vence = 48 } = req.body;

    const pedidoRes = await query(
      'SELECT id, numero, total FROM pedidos WHERE id = CAST($1 AS INTEGER) AND usuario_id = CAST($2 AS INTEGER)',
      [parseInt(pedido_id), parseInt(req.usuario.id)]
    );
    if (!pedidoRes.rows.length) {
      return res.status(404).json({ ok: false, mensaje: 'Pedido no encontrado' });
    }
    const pedido = pedidoRes.rows[0];

    const motorRes = await query("SELECT valor FROM configuracion WHERE clave = 'spei_motor'");
    const motor = motorRes.rows[0]?.valor || 'legacy';

    if (motor === 'stripe') {
      const stripeSpei = await stripeSvc.crearPaymentIntentSpei({
        pedido_id,
        numero_pedido: pedido.numero,
        monto_centavos: Math.round(parseFloat(pedido.total) * 100),
      });

      const result = await query(
        'SELECT * FROM fn_crear_referencia_spei_stripe($1,$2,$3,$4,$5,$6,$7,$8)',
        [pedido_id, stripeSpei.clabe, stripeSpei.banco, stripeSpei.beneficiario,
         stripeSpei.referencia, stripeSpei.customer_id, stripeSpei.payment_intent_id, horas_vence]
      );

      return res.json({
        ok: true,
        spei: { ...result.rows[0], r_hosted_instructions_url: stripeSpei.hosted_instructions_url },
      });
    }

    // Motor 'legacy': CLABE fija propia leída de configuracion
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
    // Verificar token compartido configurado en Admin → Configuración (spei_webhook_token)
    const cfgRes = await query(
      "SELECT valor FROM configuracion WHERE clave = 'spei_webhook_token'"
    );
    const tokenEsperado = cfgRes.rows[0]?.valor;
    if (!tokenEsperado) {
      return res.status(503).json({ ok: false, mensaje: 'spei_webhook_token no configurado' });
    }
    const tokenRecibido = req.headers['x-webhook-token']
      || req.headers['authorization']?.replace('Bearer ', '');
    if (!tokenRecibido || tokenRecibido !== tokenEsperado) {
      console.warn('webhookSpei: token inválido');
      return res.status(401).json({ ok: false });
    }

    const { referencia, monto, clave_rastreo, banco_emisor } = req.body;

    const result = await query(
      'SELECT fn_confirmar_pago_spei($1,$2,$3,$4,$5)',
      [referencia, monto, clave_rastreo, banco_emisor, JSON.stringify(req.body)]
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
    if (!(await paypal.credencialesConfiguradas())) {
      return res.status(503).json({
        ok: false,
        mensaje: 'PayPal no está configurado. Ingresa las credenciales en Admin → Configuración → Pagos'
      });
    }

    const { pedido_id } = req.body;
    if (!pedido_id) {
      return res.status(400).json({ ok: false, mensaje: 'pedido_id requerido' });
    }

    const pedidoRes = await query(
      'SELECT id, numero, total, estatus_pago FROM pedidos' +
      ' WHERE id = CAST($1 AS INTEGER) AND usuario_id = CAST($2 AS INTEGER)',
      [parseInt(pedido_id), parseInt(req.usuario.id)]
    );
    if (!pedidoRes.rows.length) {
      return res.status(404).json({ ok: false, mensaje: 'Pedido no encontrado' });
    }

    const pedido = pedidoRes.rows[0];
    if (pedido.estatus_pago === 'pagado') {
      return res.status(400).json({ ok: false, mensaje: 'Este pedido ya fue pagado' });
    }

    const appUrl = (process.env.APP_URL || (req.protocol + '://' + req.get('host'))).replace(/\/$/, '');
    const orden = await paypal.crearOrden({
      pedidoId: pedido.id,
      numeroPedido: pedido.numero,
      total: pedido.total,
      moneda: 'MXN',
      returnUrl: appUrl + '/pages/paypal-retorno.html?pedido_id=' + pedido.id,
      cancelUrl: appUrl + '/pages/paypal-retorno.html?pedido_id=' + pedido.id + '&cancelado=1'
    });

    if (!orden.approvalUrl) {
      return res.status(502).json({ ok: false, mensaje: 'PayPal no devolvió una URL de aprobación' });
    }

    await query(
      'SELECT fn_crear_orden_paypal(CAST($1 AS INTEGER), CAST($2 AS VARCHAR), CAST($3 AS VARCHAR))',
      [pedido.id, orden.orderId, orden.approvalUrl]
    );

    res.json({ ok: true, order_id: orden.orderId, approval_url: orden.approvalUrl });
  } catch (err) {
    console.error('crearOrdenPaypal:', err.message);
    res.status(500).json({ ok: false, mensaje: 'Error al crear orden PayPal' });
  }
};

// POST /api/pagos/paypal/capturar  ← el frontend llama a esto al volver de PayPal
const capturarOrdenPaypal = async (req, res) => {
  try {
    const { order_id } = req.body;
    if (!order_id) {
      return res.status(400).json({ ok: false, mensaje: 'order_id requerido' });
    }

    // Verificar que la orden pertenece a un pedido del usuario autenticado
    const ownRes = await query(
      'SELECT pp.pedido_id, pp.estado FROM pago_paypal pp' +
      ' JOIN pedidos p ON p.id = pp.pedido_id' +
      ' WHERE pp.order_id = $1 AND p.usuario_id = CAST($2 AS INTEGER)',
      [order_id, parseInt(req.usuario.id)]
    );
    if (!ownRes.rows.length) {
      return res.status(404).json({ ok: false, mensaje: 'Orden de PayPal no encontrada' });
    }
    const pedidoId = ownRes.rows[0].pedido_id;

    // Si ya fue capturada antes (doble clic, regreso repetido), no volver a capturar en PayPal
    if (ownRes.rows[0].estado !== 'COMPLETED') {
      const captura = await paypal.capturarOrden(order_id);
      const purchaseUnit = captura.purchase_units?.[0];
      const capture = purchaseUnit?.payments?.captures?.[0];

      const estado  = capture?.status || captura.status;
      const monto   = capture?.amount?.value ?? purchaseUnit?.amount?.value ?? null;
      const comision = capture?.seller_receivable_breakdown?.paypal_fee?.value ?? null;
      const email   = captura.payer?.email_address || null;

      await query(
        'SELECT fn_confirmar_pago_paypal(' +
        'CAST($1 AS VARCHAR), CAST($2 AS VARCHAR), CAST($3 AS VARCHAR),' +
        'CAST($4 AS NUMERIC), CAST($5 AS NUMERIC), CAST($6 AS VARCHAR), CAST($7 AS JSONB))',
        [order_id, capture?.id || null, estado, monto, comision, email, JSON.stringify(captura)]
      );

      // Seguro directo: si PayPal confirmó el pago, marcar pedido como pagado
      // (por si fn_confirmar_pago_paypal no actualizó por sandbox/timing)
      if (estado === 'COMPLETED') {
        await query(
          `UPDATE pedidos SET estatus_pago='pagado', fecha_pago=NOW(),
           pago_proveedor='paypal', pago_proveedor_estado='COMPLETED'
           WHERE id=CAST($1 AS INTEGER) AND estatus_pago != 'pagado'`,
          [pedidoId]
        );
      }
    }

    const estadoPago = await query('SELECT * FROM fn_estado_pago_pedido(CAST($1 AS INTEGER))', [pedidoId]);
    res.json({ ok: true, pago: estadoPago.rows[0] });
  } catch (err) {
    console.error('capturarOrdenPaypal:', err.message);
    res.status(500).json({ ok: false, mensaje: err.message || 'Error al capturar el pago de PayPal' });
  }
};

// POST /api/pagos/paypal/webhook  ← PayPal llama a esta ruta
const webhookPaypal = async (req, res) => {
  try {
    const evento = req.body;

    // Leer webhook_id desde la BD (igual que el resto de credenciales PayPal)
    const { webhook_id } = await paypal.getCfg();
    if (webhook_id) {
      const valido = await paypal.verificarWebhook(req.headers, evento);
      if (!valido) {
        console.warn('webhookPaypal: firma de webhook inválida');
        return res.status(400).json({ ok: false });
      }
    }

    const tipo = evento.event_type;
    const resource = evento.resource;
    const eventosCaptura = {
      'PAYMENT.CAPTURE.COMPLETED': 'COMPLETED',
      'PAYMENT.CAPTURE.DENIED':    'DENIED',
      'PAYMENT.CAPTURE.REFUNDED':  'REFUNDED'
    };

    if (resource && eventosCaptura[tipo]) {
      const orderId = resource.supplementary_data?.related_ids?.order_id;
      if (orderId) {
        await query(
          'SELECT fn_confirmar_pago_paypal(' +
          'CAST($1 AS VARCHAR), CAST($2 AS VARCHAR), CAST($3 AS VARCHAR),' +
          'CAST($4 AS NUMERIC), CAST($5 AS NUMERIC), CAST($6 AS VARCHAR), CAST($7 AS JSONB))',
          [
            orderId,
            resource.id || null,
            eventosCaptura[tipo],
            resource.amount?.value || null,
            resource.seller_receivable_breakdown?.paypal_fee?.value || null,
            null,
            JSON.stringify(evento)
          ]
        );
      }
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('webhookPaypal:', err.message);
    res.status(500).json({ ok: false });
  }
};


// ── Stripe ────────────────────────────────────────────────────────

// GET /api/pagos/stripe/public-key  (sin auth — publishable key)
const getStripePublicKey = async (req, res) => {
  try {
    const pk = await stripeSvc.getPublicKey();
    if (!pk) return res.status(503).json({ ok: false, mensaje: 'Stripe no configurado' });
    res.json({ ok: true, public_key: pk });
  } catch (err) {
    res.status(500).json({ ok: false, mensaje: err.message });
  }
};

// POST /api/pagos/stripe/intent
const crearIntentStripe = async (req, res) => {
  try {
    const { pedido_id } = req.body;
    if (!pedido_id) return res.status(400).json({ ok: false, mensaje: 'pedido_id requerido' });

    const pedidoRes = await query(
      'SELECT id, total, estatus_pago FROM pedidos WHERE id=CAST($1 AS INTEGER) AND usuario_id=CAST($2 AS INTEGER)',
      [parseInt(pedido_id), parseInt(req.usuario.id)]
    );
    if (!pedidoRes.rows.length) return res.status(404).json({ ok: false, mensaje: 'Pedido no encontrado' });
    const pedido = pedidoRes.rows[0];
    if (pedido.estatus_pago === 'pagado') return res.status(400).json({ ok: false, mensaje: 'Ya fue pagado' });

    const { client_secret, payment_intent_id } = await stripeSvc.crearPaymentIntent({
      monto_centavos: Math.round(parseFloat(pedido.total) * 100),
      moneda: 'mxn',
      metadata: { pedido_id: String(pedido_id) },
    });

    const pk = await stripeSvc.getPublicKey();
    res.json({ ok: true, client_secret, payment_intent_id, public_key: pk });
  } catch (err) {
    console.error('crearIntentStripe:', err.message);
    res.status(500).json({ ok: false, mensaje: err.message });
  }
};

// POST /api/pagos/stripe/webhook
const webhookStripe = async (req, res) => {
  // Verificación de firma — fallo aquí = entrega inválida → 400
  let evento;
  try {
    const sig = req.headers['stripe-signature'];
    evento = await stripeSvc.verificarWebhook(req.body, sig);
  } catch (err) {
    console.error('webhookStripe — firma inválida:', err.message);
    return res.status(400).json({ ok: false, mensaje: err.message });
  }

  // Procesamiento post-verificación — fallo aquí = error de servidor → 500
  // (Stripe no reintenta en 5xx como sí lo hace con 4xx)
  try {
    const pi = evento.data.object;
    const esSpei = pi?.metadata?.tipo === 'spei';

    const eventosSpei = {
      'payment_intent.succeeded':      'pagado',
      'payment_intent.processing':     'procesando',
      'payment_intent.payment_failed': 'fallido',
    };

    if (esSpei && eventosSpei[evento.type]) {
      await query(
        'SELECT fn_confirmar_pago_spei_stripe($1,$2,$3,$4)',
        [pi.id, eventosSpei[evento.type], pi.amount_received ? pi.amount_received / 100 : null, JSON.stringify(evento)]
      );
    } else if (evento.type === 'payment_intent.succeeded') {
      // Pago con tarjeta
      const pedidoId = pi.metadata?.pedido_id;
      if (pedidoId) {
        await query(
          `UPDATE pedidos SET estatus_pago='pagado', fecha_pago=NOW(), pago_proveedor='stripe' WHERE id=CAST($1 AS INTEGER)`,
          [parseInt(pedidoId)]
        );
      }
    }
    res.json({ ok: true, received: true });
  } catch (err) {
    console.error('webhookStripe — error procesando evento:', err.message);
    res.status(500).json({ ok: false, mensaje: 'Error procesando el evento' });
  }
};

module.exports = {
  estadoPago, crearReferenciaSpei, webhookSpei,
  crearOrdenPaypal, capturarOrdenPaypal, webhookPaypal,
  getStripePublicKey, crearIntentStripe, webhookStripe,
};

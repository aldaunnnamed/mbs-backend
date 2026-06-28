const { query } = require('../config/db');
const paypal = require('../services/paypal.service');

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
    res.json({ ok: true, pago: result.rows[0] });
  } catch (err) {
    res.status(500).json({ ok: false, mensaje: 'Error al consultar estado de pago' });
  }
};

// POST /api/pagos/spei/referencia
const crearReferenciaSpei = async (req, res) => {
  try {
    const { pedido_id, horas_vence = 48 } = req.body;

    const pedidoRes = await query(
      'SELECT id FROM pedidos WHERE id = CAST($1 AS INTEGER) AND usuario_id = CAST($2 AS INTEGER)',
      [parseInt(pedido_id), parseInt(req.usuario.id)]
    );
    if (!pedidoRes.rows.length) {
      return res.status(404).json({ ok: false, mensaje: 'Pedido no encontrado' });
    }

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
    }

    const estadoPago = await query('SELECT * FROM fn_estado_pago_pedido(CAST($1 AS INTEGER))', [pedidoId]);
    res.json({ ok: true, pago: estadoPago.rows[0] });
  } catch (err) {
    console.error('capturarOrdenPaypal:', err.message);
    res.status(500).json({ ok: false, mensaje: 'Error al capturar el pago de PayPal' });
  }
};

// POST /api/pagos/paypal/webhook  ← PayPal llama a esta ruta
const webhookPaypal = async (req, res) => {
  try {
    const evento = req.body;

    if (process.env.PAYPAL_WEBHOOK_ID) {
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
const stripeSvc = require('../services/stripe.service');

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
  try {
    const sig = req.headers['stripe-signature'];
    const evento = await stripeSvc.verificarWebhook(req.body, sig);

    if (evento.type === 'payment_intent.succeeded') {
      const pi = evento.data.object;
      const pedidoId = pi.metadata?.pedido_id;
      if (pedidoId) {
        await query(
          `UPDATE pedidos SET estatus_pago='pagado', fecha_pago=NOW(), pago_proveedor='stripe' WHERE id=CAST($1 AS INTEGER)`,
          [parseInt(pedidoId)]
        );
      }
    }
    res.json({ received: true });
  } catch (err) {
    console.error('webhookStripe:', err.message);
    res.status(400).json({ ok: false, mensaje: err.message });
  }
};

// ── Mercado Pago ──────────────────────────────────────────────────
const mpSvc = require('../services/mercadopago.service');

// POST /api/pagos/mp/preferencia
const crearPreferenciaMP = async (req, res) => {
  try {
    const { pedido_id } = req.body;
    if (!pedido_id) return res.status(400).json({ ok: false, mensaje: 'pedido_id requerido' });

    const pedidoRes = await query(
      `SELECT p.id, p.numero, p.total, p.estatus_pago,
              json_agg(json_build_object('producto_id',pi.producto_id,'nombre',pr.nombre,
                'cantidad',pi.cantidad,'precio_unitario',pi.precio_unitario)) as items
       FROM pedidos p
       JOIN pedido_items pi ON pi.pedido_id = p.id
       JOIN productos pr    ON pr.id = pi.producto_id
       WHERE p.id=CAST($1 AS INTEGER) AND p.usuario_id=CAST($2 AS INTEGER)
       GROUP BY p.id`,
      [parseInt(pedido_id), parseInt(req.usuario.id)]
    );
    if (!pedidoRes.rows.length) return res.status(404).json({ ok: false, mensaje: 'Pedido no encontrado' });
    const pedido = pedidoRes.rows[0];
    if (pedido.estatus_pago === 'pagado') return res.status(400).json({ ok: false, mensaje: 'Ya fue pagado' });

    const appUrl = (process.env.APP_URL || (req.protocol + '://' + req.get('host'))).replace(/\/$/, '');
    // MP rechaza notification_url con localhost; solo enviarla en producción (HTTPS)
    const notifUrl = appUrl.startsWith('https://') ? appUrl + '/api/pagos/mp/webhook' : undefined;

    const result = await mpSvc.crearPreferencia({
      pedido_id:        pedido.id,
      items:            pedido.items,
      notification_url: notifUrl,
      back_urls: {
        success: appUrl + '/pages/mp-retorno.html?pedido_id=' + pedido.id + '&status=success',
        failure: appUrl + '/pages/mp-retorno.html?pedido_id=' + pedido.id + '&status=failure',
        pending: appUrl + '/pages/mp-retorno.html?pedido_id=' + pedido.id + '&status=pending',
      },
    });

    res.json({ ok: true, ...result });
  } catch (err) {
    console.error('crearPreferenciaMP:', err.message);
    res.status(500).json({ ok: false, mensaje: err.message });
  }
};

// GET /api/pagos/mp/public-key  (sin auth — publishable key)
const getMPPublicKey = async (req, res) => {
  try {
    const pk = await mpSvc.getPublicKey();
    if (!pk) return res.status(503).json({ ok: false, mensaje: 'Mercado Pago no configurado' });
    res.json({ ok: true, public_key: pk });
  } catch (err) {
    res.status(500).json({ ok: false, mensaje: err.message });
  }
};

// POST /api/pagos/mp/pago  — pago directo con token de tarjeta (Checkout Bricks)
const crearPagoMP = async (req, res) => {
  try {
    const { pedido_id, token, installments, payment_method_id, issuer_id, payer } = req.body;
    if (!pedido_id || !token) {
      return res.status(400).json({ ok: false, mensaje: 'Faltan parámetros: pedido_id y token son requeridos' });
    }

    const pedidoRes = await query(
      'SELECT id, total, estatus_pago FROM pedidos WHERE id=CAST($1 AS INTEGER) AND usuario_id=CAST($2 AS INTEGER)',
      [parseInt(pedido_id), parseInt(req.usuario.id)]
    );
    if (!pedidoRes.rows.length) return res.status(404).json({ ok: false, mensaje: 'Pedido no encontrado' });
    const pedido = pedidoRes.rows[0];
    if (pedido.estatus_pago === 'pagado') return res.status(400).json({ ok: false, mensaje: 'Este pedido ya fue pagado' });

    const pago = await mpSvc.crearPago({
      token,
      installments,
      payment_method_id,
      issuer_id,
      payer,
      amount:    parseFloat(pedido.total),
      pedido_id: pedido.id,
    });

    console.log('crearPagoMP:', pago.status, pago.status_detail, 'pedido:', pedido.id);

    if (pago.status === 'approved') {
      await query(
        `UPDATE pedidos SET estatus_pago='pagado', fecha_pago=NOW() WHERE id=CAST($1 AS INTEGER)`,
        [pedido.id]
      );
    }

    res.json({
      ok:            pago.status === 'approved',
      status:        pago.status,
      status_detail: pago.status_detail,
      payment_id:    pago.id,
      mensaje:       pago.status !== 'approved' ? (pago.status_detail || 'Pago no aprobado') : undefined,
    });
  } catch (err) {
    console.error('crearPagoMP:', err.message, err.mpBody || '');
    const status = err.mpStatus && err.mpStatus >= 400 && err.mpStatus < 600 ? err.mpStatus : 500;
    res.status(status).json({ ok: false, mensaje: err.message, mp_detail: err.mpBody || undefined });
  }
};

// POST /api/pagos/mp/webhook
const webhookMP = async (req, res) => {
  try {
    const { type, data } = req.body;
    if (type === 'payment' && data?.id) {
      const pago = await mpSvc.consultarPago(data.id);
      if (pago.status === 'approved') {
        const pedidoId = pago.external_reference;
        if (pedidoId) {
          await query(
            `UPDATE pedidos SET estatus_pago='pagado', fecha_pago=NOW() WHERE id=CAST($1 AS INTEGER)`,
            [parseInt(pedidoId)]
          );
        }
      }
    }
    res.sendStatus(200);
  } catch (err) {
    console.error('webhookMP:', err.message);
    res.sendStatus(200); // MP requiere 200 aunque haya error
  }
};

module.exports = {
  estadoPago, crearReferenciaSpei, webhookSpei,
  crearOrdenPaypal, capturarOrdenPaypal, webhookPaypal,
  getStripePublicKey, crearIntentStripe, webhookStripe,
  getMPPublicKey, crearPreferenciaMP, crearPagoMP, webhookMP,
};

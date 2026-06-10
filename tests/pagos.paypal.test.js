jest.mock('../src/services/paypal.service');

const request = require('supertest');
const app = require('../src/app');
const { pool, query } = require('../src/config/db');
const paypal = require('../src/services/paypal.service');

describe('Flujo de pago con PayPal (paypal.service mockeado)', () => {
  let token;
  let pedidoId;
  const orderId = 'EC-TEST-' + Date.now();

  beforeAll(async () => {
    // 1. Registrar usuario de prueba
    const email = `paypal_test_${Date.now()}@mbs.mx`;
    const registroRes = await request(app).post('/api/auth/registro').send({
      nombre: 'Paypal', apellidos: 'Test', email, password: 'Test1234'
    });
    token = registroRes.body.token;

    // 2. Agregar un producto del seed al carrito
    const prodRes = await request(app).get('/api/productos/cable-fo-monomodo-sc-upc-3mm');
    const productoId = prodRes.body.producto.r_id;

    await request(app).post('/api/carrito/agregar')
      .set('Authorization', `Bearer ${token}`)
      .send({ producto_id: productoId, cantidad: 1 });

    const carritoRes = await request(app).get('/api/carrito/id')
      .set('Authorization', `Bearer ${token}`);
    const carritoId = carritoRes.body.carrito_id;

    // 3. Crear dirección de envío
    const dirRes = await request(app).post('/api/usuarios/direcciones')
      .set('Authorization', `Bearer ${token}`)
      .send({
        nombre: 'Paypal', apellidos: 'Test',
        calle_numero: 'Calle 1 #100', colonia: 'Centro',
        ciudad: 'CDMX', estado: 'CDMX', cp: '01000',
        es_predeterminada: true
      });
    const direccionId = dirRes.body.id;

    // 4. Métodos de envío y pago (PayPal)
    const enviosRes = await request(app).get('/api/pedidos/envios');
    const envioId = enviosRes.body.metodos.find(m => m.precio_tipo !== 'cotizar').id;

    const pagosRes = await request(app).get('/api/pedidos/pagos-metodos');
    const metodoPaypal = pagosRes.body.metodos.find(m => m.clave === 'paypal');

    // 5. Crear el pedido (queda pendiente de pago)
    const pedidoRes = await request(app).post('/api/pedidos')
      .set('Authorization', `Bearer ${token}`)
      .send({
        carrito_id: carritoId,
        direccion_id: direccionId,
        metodo_envio_id: envioId,
        metodo_pago_id: metodoPaypal.id
      });

    expect(pedidoRes.body.ok).toBe(true);
    pedidoId = pedidoRes.body.pedido_id;
  });

  afterAll(async () => {
    await pool.end();
  });

  test('POST /api/pagos/paypal/orden crea la orden y la guarda en pago_paypal', async () => {
    paypal.credencialesConfiguradas.mockReturnValue(true);
    paypal.crearOrden.mockResolvedValue({
      orderId,
      status: 'CREATED',
      approvalUrl: `https://www.sandbox.paypal.com/checkoutnow?token=${orderId}`
    });

    const res = await request(app).post('/api/pagos/paypal/orden')
      .set('Authorization', `Bearer ${token}`)
      .send({ pedido_id: pedidoId });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.order_id).toBe(orderId);
    expect(res.body.approval_url).toContain(orderId);
    expect(paypal.crearOrden).toHaveBeenCalledTimes(1);

    const fila = await query('SELECT pedido_id, estado FROM pago_paypal WHERE order_id = $1', [orderId]);
    expect(fila.rows[0].pedido_id).toBe(pedidoId);
    expect(fila.rows[0].estado).toBe('CREATED');
  });

  test('POST /api/pagos/paypal/capturar marca el pedido como pagado', async () => {
    paypal.capturarOrden.mockResolvedValue({
      status: 'COMPLETED',
      payer: { email_address: 'buyer-sandbox@personal.example.com' },
      purchase_units: [{
        amount: { value: '349.00' },
        payments: {
          captures: [{
            id: 'CAPTURE-' + orderId,
            status: 'COMPLETED',
            amount: { value: '349.00', currency_code: 'MXN' },
            seller_receivable_breakdown: { paypal_fee: { value: '12.50', currency_code: 'MXN' } }
          }]
        }
      }]
    });

    const res = await request(app).post('/api/pagos/paypal/capturar')
      .set('Authorization', `Bearer ${token}`)
      .send({ order_id: orderId });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.pago.r_estatus_pago).toBe('pagado');
    expect(res.body.pago.r_paypal_estado).toBe('COMPLETED');
    expect(res.body.pago.r_paypal_capture_id).toBe('CAPTURE-' + orderId);
    expect(paypal.capturarOrden).toHaveBeenCalledTimes(1);

    const pedido = await query('SELECT estatus_pago, pago_proveedor FROM pedidos WHERE id = $1', [pedidoId]);
    expect(pedido.rows[0].estatus_pago).toBe('pagado');
    expect(pedido.rows[0].pago_proveedor).toBe('paypal');
  });

  test('una segunda captura no vuelve a llamar a PayPal (idempotencia en el controlador)', async () => {
    const res = await request(app).post('/api/pagos/paypal/capturar')
      .set('Authorization', `Bearer ${token}`)
      .send({ order_id: orderId });

    expect(res.status).toBe(200);
    expect(res.body.pago.r_estatus_pago).toBe('pagado');
    // No debe haber llamado de nuevo a paypal.capturarOrden (sigue en 1 desde el test anterior)
    expect(paypal.capturarOrden).toHaveBeenCalledTimes(1);
  });

  test('fn_confirmar_pago_paypal no duplica notificaciones/auditoría si se llama de nuevo con COMPLETED', async () => {
    const notifAntes = await query(
      "SELECT COUNT(*)::int AS c FROM notificaciones n JOIN pedidos p ON p.usuario_id = n.usuario_id" +
      " WHERE n.tipo = 'pago_confirmado' AND p.id = $1", [pedidoId]
    );
    const audAntes = await query(
      "SELECT COUNT(*)::int AS c FROM auditoria WHERE accion = 'confirmar_pago_paypal' AND registro_id = $1",
      [pedidoId]
    );

    const result = await query(
      'SELECT fn_confirmar_pago_paypal(' +
      'CAST($1 AS VARCHAR), CAST($2 AS VARCHAR), CAST($3 AS VARCHAR),' +
      'CAST($4 AS NUMERIC), CAST($5 AS NUMERIC), CAST($6 AS VARCHAR), CAST($7 AS JSONB))',
      [orderId, 'CAPTURE-' + orderId, 'COMPLETED', '349.00', '12.50',
       'buyer-sandbox@personal.example.com', JSON.stringify({ webhook_reenviado: true })]
    );
    expect(result.rows[0].fn_confirmar_pago_paypal).toBe('OK: pago ya estaba confirmado');

    const notifDespues = await query(
      "SELECT COUNT(*)::int AS c FROM notificaciones n JOIN pedidos p ON p.usuario_id = n.usuario_id" +
      " WHERE n.tipo = 'pago_confirmado' AND p.id = $1", [pedidoId]
    );
    const audDespues = await query(
      "SELECT COUNT(*)::int AS c FROM auditoria WHERE accion = 'confirmar_pago_paypal' AND registro_id = $1",
      [pedidoId]
    );

    expect(notifDespues.rows[0].c).toBe(notifAntes.rows[0].c);
    expect(audDespues.rows[0].c).toBe(audAntes.rows[0].c);
  });
});

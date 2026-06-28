const request = require('supertest');
const app     = require('../src/app');
const { pool } = require('../src/config/db');

describe('API Pedidos (/api/pedidos)', () => {
  let token;
  let productoId;
  let carritoId;
  let direccionId;
  let envioId;
  let pagoId;
  let pedidoId;

  beforeAll(async () => {
    const email = `pedido_test_${Date.now()}@mbs.mx`;
    const reg = await request(app).post('/api/auth/registro').send({
      nombre: 'Pedido', apellidos: 'Test', email, password: 'Test1234',
    });
    token = reg.body.token;

    // Producto del seed
    const prod = await request(app).get('/api/productos/cable-fo-monomodo-sc-upc-3mm');
    productoId = prod.body.producto.r_id;

    // Agregar al carrito
    const sessionKey = 'pedido-session-' + Date.now();
    await request(app)
      .post('/api/carrito/agregar')
      .set('Authorization', `Bearer ${token}`)
      .set('x-session-key', sessionKey)
      .send({ producto_id: productoId, cantidad: 1 });

    const cartRes = await request(app)
      .get('/api/carrito/id')
      .set('Authorization', `Bearer ${token}`);
    carritoId = cartRes.body.carrito_id;

    // Dirección de envío
    const dirRes = await request(app)
      .post('/api/usuarios/direcciones')
      .set('Authorization', `Bearer ${token}`)
      .send({
        nombre: 'Pedido', apellidos: 'Test',
        calle_numero: 'Av. Prueba #1', colonia: 'Centro',
        ciudad: 'CDMX', estado: 'CDMX', cp: '01000',
        es_predeterminada: true,
      });
    direccionId = dirRes.body.id;

    // Métodos
    const enviosRes = await request(app).get('/api/pedidos/envios');
    envioId = enviosRes.body.metodos.find(m => m.precio_tipo !== 'cotizar')?.id;

    const pagosRes = await request(app).get('/api/pedidos/pagos-metodos');
    pagoId = pagosRes.body.metodos[0]?.id;
  });

  afterAll(async () => { await pool.end(); });

  test('GET /envios devuelve lista de métodos de envío activos', async () => {
    const res = await request(app).get('/api/pedidos/envios');

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(Array.isArray(res.body.metodos)).toBe(true);
    expect(res.body.metodos.length).toBeGreaterThan(0);
  });

  test('GET /pagos-metodos devuelve lista de métodos de pago activos', async () => {
    const res = await request(app).get('/api/pedidos/pagos-metodos');

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(Array.isArray(res.body.metodos)).toBe(true);
    expect(res.body.metodos.length).toBeGreaterThan(0);
  });

  test('POST / requiere token', async () => {
    const res = await request(app).post('/api/pedidos').send({});

    expect(res.status).toBe(401);
    expect(res.body.ok).toBe(false);
  });

  test('POST / rechaza pedido sin datos requeridos', async () => {
    const res = await request(app)
      .post('/api/pedidos')
      .set('Authorization', `Bearer ${token}`)
      .send({ carrito_id: carritoId });

    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
  });

  test('POST / crea un pedido correctamente', async () => {
    expect(carritoId).toBeTruthy();
    expect(direccionId).toBeTruthy();
    expect(envioId).toBeTruthy();
    expect(pagoId).toBeTruthy();

    const res = await request(app)
      .post('/api/pedidos')
      .set('Authorization', `Bearer ${token}`)
      .send({
        carrito_id:      carritoId,
        direccion_id:    direccionId,
        metodo_envio_id: envioId,
        metodo_pago_id:  pagoId,
      });

    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(true);
    expect(res.body.pedido_id).toBeTruthy();
    expect(res.body.numero_pedido).toMatch(/^MBS-\d{4}-\d{6}$/);
    pedidoId = res.body.pedido_id;
  });

  test('GET / lista los pedidos del usuario autenticado', async () => {
    const res = await request(app)
      .get('/api/pedidos')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(Array.isArray(res.body.pedidos)).toBe(true);
    expect(res.body.pedidos.length).toBeGreaterThan(0);
  });

  test('GET /:id devuelve el detalle del pedido', async () => {
    expect(pedidoId).toBeTruthy();

    const res = await request(app)
      .get(`/api/pedidos/${pedidoId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(Array.isArray(res.body.pedido)).toBe(true);
    expect(res.body.pedido.length).toBeGreaterThan(0);
  });

  test('GET /:id/factura devuelve HTML de la factura', async () => {
    expect(pedidoId).toBeTruthy();

    const res = await request(app)
      .get(`/api/pedidos/${pedidoId}/factura`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
    expect(res.text).toContain('MBS');
  });

  test('POST /:id/cancelar cancela un pedido en estado nuevo', async () => {
    expect(pedidoId).toBeTruthy();

    const res = await request(app)
      .post(`/api/pedidos/${pedidoId}/cancelar`)
      .set('Authorization', `Bearer ${token}`)
      .send({ motivo: 'Test automatizado' });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.mensaje).toContain('cancelado');
  });

  test('POST /:id/cancelar rechaza cancelar un pedido ya cancelado', async () => {
    expect(pedidoId).toBeTruthy();

    const res = await request(app)
      .post(`/api/pedidos/${pedidoId}/cancelar`)
      .set('Authorization', `Bearer ${token}`)
      .send({ motivo: 'Segundo intento' });

    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
  });
});

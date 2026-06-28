const request = require('supertest');
const app     = require('../src/app');
const { pool } = require('../src/config/db');

describe('API Carrito (/api/carrito)', () => {
  let token;
  let productoId;
  const sessionKey = 'test-cart-session-' + Date.now();

  beforeAll(async () => {
    const email = `carrito_test_${Date.now()}@mbs.mx`;
    const reg = await request(app).post('/api/auth/registro').send({
      nombre: 'Carrito', apellidos: 'Test', email, password: 'Test1234',
    });
    token = reg.body.token;

    const prod = await request(app).get('/api/productos/cable-fo-monomodo-sc-upc-3mm');
    productoId = prod.body.producto.r_id;
  });

  afterAll(async () => { await pool.end(); });

  test('GET / devuelve carrito vacío para sesión nueva', async () => {
    const res = await request(app)
      .get('/api/carrito')
      .set('x-session-key', sessionKey);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(Array.isArray(res.body.items)).toBe(true);
    expect(res.body.items.length).toBe(0);
  });

  test('POST /agregar añade un producto al carrito anónimo', async () => {
    const res = await request(app)
      .post('/api/carrito/agregar')
      .set('x-session-key', sessionKey)
      .send({ producto_id: productoId, cantidad: 2 });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.carrito_id).toBeTruthy();
  });

  test('GET / muestra el item recién añadido con cantidad correcta', async () => {
    const res = await request(app)
      .get('/api/carrito')
      .set('x-session-key', sessionKey);

    expect(res.status).toBe(200);
    expect(res.body.items.length).toBeGreaterThan(0);
    expect(res.body.items[0].r_producto_id).toBe(productoId);
    expect(Number(res.body.items[0].r_cantidad)).toBe(2);
  });

  test('PUT /:item_id actualiza la cantidad', async () => {
    const carrito = await request(app).get('/api/carrito').set('x-session-key', sessionKey);
    const itemId  = carrito.body.items[0].r_item_id;

    const res = await request(app)
      .put(`/api/carrito/${itemId}`)
      .set('x-session-key', sessionKey)
      .send({ cantidad: 5 });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    const verificar = await request(app).get('/api/carrito').set('x-session-key', sessionKey);
    expect(Number(verificar.body.items[0].r_cantidad)).toBe(5);
  });

  test('PUT /:item_id rechaza cantidad inválida', async () => {
    const carrito = await request(app).get('/api/carrito').set('x-session-key', sessionKey);
    const itemId  = carrito.body.items[0].r_item_id;

    const res = await request(app)
      .put(`/api/carrito/${itemId}`)
      .set('x-session-key', sessionKey)
      .send({ cantidad: 0 });

    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
  });

  test('GET /id devuelve el carrito_id activo', async () => {
    const res = await request(app)
      .get('/api/carrito/id')
      .set('x-session-key', sessionKey);

    expect(res.status).toBe(200);
    expect(res.body.carrito_id).toBeTruthy();
  });

  test('POST /fusionar fusiona carrito anónimo al usuario autenticado', async () => {
    const fusionKey = 'fusion-key-' + Date.now();
    await request(app)
      .post('/api/carrito/agregar')
      .set('x-session-key', fusionKey)
      .send({ producto_id: productoId, cantidad: 1 });

    const res = await request(app)
      .post('/api/carrito/fusionar')
      .set('Authorization', `Bearer ${token}`)
      .set('x-session-key', fusionKey);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  test('DELETE /:item_id elimina un item del carrito', async () => {
    // Añadir un item limpio con sesión propia
    const delKey = 'del-session-' + Date.now();
    await request(app)
      .post('/api/carrito/agregar')
      .set('x-session-key', delKey)
      .send({ producto_id: productoId, cantidad: 1 });

    const carrito = await request(app).get('/api/carrito').set('x-session-key', delKey);
    const itemId  = carrito.body.items[0].r_item_id;

    const res = await request(app)
      .delete(`/api/carrito/${itemId}`)
      .set('x-session-key', delKey);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    const vacio = await request(app).get('/api/carrito').set('x-session-key', delKey);
    expect(vacio.body.items.length).toBe(0);
  });
});

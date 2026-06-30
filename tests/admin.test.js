const request = require('supertest');
const app = require('../src/app');
const { pool } = require('../src/config/db');

describe('API Admin (/api/admin)', () => {
  let tokenCliente;
  let tokenAdmin;

  beforeAll(async () => {
    // Cuenta de cliente normal (sin permisos de admin)
    const email = `cliente_test_${Date.now()}@mbs.mx`;
    const registroRes = await request(app).post('/api/auth/registro').send({
      nombre: 'Cliente',
      apellidos: 'Test',
      email,
      password: 'Test1234'
    });
    tokenCliente = registroRes.body.token;

    // Cuenta de administrador (seed de 03_seed_data.sql)
    const loginRes = await request(app).post('/api/auth/login').send({
      email: 'admin@mbs.mx',
      password: 'Admin@MBS2025'
    });
    tokenAdmin = loginRes.body.token;
  });

  afterAll(async () => {
    await pool.end();
  });

  test('GET /dashboard sin token devuelve 401', async () => {
    const res = await request(app).get('/api/admin/dashboard');

    expect(res.status).toBe(401);
    expect(res.body.ok).toBe(false);
  });

  test('GET /dashboard con un cliente sin permisos devuelve 403', async () => {
    const res = await request(app)
      .get('/api/admin/dashboard')
      .set('Authorization', `Bearer ${tokenCliente}`);

    expect(res.status).toBe(403);
    expect(res.body.ok).toBe(false);
  });

  test('GET /dashboard con un admin devuelve los KPIs', async () => {
    expect(tokenAdmin).toBeTruthy();

    const res = await request(app)
      .get('/api/admin/dashboard')
      .set('Authorization', `Bearer ${tokenAdmin}`);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.kpis).toBeDefined();
    expect(Array.isArray(res.body.pedidos_recientes)).toBe(true);
  });

  // ── Clientes ──────────────────────────────────────────────────
  describe('Clientes', () => {
    let clienteId;

    test('GET /clientes devuelve lista paginada', async () => {
      const res = await request(app)
        .get('/api/admin/clientes')
        .set('Authorization', `Bearer ${tokenAdmin}`);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(Array.isArray(res.body.clientes)).toBe(true);
      expect(typeof res.body.total).toBe('number');
      clienteId = res.body.clientes[0]?.id;
    });

    test('GET /clientes/:id devuelve el detalle del cliente', async () => {
      if (!clienteId) return;

      const res = await request(app)
        .get(`/api/admin/clientes/${clienteId}`)
        .set('Authorization', `Bearer ${tokenAdmin}`);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.cliente).toBeDefined();
    });
  });

  // ── Pedidos ───────────────────────────────────────────────────
  describe('Pedidos', () => {
    let pedidoId;

    test('GET /pedidos/kpis devuelve KPIs de pedidos', async () => {
      const res = await request(app)
        .get('/api/admin/pedidos/kpis')
        .set('Authorization', `Bearer ${tokenAdmin}`);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });

    test('GET /pedidos devuelve lista paginada', async () => {
      const res = await request(app)
        .get('/api/admin/pedidos')
        .set('Authorization', `Bearer ${tokenAdmin}`);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(Array.isArray(res.body.pedidos)).toBe(true);
      pedidoId = res.body.pedidos[0]?.id;
    });

    test('GET /pedidos/:id devuelve el detalle del pedido', async () => {
      if (!pedidoId) return;

      const res = await request(app)
        .get(`/api/admin/pedidos/${pedidoId}`)
        .set('Authorization', `Bearer ${tokenAdmin}`);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });
  });

  // ── Inventario ────────────────────────────────────────────────
  describe('Inventario', () => {
    test('GET /inventario/alertas devuelve productos bajo stock mínimo', async () => {
      const res = await request(app)
        .get('/api/admin/inventario/alertas')
        .set('Authorization', `Bearer ${tokenAdmin}`);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(Array.isArray(res.body.alertas)).toBe(true);
    });
  });

  // ── Productos ─────────────────────────────────────────────────
  describe('Productos', () => {
    let productoId;

    test('GET /productos devuelve lista de productos', async () => {
      const res = await request(app)
        .get('/api/admin/productos')
        .set('Authorization', `Bearer ${tokenAdmin}`);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(Array.isArray(res.body.productos)).toBe(true);
      productoId = res.body.productos[0]?.id;
    });

    test('GET /productos/top devuelve productos más vendidos', async () => {
      const res = await request(app)
        .get('/api/admin/productos/top')
        .set('Authorization', `Bearer ${tokenAdmin}`);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(Array.isArray(res.body.productos)).toBe(true);
    });

    test('POST /productos crea un nuevo producto', async () => {
      const uniqueSku = `TEST-ADMIN-${Date.now()}`;
      const res = await request(app)
        .post('/api/admin/productos')
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send({
          sku:           uniqueSku,
          nombre:        `Producto de Test Admin ${uniqueSku}`,
          descripcion_corta: 'Descripción corta de prueba',
          categoria_id:  1,
          precio_venta:  99.99,
          stock_actual:  10,
          stock_minimo:  2,
          estado:        'activo',
        });

      expect(res.status).toBe(201);
      expect(res.body.ok).toBe(true);
      expect(res.body.producto_id).toBeTruthy();
      productoId = res.body.producto_id;
    });

    test('PUT /productos/:id actualiza el producto', async () => {
      if (!productoId) return;

      const putSku = `TEST-ADMIN-PUT-${Date.now()}`;
      const res = await request(app)
        .put(`/api/admin/productos/${productoId}`)
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send({
          sku:          putSku,
          nombre:       `Producto de Test Admin Editado ${putSku}`,
          precio_venta: 129.99,
          stock_actual: 15,
          stock_minimo: 2,
          categoria_id: 1,
          estado:       'activo',
        });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });

    test('PUT /productos/:id/estado cambia el estado', async () => {
      if (!productoId) return;

      const res = await request(app)
        .put(`/api/admin/productos/${productoId}/estado`)
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send({ estado: 'inactivo' });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });
  });

  // ── Categorías y Marcas ───────────────────────────────────────
  describe('Categorías y Marcas', () => {
    test('POST /categorias crea una categoría', async () => {
      const res = await request(app)
        .post('/api/admin/categorias')
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send({ nombre: `Cat Test ${Date.now()}`, descripcion: 'Prueba', activa: true });

      expect(res.status).toBe(201);
      expect(res.body.ok).toBe(true);
      expect(res.body.id).toBeTruthy();
    });

    test('POST /marcas crea una marca', async () => {
      const res = await request(app)
        .post('/api/admin/marcas')
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send({ nombre: `Marca Test ${Date.now()}`, activa: true });

      expect(res.status).toBe(201);
      expect(res.body.ok).toBe(true);
      expect(res.body.id).toBeTruthy();
    });
  });

  // ── Métodos de envío ──────────────────────────────────────────
  describe('Métodos de envío', () => {
    let envioId;

    test('GET /envios devuelve la lista de métodos', async () => {
      const res = await request(app)
        .get('/api/admin/envios')
        .set('Authorization', `Bearer ${tokenAdmin}`);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(Array.isArray(res.body.metodos)).toBe(true);
      envioId = res.body.metodos[0]?.id;
    });

    test('PUT /envios/:id/activo alterna el estado activo', async () => {
      if (!envioId) return;

      const res = await request(app)
        .put(`/api/admin/envios/${envioId}/activo`)
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send({ activo: true });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });
  });

  // ── Métodos de pago ───────────────────────────────────────────
  describe('Métodos de pago', () => {
    let pagoMetodoId;

    test('GET /pagos-metodos devuelve la lista', async () => {
      const res = await request(app)
        .get('/api/admin/pagos-metodos')
        .set('Authorization', `Bearer ${tokenAdmin}`);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(Array.isArray(res.body.metodos)).toBe(true);
      pagoMetodoId = res.body.metodos[0]?.id;
    });

    test('PUT /pagos-metodos/:id/activo alterna el estado activo', async () => {
      if (!pagoMetodoId) return;

      const res = await request(app)
        .put(`/api/admin/pagos-metodos/${pagoMetodoId}/activo`)
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send({ activo: true });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });
  });

  // ── Mensajes de contacto ──────────────────────────────────────
  describe('Mensajes', () => {
    let mensajeId;

    test('GET /mensajes devuelve lista de mensajes', async () => {
      const res = await request(app)
        .get('/api/admin/mensajes')
        .set('Authorization', `Bearer ${tokenAdmin}`);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(Array.isArray(res.body.mensajes)).toBe(true);
      mensajeId = res.body.mensajes[0]?.id;
    });

    test('PUT /mensajes/:id/leido marca el mensaje como leído', async () => {
      if (!mensajeId) return;

      const res = await request(app)
        .put(`/api/admin/mensajes/${mensajeId}/leido`)
        .set('Authorization', `Bearer ${tokenAdmin}`);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });
  });

  // ── Configuración ─────────────────────────────────────────────
  describe('Configuración', () => {
    test('GET /configuracion devuelve la configuración actual', async () => {
      const res = await request(app)
        .get('/api/admin/configuracion')
        .set('Authorization', `Bearer ${tokenAdmin}`);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.configuracion).toBeDefined();
    });
  });

  // ── Notificaciones admin ──────────────────────────────────────
  describe('Notificaciones', () => {
    test('GET /notificaciones devuelve lista', async () => {
      const res = await request(app)
        .get('/api/admin/notificaciones')
        .set('Authorization', `Bearer ${tokenAdmin}`);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(Array.isArray(res.body.grupos)).toBe(true);
    });
  });

  // ── Admins ────────────────────────────────────────────────────
  describe('Admins', () => {
    test('GET /admins devuelve lista de administradores', async () => {
      const res = await request(app)
        .get('/api/admin/admins')
        .set('Authorization', `Bearer ${tokenAdmin}`);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(Array.isArray(res.body.admins)).toBe(true);
      expect(res.body.admins.length).toBeGreaterThan(0);
    });
  });
});

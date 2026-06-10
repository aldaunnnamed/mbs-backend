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
});

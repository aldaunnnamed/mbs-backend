const request = require('supertest');
const app = require('../src/app');
const { pool } = require('../src/config/db');

describe('API Auth (/api/auth)', () => {
  const email = `test_${Date.now()}@mbs.mx`;
  const password = 'Test1234';

  afterAll(async () => {
    await pool.end();
  });

  test('POST /registro crea una cuenta nueva', async () => {
    const res = await request(app).post('/api/auth/registro').send({
      nombre: 'Test',
      apellidos: 'Automatizado',
      email,
      password,
      telefono: '5512345678'
    });

    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(true);
    expect(res.body.token).toBeTruthy();
    expect(res.body.usuario.email).toBe(email);
  });

  test('POST /registro rechaza un email duplicado', async () => {
    const res = await request(app).post('/api/auth/registro').send({
      nombre: 'Test',
      apellidos: 'Automatizado',
      email,
      password,
      telefono: '5512345678'
    });

    expect(res.status).toBe(409);
    expect(res.body.ok).toBe(false);
  });

  test('POST /registro rechaza una contraseña débil', async () => {
    const res = await request(app).post('/api/auth/registro').send({
      nombre: 'Test',
      apellidos: 'Debil',
      email: `debil_${Date.now()}@mbs.mx`,
      password: 'abc12345' // sin mayúsculas
    });

    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
  });

  test('POST /login rechaza credenciales incorrectas', async () => {
    const res = await request(app).post('/api/auth/login').send({
      email,
      password: 'ContraseñaIncorrecta1'
    });

    expect(res.status).toBe(401);
    expect(res.body.ok).toBe(false);
  });

  test('POST /login devuelve un token con credenciales correctas', async () => {
    const res = await request(app).post('/api/auth/login').send({ email, password });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.token).toBeTruthy();
    expect(res.body.usuario.rol).toBe('cliente');
  });

  test('GET /perfil requiere token', async () => {
    const res = await request(app).get('/api/auth/perfil');

    expect(res.status).toBe(401);
    expect(res.body.ok).toBe(false);
  });

  test('GET /perfil devuelve los datos del usuario autenticado', async () => {
    const loginRes = await request(app).post('/api/auth/login').send({ email, password });
    const token = loginRes.body.token;

    const res = await request(app)
      .get('/api/auth/perfil')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.datos).toBeDefined();
  });
});

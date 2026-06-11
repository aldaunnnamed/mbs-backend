const request = require('supertest');
const app = require('../src/app');
const { pool } = require('../src/config/db');

afterAll(async () => {
  await pool.end();
});

describe('API Auth (/api/auth)', () => {
  const email = `test_${Date.now()}@mbs.mx`;
  const password = 'Test1234';

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

describe('POST /api/auth/recuperar', () => {
  const email = `test_recuperar_${Date.now()}@mbs.mx`;

  beforeAll(async () => {
    await request(app).post('/api/auth/registro').send({
      nombre: 'Test',
      apellidos: 'Recuperar',
      email,
      password: 'Original1',
      telefono: '5512345678'
    });
  });

  test('rechaza solicitud sin email', async () => {
    const res = await request(app).post('/api/auth/recuperar').send({});

    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
  });

  test('responde con mensaje genérico para email no registrado', async () => {
    const res = await request(app).post('/api/auth/recuperar').send({ email: `no_existe_${Date.now()}@mbs.mx` });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  test('genera un token de recuperación para un email registrado', async () => {
    const res = await request(app).post('/api/auth/recuperar').send({ email });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    const r = await pool.query(
      `SELECT pr.token FROM password_resets pr
       JOIN usuarios u ON u.id = pr.usuario_id
       WHERE u.email = $1`,
      [email]
    );

    expect(r.rows.length).toBe(1);
    expect(r.rows[0].token).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe('POST /api/auth/reset-password', () => {
  test('rechaza contraseña débil', async () => {
    const res = await request(app).post('/api/auth/reset-password').send({ token: 'cualquier-token', password: 'abc' });

    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
  });

  test('rechaza un token inválido o expirado', async () => {
    const res = await request(app).post('/api/auth/reset-password').send({ token: 'token-invalido', password: 'NuevaPass1' });

    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
  });

  test('actualiza la contraseña con un token válido', async () => {
    const recoverEmail = `test_reset_${Date.now()}@mbs.mx`;
    await request(app).post('/api/auth/registro').send({
      nombre: 'Test',
      apellidos: 'Reset',
      email: recoverEmail,
      password: 'Original1',
      telefono: '5512345678'
    });

    await request(app).post('/api/auth/recuperar').send({ email: recoverEmail });

    const r = await pool.query(
      `SELECT pr.token FROM password_resets pr
       JOIN usuarios u ON u.id = pr.usuario_id
       WHERE u.email = $1`,
      [recoverEmail]
    );
    const token = r.rows[0].token;

    const nuevaPassword = 'NuevaPass1';
    const res = await request(app).post('/api/auth/reset-password').send({ token, password: nuevaPassword });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    const loginRes = await request(app).post('/api/auth/login').send({ email: recoverEmail, password: nuevaPassword });
    expect(loginRes.status).toBe(200);
    expect(loginRes.body.ok).toBe(true);

    const reuseRes = await request(app).post('/api/auth/reset-password').send({ token, password: 'OtraPass2' });
    expect(reuseRes.status).toBe(400);
    expect(reuseRes.body.ok).toBe(false);
  });
});

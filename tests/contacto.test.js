const request = require('supertest');
const app     = require('../src/app');
const { pool } = require('../src/config/db');

describe('API Contacto (/api/contacto)', () => {
  afterAll(async () => { await pool.end(); });

  const payload = {
    nombre: 'Tester Automático',
    email:  'contacto_test@mbs.mx',
    asunto: 'Prueba automática',
    mensaje: 'Este es un mensaje de prueba enviado por el suite de tests.',
  };

  test('POST / guarda un mensaje correctamente', async () => {
    const res = await request(app).post('/api/contacto').send(payload);

    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(true);
    expect(res.body.mensaje).toBeTruthy();
  });

  test('POST / rechaza si falta el nombre', async () => {
    const res = await request(app)
      .post('/api/contacto')
      .send({ ...payload, nombre: '' });

    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
  });

  test('POST / rechaza si falta el email', async () => {
    const res = await request(app)
      .post('/api/contacto')
      .send({ ...payload, email: '' });

    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
  });

  test('POST / rechaza si falta el mensaje', async () => {
    const res = await request(app)
      .post('/api/contacto')
      .send({ ...payload, mensaje: '' });

    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
  });

  test('POST / rechaza si falta el asunto', async () => {
    const res = await request(app)
      .post('/api/contacto')
      .send({ ...payload, asunto: '' });

    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
  });

  test('POST / rechaza email con formato inválido', async () => {
    const res = await request(app)
      .post('/api/contacto')
      .send({ ...payload, email: 'no-es-un-email' });

    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
  });
});

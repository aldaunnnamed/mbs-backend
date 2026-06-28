const request = require('supertest');
const app     = require('../src/app');
const { pool } = require('../src/config/db');

describe('API Reseñas (/api/productos/:id/resenas)', () => {
  let token;
  let productoId;

  beforeAll(async () => {
    const email = `resenas_test_${Date.now()}@mbs.mx`;
    const reg = await request(app).post('/api/auth/registro').send({
      nombre: 'Resenas', apellidos: 'Test', email, password: 'Test1234',
    });
    token = reg.body.token;

    const prod = await request(app).get('/api/productos/cable-fo-monomodo-sc-upc-3mm');
    productoId = prod.body.producto.r_id;
  });

  afterAll(async () => { await pool.end(); });

  test('GET /:id/resenas devuelve lista (puede estar vacía)', async () => {
    const res = await request(app).get(`/api/productos/${productoId}/resenas`);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(Array.isArray(res.body.resenas)).toBe(true);
    expect(typeof res.body.total).toBe('number');
  });

  test('POST /:id/resenas requiere autenticación', async () => {
    const res = await request(app)
      .post(`/api/productos/${productoId}/resenas`)
      .send({ calificacion: 5, comentario: 'Excelente producto, funciona perfectamente' });

    expect(res.status).toBe(401);
    expect(res.body.ok).toBe(false);
  });

  test('POST /:id/resenas rechaza calificación inválida (fuera de 1-5)', async () => {
    const res = await request(app)
      .post(`/api/productos/${productoId}/resenas`)
      .set('Authorization', `Bearer ${token}`)
      .send({ calificacion: 6, comentario: 'Buen producto en general' });

    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
    expect(res.body.mensaje).toMatch(/calificaci/i);
  });

  test('POST /:id/resenas rechaza calificación faltante', async () => {
    const res = await request(app)
      .post(`/api/productos/${productoId}/resenas`)
      .set('Authorization', `Bearer ${token}`)
      .send({ comentario: 'Buen producto en general' });

    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
  });

  test('POST /:id/resenas rechaza comentario demasiado corto (< 10 chars)', async () => {
    const res = await request(app)
      .post(`/api/productos/${productoId}/resenas`)
      .set('Authorization', `Bearer ${token}`)
      .send({ calificacion: 4, comentario: 'Bien' });

    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
    expect(res.body.mensaje).toMatch(/comentario|10/i);
  });

  test('POST /:id/resenas crea reseña válida correctamente', async () => {
    const res = await request(app)
      .post(`/api/productos/${productoId}/resenas`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        calificacion: 5,
        titulo: 'Excelente fibra óptica',
        comentario: 'Muy buena calidad, llegó rápido y funciona perfectamente.',
      });

    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(true);
    expect(res.body.mensaje).toMatch(/rese/i);
    expect(typeof res.body.verificado).toBe('boolean');
    expect(res.body.verificado).toBe(false); // usuario de prueba sin pedido pagado
  });

  test('GET /:id/resenas ahora muestra la reseña publicada', async () => {
    const res = await request(app).get(`/api/productos/${productoId}/resenas`);

    expect(res.status).toBe(200);
    expect(res.body.total).toBeGreaterThan(0);
    expect(res.body.resenas.length).toBeGreaterThan(0);
  });

  test('POST /:id/resenas rechaza segunda reseña del mismo usuario (409)', async () => {
    const res = await request(app)
      .post(`/api/productos/${productoId}/resenas`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        calificacion: 3,
        comentario: 'Segundo intento de reseña que no debería crearse.',
      });

    expect(res.status).toBe(409);
    expect(res.body.ok).toBe(false);
    expect(res.body.mensaje).toMatch(/ya publicaste/i);
  });

  test('POST /:id/resenas devuelve 404 para producto inexistente', async () => {
    const res = await request(app)
      .post('/api/productos/99999999/resenas')
      .set('Authorization', `Bearer ${token}`)
      .send({ calificacion: 4, comentario: 'Comentario de prueba para producto fantasma.' });

    expect(res.status).toBe(404);
    expect(res.body.ok).toBe(false);
  });
});

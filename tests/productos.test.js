const request = require('supertest');
const app = require('../src/app');
const { pool } = require('../src/config/db');

describe('API Productos (/api/productos)', () => {
  afterAll(async () => {
    await pool.end();
  });

  test('GET / devuelve un listado de productos', async () => {
    const res = await request(app).get('/api/productos');

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(Array.isArray(res.body.productos)).toBe(true);
    expect(res.body.productos.length).toBeGreaterThan(0);
  });

  test('GET / soporta paginación y búsqueda', async () => {
    const res = await request(app).get('/api/productos').query({ pagina: 1, por_pagina: 2, busqueda: 'cable' });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.productos.length).toBeLessThanOrEqual(2);
  });

  test('GET /marcas devuelve las marcas activas', async () => {
    const res = await request(app).get('/api/productos/marcas');

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(Array.isArray(res.body.marcas)).toBe(true);
  });

  test('GET /:slug devuelve el detalle de un producto existente', async () => {
    const lista = await request(app).get('/api/productos');
    const slug = lista.body.productos[0].r_slug;

    const res = await request(app).get(`/api/productos/${slug}`);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.producto.r_slug).toBe(slug);
    expect(Array.isArray(res.body.imagenes)).toBe(true);
    expect(Array.isArray(res.body.specs)).toBe(true);
  });

  test('GET /:slug devuelve 404 si el producto no existe', async () => {
    const res = await request(app).get('/api/productos/producto-que-no-existe-xyz');

    expect(res.status).toBe(404);
    expect(res.body.ok).toBe(false);
  });
});

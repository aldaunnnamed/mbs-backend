const request = require('supertest');
const app     = require('../src/app');
const { pool } = require('../src/config/db');

describe('API Usuarios (/api/usuarios)', () => {
  let token;
  let productoId;
  let direccionId;

  beforeAll(async () => {
    const email = `usuarios_test_${Date.now()}@mbs.mx`;
    const reg = await request(app).post('/api/auth/registro').send({
      nombre: 'Usuarios', apellidos: 'Test', email, password: 'Test1234',
    });
    token = reg.body.token;

    const prod = await request(app).get('/api/productos/cable-fo-monomodo-sc-upc-3mm');
    productoId = prod.body.producto.r_id;
  });

  afterAll(async () => { await pool.end(); });

  // ── Direcciones ───────────────────────────────────────────────
  describe('Direcciones', () => {
    test('GET /direcciones devuelve lista vacía para usuario nuevo', async () => {
      const res = await request(app)
        .get('/api/usuarios/direcciones')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(Array.isArray(res.body.direcciones)).toBe(true);
    });

    test('POST /direcciones crea una dirección', async () => {
      const res = await request(app)
        .post('/api/usuarios/direcciones')
        .set('Authorization', `Bearer ${token}`)
        .send({
          alias: 'Casa', nombre: 'Test', apellidos: 'Usuario',
          calle_numero: 'Calle Falsa #123', colonia: 'Centro',
          ciudad: 'CDMX', estado: 'CDMX', cp: '01000',
          telefono: '5512345678', es_predeterminada: true,
        });

      expect(res.status).toBe(201);
      expect(res.body.ok).toBe(true);
      expect(res.body.id).toBeTruthy();
      direccionId = res.body.id;
    });

    test('GET /direcciones devuelve la dirección recién creada', async () => {
      const res = await request(app)
        .get('/api/usuarios/direcciones')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.direcciones.length).toBeGreaterThan(0);
      expect(res.body.direcciones[0].es_predeterminada).toBe(true);
    });

    test('PUT /direcciones/:id actualiza la dirección', async () => {
      expect(direccionId).toBeTruthy();

      const res = await request(app)
        .put(`/api/usuarios/direcciones/${direccionId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          alias: 'Trabajo', nombre: 'Test', apellidos: 'Usuario',
          calle_numero: 'Av. Actualizada #456', colonia: 'Roma Norte',
          ciudad: 'CDMX', estado: 'CDMX', cp: '06600',
        });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });

    test('DELETE /direcciones/:id elimina la dirección', async () => {
      expect(direccionId).toBeTruthy();

      const res = await request(app)
        .delete(`/api/usuarios/direcciones/${direccionId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);

      const lista = await request(app)
        .get('/api/usuarios/direcciones')
        .set('Authorization', `Bearer ${token}`);
      expect(lista.body.direcciones.find(d => d.id === direccionId)).toBeUndefined();
    });
  });

  // ── Favoritos ─────────────────────────────────────────────────
  describe('Favoritos', () => {
    test('GET /favoritos devuelve lista vacía para usuario nuevo', async () => {
      const res = await request(app)
        .get('/api/usuarios/favoritos')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(Array.isArray(res.body.favoritos)).toBe(true);
    });

    test('POST /favoritos/:id agrega un producto a favoritos', async () => {
      const res = await request(app)
        .post(`/api/usuarios/favoritos/${productoId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.accion).toBe('agregado');
    });

    test('GET /favoritos muestra el producto añadido', async () => {
      const res = await request(app)
        .get('/api/usuarios/favoritos')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.favoritos.length).toBeGreaterThan(0);
    });

    test('POST /favoritos/:id (toggle) elimina el favorito ya existente', async () => {
      const res = await request(app)
        .post(`/api/usuarios/favoritos/${productoId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.accion).toBe('eliminado');
    });

    test('POST /favoritos/:id requiere autenticación', async () => {
      const res = await request(app)
        .post(`/api/usuarios/favoritos/${productoId}`);

      expect(res.status).toBe(401);
    });
  });

  // ── Notificaciones ────────────────────────────────────────────
  describe('Notificaciones', () => {
    test('GET /notificaciones devuelve lista para usuario autenticado', async () => {
      const res = await request(app)
        .get('/api/usuarios/notificaciones')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(Array.isArray(res.body.notificaciones)).toBe(true);
    });

    test('PUT /notificaciones/todas/leidas marca todas como leídas', async () => {
      const res = await request(app)
        .put('/api/usuarios/notificaciones/todas/leidas')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });

    test('GET /notificaciones requiere autenticación', async () => {
      const res = await request(app).get('/api/usuarios/notificaciones');

      expect(res.status).toBe(401);
    });
  });
});

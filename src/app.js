require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const morgan  = require('morgan');
const path    = require('path');

const app = express();

// ── Middlewares globales ──────────────────────────────────────
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Archivos estáticos (CSS, JS, IMG) ────────────────────────
app.use(express.static(path.join(__dirname, '../public')));
app.use('/uploads', express.static(path.join(__dirname, '../public/uploads')));

// ── Rutas API ─────────────────────────────────────────────────
app.use('/api/auth',      require('./routes/auth.routes'));
app.use('/api/productos', require('./routes/productos.routes'));
app.use('/api/carrito',   require('./routes/carrito.routes'));
app.use('/api/pedidos',   require('./routes/pedidos.routes'));
app.use('/api/usuarios',  require('./routes/usuarios.routes'));
app.use('/api/admin',     require('./routes/admin.routes'));
app.use('/api/pagos',     require('./routes/pagos.routes'));
app.use('/api/contacto',  require('./routes/contacto.routes'));

// GET /api/config/publica — configuración pública (redes sociales, datos de contacto)
app.get('/api/config/publica', async (req, res) => {
  try {
    const { query } = require('./config/db');
    const claves = ['sitio_nombre','contacto_whatsapp','contacto_telefono','contacto_email',
                    'social_facebook','social_instagram','social_linkedin'];
    const result = await query(
      'SELECT clave, valor FROM configuracion WHERE clave = ANY($1::varchar[])',
      [claves]
    );
    res.json({ ok: true, configuracion: result.rows });
  } catch { res.json({ ok: false, configuracion: [] }); }
});

// ── Rutas HTML explícitas del cliente ─────────────────────────
const pages = [
  'catalogo', 'producto', 'carrito',
  'checkout', 'mi-cuenta', 'mis-pedidos',
  'login', 'registro', 'contacto', 'recuperar-password',
  'sobre-nosotros', 'faq', 'politica-envios', 'garantia', 'privacidad', 'terminos',
  'reset-password', 'paypal-retorno'
];
pages.forEach(page => {
  app.get('/pages/' + page + '.html', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/pages/' + page + '.html'));
  });
});

// ── Rutas Admin ───────────────────────────────────────────────
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/admin/index.html'));
});
app.get('/admin/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/admin/index.html'));
});
['login','productos','pedidos','clientes','inventario','mensajes','configuracion'].forEach(page => {
  app.get('/admin/' + page, (req, res) => {
    res.sendFile(path.join(__dirname, '../public/admin/' + page + '.html'));
  });
});

// ── Ruta raíz → Home ──────────────────────────────────────────
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// ── Cualquier otra ruta desconocida → Home ────────────────────
// Solo aplica si NO es /api/ ni /pages/ ni un archivo estático
app.get('*', (req, res) => {
  // Si la ruta pide un archivo estático que no existe → 404
  if (req.path.includes('.')) {
    return res.status(404).send('Archivo no encontrado');
  }
  // Cualquier otra ruta → Home
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// ── Manejador de errores global ───────────────────────────────
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    ok: false,
    mensaje: err.message || 'Error interno del servidor'
  });
});

// ── Iniciar servidor ──────────────────────────────────────────
// Solo escuchar si este archivo se ejecuta directamente (no al hacer require desde los tests)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log('Servidor MBS corriendo en http://localhost:' + PORT);
    console.log('Entorno:', process.env.NODE_ENV || 'development');
  });
}

module.exports = app;

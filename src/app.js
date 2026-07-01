require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const morgan  = require('morgan');
const path    = require('path');
const helmet  = require('helmet');

const app = express();

// ── Proxy trust (ngrok, Render, Railway, etc.) ────────────────
// Permite que req.protocol devuelva 'https' cuando el servidor está
// detrás de un reverse proxy que termina SSL (ngrok, load balancers).
app.set('trust proxy', 1);

// ── Middlewares globales ──────────────────────────────────────
app.use(helmet({
  // CSP desactivado aquí: las páginas HTML cargan scripts de CDN externos
  // (PayPal, Stripe) cuyas URLs varían; definir una política restrictiva
  // requeriría listar cada dominio de terceros por separado.
  contentSecurityPolicy: false,
  // crossOriginEmbedderPolicy bloquea recursos de terceros en iframes (e.g. widgets de PayPal)
  crossOriginEmbedderPolicy: false,
}));
app.use(cors());
app.use(morgan('dev'));

// ── Bypass ngrok browser warning para páginas HTML ───────────
// ngrok muestra una advertencia en el primer acceso de cada sesión.
// Enviar este header en todas las respuestas lo omite automáticamente.
app.use((req, res, next) => {
  res.setHeader('ngrok-skip-browser-warning', 'true');
  next();
});
// Stripe webhook necesita body raw para verificar la firma — va ANTES de express.json()
app.use('/api/pagos/stripe/webhook', express.raw({ type: 'application/json' }));
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
    const claves = ['sitio_nombre','slogan','telefono','whatsapp','email',
                    'direccion','facebook','instagram','linkedin','logo_url',
                    'horario_lv','horario_sab','horario_dom'];
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
  'reset-password', 'paypal-retorno',
  'checkout-ok', 'checkout-error', 'checkout-pendiente'
];
pages.forEach(page => {
  app.get('/pages/' + page + '.html', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/pages/' + page + '.html'));
  });
});

// ── Ruta directa para notificaciones de pedidos del cliente ───
// e.g. /mi-cuenta/pedidos/MBS-2026-000028  →  sirve mi-cuenta.html
// (el JS de la página detecta el número y abre el detalle automáticamente)
app.get('/mi-cuenta/pedidos/:numero', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/pages/mi-cuenta.html'));
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
    const appUrl = process.env.APP_URL || ('http://localhost:' + PORT);
    console.log('Servidor MBS corriendo en http://localhost:' + PORT);
    if (process.env.APP_URL) console.log('URL pública (ngrok/producción):', appUrl);
    console.log('Entorno:', process.env.NODE_ENV || 'development');
  });
}

module.exports = app;

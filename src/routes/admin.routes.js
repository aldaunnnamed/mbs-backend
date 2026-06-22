const router = require('express').Router();
const ctrl   = require('../controllers/admin.controller');
const { verificarToken, soloAdmin } = require('../middlewares/auth');
const { uploadImage, uploadCsv, uploadLogo } = require('../middlewares/upload');

// Todas las rutas admin requieren token + rol admin
router.use(verificarToken, soloAdmin);

// Dashboard
router.get('/dashboard',                    ctrl.dashboard);

// Notificaciones admin
router.get('/notificaciones',               ctrl.notificaciones);

// Clientes
router.get('/clientes/export',              ctrl.exportarClientes);
router.get('/clientes',                     ctrl.listarClientes);
router.get('/clientes/:id',                 ctrl.detalleCliente);
router.put('/clientes/:id/bloqueo',         ctrl.toggleBloqueo);

// Pedidos
router.get('/pedidos/kpis',                 ctrl.kpisPedidos);
router.get('/pedidos',                      ctrl.listarPedidos);
router.get('/pedidos/:id',                  ctrl.detallePedido);
router.put('/pedidos/:id/estado',           ctrl.actualizarEstadoPedido);

// Inventario
router.get('/inventario/alertas',           ctrl.alertasInventario);
router.put('/inventario/:id/stock',         ctrl.ajustarStock);

// Categorías y marcas (creación rápida desde modal de producto)
router.post('/categorias',                  ctrl.crearCategoria);
router.post('/marcas',                      ctrl.crearMarca);

// Productos
router.get ('/productos/top',               ctrl.topProductos);
router.get ('/productos/export',            ctrl.exportarProductos);
router.post('/productos/import',            uploadCsv.single('archivo'), ctrl.importarProductos);
router.get ('/productos',                   ctrl.listarProductos);
router.post('/productos',                   ctrl.guardarProducto);
router.put ('/productos/:id',               ctrl.guardarProducto);
router.put ('/productos/:id/estado',        ctrl.toggleEstadoProducto);
router.post('/productos/:id/imagenes',      uploadImage.single('imagen'), ctrl.subirImagenProducto);
router.delete('/productos/:id/imagenes/:img_id', ctrl.eliminarImagenProducto);

// Métodos de envío
router.get ('/envios',                      ctrl.listarMetodosEnvio);
router.post('/envios',                      ctrl.guardarMetodoEnvio);
router.put ('/envios/:id',                  ctrl.guardarMetodoEnvio);
router.put ('/envios/:id/activo',           ctrl.toggleMetodoEnvio);

// Configuración
router.get ('/configuracion',               ctrl.obtenerConfiguracion);
router.post('/configuracion',               ctrl.guardarConfiguracion);
router.post('/configuracion/notificaciones', ctrl.guardarConfigNotif);
router.post('/configuracion/logo',          uploadLogo.single('logo'), ctrl.subirLogo);

// Admins
router.get ('/admins',                      ctrl.listarAdmins);
router.post('/admins',                      ctrl.crearAdmin);

// Métodos de pago
router.get ('/pagos-metodos',               ctrl.listarMetodosPago);
router.put ('/pagos-metodos/:id/activo',    ctrl.toggleMetodoPago);

// Mensajes de contacto
router.get ('/mensajes',                    ctrl.listarMensajes);
router.put ('/mensajes/:id/leido',          ctrl.marcarMensajeLeido);

module.exports = router;

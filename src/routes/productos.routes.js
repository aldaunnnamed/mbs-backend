const router = require('express').Router();
const ctrl   = require('../controllers/productos.controller');
const { verificarToken } = require('../middlewares/auth');

router.get ('/',             ctrl.listar);
router.get ('/categorias',   ctrl.categorias);
router.get ('/marcas',       ctrl.marcas);
router.get ('/:id/resenas',  ctrl.resenas);
router.post('/:id/resenas',  verificarToken, ctrl.crearResena);
router.get ('/:slug',        ctrl.detalle);

module.exports = router;

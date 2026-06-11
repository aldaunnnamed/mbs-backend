const router = require('express').Router();
const ctrl   = require('../controllers/productos.controller');

router.get('/',            ctrl.listar);
router.get('/categorias',  ctrl.categorias);
router.get('/marcas',      ctrl.marcas);
router.get('/:id/resenas', ctrl.resenas);
router.get('/:slug',       ctrl.detalle);

module.exports = router;

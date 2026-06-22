const router   = require('express').Router();
const { query } = require('../config/db');
const { verificarToken } = require('../middlewares/auth');
const { uploadImage } = require('../middlewares/upload');

// POST /api/usuarios/foto — sube o actualiza foto de perfil
router.post('/foto', verificarToken, uploadImage.single('foto'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ ok: false, mensaje: 'No se recibió ninguna imagen' });
    const url = '/uploads/productos/' + req.file.filename;
    await query(
      'UPDATE usuarios SET avatar_url = $1 WHERE id = $2',
      [url, parseInt(req.usuario.id)]
    );
    res.json({ ok: true, mensaje: 'Foto actualizada', avatar_url: url });
  } catch (err) {
    console.error('foto perfil:', err.message);
    res.status(500).json({ ok: false, mensaje: 'Error al subir la foto' });
  }
});

router.get('/favoritos', verificarToken, async (req, res) => {
  try {
    const result = await query(
      'SELECT * FROM fn_listar_favoritos(CAST($1 AS INTEGER))',
      [parseInt(req.usuario.id)]
    );
    res.json({ ok: true, favoritos: result.rows });
  } catch (err) {
    res.status(500).json({ ok: false, mensaje: 'Error al obtener favoritos' });
  }
});

router.post('/favoritos/:producto_id', verificarToken, async (req, res) => {
  try {
    const result = await query(
      'SELECT fn_toggle_favorito(CAST($1 AS INTEGER), CAST($2 AS INTEGER))',
      [parseInt(req.usuario.id), parseInt(req.params.producto_id)]
    );
    const accion = result.rows[0].fn_toggle_favorito;
    res.json({ ok: true, accion, mensaje: accion === 'agregado' ? 'Agregado a favoritos' : 'Eliminado de favoritos' });
  } catch (err) {
    res.status(500).json({ ok: false, mensaje: 'Error al actualizar favorito' });
  }
});

router.get('/direcciones', verificarToken, async (req, res) => {
  try {
    const result = await query(
      'SELECT * FROM direcciones WHERE usuario_id = $1 ORDER BY es_predeterminada DESC',
      [parseInt(req.usuario.id)]
    );
    res.json({ ok: true, direcciones: result.rows });
  } catch (err) {
    res.status(500).json({ ok: false, mensaje: 'Error al obtener direcciones' });
  }
});

router.post('/direcciones', verificarToken, async (req, res) => {
  try {
    const { alias, nombre, apellidos, calle_numero, colonia, ciudad, estado, cp, telefono, es_predeterminada } = req.body;
    if (es_predeterminada) {
      await query('UPDATE direcciones SET es_predeterminada = FALSE WHERE usuario_id = $1', [parseInt(req.usuario.id)]);
    }
    const result = await query(
      'INSERT INTO direcciones (usuario_id, alias, nombre, apellidos, calle_numero, colonia, ciudad, estado, cp, telefono, es_predeterminada)' +
      ' VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id',
      [parseInt(req.usuario.id), alias || null, nombre || '', apellidos || '',
       calle_numero || '', colonia || '', ciudad || '', estado || '', cp || '',
       telefono || null, es_predeterminada ? true : false]
    );
    res.status(201).json({ ok: true, mensaje: 'Direccion guardada', id: result.rows[0].id });
  } catch (err) {
    res.status(500).json({ ok: false, mensaje: 'Error al guardar direccion' });
  }
});

router.put('/direcciones/:id', verificarToken, async (req, res) => {
  try {
    const { alias, nombre, apellidos, calle_numero, colonia, ciudad, estado, cp, telefono, es_predeterminada } = req.body;
    if (es_predeterminada) {
      await query('UPDATE direcciones SET es_predeterminada = FALSE WHERE usuario_id = $1', [parseInt(req.usuario.id)]);
    }
    await query(
      'UPDATE direcciones SET alias=$1, nombre=$2, apellidos=$3, calle_numero=$4,' +
      ' colonia=$5, ciudad=$6, estado=$7, cp=$8, telefono=$9, es_predeterminada=$10' +
      ' WHERE id=$11 AND usuario_id=$12',
      [alias || null, nombre || '', apellidos || '', calle_numero || '',
       colonia || '', ciudad || '', estado || '', cp || '',
       telefono || null, es_predeterminada ? true : false,
       parseInt(req.params.id), parseInt(req.usuario.id)]
    );
    res.json({ ok: true, mensaje: 'Dirección actualizada' });
  } catch (err) {
    res.status(500).json({ ok: false, mensaje: 'Error al actualizar dirección' });
  }
});

router.delete('/direcciones/:id', verificarToken, async (req, res) => {
  try {
    await query('DELETE FROM direcciones WHERE id = $1 AND usuario_id = $2', [parseInt(req.params.id), parseInt(req.usuario.id)]);
    res.json({ ok: true, mensaje: 'Direccion eliminada' });
  } catch (err) {
    res.status(500).json({ ok: false, mensaje: 'Error al eliminar direccion' });
  }
});

router.get('/notificaciones', verificarToken, async (req, res) => {
  try {
    const result = await query(
      'SELECT * FROM notificaciones WHERE usuario_id = $1 ORDER BY created_at DESC LIMIT 20',
      [parseInt(req.usuario.id)]
    );
    res.json({ ok: true, notificaciones: result.rows });
  } catch (err) {
    res.status(500).json({ ok: false, mensaje: 'Error al obtener notificaciones' });
  }
});

router.put('/notificaciones/todas/leidas', verificarToken, async (req, res) => {
  try {
    await query(
      'UPDATE notificaciones SET leida = TRUE WHERE usuario_id = $1',
      [parseInt(req.usuario.id)]
    );
    res.json({ ok: true, mensaje: 'Todas las notificaciones marcadas como leídas' });
  } catch (err) {
    console.error('notif todas leidas:', err.message);
    res.status(500).json({ ok: false, mensaje: 'Error al actualizar notificaciones' });
  }
});

router.put('/notificaciones/:id/leer', verificarToken, async (req, res) => {
  try {
    await query('UPDATE notificaciones SET leida = TRUE WHERE id = $1 AND usuario_id = $2',
      [parseInt(req.params.id), parseInt(req.usuario.id)]);
    res.json({ ok: true, mensaje: 'Notificacion marcada como leida' });
  } catch (err) {
    res.status(500).json({ ok: false, mensaje: 'Error al actualizar notificacion' });
  }
});

module.exports = router;

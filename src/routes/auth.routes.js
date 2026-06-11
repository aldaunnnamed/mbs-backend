const router = require('express').Router();
const ctrl   = require('../controllers/auth.controller');
const { verificarToken } = require('../middlewares/auth');
const { query } = require('../config/db');
const crypto = require('crypto');
const { enviarCorreoRecuperacion } = require('../services/email.service');

router.post('/registro',          ctrl.registro);
router.post('/login',             ctrl.login);
router.get ('/perfil',  verificarToken, ctrl.perfil);
router.put ('/perfil',  verificarToken, ctrl.actualizarPerfil);
router.put ('/password',verificarToken, ctrl.cambiarPassword);

// POST /api/auth/recuperar — solicita recuperación de contraseña
router.post('/recuperar', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ ok: false, mensaje: 'Email requerido' });

    const correo = email.trim().toLowerCase();
    const r = await query('SELECT id, nombre FROM usuarios WHERE email = $1 AND activo = true', [correo]);
    if (!r.rows.length) {
      // Respuesta genérica por seguridad
      return res.json({ ok: true, mensaje: 'Si el correo está registrado, recibirás instrucciones.' });
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expira = new Date(Date.now() + 2 * 60 * 60 * 1000); // 2 horas

    await query(
      'INSERT INTO password_resets (usuario_id, token, expira_at) VALUES ($1,$2,$3)' +
      ' ON CONFLICT (usuario_id) DO UPDATE SET token=$2, expira_at=$3, usado=false',
      [r.rows[0].id, token, expira]
    );

    const appUrl = (process.env.APP_URL || (req.protocol + '://' + req.get('host'))).replace(/\/$/, '');
    const resetUrl = appUrl + '/pages/reset-password.html?token=' + token;

    enviarCorreoRecuperacion({ to: correo, nombre: r.rows[0].nombre, resetUrl })
      .catch(err => console.error('enviarCorreoRecuperacion:', err.message));

    res.json({ ok: true, mensaje: 'Si el correo está registrado, recibirás instrucciones.' });
  } catch (err) {
    if (err.code === '42P01') {
      return res.json({ ok: true, mensaje: 'Si el correo está registrado, recibirás instrucciones.' });
    }
    console.error('recuperar password:', err.message);
    res.status(500).json({ ok: false, mensaje: 'Error al procesar la solicitud' });
  }
});

// POST /api/auth/reset-password — aplica nueva contraseña con token
router.post('/reset-password', async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) {
      return res.status(400).json({ ok: false, mensaje: 'Token y contraseña requeridos' });
    }
    if (password.length < 8) {
      return res.status(400).json({ ok: false, mensaje: 'La contraseña debe tener mínimo 8 caracteres' });
    }
    if (!/[A-Z]/.test(password)) {
      return res.status(400).json({ ok: false, mensaje: 'La contraseña debe incluir al menos una mayúscula' });
    }
    if (!/[0-9]/.test(password)) {
      return res.status(400).json({ ok: false, mensaje: 'La contraseña debe incluir al menos un número' });
    }

    const r = await query(
      'SELECT usuario_id FROM password_resets WHERE token = $1 AND expira_at > NOW() AND usado = false',
      [token]
    );
    if (!r.rows.length) {
      return res.status(400).json({ ok: false, mensaje: 'El enlace es inválido o ha expirado. Solicita uno nuevo.' });
    }

    const bcrypt = require('bcryptjs');
    const hash = await bcrypt.hash(password, 12);
    const uid  = r.rows[0].usuario_id;

    await query('UPDATE usuarios SET password_hash = $1 WHERE id = $2', [hash, uid]);
    await query('UPDATE password_resets SET usado = true WHERE usuario_id = $1', [uid]);

    res.json({ ok: true, mensaje: 'Contraseña actualizada correctamente. Ya puedes iniciar sesión.' });
  } catch (err) {
    if (err.code === '42P01') {
      return res.status(503).json({ ok: false, mensaje: 'Función no disponible aún. Contacta al soporte.' });
    }
    console.error('reset-password:', err.message);
    res.status(500).json({ ok: false, mensaje: 'Error al actualizar la contraseña' });
  }
});

module.exports = router;

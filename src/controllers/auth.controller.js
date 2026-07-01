const { query }  = require('../config/db');
const bcrypt     = require('bcryptjs');
const jwt        = require('jsonwebtoken');

// POST /api/auth/registro
const registro = async (req, res) => {
  try {
    const { nombre, apellidos, email, password, telefono, tipo } = req.body;
    if (!nombre || !apellidos || !email || !password) {
      return res.status(400).json({ ok: false, mensaje: 'Faltan campos obligatorios' });
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
    const hash = await bcrypt.hash(password, 12);
    const result = await query(
      'SELECT * FROM fn_registrar_usuario(' +
      'CAST($1 AS CHARACTER VARYING), CAST($2 AS CHARACTER VARYING),' +
      'CAST($3 AS CHARACTER VARYING), CAST($4 AS CHARACTER VARYING),' +
      'CAST($5 AS CHARACTER VARYING), CAST($6 AS CHARACTER VARYING))',
      [nombre, apellidos, email, hash, telefono || null, tipo || 'particular']
    );
    const fila = result.rows[0];
    if (fila.r_usuario_id === 0) {
      return res.status(409).json({ ok: false, mensaje: fila.r_mensaje });
    }
    const token = jwt.sign(
      { id: fila.r_usuario_id, email, rol: 'cliente' },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );
    res.status(201).json({
      ok: true, mensaje: 'Cuenta creada exitosamente', token,
      usuario: { id: fila.r_usuario_id, nombre, apellidos, email, rol: 'cliente' }
    });
  } catch (err) {
    console.error('registro:', err.message);
    res.status(500).json({ ok: false, mensaje: 'Error al crear la cuenta' });
  }
};

// POST /api/auth/login
const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ ok: false, mensaje: 'Email y contrasena requeridos' });
    }
    const result = await query(
      'SELECT id, nombre, apellidos, email, password_hash, rol, activo, bloqueado, avatar_url FROM usuarios WHERE email = $1',
      [email]
    );
    if (!result.rows.length) {
      return res.status(401).json({ ok: false, mensaje: 'Credenciales incorrectas' });
    }
    const u = result.rows[0];
    if (!u.activo)   return res.status(403).json({ ok: false, mensaje: 'Cuenta desactivada' });
    if (u.bloqueado) return res.status(403).json({ ok: false, mensaje: 'Cuenta bloqueada. Contacta soporte.' });
    const ok = await bcrypt.compare(password, u.password_hash);
    if (!ok) return res.status(401).json({ ok: false, mensaje: 'Credenciales incorrectas' });
    await query('UPDATE usuarios SET ultimo_login = NOW() WHERE id = $1', [u.id]);
    const token = jwt.sign(
      { id: u.id, email: u.email, rol: u.rol },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );
    res.json({
      ok: true, mensaje: 'Login exitoso', token,
      usuario: { id: u.id, nombre: u.nombre, apellidos: u.apellidos, email: u.email, rol: u.rol, foto_url: u.avatar_url || null }
    });
  } catch (err) {
    console.error('login:', err.message);
    res.status(500).json({ ok: false, mensaje: 'Error al iniciar sesion' });
  }
};

// GET /api/auth/perfil
const perfil = async (req, res) => {
  try {
    const result = await query(
      'SELECT * FROM fn_obtener_perfil_cliente(CAST($1 AS INTEGER))',
      [parseInt(req.usuario.id)]
    );
    if (!result.rows.length) {
      return res.status(404).json({ ok: false, mensaje: 'Usuario no encontrado' });
    }
    res.json({ ok: true, datos: result.rows[0] });
  } catch (err) {
    console.error('perfil:', err.message);
    res.status(500).json({ ok: false, mensaje: 'Error al obtener perfil' });
  }
};

// PUT /api/auth/password
const cambiarPassword = async (req, res) => {
  try {
    const { password_actual, password_nueva } = req.body;
    if (!password_actual || !password_nueva) {
      return res.status(400).json({ ok: false, mensaje: 'Contraseña actual y nueva requeridas' });
    }
    if (password_nueva.length < 8) {
      return res.status(400).json({ ok: false, mensaje: 'La nueva contraseña debe tener mínimo 8 caracteres' });
    }
    const result = await query(
      'SELECT password_hash FROM usuarios WHERE id = $1',
      [parseInt(req.usuario.id)]
    );
    if (!result.rows.length) {
      return res.status(404).json({ ok: false, mensaje: 'Usuario no encontrado' });
    }
    const match = await bcrypt.compare(password_actual, result.rows[0].password_hash);
    if (!match) {
      return res.status(401).json({ ok: false, mensaje: 'La contraseña actual es incorrecta' });
    }
    const hash = await bcrypt.hash(password_nueva, 12);
    await query('UPDATE usuarios SET password_hash = $1 WHERE id = $2', [hash, parseInt(req.usuario.id)]);
    res.json({ ok: true, mensaje: 'Contraseña actualizada correctamente' });
  } catch (err) {
    console.error('cambiarPassword:', err.message);
    res.status(500).json({ ok: false, mensaje: 'Error al cambiar contraseña' });
  }
};

// PUT /api/auth/perfil
const actualizarPerfil = async (req, res) => {
  try {
    const { nombre, apellidos, telefono, rfc, razon_social } = req.body;
    await query(
      'SELECT fn_actualizar_datos_personales(' +
      'CAST($1 AS INTEGER), CAST($2 AS CHARACTER VARYING), CAST($3 AS CHARACTER VARYING),' +
      'CAST($4 AS CHARACTER VARYING), CAST($5 AS CHARACTER VARYING), CAST($6 AS CHARACTER VARYING))',
      [parseInt(req.usuario.id), nombre, apellidos,
       telefono || null, rfc || null, razon_social || null]
    );
    res.json({ ok: true, mensaje: 'Perfil actualizado correctamente' });
  } catch (err) {
    console.error('actualizarPerfil:', err.message);
    res.status(500).json({ ok: false, mensaje: 'Error al actualizar perfil' });
  }
};

module.exports = { registro, login, perfil, actualizarPerfil, cambiarPassword };

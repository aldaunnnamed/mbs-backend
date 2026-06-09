const jwt = require('jsonwebtoken');

// Verifica que el token JWT sea válido
const verificarToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ ok: false, mensaje: 'Token requerido' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.usuario = decoded; // { id, email, rol }
    next();
  } catch (err) {
    return res.status(403).json({ ok: false, mensaje: 'Token inválido o expirado' });
  }
};

// Solo permite acceso a admins y superadmins
const soloAdmin = (req, res, next) => {
  if (!req.usuario || !['admin', 'superadmin'].includes(req.usuario.rol)) {
    return res.status(403).json({ ok: false, mensaje: 'Acceso denegado' });
  }
  next();
};

// Token opcional — no falla si no hay token, solo agrega el usuario si existe
const tokenOpcional = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (token) {
    try {
      req.usuario = jwt.verify(token, process.env.JWT_SECRET);
    } catch (_) {
      req.usuario = null;
    }
  }
  next();
};

module.exports = { verificarToken, soloAdmin, tokenOpcional };

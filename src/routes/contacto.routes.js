const router = require('express').Router();
const { query } = require('../config/db');

// POST /api/contacto — guarda mensaje del formulario de contacto
router.post('/', async (req, res) => {
  try {
    const { nombre, empresa, email, telefono, asunto, mensaje } = req.body;
    if (!nombre || !email || !asunto || !mensaje) {
      return res.status(400).json({ ok: false, mensaje: 'nombre, email, asunto y mensaje son requeridos' });
    }
    await query(
      'INSERT INTO mensajes_contacto (nombre, empresa, email, telefono, asunto, mensaje)' +
      ' VALUES ($1,$2,$3,$4,$5,$6)',
      [nombre.trim(), empresa?.trim() || null, email.trim(),
       telefono?.trim() || null, asunto.trim(), mensaje.trim()]
    );
    res.status(201).json({ ok: true, mensaje: 'Mensaje recibido. Te responderemos pronto.' });
  } catch (err) {
    console.error('contacto:', err.message);
    res.status(500).json({ ok: false, mensaje: 'Error al enviar el mensaje. Intenta de nuevo.' });
  }
});

module.exports = router;

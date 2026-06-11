// Envío de correos transaccionales vía SMTP (nodemailer).
// La configuración viene de variables de entorno; si no están definidas,
// el envío se omite (se loguea una advertencia) en lugar de fallar.

const nodemailer = require('nodemailer');

let transporter = null;

const credencialesConfiguradas = () =>
  !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);

const obtenerTransporter = () => {
  if (transporter) return transporter;
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
  return transporter;
};

// Envía el correo con el enlace para restablecer la contraseña.
// Devuelve { enviado: boolean } — nunca lanza si falla, solo loguea.
const enviarCorreoRecuperacion = async ({ to, nombre, resetUrl }) => {
  if (!credencialesConfiguradas()) {
    console.warn('[email] SMTP no configurado — no se envió el correo de recuperación a', to);
    return { enviado: false };
  }

  const html = `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#F4F6F8;font-family:Arial,sans-serif;color:#263238;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F6F8;padding:32px 0;">
    <tr><td align="center">
      <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;max-width:480px;width:100%;">
        <tr><td style="background:#0B1E3D;padding:24px 32px;">
          <span style="font-family:Arial,sans-serif;font-size:24px;font-weight:700;color:#ffffff;letter-spacing:2px;">MBS</span>
        </td></tr>
        <tr><td style="padding:32px;">
          <h2 style="margin:0 0 12px;font-size:20px;color:#0B1E3D;">Recupera tu contraseña</h2>
          <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#546E7A;">
            Hola${nombre ? ' ' + nombre : ''}, recibimos una solicitud para restablecer la contraseña de tu cuenta en MBS Comunicaciones.
            Haz clic en el siguiente botón para crear una nueva contraseña. Este enlace expira en 2 horas.
          </p>
          <p style="text-align:center;margin:24px 0;">
            <a href="${resetUrl}" style="background:#FF6F00;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:13px 28px;border-radius:6px;display:inline-block;">
              Restablecer contraseña
            </a>
          </p>
          <p style="margin:0 0 8px;font-size:12px;line-height:1.6;color:#90A4AE;">
            Si el botón no funciona, copia y pega este enlace en tu navegador:<br>
            <a href="${resetUrl}" style="color:#0B1E3D;word-break:break-all;">${resetUrl}</a>
          </p>
          <p style="margin:16px 0 0;font-size:12px;line-height:1.6;color:#90A4AE;">
            Si tú no solicitaste este cambio, puedes ignorar este correo.
          </p>
        </td></tr>
        <tr><td style="padding:16px 32px;background:#FAFBFC;border-top:1px solid #ECEFF1;">
          <p style="margin:0;font-size:11px;color:#90A4AE;">© ${new Date().getFullYear()} MBS Comunicaciones</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  await obtenerTransporter().sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to,
    subject: 'Recupera tu contraseña — MBS Comunicaciones',
    html
  });

  return { enviado: true };
};

module.exports = { enviarCorreoRecuperacion, credencialesConfiguradas };

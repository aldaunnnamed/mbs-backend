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

const FROM = () => process.env.SMTP_FROM || process.env.SMTP_USER;

const enviar = async (mailOptions) => {
  if (!credencialesConfiguradas()) {
    console.warn('[email] SMTP no configurado — no se envió:', mailOptions.subject, '→', mailOptions.to);
    return { enviado: false };
  }
  await obtenerTransporter().sendMail({ from: FROM(), ...mailOptions });
  return { enviado: true };
};

// ── Helpers de plantilla ─────────────────────────────────────────────
const AZUL        = '#0B1E3D';
const NARANJA     = '#F97316';
const GRIS_TEXTO  = '#546E7A';
const GRIS_CLARO  = '#FAFBFC';
const BORDE       = '#ECEFF1';

const cabecera = (subtitulo) => `
  <tr><td style="background:${AZUL};padding:24px 32px;">
    <span style="font-family:Arial,sans-serif;font-size:24px;font-weight:700;color:#fff;letter-spacing:2px;">MBS</span>
    ${subtitulo ? `<span style="font-family:Arial,sans-serif;font-size:13px;color:#94a3b8;margin-left:12px;">${subtitulo}</span>` : ''}
  </td></tr>`;

const pie = () => `
  <tr><td style="padding:16px 32px;background:${GRIS_CLARO};border-top:1px solid ${BORDE};">
    <p style="margin:0;font-size:11px;color:#90A4AE;">© ${new Date().getFullYear()} MBS Comunicaciones</p>
  </td></tr>`;

const wrapLayout = (rows) => `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F4F6F8;font-family:Arial,sans-serif;color:#263238;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F6F8;padding:32px 0;">
    <tr><td align="center">
      <table role="presentation" width="520" cellpadding="0" cellspacing="0"
             style="background:#fff;border-radius:8px;overflow:hidden;max-width:520px;width:100%;">
        ${rows}
      </table>
    </td></tr>
  </table>
</body>
</html>`;

const fmtMXN = (n) => '$' + parseFloat(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const ESTADO_LABEL = {
  nuevo:          { texto: 'Recibido',              color: AZUL },
  en_preparacion: { texto: 'En preparación',        color: '#D97706' },
  enviado:        { texto: 'Enviado',               color: '#2563EB' },
  en_camino:      { texto: 'En camino',             color: '#7C3AED' },
  entregado:      { texto: 'Entregado',             color: '#16A34A' },
  cancelado:      { texto: 'Cancelado',             color: '#DC2626' },
  devolucion:     { texto: 'Devolución en proceso', color: '#9333EA' },
};

// ── 1. Confirmación de pedido al cliente ─────────────────────────────
// pedido: { numero, total, subtotal, costo_envio, iva, metodo_envio_nombre,
//           metodo_pago_nombre, items: [{ nombre, sku, cantidad, precio_unitario, subtotal }],
//           dir_receptor, dir_calle, dir_colonia, dir_ciudad, dir_estado_geo, dir_cp }
const enviarConfirmacionPedido = async ({ to, nombre, pedido }) => {
  const appUrl = (process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '');

  const filasItems = (pedido.items || []).map((it, i) => `
    <tr style="background:${i % 2 === 0 ? '#F8FAFC' : '#fff'};">
      <td style="padding:8px 12px;font-size:13px;color:#1e293b;">${it.nombre || '—'}</td>
      <td style="padding:8px 12px;font-size:12px;color:${GRIS_TEXTO};text-align:center;">${it.cantidad}</td>
      <td style="padding:8px 12px;font-size:13px;color:#1e293b;text-align:right;">${fmtMXN(it.subtotal)}</td>
    </tr>`).join('');

  const direccion = [pedido.dir_calle, pedido.dir_colonia, pedido.dir_ciudad,
    pedido.dir_estado_geo, pedido.dir_cp].filter(Boolean).join(', ');

  const html = wrapLayout(`
    ${cabecera('Confirmación de pedido')}
    <tr><td style="padding:28px 32px;">
      <h2 style="margin:0 0 4px;font-size:20px;color:${AZUL};">¡Pedido recibido!</h2>
      <p style="margin:0 0 20px;font-size:14px;color:${GRIS_TEXTO};">
        Hola ${nombre || ''}, recibimos tu pedido. En cuanto lo procesemos te avisaremos.
      </p>

      <div style="background:#EFF6FF;border-left:4px solid ${NARANJA};padding:12px 16px;border-radius:4px;margin-bottom:20px;">
        <p style="margin:0;font-size:13px;color:${AZUL};">
          <strong>Número de pedido:</strong>
          <span style="font-size:16px;font-weight:700;color:${NARANJA};margin-left:8px;">${pedido.numero}</span>
        </p>
      </div>

      <!-- Tabla de productos -->
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:20px;">
        <thead>
          <tr style="background:${AZUL};">
            <th style="padding:8px 12px;font-size:12px;color:#fff;text-align:left;">Producto</th>
            <th style="padding:8px 12px;font-size:12px;color:#fff;text-align:center;">Cant.</th>
            <th style="padding:8px 12px;font-size:12px;color:#fff;text-align:right;">Subtotal</th>
          </tr>
        </thead>
        <tbody>${filasItems}</tbody>
      </table>

      <!-- Totales -->
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
        <tr>
          <td style="padding:4px 0;font-size:13px;color:${GRIS_TEXTO};">Subtotal</td>
          <td style="padding:4px 0;font-size:13px;color:#1e293b;text-align:right;">${fmtMXN(pedido.subtotal)}</td>
        </tr>
        <tr>
          <td style="padding:4px 0;font-size:13px;color:${GRIS_TEXTO};">Envío (${pedido.metodo_envio_nombre || '—'})</td>
          <td style="padding:4px 0;font-size:13px;color:#1e293b;text-align:right;">${fmtMXN(pedido.costo_envio)}</td>
        </tr>
        ${pedido.iva && parseFloat(pedido.iva) > 0 ? `
        <tr>
          <td style="padding:4px 0;font-size:13px;color:${GRIS_TEXTO};">IVA</td>
          <td style="padding:4px 0;font-size:13px;color:#1e293b;text-align:right;">${fmtMXN(pedido.iva)}</td>
        </tr>` : ''}
        <tr>
          <td style="padding:8px 0 4px;font-size:15px;font-weight:700;color:${AZUL};border-top:2px solid ${BORDE};">Total</td>
          <td style="padding:8px 0 4px;font-size:15px;font-weight:700;color:${AZUL};text-align:right;border-top:2px solid ${BORDE};">${fmtMXN(pedido.total)}</td>
        </tr>
      </table>

      <!-- Detalles de envío y pago -->
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
        <tr>
          <td width="50%" style="vertical-align:top;padding-right:12px;">
            <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:${GRIS_TEXTO};text-transform:uppercase;letter-spacing:.5px;">Método de pago</p>
            <p style="margin:0;font-size:13px;color:#1e293b;">${pedido.metodo_pago_nombre || '—'}</p>
          </td>
          <td width="50%" style="vertical-align:top;">
            <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:${GRIS_TEXTO};text-transform:uppercase;letter-spacing:.5px;">Dirección de entrega</p>
            <p style="margin:0;font-size:13px;color:#1e293b;">${pedido.dir_receptor || ''}<br>${direccion}</p>
          </td>
        </tr>
      </table>

      <p style="text-align:center;margin:0;">
        <a href="${appUrl}/pages/mis-pedidos.html"
           style="background:${NARANJA};color:#fff;text-decoration:none;font-weight:700;font-size:14px;padding:12px 28px;border-radius:6px;display:inline-block;">
          Ver mis pedidos
        </a>
      </p>
    </td></tr>
    ${pie()}
  `);

  return enviar({ to, subject: `Pedido ${pedido.numero} recibido — MBS Comunicaciones`, html });
};

// ── 2. Notificación de nuevo pedido al administrador ─────────────────
const enviarNotificacionNuevoPedido = async ({ numeroPedido, clienteNombre, clienteEmail, total, totalItems }) => {
  const adminTo = process.env.SMTP_FROM || process.env.SMTP_USER;
  if (!adminTo) return { enviado: false };

  const appUrl = (process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '');

  const html = wrapLayout(`
    ${cabecera('Nuevo pedido recibido')}
    <tr><td style="padding:28px 32px;">
      <h2 style="margin:0 0 16px;font-size:20px;color:${AZUL};">Nuevo pedido en tienda</h2>

      <div style="background:#EFF6FF;border-left:4px solid ${NARANJA};padding:12px 16px;border-radius:4px;margin-bottom:20px;">
        <p style="margin:0;font-size:13px;color:${AZUL};">
          <strong>Número:</strong>
          <span style="font-size:16px;font-weight:700;color:${NARANJA};margin-left:8px;">${numeroPedido}</span>
        </p>
      </div>

      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
        <tr>
          <td style="padding:6px 0;font-size:13px;color:${GRIS_TEXTO};">Cliente</td>
          <td style="padding:6px 0;font-size:13px;color:#1e293b;text-align:right;">${clienteNombre} &lt;${clienteEmail}&gt;</td>
        </tr>
        <tr>
          <td style="padding:6px 0;font-size:13px;color:${GRIS_TEXTO};">Productos</td>
          <td style="padding:6px 0;font-size:13px;color:#1e293b;text-align:right;">${totalItems} unidad(es)</td>
        </tr>
        <tr>
          <td style="padding:6px 0;font-size:15px;font-weight:700;color:${AZUL};border-top:2px solid ${BORDE};">Total</td>
          <td style="padding:6px 0;font-size:15px;font-weight:700;color:${AZUL};text-align:right;border-top:2px solid ${BORDE};">${fmtMXN(total)}</td>
        </tr>
      </table>

      <p style="text-align:center;margin:0;">
        <a href="${appUrl}/admin/pedidos"
           style="background:${AZUL};color:#fff;text-decoration:none;font-weight:700;font-size:14px;padding:12px 28px;border-radius:6px;display:inline-block;">
          Ver en panel admin
        </a>
      </p>
    </td></tr>
    ${pie()}
  `);

  return enviar({ to: adminTo, subject: `Nuevo pedido ${numeroPedido} — MBS Comunicaciones`, html });
};

// ── 3. Actualización de estado al cliente ────────────────────────────
// Solo se envía para estados relevantes post-creación (no para 'nuevo')
const ESTADOS_CON_EMAIL = new Set(['en_preparacion', 'enviado', 'en_camino', 'entregado', 'cancelado', 'devolucion']);

const enviarActualizacionEstado = async ({ to, nombre, numeroPedido, estado, paqueteria, numeroGuia }) => {
  if (!ESTADOS_CON_EMAIL.has(estado)) return { enviado: false };

  const appUrl   = (process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '');
  const info     = ESTADO_LABEL[estado] || { texto: estado, color: AZUL };

  const guiaHtml = (estado === 'enviado' || estado === 'en_camino') && (paqueteria || numeroGuia) ? `
    <div style="background:#F8FAFC;border:1px solid ${BORDE};border-radius:6px;padding:14px 16px;margin:20px 0;">
      ${paqueteria ? `<p style="margin:0 0 6px;font-size:13px;color:${GRIS_TEXTO};">Paquetería: <strong style="color:#1e293b;">${paqueteria}</strong></p>` : ''}
      ${numeroGuia ? `<p style="margin:0;font-size:13px;color:${GRIS_TEXTO};">Número de guía: <strong style="color:#1e293b;">${numeroGuia}</strong></p>` : ''}
    </div>` : '';

  const mensajes = {
    en_preparacion: 'Estamos preparando tu pedido con mucho cuidado. Pronto lo enviaremos.',
    enviado:        'Tu pedido salió de nuestras instalaciones y está en camino a ti.',
    en_camino:      'Tu pedido está muy cerca. El repartidor lo lleva a tu dirección.',
    entregado:      '¡Tu pedido fue entregado! Esperamos que estés satisfecho con tu compra.',
    cancelado:      'Tu pedido fue cancelado. Si tienes dudas, contáctanos.',
    devolucion:     'Recibimos tu solicitud de devolución y la estamos procesando.',
  };

  const html = wrapLayout(`
    ${cabecera('Actualización de tu pedido')}
    <tr><td style="padding:28px 32px;">
      <div style="background:${info.color};border-radius:6px;padding:14px 20px;margin-bottom:20px;text-align:center;">
        <p style="margin:0;font-size:11px;color:rgba(255,255,255,.7);text-transform:uppercase;letter-spacing:1px;">Estado</p>
        <p style="margin:4px 0 0;font-size:20px;font-weight:700;color:#fff;">${info.texto}</p>
      </div>

      <p style="margin:0 0 6px;font-size:14px;color:${GRIS_TEXTO};">
        Hola ${nombre || ''}, tu pedido
        <strong style="color:${AZUL};">${numeroPedido}</strong>
        fue actualizado.
      </p>
      <p style="margin:0 0 20px;font-size:14px;color:${GRIS_TEXTO};">${mensajes[estado] || ''}</p>

      ${guiaHtml}

      <p style="text-align:center;margin:24px 0 0;">
        <a href="${appUrl}/pages/mis-pedidos.html"
           style="background:${NARANJA};color:#fff;text-decoration:none;font-weight:700;font-size:14px;padding:12px 28px;border-radius:6px;display:inline-block;">
          Ver mis pedidos
        </a>
      </p>
    </td></tr>
    ${pie()}
  `);

  return enviar({ to, subject: `Pedido ${numeroPedido}: ${info.texto} — MBS Comunicaciones`, html });
};

// ── 4. Recuperación de contraseña (original) ─────────────────────────
const enviarCorreoRecuperacion = async ({ to, nombre, resetUrl }) => {
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

  return enviar({ to, subject: 'Recupera tu contraseña — MBS Comunicaciones', html });
};

module.exports = {
  enviarCorreoRecuperacion,
  enviarConfirmacionPedido,
  enviarNotificacionNuevoPedido,
  enviarActualizacionEstado,
  credencialesConfiguradas,
};

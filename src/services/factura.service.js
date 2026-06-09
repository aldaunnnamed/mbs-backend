const { query } = require('../config/db');
const { exec }  = require('child_process');
const path      = require('path');
const fs        = require('fs');

// Genera la factura como HTML y la convierte a PDF usando Puppeteer
// o la genera directamente como HTML descargable si Puppeteer no está disponible.
// En producción usar wkhtmltopdf o Puppeteer.

const generarFacturaHTML = (pedido, items) => {
  const fecha = new Date(pedido.created_at || Date.now())
    .toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' });

  const itemsRows = items.map(i => `
    <tr>
      <td>${i.nombre || i.item_nombre || ''}</td>
      <td style="text-align:center">${i.cantidad || i.item_cantidad || 1}</td>
      <td style="text-align:right">$${parseFloat(i.precio_unitario || i.item_precio_unitario || 0).toLocaleString('es-MX', {minimumFractionDigits:2})}</td>
      <td style="text-align:right">$${parseFloat(i.subtotal || i.item_subtotal || 0).toLocaleString('es-MX', {minimumFractionDigits:2})}</td>
    </tr>`).join('');

  const subtotal = parseFloat(pedido.subtotal || 0);
  const envio    = parseFloat(pedido.costo_envio || 0);
  const iva      = parseFloat(pedido.iva || 0);
  const total    = parseFloat(pedido.total || 0);

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: Arial, sans-serif; font-size: 11px; color: #263238; padding: 40px; }
  .header { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:32px; padding-bottom:20px; border-bottom:3px solid #0B1E3D; }
  .brand { font-size:28px; font-weight:700; color:#0B1E3D; letter-spacing:2px; }
  .brand-sub { font-size:10px; color:#546E7A; margin-top:4px; }
  .invoice-title { text-align:right; }
  .invoice-title h2 { font-size:22px; color:#FF6F00; font-weight:700; }
  .invoice-title p  { font-size:10px; color:#546E7A; margin-top:2px; }
  .meta-grid { display:grid; grid-template-columns:1fr 1fr; gap:24px; margin-bottom:28px; }
  .meta-box { background:#F5F7FA; border-radius:6px; padding:14px 16px; }
  .meta-box h4 { font-size:9px; text-transform:uppercase; letter-spacing:.08em; color:#90A4AE; margin-bottom:8px; }
  .meta-box p  { font-size:10.5px; line-height:1.7; color:#263238; }
  .meta-box strong { color:#0B1E3D; }
  table { width:100%; border-collapse:collapse; margin-bottom:20px; }
  thead tr { background:#0B1E3D; color:#fff; }
  thead th { padding:10px 12px; text-align:left; font-size:9px; text-transform:uppercase; letter-spacing:.06em; }
  tbody tr { border-bottom:1px solid #E0E7EF; }
  tbody tr:nth-child(even) { background:#F5F7FA; }
  tbody td { padding:10px 12px; font-size:10.5px; }
  .totals { display:flex; justify-content:flex-end; margin-bottom:28px; }
  .totals-box { min-width:260px; }
  .totals-row { display:flex; justify-content:space-between; padding:6px 0; font-size:10.5px; border-bottom:1px solid #E0E7EF; }
  .totals-row:last-child { border-bottom:none; }
  .totals-row.total { font-weight:700; font-size:13px; color:#FF6F00; padding-top:10px; }
  .totals-row span:first-child { color:#546E7A; }
  .totals-row.total span:first-child { color:#0B1E3D; }
  .footer { text-align:center; padding-top:20px; border-top:1px solid #E0E7EF; color:#90A4AE; font-size:9px; line-height:1.8; }
  .badge { display:inline-block; padding:3px 10px; background:#EAF3DE; color:#2E7D32; border-radius:99px; font-size:9px; font-weight:700; }
</style>
</head>
<body>

<div class="header">
  <div>
    <div class="brand">MBS</div>
    <div class="brand-sub">Insumos de Fibra Optica para Profesionales<br>Hidalgo, Mexico · ventas@mbscomunicaciones.mx</div>
  </div>
  <div class="invoice-title">
    <h2>FACTURA</h2>
    <p>No. de pedido: <strong>${pedido.numero || ''}</strong></p>
    <p>Fecha: ${fecha}</p>
    <span class="badge">PAGADO</span>
  </div>
</div>

<div class="meta-grid">
  <div class="meta-box">
    <h4>Datos del cliente</h4>
    <p>
      <strong>${pedido.dir_nombre || ''} ${pedido.dir_apellidos || ''}</strong><br>
      ${pedido.dir_calle || ''}, ${pedido.dir_colonia || ''}<br>
      ${pedido.dir_ciudad || ''}, ${pedido.dir_estado_geo || ''} C.P. ${pedido.dir_cp || ''}<br>
      ${pedido.rfc_factura ? 'RFC: ' + pedido.rfc_factura : ''}
    </p>
  </div>
  <div class="meta-box">
    <h4>Informacion del pedido</h4>
    <p>
      <strong>Pedido:</strong> ${pedido.numero || ''}<br>
      <strong>Fecha:</strong> ${fecha}<br>
      <strong>Metodo de pago:</strong> ${pedido.metodo_pago_nombre || pedido.metodo_pago_id || ''}<br>
      <strong>Envio:</strong> ${pedido.metodo_envio_nombre || pedido.metodo_envio_id || ''}
    </p>
  </div>
</div>

<table>
  <thead>
    <tr>
      <th>Producto</th>
      <th style="text-align:center">Cantidad</th>
      <th style="text-align:right">Precio Unit.</th>
      <th style="text-align:right">Subtotal</th>
    </tr>
  </thead>
  <tbody>
    ${itemsRows}
  </tbody>
</table>

<div class="totals">
  <div class="totals-box">
    <div class="totals-row"><span>Subtotal</span><span>$${subtotal.toLocaleString('es-MX',{minimumFractionDigits:2})}</span></div>
    <div class="totals-row"><span>Envio</span><span>${envio===0?'GRATIS':'$'+envio.toLocaleString('es-MX',{minimumFractionDigits:2})}</span></div>
    <div class="totals-row"><span>IVA (16%)</span><span>$${iva.toLocaleString('es-MX',{minimumFractionDigits:2})}</span></div>
    <div class="totals-row total"><span>TOTAL</span><span>$${total.toLocaleString('es-MX',{minimumFractionDigits:2})} MXN</span></div>
  </div>
</div>

<div class="footer">
  <p>MBS Comunicaciones · Hidalgo, Mexico · +52 (771) 345-5929 · ventas@mbscomunicaciones.mx</p>
  <p>Este documento es un comprobante de compra. Para factura fiscal (CFDI) contacta a ventas@mbscomunicaciones.mx</p>
  <p>Gracias por tu compra · www.mbscomunicaciones.mx</p>
</div>

</body>
</html>`;
};

module.exports = { generarFacturaHTML };

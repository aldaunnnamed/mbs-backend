const { query } = require('../config/db');

const dashboard = async (req, res) => {
  try {
    const [resumen, ventas, pedidos_rec] = await Promise.all([
      query('SELECT * FROM fn_dashboard_resumen()'),
      query('SELECT * FROM fn_ventas_semana()'),
      query(
        "SELECT p.id, p.numero, p.estado, p.total, p.created_at," +
        " u.nombre || ' ' || u.apellidos AS cliente_nombre" +
        " FROM pedidos p JOIN usuarios u ON u.id = p.usuario_id" +
        " ORDER BY p.created_at DESC LIMIT 5"
      )
    ]);
    res.json({ ok: true, kpis: resumen.rows[0], ventas_semana: ventas.rows, pedidos_recientes: pedidos_rec.rows });
  } catch (err) {
    console.error('dashboard:', err.message);
    res.status(500).json({ ok: false, mensaje: 'Error al obtener dashboard' });
  }
};

const listarClientes = async (req, res) => {
  try {
    const { busqueda = null, tipo = null, pagina = 1 } = req.query;
    const result = await query(
      'SELECT * FROM fn_admin_listar_clientes(' +
      'CAST($1 AS CHARACTER VARYING), CAST($2 AS CHARACTER VARYING), CAST($3 AS INTEGER))',
      [busqueda || null, tipo || null, parseInt(pagina)]
    );
    const total = result.rows[0]?.r_total_registros || 0;
    res.json({ ok: true, total: parseInt(total), clientes: result.rows });
  } catch (err) {
    console.error('listarClientes:', err.message);
    res.status(500).json({ ok: false, mensaje: 'Error al obtener clientes' });
  }
};

const toggleBloqueo = async (req, res) => {
  try {
    const { bloqueado, motivo } = req.body;
    await query(
      'SELECT fn_toggle_bloqueo_cliente(' +
      'CAST($1 AS INTEGER), CAST($2 AS BOOLEAN), CAST($3 AS CHARACTER VARYING), CAST($4 AS INTEGER))',
      [parseInt(req.params.id), Boolean(bloqueado), motivo || null, parseInt(req.usuario.id)]
    );
    res.json({ ok: true, mensaje: bloqueado ? 'Cliente bloqueado' : 'Cliente desbloqueado' });
  } catch (err) {
    console.error('toggleBloqueo:', err.message);
    res.status(500).json({ ok: false, mensaje: 'Error al cambiar estado' });
  }
};

const listarPedidos = async (req, res) => {
  try {
    const { estado = null, pagina = 1, por_pagina = 10 } = req.query;
    const offset = (parseInt(pagina) - 1) * parseInt(por_pagina);
    const result = await query(
      "SELECT p.*, u.nombre || ' ' || u.apellidos AS cliente_nombre," +
      " (SELECT COUNT(*) FROM pedido_items pi WHERE pi.pedido_id = p.id) AS total_items" +
      " FROM pedidos p JOIN usuarios u ON u.id = p.usuario_id" +
      " WHERE ($1::VARCHAR IS NULL OR p.estado = $1)" +
      " ORDER BY p.created_at DESC LIMIT $2 OFFSET $3",
      [estado || null, parseInt(por_pagina), offset]
    );
    res.json({ ok: true, pedidos: result.rows });
  } catch (err) {
    console.error('listarPedidos:', err.message);
    res.status(500).json({ ok: false, mensaje: 'Error al obtener pedidos' });
  }
};

const ESTADOS_PEDIDO_VALIDOS = ['nuevo', 'en_preparacion', 'enviado', 'en_camino', 'entregado', 'cancelado', 'devolucion'];

const actualizarEstadoPedido = async (req, res) => {
  try {
    const { estado, paqueteria, numero_guia, notas } = req.body;
    if (!estado) return res.status(400).json({ ok: false, mensaje: 'Estado requerido' });
    if (!ESTADOS_PEDIDO_VALIDOS.includes(estado)) {
      return res.status(400).json({ ok: false, mensaje: 'Estado inválido' });
    }
    await query(
      'SELECT fn_actualizar_estado_pedido(' +
      'CAST($1 AS INTEGER), CAST($2 AS CHARACTER VARYING),' +
      'CAST($3 AS CHARACTER VARYING), CAST($4 AS CHARACTER VARYING),' +
      'CAST($5 AS TEXT), CAST($6 AS INTEGER))',
      [parseInt(req.params.id), estado, paqueteria || null, numero_guia || null, notas || null, parseInt(req.usuario.id)]
    );
    res.json({ ok: true, mensaje: 'Estado actualizado correctamente' });
  } catch (err) {
    console.error('actualizarEstadoPedido:', err.message);
    res.status(500).json({ ok: false, mensaje: 'Error al actualizar estado' });
  }
};

const alertasInventario = async (req, res) => {
  try {
    const result = await query('SELECT * FROM fn_alertas_inventario()');
    res.json({ ok: true, alertas: result.rows });
  } catch (err) {
    res.status(500).json({ ok: false, mensaje: 'Error al obtener alertas' });
  }
};

const ajustarStock = async (req, res) => {
  try {
    const { nuevo_stock, motivo } = req.body;
    if (nuevo_stock === undefined || !motivo) {
      return res.status(400).json({ ok: false, mensaje: 'nuevo_stock y motivo requeridos' });
    }
    const result = await query(
      'SELECT fn_ajustar_stock(' +
      'CAST($1 AS INTEGER), CAST($2 AS INTEGER), CAST($3 AS CHARACTER VARYING), CAST($4 AS INTEGER))',
      [parseInt(req.params.id), parseInt(nuevo_stock), motivo, parseInt(req.usuario.id)]
    );
    const mensaje = result.rows[0].fn_ajustar_stock;
    if (mensaje === 'Producto no encontrado.') {
      return res.status(404).json({ ok: false, mensaje });
    }
    res.json({ ok: true, mensaje });
  } catch (err) {
    console.error('ajustarStock:', err.message);
    res.status(500).json({ ok: false, mensaje: 'Error al ajustar stock' });
  }
};

const listarProductos = async (req, res) => {
  try {
    const { busqueda = null, categoria_id = null, estado = null, pagina = 1, por_pagina = 10 } = req.query;
    const result = await query(
      'SELECT * FROM fn_admin_listar_productos(' +
      'CAST($1 AS CHARACTER VARYING), CAST($2 AS INTEGER), CAST($3 AS CHARACTER VARYING),' +
      'CAST($4 AS INTEGER), CAST($5 AS INTEGER))',
      [busqueda || null, categoria_id ? parseInt(categoria_id) : null, estado || null,
       parseInt(pagina), parseInt(por_pagina)]
    );
    const total = result.rows[0]?.r_total_registros || 0;
    res.json({ ok: true, total: parseInt(total), productos: result.rows });
  } catch (err) {
    console.error('listarProductos:', err.message);
    res.status(500).json({ ok: false, mensaje: 'Error al obtener productos' });
  }
};

const guardarProducto = async (req, res) => {
  try {
    const id = req.params.id ? parseInt(req.params.id) : 0;
    const { sku, nombre, descripcion_corta, descripcion_larga, categoria_id, marca_id,
            precio_venta, precio_antes, stock_actual, stock_minimo, estado, badge } = req.body;
    const result = await query(
      'SELECT * FROM fn_guardar_producto(' +
      'CAST($1 AS INTEGER), CAST($2 AS CHARACTER VARYING), CAST($3 AS CHARACTER VARYING),' +
      'CAST($4 AS CHARACTER VARYING), CAST($5 AS TEXT),' +
      'CAST($6 AS INTEGER), CAST($7 AS INTEGER),' +
      'CAST($8 AS NUMERIC), CAST($9 AS NUMERIC),' +
      'CAST($10 AS INTEGER), CAST($11 AS INTEGER),' +
      'CAST($12 AS CHARACTER VARYING), CAST($13 AS CHARACTER VARYING), CAST($14 AS INTEGER))',
      [
        id, sku, nombre, descripcion_corta || null, descripcion_larga || null,
        parseInt(categoria_id), marca_id ? parseInt(marca_id) : null,
        parseFloat(precio_venta), precio_antes ? parseFloat(precio_antes) : null,
        parseInt(stock_actual) || 0, parseInt(stock_minimo) || 5,
        estado || 'activo', badge || null, parseInt(req.usuario.id)
      ]
    );
    const fila = result.rows[0];
    res.status(id === 0 ? 201 : 200).json({ ok: true, mensaje: fila.r_mensaje, producto_id: fila.r_producto_id });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ ok: false, mensaje: 'El SKU ya está registrado en otro producto' });
    console.error('guardarProducto:', err.message);
    res.status(500).json({ ok: false, mensaje: 'Error al guardar producto' });
  }
};

const obtenerConfiguracion = async (req, res) => {
  try {
    const { seccion = null } = req.query;
    const result = await query(
      'SELECT * FROM fn_obtener_configuracion(CAST($1 AS CHARACTER VARYING))',
      [seccion || null]
    );
    res.json({ ok: true, configuracion: result.rows });
  } catch (err) {
    console.error('obtenerConfiguracion:', err.message);
    res.status(500).json({ ok: false, mensaje: 'Error al obtener configuración' });
  }
};

const guardarConfiguracion = async (req, res) => {
  try {
    const { clave, valor } = req.body;
    if (!clave || valor === undefined) {
      return res.status(400).json({ ok: false, mensaje: 'clave y valor requeridos' });
    }
    await query(
      'SELECT fn_guardar_configuracion(CAST($1 AS CHARACTER VARYING), CAST($2 AS TEXT), CAST($3 AS INTEGER))',
      [clave, String(valor), parseInt(req.usuario.id)]
    );
    res.json({ ok: true, mensaje: 'Configuración guardada' });
  } catch (err) {
    console.error('guardarConfiguracion:', err.message);
    res.status(500).json({ ok: false, mensaje: 'Error al guardar configuración' });
  }
};

const exportarClientes = async (req, res) => {
  try {
    const result = await query(
      'SELECT u.nombre, u.apellidos, u.email, u.telefono, u.rfc, u.razon_social,' +
      ' u.tipo, u.activo, u.bloqueado, u.created_at,' +
      ' COUNT(p.id) AS total_pedidos,' +
      ' COALESCE(SUM(p.total),0) AS total_gastado' +
      ' FROM usuarios u' +
      " LEFT JOIN pedidos p ON p.usuario_id = u.id AND p.estatus_pago = 'pagado'" +
      " WHERE u.rol = 'cliente'" +
      ' GROUP BY u.id ORDER BY u.created_at DESC'
    );
    const cols = ['nombre','apellidos','email','telefono','rfc','razon_social',
                  'tipo','activo','bloqueado','created_at','total_pedidos','total_gastado'];
    const esc = (v) => {
      if (v === null || v === undefined) return '';
      const s = String(v);
      return s.includes(',') || s.includes('"') || s.includes('\n')
        ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const rows = [cols.join(',')];
    result.rows.forEach(r => rows.push(cols.map(c => esc(r[c])).join(',')));
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="clientes-mbs.csv"');
    res.send('﻿' + rows.join('\r\n'));
  } catch (err) {
    console.error('exportarClientes:', err.message);
    res.status(500).json({ ok: false, mensaje: 'Error al exportar clientes' });
  }
};

const listarAdmins = async (req, res) => {
  try {
    const result = await query(
      "SELECT id, nombre, apellidos, email, rol, activo, ultimo_login, created_at" +
      " FROM usuarios WHERE rol IN ('admin','superadmin') ORDER BY created_at"
    );
    res.json({ ok: true, admins: result.rows });
  } catch (err) {
    res.status(500).json({ ok: false, mensaje: 'Error al obtener admins' });
  }
};

const crearAdmin = async (req, res) => {
  try {
    const { nombre, apellidos, email, password, rol = 'admin' } = req.body;
    if (!nombre || !apellidos || !email || !password) {
      return res.status(400).json({ ok: false, mensaje: 'Todos los campos son requeridos' });
    }
    if (!['admin','superadmin'].includes(rol)) {
      return res.status(400).json({ ok: false, mensaje: 'Rol inválido' });
    }
    const bcrypt = require('bcryptjs');
    const hash = await bcrypt.hash(password, 12);
    const r = await query(
      'INSERT INTO usuarios (nombre, apellidos, email, password_hash, rol, tipo)' +
      " VALUES ($1,$2,$3,$4,$5,'empresa') RETURNING id",
      [nombre, apellidos, email, hash, rol]
    );
    res.status(201).json({ ok: true, mensaje: 'Administrador creado', id: r.rows[0].id });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ ok: false, mensaje: 'El email ya está registrado' });
    console.error('crearAdmin:', err.message);
    res.status(500).json({ ok: false, mensaje: 'Error al crear administrador' });
  }
};

const listarMetodosPago = async (req, res) => {
  try {
    const result = await query('SELECT id, clave, nombre, descripcion, comision, comision_fija, activo FROM metodos_pago ORDER BY id');
    res.json({ ok: true, metodos: result.rows });
  } catch (err) {
    res.status(500).json({ ok: false, mensaje: 'Error al obtener métodos de pago' });
  }
};

const toggleMetodoPago = async (req, res) => {
  try {
    const r = await query(
      'UPDATE metodos_pago SET activo = NOT activo WHERE id = $1 RETURNING activo',
      [parseInt(req.params.id)]
    );
    if (!r.rows.length) return res.status(404).json({ ok: false, mensaje: 'No encontrado' });
    res.json({ ok: true, activo: r.rows[0].activo });
  } catch (err) {
    res.status(500).json({ ok: false, mensaje: 'Error al cambiar estado' });
  }
};

const guardarConfigNotif = async (req, res) => {
  try {
    const { configuraciones } = req.body;
    if (!Array.isArray(configuraciones)) {
      return res.status(400).json({ ok: false, mensaje: 'Se esperaba array de configuraciones' });
    }
    for (const { clave, valor } of configuraciones) {
      await query(
        'SELECT fn_guardar_configuracion(CAST($1 AS CHARACTER VARYING), CAST($2 AS TEXT), CAST($3 AS INTEGER))',
        [clave, String(valor), parseInt(req.usuario.id)]
      );
    }
    res.json({ ok: true, mensaje: 'Configuración de notificaciones guardada' });
  } catch (err) {
    console.error('guardarConfigNotif:', err.message);
    res.status(500).json({ ok: false, mensaje: 'Error al guardar notificaciones' });
  }
};

const topProductos = async (req, res) => {
  try {
    const result = await query(
      'SELECT p.id, p.nombre, p.sku,' +
      ' SUM(pi.cantidad) AS unidades_vendidas,' +
      ' SUM(pi.subtotal) AS total_vendido' +
      ' FROM pedido_items pi' +
      ' JOIN productos p ON p.id = pi.producto_id' +
      ' JOIN pedidos pe ON pe.id = pi.pedido_id' +
      " WHERE pe.estatus_pago = 'pagado'" +
      ' GROUP BY p.id, p.nombre, p.sku' +
      ' ORDER BY unidades_vendidas DESC' +
      ' LIMIT 5'
    );
    res.json({ ok: true, productos: result.rows });
  } catch (err) {
    console.error('topProductos:', err.message);
    res.status(500).json({ ok: false, mensaje: 'Error al obtener top productos' });
  }
};

const listarMetodosEnvio = async (req, res) => {
  try {
    const result = await query('SELECT * FROM metodos_envio ORDER BY orden, id');
    res.json({ ok: true, metodos: result.rows });
  } catch (err) {
    res.status(500).json({ ok: false, mensaje: 'Error al obtener métodos de envío' });
  }
};

const guardarMetodoEnvio = async (req, res) => {
  try {
    const id = req.params.id ? parseInt(req.params.id) : null;
    const { nombre, descripcion, precio, precio_tipo, dias_min, dias_max, monto_gratis, orden } = req.body;
    if (!nombre) return res.status(400).json({ ok: false, mensaje: 'Nombre requerido' });
    if (id) {
      await query(
        'UPDATE metodos_envio SET nombre=$1, descripcion=$2, precio=$3, precio_tipo=$4,' +
        ' dias_min=$5, dias_max=$6, monto_gratis=$7, orden=$8 WHERE id=$9',
        [nombre, descripcion || null, parseFloat(precio) || 0, precio_tipo || 'fijo',
         dias_min ? parseInt(dias_min) : null, dias_max ? parseInt(dias_max) : null,
         monto_gratis ? parseFloat(monto_gratis) : null, parseInt(orden) || 0, id]
      );
      res.json({ ok: true, mensaje: 'Método de envío actualizado' });
    } else {
      const r = await query(
        'INSERT INTO metodos_envio (nombre, descripcion, precio, precio_tipo, dias_min, dias_max, monto_gratis, orden)' +
        ' VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id',
        [nombre, descripcion || null, parseFloat(precio) || 0, precio_tipo || 'fijo',
         dias_min ? parseInt(dias_min) : null, dias_max ? parseInt(dias_max) : null,
         monto_gratis ? parseFloat(monto_gratis) : null, parseInt(orden) || 0]
      );
      res.status(201).json({ ok: true, mensaje: 'Método de envío creado', id: r.rows[0].id });
    }
  } catch (err) {
    console.error('guardarMetodoEnvio:', err.message);
    res.status(500).json({ ok: false, mensaje: 'Error al guardar método de envío' });
  }
};

const toggleMetodoEnvio = async (req, res) => {
  try {
    const r = await query(
      'UPDATE metodos_envio SET activo = NOT activo WHERE id = $1 RETURNING activo',
      [parseInt(req.params.id)]
    );
    if (!r.rows.length) return res.status(404).json({ ok: false, mensaje: 'No encontrado' });
    res.json({ ok: true, activo: r.rows[0].activo });
  } catch (err) {
    res.status(500).json({ ok: false, mensaje: 'Error al cambiar estado' });
  }
};

const exportarProductos = async (req, res) => {
  try {
    const result = await query(
      'SELECT p.sku, p.nombre, p.descripcion_corta, p.precio_venta, p.precio_antes,' +
      ' p.stock_actual, p.stock_minimo, p.estado, p.badge,' +
      ' c.nombre AS categoria, m.nombre AS marca' +
      ' FROM productos p' +
      ' LEFT JOIN categorias c ON c.id = p.categoria_id' +
      ' LEFT JOIN marcas m ON m.id = p.marca_id' +
      ' ORDER BY p.id'
    );
    const cols = ['sku','nombre','descripcion_corta','precio_venta','precio_antes',
                  'stock_actual','stock_minimo','estado','badge','categoria','marca'];
    const esc = (v) => {
      if (v === null || v === undefined) return '';
      const s = String(v);
      return s.includes(',') || s.includes('"') || s.includes('\n')
        ? '"' + s.replace(/"/g, '""') + '"'
        : s;
    };
    const rows = [cols.join(',')];
    result.rows.forEach(r => rows.push(cols.map(c => esc(r[c])).join(',')));
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="productos-mbs.csv"');
    res.send('﻿' + rows.join('\r\n'));
  } catch (err) {
    console.error('exportarProductos:', err.message);
    res.status(500).json({ ok: false, mensaje: 'Error al exportar' });
  }
};

const importarProductos = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ ok: false, mensaje: 'Archivo CSV requerido' });
    const lines = req.file.buffer.toString('utf-8').replace(/\r/g, '').split('\n').filter(Boolean);
    if (lines.length < 2) return res.status(400).json({ ok: false, mensaje: 'El CSV no tiene datos' });

    const header = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, '').toLowerCase());
    const required = ['sku', 'nombre', 'precio_venta', 'categoria_id'];
    for (const r of required) {
      if (!header.includes(r)) {
        return res.status(400).json({ ok: false, mensaje: `Columna requerida faltante: ${r}` });
      }
    }

    const parseRow = (line) => {
      const vals = [];
      let cur = '', inQ = false;
      for (const ch of line) {
        if (ch === '"') { inQ = !inQ; }
        else if (ch === ',' && !inQ) { vals.push(cur); cur = ''; }
        else cur += ch;
      }
      vals.push(cur);
      return vals.map(v => v.trim());
    };

    let creados = 0, actualizados = 0, errores = 0;
    for (let i = 1; i < lines.length; i++) {
      const vals = parseRow(lines[i]);
      const row = {};
      header.forEach((h, idx) => { row[h] = vals[idx] || null; });
      try {
        const r = await query(
          'SELECT * FROM fn_guardar_producto(' +
          'CAST($1 AS INTEGER), CAST($2 AS CHARACTER VARYING), CAST($3 AS CHARACTER VARYING),' +
          'CAST($4 AS CHARACTER VARYING), CAST($5 AS TEXT),' +
          'CAST($6 AS INTEGER), CAST($7 AS INTEGER),' +
          'CAST($8 AS NUMERIC), CAST($9 AS NUMERIC),' +
          'CAST($10 AS INTEGER), CAST($11 AS INTEGER),' +
          'CAST($12 AS CHARACTER VARYING), CAST($13 AS CHARACTER VARYING), CAST($14 AS INTEGER))',
          [
            0, row.sku, row.nombre,
            row.descripcion_corta || null, row.descripcion_larga || null,
            parseInt(row.categoria_id) || 1, row.marca_id ? parseInt(row.marca_id) : null,
            parseFloat(row.precio_venta) || 0, row.precio_antes ? parseFloat(row.precio_antes) : null,
            parseInt(row.stock_actual) || 0, parseInt(row.stock_minimo) || 5,
            row.estado || 'activo', row.badge || null, parseInt(req.usuario.id)
          ]
        );
        r.rows[0]?.r_mensaje?.includes('creado') ? creados++ : actualizados++;
      } catch { errores++; }
    }
    res.json({ ok: true, mensaje: `Importación completada: ${creados} creados, ${actualizados} actualizados, ${errores} errores` });
  } catch (err) {
    console.error('importarProductos:', err.message);
    res.status(500).json({ ok: false, mensaje: 'Error al importar' });
  }
};

const subirImagenProducto = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ ok: false, mensaje: 'Imagen requerida' });
    const productoId = parseInt(req.params.id);
    const url = '/uploads/productos/' + req.file.filename;
    const esPrincipal = req.body.es_principal === 'true';
    if (esPrincipal) {
      await query('UPDATE producto_imagenes SET es_principal = FALSE WHERE producto_id = $1', [productoId]);
    }
    const r = await query(
      'INSERT INTO producto_imagenes (producto_id, url, alt, orden, es_principal)' +
      ' VALUES ($1,$2,$3,(SELECT COALESCE(MAX(orden),0)+1 FROM producto_imagenes WHERE producto_id=$1),$4)' +
      ' RETURNING id',
      [productoId, url, req.body.alt || null, esPrincipal]
    );
    res.status(201).json({ ok: true, mensaje: 'Imagen subida', id: r.rows[0].id, url });
  } catch (err) {
    console.error('subirImagenProducto:', err.message);
    res.status(500).json({ ok: false, mensaje: 'Error al subir imagen' });
  }
};

const eliminarImagenProducto = async (req, res) => {
  try {
    const r = await query(
      'DELETE FROM producto_imagenes WHERE id=$1 RETURNING url',
      [parseInt(req.params.img_id)]
    );
    if (!r.rows.length) return res.status(404).json({ ok: false, mensaje: 'Imagen no encontrada' });
    const fs = require('fs');
    const path = require('path');
    const filePath = path.join(__dirname, '../../public', r.rows[0].url);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    res.json({ ok: true, mensaje: 'Imagen eliminada' });
  } catch (err) {
    console.error('eliminarImagenProducto:', err.message);
    res.status(500).json({ ok: false, mensaje: 'Error al eliminar imagen' });
  }
};

const detalleCliente = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [perfil, pedidos] = await Promise.all([
      query(
        'SELECT * FROM fn_obtener_perfil_cliente(CAST($1 AS INTEGER))',
        [id]
      ),
      query(
        'SELECT id, numero, estado, total, created_at FROM pedidos' +
        ' WHERE usuario_id = $1 ORDER BY created_at DESC LIMIT 10',
        [id]
      )
    ]);
    if (!perfil.rows.length) {
      return res.status(404).json({ ok: false, mensaje: 'Cliente no encontrado' });
    }
    res.json({ ok: true, cliente: perfil.rows[0], pedidos_recientes: pedidos.rows });
  } catch (err) {
    console.error('detalleCliente:', err.message);
    res.status(500).json({ ok: false, mensaje: 'Error al obtener cliente' });
  }
};

const detallePedido = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [pedidoRes, itemsRes] = await Promise.all([
      query(
        'SELECT p.id, p.numero, p.estado, p.subtotal, p.costo_envio, p.iva,' +
        ' p.total, p.notas_cliente, p.notas_internas,' +
        ' p.paqueteria, p.numero_guia, p.requiere_factura, p.created_at,' +
        " u.nombre || ' ' || u.apellidos AS cliente_nombre," +
        ' u.email AS email_cliente, u.telefono,' +
        ' me.nombre AS metodo_envio_nombre, mp.nombre AS metodo_pago_nombre,' +
        " p.dir_calle || ', ' || p.dir_colonia || ', ' || p.dir_ciudad || ', ' || p.dir_estado_geo || ', CP ' || p.dir_cp AS direccion_entrega" +
        ' FROM pedidos p' +
        ' JOIN usuarios u ON u.id = p.usuario_id' +
        ' LEFT JOIN metodos_envio me ON me.id = p.metodo_envio_id' +
        ' JOIN metodos_pago mp ON mp.id = p.metodo_pago_id' +
        ' WHERE p.id = $1',
        [id]
      ),
      query(
        'SELECT pi.cantidad, pi.precio_unitario, pi.subtotal,' +
        ' pr.nombre AS nombre_producto, pr.sku' +
        ' FROM pedido_items pi' +
        ' JOIN productos pr ON pr.id = pi.producto_id' +
        ' WHERE pi.pedido_id = $1',
        [id]
      )
    ]);
    if (!pedidoRes.rows.length) {
      return res.status(404).json({ ok: false, mensaje: 'Pedido no encontrado' });
    }
    res.json({ ok: true, pedido: pedidoRes.rows[0], items: itemsRes.rows });
  } catch (err) {
    console.error('detallePedido:', err.message);
    res.status(500).json({ ok: false, mensaje: 'Error al obtener pedido' });
  }
};

const listarMensajes = async (req, res) => {
  try {
    const { leido, pagina = 1 } = req.query;
    const limit = 20;
    const offset = (parseInt(pagina) - 1) * limit;
    let where = '';
    const params = [];
    if (leido === 'true')  { where = ' WHERE leido = true';  }
    if (leido === 'false') { where = ' WHERE leido = false'; }
    const [rows, cnt] = await Promise.all([
      query(
        'SELECT id, nombre, empresa, email, telefono, asunto, mensaje, leido, created_at' +
        ' FROM mensajes_contacto' + where +
        ' ORDER BY created_at DESC LIMIT $' + (params.length+1) + ' OFFSET $' + (params.length+2),
        [...params, limit, offset]
      ),
      query('SELECT COUNT(*) AS total FROM mensajes_contacto' + where, params)
    ]);
    res.json({ ok: true, mensajes: rows.rows, total: parseInt(cnt.rows[0].total) });
  } catch (err) {
    if (err.code === '42P01') return res.json({ ok: true, mensajes: [], total: 0 });
    console.error('listarMensajes:', err.message);
    res.status(500).json({ ok: false, mensaje: 'Error al obtener mensajes' });
  }
};

const marcarMensajeLeido = async (req, res) => {
  try {
    await query('UPDATE mensajes_contacto SET leido = true WHERE id = $1', [parseInt(req.params.id)]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, mensaje: 'Error al marcar mensaje' });
  }
};

module.exports = {
  dashboard, listarClientes, toggleBloqueo,
  listarPedidos, actualizarEstadoPedido,
  alertasInventario, ajustarStock, listarProductos, guardarProducto,
  obtenerConfiguracion, guardarConfiguracion,
  detalleCliente, detallePedido,
  topProductos,
  listarMetodosEnvio, guardarMetodoEnvio, toggleMetodoEnvio,
  exportarProductos, importarProductos,
  subirImagenProducto, eliminarImagenProducto,
  exportarClientes,
  listarAdmins, crearAdmin,
  listarMetodosPago, toggleMetodoPago,
  guardarConfigNotif,
  listarMensajes, marcarMensajeLeido
};

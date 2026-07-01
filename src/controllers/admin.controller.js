const { query }  = require('../config/db');
const bcrypt     = require('bcryptjs');
const PDFDocument = require('pdfkit');
const { enviarActualizacionEstado } = require('../services/email.service');

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
    const limite = 15;
    const offset = (parseInt(pagina) - 1) * limite;
    const params = [];
    let whereExtra = '';

    if (busqueda) {
      params.push(`%${busqueda}%`);
      whereExtra += ` AND (u.nombre ILIKE $${params.length} OR u.apellidos ILIKE $${params.length} OR u.email ILIKE $${params.length} OR COALESCE(u.rfc,'') ILIKE $${params.length})`;
    }
    if (tipo) {
      params.push(tipo);
      whereExtra += ` AND u.tipo = $${params.length}`;
    }

    // Total de registros
    const countRes = await query(
      `SELECT COUNT(*) AS total FROM usuarios u
       WHERE u.rol NOT IN ('admin', 'superadmin')${whereExtra}`,
      params
    );
    const total = parseInt(countRes.rows[0].total) || 0;

    // Datos paginados
    const limitParam  = params.length + 1;
    const offsetParam = params.length + 2;
    const dataRes = await query(
      `SELECT
         u.id            AS r_id,
         u.nombre        AS r_nombre,
         u.apellidos     AS r_apellidos,
         u.email         AS r_email,
         u.telefono      AS r_telefono,
         u.rfc           AS r_rfc,
         u.tipo          AS r_tipo,
         u.activo        AS r_activo,
         u.bloqueado     AS r_bloqueado,
         u.created_at    AS r_created_at,
         COUNT(DISTINCT pe.id)          AS r_num_pedidos,
         COALESCE(SUM(pe.total), 0)     AS r_total_gastado
       FROM usuarios u
       LEFT JOIN pedidos pe
         ON pe.usuario_id = u.id AND pe.estatus_pago = 'pagado'
       WHERE u.rol NOT IN ('admin', 'superadmin')${whereExtra}
       GROUP BY u.id
       ORDER BY COALESCE(SUM(pe.total), 0) DESC, u.created_at DESC
       LIMIT $${limitParam} OFFSET $${offsetParam}`,
      [...params, limite, offset]
    );

    res.json({ ok: true, total, clientes: dataRes.rows });
  } catch (err) {
    console.error('listarClientes:', err.message);
    res.status(500).json({ ok: false, mensaje: 'Error al obtener clientes: ' + err.message });
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

const kpisPedidos = async (req, res) => {
  try {
    const result = await query(`
      SELECT
        COUNT(*)                                                   AS total,
        COUNT(*) FILTER (WHERE created_at::DATE = CURRENT_DATE)   AS pedidos_hoy,
        COUNT(*) FILTER (WHERE estado = 'nuevo')                   AS sin_atender,
        COUNT(*) FILTER (WHERE estado = 'en_preparacion')          AS en_preparacion,
        COUNT(*) FILTER (WHERE estado IN ('enviado','en_camino'))  AS enviados,
        COUNT(*) FILTER (WHERE estado = 'entregado'
                         AND fecha_entrega::DATE = CURRENT_DATE)   AS entregados_hoy
      FROM pedidos
      WHERE estado NOT IN ('cancelado','devolucion')
    `);
    res.json({ ok: true, kpis: result.rows[0] });
  } catch (err) {
    console.error('kpisPedidos:', err.message);
    res.status(500).json({ ok: false, mensaje: 'Error al obtener KPIs de pedidos' });
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

    // Email al cliente — fire-and-forget
    ;(async () => {
      try {
        const r = await query(
          'SELECT p.numero, u.email, u.nombre FROM pedidos p' +
          ' JOIN usuarios u ON u.id = p.usuario_id WHERE p.id = $1',
          [parseInt(req.params.id)]
        );
        if (r.rows.length) {
          const { numero, email, nombre } = r.rows[0];
          await enviarActualizacionEstado({
            to: email, nombre, numeroPedido: numero,
            estado, paqueteria: paqueteria || null, numeroGuia: numero_guia || null,
          });
        }
      } catch (e) {
        console.error('[email] actualización estado:', e.message);
      }
    })();
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
    const limite = parseInt(por_pagina) || 10;
    const offset = (parseInt(pagina) - 1) * limite;
    const params = [];
    let whereExtra = '';

    if (busqueda) {
      params.push(`%${busqueda}%`);
      const idx = params.length;
      whereExtra += ` AND (p.nombre ILIKE $${idx} OR p.sku ILIKE $${idx} OR p.descripcion_corta ILIKE $${idx})`;
    }
    if (categoria_id) {
      params.push(parseInt(categoria_id));
      whereExtra += ` AND p.categoria_id = $${params.length}`;
    }
    if (estado) {
      params.push(estado);
      whereExtra += ` AND p.estado = $${params.length}`;
    }

    const countRes = await query(
      `SELECT COUNT(*) AS total FROM productos p WHERE 1=1${whereExtra}`,
      params
    );
    const total = parseInt(countRes.rows[0].total) || 0;

    const dataRes = await query(
      `SELECT
         p.id            AS r_id,
         p.sku           AS r_sku,
         p.nombre        AS r_nombre,
         p.slug          AS r_slug,
         p.descripcion_corta AS r_descripcion_corta,
         p.descripcion_larga AS r_descripcion_larga,
         p.categoria_id  AS r_categoria_id,
         COALESCE(c.nombre, '—') AS r_categoria,
         p.marca_id      AS r_marca_id,
         m.nombre        AS r_marca,
         p.precio_venta  AS r_precio_venta,
         p.precio_antes  AS r_precio_antes,
         p.stock_actual  AS r_stock_actual,
         p.stock_minimo  AS r_stock_minimo,
         p.estado        AS r_estado,
         p.badge         AS r_badge,
         p.destacado     AS r_destacado,
         (SELECT url FROM producto_imagenes
          WHERE producto_id = p.id AND es_principal = TRUE
          LIMIT 1) AS r_imagen_principal
       FROM productos p
       LEFT JOIN categorias c ON c.id = p.categoria_id
       LEFT JOIN marcas m ON m.id = p.marca_id
       WHERE 1=1${whereExtra}
       ORDER BY p.created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limite, offset]
    );

    res.json({ ok: true, total, productos: dataRes.rows });
  } catch (err) {
    console.error('listarProductos:', err.message);
    res.status(500).json({ ok: false, mensaje: 'Error al obtener productos: ' + err.message });
  }
};

const guardarProducto = async (req, res) => {
  try {
    const id = req.params.id ? parseInt(req.params.id) : 0;
    const { sku, nombre, descripcion_corta, descripcion_larga, categoria_id, marca_id,
            precio_venta, precio_antes, stock_actual, stock_minimo, estado, badge } = req.body;

    // Validaciones básicas
    if (!sku || !nombre || !precio_venta || !categoria_id) {
      return res.status(400).json({ ok: false, mensaje: 'Faltan campos obligatorios: nombre, SKU, precio y categoría' });
    }

    const catId    = parseInt(categoria_id);
    const marcaId  = marca_id ? parseInt(marca_id) : null;
    const precio   = parseFloat(precio_venta);
    const precioAnt= precio_antes ? parseFloat(precio_antes) : null;
    const stockAct = parseInt(stock_actual) || 0;
    const stockMin = parseInt(stock_minimo) || 5;
    const estadoVal= ['activo','inactivo','borrador'].includes(estado) ? estado : 'activo';
    const adminId  = parseInt(req.usuario.id);

    // Generar slug desde el nombre
    const slug = nombre.toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/\s+/g, '-').replace(/[^a-z0-9\-]/g, '').replace(/-+/g, '-');

    if (isNaN(catId) || catId <= 0) {
      return res.status(400).json({ ok: false, mensaje: 'Selecciona una categoría válida' });
    }

    let productoId;

    if (id === 0) {
      // Crear nuevo producto
      const ins = await query(
        `INSERT INTO productos
           (sku, nombre, slug, descripcion_corta, descripcion_larga,
            categoria_id, marca_id, precio_venta, precio_antes,
            stock_actual, stock_minimo, estado, badge)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         RETURNING id`,
        [sku, nombre, slug, descripcion_corta || null, descripcion_larga || null,
         catId, marcaId, precio, precioAnt, stockAct, stockMin, estadoVal, badge || null]
      );
      productoId = ins.rows[0].id;

      // Movimiento inicial de inventario si hay stock (no-fatal)
      if (stockAct > 0) {
        try {
          await query(
            `INSERT INTO inventario_movimientos
               (producto_id, tipo, cantidad, stock_antes, stock_despues, motivo, usuario_id)
             VALUES ($1,'entrada',$2,0,$3,'Stock inicial al crear producto',$4)`,
            [productoId, stockAct, stockAct, adminId]
          );
        } catch (e) { console.warn('inventario_movimientos (crear):', e.message); }
      }

      // Auditoría (no-fatal)
      try {
        await query(
          `INSERT INTO auditoria (usuario_id, accion, tabla, registro_id) VALUES ($1,'crear_producto','productos',$2)`,
          [adminId, productoId]
        );
      } catch (e) { console.warn('auditoria (crear_producto):', e.message); }

      res.status(201).json({ ok: true, mensaje: 'Producto creado exitosamente', producto_id: productoId });
    } else {
      // Actualizar producto existente
      const before = await query('SELECT stock_actual FROM productos WHERE id = $1', [id]);
      if (!before.rows.length) return res.status(404).json({ ok: false, mensaje: 'Producto no encontrado' });
      const stockAntes = before.rows[0].stock_actual;

      await query(
        `UPDATE productos SET
           sku=$1, nombre=$2, slug=$3, descripcion_corta=$4, descripcion_larga=$5,
           categoria_id=$6, marca_id=$7, precio_venta=$8, precio_antes=$9,
           stock_actual=$10, stock_minimo=$11, estado=$12, badge=$13
         WHERE id=$14`,
        [sku, nombre, slug, descripcion_corta || null, descripcion_larga || null,
         catId, marcaId, precio, precioAnt, stockAct, stockMin, estadoVal, badge || null, id]
      );

      if (stockAct !== stockAntes) {
        try {
          await query(
            `INSERT INTO inventario_movimientos
               (producto_id, tipo, cantidad, stock_antes, stock_despues, motivo, usuario_id)
             VALUES ($1,'ajuste',$2,$3,$4,'Ajuste manual desde admin',$5)`,
            [id, stockAct - stockAntes, stockAntes, stockAct, adminId]
          );
        } catch (e) { console.warn('inventario_movimientos (editar):', e.message); }
      }

      // Auditoría (no-fatal)
      try {
        await query(
          `INSERT INTO auditoria (usuario_id, accion, tabla, registro_id) VALUES ($1,'editar_producto','productos',$2)`,
          [adminId, id]
        );
      } catch (e) { console.warn('auditoria (editar_producto):', e.message); }

      res.json({ ok: true, mensaje: 'Producto actualizado exitosamente', producto_id: id });
    }
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ ok: false, mensaje: 'El SKU ya está registrado en otro producto — usa un SKU diferente' });
    if (err.code === '23503') return res.status(400).json({ ok: false, mensaje: 'La categoría o marca seleccionada no existe' });
    console.error('guardarProducto:', err.message);
    res.status(500).json({ ok: false, mensaje: 'Error al guardar: ' + err.message });
  }
};

const toggleEstadoProducto = async (req, res) => {
  try {
    const { estado } = req.body;
    if (!['activo', 'inactivo'].includes(estado)) {
      return res.status(400).json({ ok: false, mensaje: 'Estado inválido' });
    }
    const r = await query(
      'UPDATE productos SET estado = $1 WHERE id = $2 RETURNING id',
      [estado, parseInt(req.params.id)]
    );
    if (!r.rows.length) return res.status(404).json({ ok: false, mensaje: 'Producto no encontrado' });
    res.json({ ok: true, mensaje: estado === 'inactivo' ? 'Producto dado de baja' : 'Producto reactivado' });
  } catch (err) {
    console.error('toggleEstadoProducto:', err.message);
    res.status(500).json({ ok: false, mensaje: 'Error al cambiar estado' });
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
      'SELECT u.nombre, u.apellidos, u.email, u.telefono, u.rfc,' +
      ' u.tipo, u.activo, u.bloqueado, u.created_at,' +
      ' COUNT(p.id) AS total_pedidos,' +
      ' COALESCE(SUM(p.total),0) AS total_gastado' +
      ' FROM usuarios u' +
      " LEFT JOIN pedidos p ON p.usuario_id = u.id AND p.estatus_pago = 'pagado'" +
      " WHERE u.rol NOT IN ('admin','superadmin')" +
      ' GROUP BY u.id ORDER BY u.created_at DESC'
    );

    const doc = new PDFDocument({ margin: 40, size: 'A4', layout: 'landscape' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="clientes-mbs.pdf"');
    doc.pipe(res);

    const W = doc.page.width;
    const MARGIN = 40;
    const tableW = W - MARGIN * 2;

    // ── Cabecera ──────────────────────────────────────────────────
    doc.rect(0, 0, W, 64).fill('#0b1e3d');
    doc.fillColor('#ffffff').fontSize(16).font('Helvetica-Bold').text('MBS Comunicaciones', MARGIN, 16);
    doc.fontSize(9).font('Helvetica').text('Reporte de Clientes', MARGIN, 38);
    doc.fillColor('#f97316').fontSize(8)
       .text('Generado: ' + new Date().toLocaleDateString('es-MX',{day:'2-digit',month:'long',year:'numeric'}), MARGIN, 51);
    doc.fillColor('#94a3b8').fontSize(8)
       .text(`${result.rows.length} registros`, W - MARGIN - 60, 28);

    // ── Tabla ─────────────────────────────────────────────────────
    const HDR   = ['Nombre', 'Apellidos', 'Email', 'Teléfono', 'RFC', 'Tipo', 'Pedidos', 'Total Gastado', 'Estado'];
    const COLS  = [90, 90, 155, 78, 70, 55, 50, 90, 64];  // suma = 742
    const ROW_H = 20;
    const fmtM  = n => '$' + parseFloat(n||0).toLocaleString('es-MX',{minimumFractionDigits:2,maximumFractionDigits:2});
    const fmtD  = s => s ? new Date(s).toLocaleDateString('es-MX',{day:'2-digit',month:'2-digit',year:'numeric'}) : '—';

    const drawHeader = (y) => {
      doc.rect(MARGIN, y, tableW, ROW_H).fill('#1e3a5f');
      let x = MARGIN;
      HDR.forEach((h, i) => {
        doc.fillColor('#ffffff').fontSize(7).font('Helvetica-Bold')
           .text(h, x + 3, y + 7, { width: COLS[i] - 6, lineBreak: false });
        x += COLS[i];
      });
      return y + ROW_H;
    };

    let y = drawHeader(74);

    result.rows.forEach((row, ri) => {
      if (y + ROW_H > doc.page.height - 36) {
        doc.addPage();
        y = drawHeader(40);
      }
      doc.rect(MARGIN, y, tableW, ROW_H).fill(ri % 2 === 0 ? '#f8fafc' : '#ffffff');

      const estado = row.bloqueado ? 'Bloqueado' : (row.activo !== false ? 'Activo' : 'Inactivo');
      const cells  = [
        row.nombre || '—', row.apellidos || '—', row.email || '—',
        row.telefono || '—', row.rfc || '—', row.tipo || '—',
        String(row.total_pedidos || 0), fmtM(row.total_gastado), estado
      ];
      let x = MARGIN;
      cells.forEach((cell, i) => {
        const isEstado = i === 8;
        const color = isEstado
          ? (cell === 'Activo' ? '#16a34a' : cell === 'Bloqueado' ? '#dc2626' : '#64748b')
          : '#1e293b';
        doc.fillColor(color).fontSize(7.5).font(isEstado ? 'Helvetica-Bold' : 'Helvetica')
           .text(cell, x + 3, y + 7, { width: COLS[i] - 6, lineBreak: false });
        x += COLS[i];
      });
      doc.moveTo(MARGIN, y + ROW_H).lineTo(MARGIN + tableW, y + ROW_H)
         .strokeColor('#e2e8f0').lineWidth(0.4).stroke();
      y += ROW_H;
    });

    // Pie de página
    const pageRange = doc.bufferedPageRange();
    for (let i = 0; i < pageRange.count; i++) {
      doc.switchToPage(pageRange.start + i);
      doc.fillColor('#94a3b8').fontSize(7.5)
         .text(`MBS Comunicaciones — Clientes — Pág. ${i + 1} / ${pageRange.count}`,
               MARGIN, doc.page.height - 22, { width: tableW, align: 'center' });
    }

    doc.end();
  } catch (err) {
    console.error('exportarClientes:', err.message);
    if (!res.headersSent) res.status(500).json({ ok: false, mensaje: 'Error al exportar clientes' });
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
      `SELECT p.id, p.nombre, p.sku,
              SUM(pi.cantidad)  AS unidades_vendidas,
              SUM(pi.subtotal)  AS total_vendido
         FROM pedido_items pi
         JOIN productos p  ON p.id  = pi.producto_id
         JOIN pedidos pe   ON pe.id = pi.pedido_id
        WHERE pe.estado NOT IN ('cancelado', 'devolucion')
        GROUP BY p.id, p.nombre, p.sku
        ORDER BY unidades_vendidas DESC
        LIMIT 5`
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
      'SELECT p.sku, p.nombre, p.precio_venta, p.precio_antes,' +
      ' p.stock_actual, p.stock_minimo, p.estado, p.badge,' +
      ' c.nombre AS categoria, m.nombre AS marca' +
      ' FROM productos p' +
      ' LEFT JOIN categorias c ON c.id = p.categoria_id' +
      ' LEFT JOIN marcas m ON m.id = p.marca_id' +
      ' ORDER BY p.nombre'
    );

    const doc = new PDFDocument({ margin: 40, size: 'A4', layout: 'landscape' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="productos-mbs.pdf"');
    doc.pipe(res);

    const W = doc.page.width;
    const MARGIN = 40;
    const tableW = W - MARGIN * 2;

    // ── Cabecera ──────────────────────────────────────────────────
    doc.rect(0, 0, W, 64).fill('#0b1e3d');
    doc.fillColor('#ffffff').fontSize(16).font('Helvetica-Bold').text('MBS Comunicaciones', MARGIN, 16);
    doc.fontSize(9).font('Helvetica').text('Catálogo de Productos', MARGIN, 38);
    doc.fillColor('#f97316').fontSize(8)
       .text('Generado: ' + new Date().toLocaleDateString('es-MX',{day:'2-digit',month:'long',year:'numeric'}), MARGIN, 51);
    doc.fillColor('#94a3b8').fontSize(8)
       .text(`${result.rows.length} productos`, W - MARGIN - 65, 28);

    // ── Tabla ─────────────────────────────────────────────────────
    const HDR  = ['SKU', 'Nombre', 'Categoría', 'Marca', 'Precio', 'Precio Ant.', 'Stock', 'Stock Mín.', 'Estado'];
    const COLS = [85, 175, 100, 90, 75, 75, 50, 55, 57];  // suma = 762
    const ROW_H = 20;
    const fmtM = n => '$' + parseFloat(n||0).toLocaleString('es-MX',{minimumFractionDigits:2,maximumFractionDigits:2});

    const ESTADO_MAP = {
      activo: { label: 'Activo', color: '#16a34a' },
      inactivo: { label: 'Inactivo', color: '#64748b' },
      borrador: { label: 'Borrador', color: '#d97706' },
    };

    const drawHeader = (y) => {
      doc.rect(MARGIN, y, tableW, ROW_H).fill('#1e3a5f');
      let x = MARGIN;
      HDR.forEach((h, i) => {
        doc.fillColor('#ffffff').fontSize(7).font('Helvetica-Bold')
           .text(h, x + 3, y + 7, { width: COLS[i] - 6, lineBreak: false });
        x += COLS[i];
      });
      return y + ROW_H;
    };

    let y = drawHeader(74);

    result.rows.forEach((row, ri) => {
      if (y + ROW_H > doc.page.height - 36) {
        doc.addPage();
        y = drawHeader(40);
      }
      doc.rect(MARGIN, y, tableW, ROW_H).fill(ri % 2 === 0 ? '#f8fafc' : '#ffffff');

      const estInfo = ESTADO_MAP[row.estado] || { label: row.estado || '—', color: '#64748b' };
      const cells = [
        row.sku || '—', row.nombre || '—', row.categoria || '—',
        row.marca || '—', fmtM(row.precio_venta),
        row.precio_antes ? fmtM(row.precio_antes) : '—',
        String(row.stock_actual ?? 0), String(row.stock_minimo ?? 5),
        estInfo.label
      ];
      let x = MARGIN;
      cells.forEach((cell, i) => {
        const isEstado = i === 8;
        const isSku    = i === 0;
        const color = isEstado ? estInfo.color : (isSku ? '#0369a1' : '#1e293b');
        doc.fillColor(color).fontSize(7.5)
           .font(isEstado || isSku ? 'Helvetica-Bold' : 'Helvetica')
           .text(cell, x + 3, y + 7, { width: COLS[i] - 6, lineBreak: false });
        x += COLS[i];
      });
      doc.moveTo(MARGIN, y + ROW_H).lineTo(MARGIN + tableW, y + ROW_H)
         .strokeColor('#e2e8f0').lineWidth(0.4).stroke();
      y += ROW_H;
    });

    // Pie de página
    const pageRange = doc.bufferedPageRange();
    for (let i = 0; i < pageRange.count; i++) {
      doc.switchToPage(pageRange.start + i);
      doc.fillColor('#94a3b8').fontSize(7.5)
         .text(`MBS Comunicaciones — Productos — Pág. ${i + 1} / ${pageRange.count}`,
               MARGIN, doc.page.height - 22, { width: tableW, align: 'center' });
    }

    doc.end();
  } catch (err) {
    console.error('exportarProductos:', err.message);
    if (!res.headersSent) res.status(500).json({ ok: false, mensaje: 'Error al exportar' });
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
        if (!row.sku || !row.nombre) { errores++; continue; }
        const slug = (row.nombre || '').toLowerCase()
          .normalize('NFD').replace(/[̀-ͯ]/g, '')
          .replace(/\s+/g, '-').replace(/[^a-z0-9\-]/g, '');
        const exists = await query('SELECT id FROM productos WHERE sku = $1', [row.sku]);
        if (exists.rows.length) {
          await query(
            `UPDATE productos SET nombre=$1,slug=$2,descripcion_corta=$3,descripcion_larga=$4,
             categoria_id=$5,marca_id=$6,precio_venta=$7,precio_antes=$8,
             stock_actual=$9,stock_minimo=$10,estado=$11,badge=$12 WHERE sku=$13`,
            [row.nombre, slug, row.descripcion_corta||null, row.descripcion_larga||null,
             parseInt(row.categoria_id)||1, row.marca_id?parseInt(row.marca_id):null,
             parseFloat(row.precio_venta)||0, row.precio_antes?parseFloat(row.precio_antes):null,
             parseInt(row.stock_actual)||0, parseInt(row.stock_minimo)||5,
             row.estado||'activo', row.badge||null, row.sku]
          );
          actualizados++;
        } else {
          await query(
            `INSERT INTO productos (sku,nombre,slug,descripcion_corta,descripcion_larga,
             categoria_id,marca_id,precio_venta,precio_antes,stock_actual,stock_minimo,estado,badge)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
            [row.sku, row.nombre, slug, row.descripcion_corta||null, row.descripcion_larga||null,
             parseInt(row.categoria_id)||1, row.marca_id?parseInt(row.marca_id):null,
             parseFloat(row.precio_venta)||0, row.precio_antes?parseFloat(row.precio_antes):null,
             parseInt(row.stock_actual)||0, parseInt(row.stock_minimo)||5,
             row.estado||'activo', row.badge||null]
          );
          creados++;
        }
      } catch (rowErr) { errores++; }
    }
    res.json({ ok: true, creados, actualizados, errores,
      mensaje: `Importación: ${creados} creados, ${actualizados} actualizados, ${errores} errores` });
  } catch (err) {
    console.error('importarProductos:', err.message);
    res.status(500).json({ ok: false, mensaje: 'Error al importar CSV' });
  }
};

/* ── Notificaciones admin ────────────────────────────────────── */
const notificaciones = async (req, res) => {
  try {
    const grupos = [];

    // Pedidos sin atender (estado 'nuevo')
    const pedidosR = await query(
      `SELECT p.id, p.numero, p.total, p.created_at,
              u.nombre || ' ' || u.apellidos AS cliente_nombre
       FROM pedidos p
       JOIN usuarios u ON u.id = p.usuario_id
       WHERE p.estado = 'nuevo'
       ORDER BY p.created_at DESC LIMIT 15`
    );
    if (pedidosR.rows.length) {
      grupos.push({
        tipo: 'pedidos',
        icono: '🛒',
        titulo: 'Pedidos sin atender',
        url: '/admin/pedidos.html',
        count: pedidosR.rows.length,
        items: pedidosR.rows.map(p => ({
          id: p.id,
          texto: p.numero + ' — ' + p.cliente_nombre,
          subtexto: '$' + parseFloat(p.total).toFixed(2) + ' · ' + new Date(p.created_at).toLocaleDateString('es-MX'),
          created_at: p.created_at,
        })),
      });
    }

    // Mensajes de contacto sin leer
    const mensajesR = await query(
      `SELECT id, nombre, asunto, created_at
       FROM mensajes_contacto WHERE leido = FALSE
       ORDER BY created_at DESC LIMIT 10`
    );
    if (mensajesR.rows.length) {
      grupos.push({
        tipo: 'mensajes',
        icono: '✉️',
        titulo: 'Mensajes sin leer',
        url: '/admin/mensajes.html',
        count: mensajesR.rows.length,
        items: mensajesR.rows.map(m => ({
          id: m.id,
          texto: m.asunto || 'Sin asunto',
          subtexto: m.nombre + ' · ' + new Date(m.created_at).toLocaleDateString('es-MX'),
          created_at: m.created_at,
        })),
      });
    }

    res.json({ ok: true, grupos });
  } catch (err) {
    console.error('notificaciones:', err.message);
    res.status(500).json({ ok: false, mensaje: 'Error al obtener notificaciones' });
  }
};

/* ── Clientes (detalle) ──────────────────────────────────────── */
const detalleCliente = async (req, res) => {
  try {
    const [c, p] = await Promise.all([
      query('SELECT * FROM fn_detalle_cliente(CAST($1 AS INTEGER))', [parseInt(req.params.id)]),
      query(`SELECT numero, estado, total, created_at FROM pedidos
             WHERE usuario_id=$1 ORDER BY created_at DESC LIMIT 10`, [parseInt(req.params.id)]),
    ]);
    if (!c.rows.length) return res.status(404).json({ ok: false, mensaje: 'Cliente no encontrado' });
    res.json({ ok: true, cliente: c.rows[0], pedidos_recientes: p.rows });
  } catch (err) { res.status(500).json({ ok: false, mensaje: 'Error al obtener cliente' }); }
};

/* ── Pedidos (detalle) ───────────────────────────────────────── */
const detallePedido = async (req, res) => {
  try {
    const id = parseInt(req.params.id);

    // Pedido + cliente + métodos
    const pedidoRes = await query(
      `SELECT
         p.id, p.numero, p.estado, p.estatus_pago,
         p.subtotal, p.costo_envio, p.iva, p.total,
         p.notas_internas, p.notas_cliente,
         p.paqueteria, p.numero_guia,
         p.dir_nombre || ' ' || p.dir_apellidos                      AS dir_receptor,
         p.dir_calle  || ', ' || p.dir_colonia || ', ' ||
         p.dir_ciudad || ', ' || p.dir_estado_geo || ' ' || p.dir_cp AS direccion_entrega,
         u.nombre || ' ' || u.apellidos  AS cliente_nombre,
         u.email                          AS email_cliente,
         u.telefono                       AS telefono_cliente,
         me.nombre                        AS metodo_envio_nombre,
         mp.nombre                        AS metodo_pago_nombre,
         p.created_at
       FROM pedidos p
       JOIN usuarios u       ON u.id  = p.usuario_id
       JOIN metodos_envio me ON me.id = p.metodo_envio_id
       JOIN metodos_pago  mp ON mp.id = p.metodo_pago_id
       WHERE p.id = $1`,
      [id]
    );

    if (!pedidoRes.rows.length) {
      return res.status(404).json({ ok: false, mensaje: 'Pedido no encontrado' });
    }

    // Items del pedido
    const itemsRes = await query(
      `SELECT nombre AS nombre_producto, sku, cantidad, precio_unitario, subtotal
       FROM pedido_items WHERE pedido_id = $1 ORDER BY id`,
      [id]
    );

    res.json({ ok: true, pedido: pedidoRes.rows[0], items: itemsRes.rows });
  } catch (err) {
    console.error('detallePedido:', err.message);
    res.status(500).json({ ok: false, mensaje: 'Error al obtener pedido' });
  }
};

/* ── Imágenes de producto ────────────────────────────────────── */
const listarImagenesProducto = async (req, res) => {
  try {
    const r = await query(
      'SELECT * FROM producto_imagenes WHERE producto_id=$1 ORDER BY es_principal DESC, id',
      [parseInt(req.params.id)]);
    res.json({ ok: true, imagenes: r.rows });
  } catch (err) { res.status(500).json({ ok: false, mensaje: 'Error al listar imágenes' }); }
};

const subirImagenProducto = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ ok: false, mensaje: 'Archivo requerido' });
    const url = '/uploads/productos/' + req.file.filename;
    const r = await query(
      'INSERT INTO producto_imagenes (producto_id, url, es_principal) VALUES ($1,$2,false) RETURNING *',
      [parseInt(req.params.id), url]);
    res.json({ ok: true, imagen: r.rows[0] });
  } catch (err) { res.status(500).json({ ok: false, mensaje: 'Error al subir imagen' }); }
};

const eliminarImagenProducto = async (req, res) => {
  try {
    await query('DELETE FROM producto_imagenes WHERE id=$1 AND producto_id=$2',
      [parseInt(req.params.img_id), parseInt(req.params.id)]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ ok: false, mensaje: 'Error al eliminar' }); }
};

const marcarPrincipalImagen = async (req, res) => {
  try {
    await query('UPDATE producto_imagenes SET es_principal=false WHERE producto_id=$1',
      [parseInt(req.params.id)]);
    await query('UPDATE producto_imagenes SET es_principal=true WHERE id=$1',
      [parseInt(req.params.img_id)]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ ok: false, mensaje: 'Error al marcar principal' }); }
};

/* ── Categorías y Marcas ─────────────────────────────────────── */
const crearCategoria = async (req, res) => {
  try {
    const { nombre, descripcion, icono } = req.body;
    if (!nombre) return res.status(400).json({ ok: false, mensaje: 'Nombre requerido' });
    const slug = nombre.toLowerCase().normalize('NFD')
      .replace(/[̀-ͯ]/g, '').replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    const r = await query(
      'INSERT INTO categorias (nombre,slug,descripcion,icono) VALUES ($1,$2,$3,$4) RETURNING *',
      [nombre, slug, descripcion || null, icono || null]);
    res.status(201).json({ ok: true, id: r.rows[0].id, categoria: r.rows[0] });
  } catch (err) { res.status(500).json({ ok: false, mensaje: 'Error al crear categoría' }); }
};

const crearMarca = async (req, res) => {
  try {
    const { nombre } = req.body;
    if (!nombre) return res.status(400).json({ ok: false, mensaje: 'Nombre requerido' });
    const r = await query(
      'INSERT INTO marcas (nombre) VALUES ($1) RETURNING *',
      [nombre]);
    res.status(201).json({ ok: true, id: r.rows[0].id, marca: r.rows[0] });
  } catch (err) { res.status(500).json({ ok: false, mensaje: 'Error al crear marca' }); }
};

/* ── Logo ────────────────────────────────────────────────────── */
const subirLogo = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ ok: false, mensaje: 'Archivo requerido' });
    // El middleware guarda siempre como logo.png; construimos la URL pública
    const ext = require('path').extname(req.file.originalname).toLowerCase() || '.png';
    const logoUrl = '/uploads/logo/logo' + ext;
    // Guardar la URL en la tabla configuracion para que /api/config/publica la devuelva
    await query(
      'SELECT fn_guardar_configuracion(CAST($1 AS CHARACTER VARYING), CAST($2 AS TEXT), CAST($3 AS INTEGER))',
      ['logo_url', logoUrl, parseInt(req.usuario.id)]
    );
    res.json({ ok: true, url: logoUrl, mensaje: 'Logo actualizado correctamente' });
  } catch (err) {
    console.error('subirLogo:', err.message);
    res.status(500).json({ ok: false, mensaje: 'Error al subir logo' });
  }
};

/* ── Mensajes de contacto ────────────────────────────────────── */
const listarMensajes = async (req, res) => {
  try {
    const pagina    = Math.max(1, parseInt(req.query.pagina) || 1);
    const porPagina = 20;
    const offset    = (pagina - 1) * porPagina;

    let filtroWhere = '';
    if (req.query.leido === 'true')  filtroWhere = 'WHERE leido = TRUE';
    if (req.query.leido === 'false') filtroWhere = 'WHERE leido = FALSE';

    const countRes = await query(
      `SELECT COUNT(*) AS total FROM mensajes_contacto ${filtroWhere}`
    );
    const total = parseInt(countRes.rows[0].total);

    const dataRes = await query(
      `SELECT id, nombre, empresa, email, telefono, asunto, mensaje, leido, created_at
         FROM mensajes_contacto
         ${filtroWhere}
         ORDER BY created_at DESC
         LIMIT $1 OFFSET $2`,
      [porPagina, offset]
    );

    res.json({ ok: true, mensajes: dataRes.rows, total, pagina, porPagina });
  } catch (err) {
    console.error('listarMensajes:', err.message);
    res.status(500).json({ ok: false, mensaje: 'Error al cargar mensajes' });
  }
};

const marcarMensajeLeido = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await query('UPDATE mensajes_contacto SET leido = TRUE WHERE id = $1', [id]);
    res.json({ ok: true, mensaje: 'Mensaje marcado como leído' });
  } catch (err) {
    console.error('marcarMensajeLeido:', err.message);
    res.status(500).json({ ok: false, mensaje: 'Error al marcar mensaje' });
  }
};

/* -- Exports -- */
module.exports = {
  dashboard, kpisPedidos, notificaciones, topProductos,
  listarClientes, detalleCliente, toggleBloqueo, exportarClientes,
  listarPedidos, actualizarEstadoPedido, detallePedido,
  listarProductos, guardarProducto, toggleEstadoProducto,
  crearCategoria, crearMarca,
  listarImagenesProducto, subirImagenProducto, eliminarImagenProducto, marcarPrincipalImagen,
  exportarProductos, importarProductos,
  alertasInventario, ajustarStock,
  obtenerConfiguracion, guardarConfiguracion, guardarConfigNotif, subirLogo,
  listarAdmins, crearAdmin,
  listarMetodosPago, toggleMetodoPago,
  listarMetodosEnvio, guardarMetodoEnvio, toggleMetodoEnvio,
  listarMensajes, marcarMensajeLeido,
};

/**
 * fix-imagenes-principal.js
 * Repara las imágenes existentes que se subieron sin es_principal = TRUE.
 *
 * Ejecutar desde mbs_backend/:
 *   node fix-imagenes-principal.js
 */
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  host:     process.env.DB_HOST,
  port:     parseInt(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME,
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

async function main() {
  const client = await pool.connect();
  try {
    console.log('Conectado a PostgreSQL...\n');

    // 1. Diagnóstico
    const check = await client.query(`
      SELECT
        p.id           AS producto_id,
        p.nombre,
        COUNT(pi.id)   AS total_imagenes,
        COUNT(pi.id) FILTER (WHERE pi.es_principal = TRUE) AS imagenes_principal
      FROM productos p
      JOIN producto_imagenes pi ON pi.producto_id = p.id
      GROUP BY p.id, p.nombre
      ORDER BY p.id
    `);

    console.log('Estado de imágenes por producto:');
    let sinPrincipal = 0;
    check.rows.forEach(r => {
      const ok = parseInt(r.imagenes_principal) > 0 ? '✓' : '✗ SIN PRINCIPAL';
      console.log(`  [${r.producto_id}] ${r.nombre} — ${r.total_imagenes} img, ${r.imagenes_principal} principal ${ok}`);
      if (parseInt(r.imagenes_principal) === 0) sinPrincipal++;
    });

    if (sinPrincipal === 0) {
      console.log('\n✅ Todas las imágenes ya tienen una imagen principal asignada. No se requiere reparación.');
      return;
    }

    console.log(`\n⚠️  ${sinPrincipal} producto(s) sin imagen principal. Reparando...`);

    // 2. Reparar: marcar la imagen con menor orden (o menor id) como principal
    const fix = await client.query(`
      UPDATE producto_imagenes pi
      SET es_principal = TRUE
      FROM (
        SELECT DISTINCT ON (producto_id) id
          FROM producto_imagenes
         WHERE producto_id IN (
           SELECT producto_id
             FROM producto_imagenes
            GROUP BY producto_id
           HAVING COUNT(*) FILTER (WHERE es_principal = TRUE) = 0
         )
         ORDER BY producto_id, orden ASC, id ASC
      ) sub
      WHERE pi.id = sub.id
      RETURNING pi.producto_id, pi.id, pi.url
    `);

    console.log(`\n✅ Reparadas ${fix.rowCount} imagen(es) como principal:`);
    fix.rows.forEach(r => {
      console.log(`  producto_id=${r.producto_id} → imagen id=${r.id} (${r.url})`);
    });

  } finally {
    client.release();
    await pool.end();
    console.log('\nListo. Recarga el catálogo para ver los cambios.');
  }
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});

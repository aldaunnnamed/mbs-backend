const { Pool } = require('pg');

const pool = new Pool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     parseInt(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME     || 'mbs_comunicaciones',
  user:     process.env.DB_USER     || 'postgres',
  password: process.env.DB_PASSWORD || '',
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.connect((err, client, release) => {
  if (err) {
    console.error('ERROR conectando a PostgreSQL:', err.message);
  } else {
    release();
    console.log('Conectado a PostgreSQL -', process.env.DB_NAME);
  }
});

const query = (text, params) => pool.query(text, params);

module.exports = { pool, query };

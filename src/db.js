require('dotenv').config();
const { Pool } = require('pg');

const url = process.env.DATABASE_URL || '';
const isLocal = /localhost|127\.0\.0\.1/.test(url);

// Online databases (Neon, Supabase) need SSL. Local PostgreSQL does not.
const pool = new Pool({
  connectionString: url,
  ssl: isLocal ? false : { rejectUnauthorized: false },
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 20000, // Neon may need a few seconds to wake up
});

pool.on('error', (e) => console.error('pg pool error', e.message));

module.exports = {
  pool,
  query: (text, params) => pool.query(text, params),
};
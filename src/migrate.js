// Runs every .sql file in /sql once, in name order.
const fs = require('fs');
const path = require('path');
const db = require('./db');

(async () => {
  await db.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  const dir = path.join(__dirname, '..', 'sql');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  for (const f of files) {
    const done = await db.query('SELECT 1 FROM schema_migrations WHERE name=$1', [f]);
    if (done.rowCount) {
      console.log('skip   ', f);
      continue;
    }
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(fs.readFileSync(path.join(dir, f), 'utf8'));
      await client.query('INSERT INTO schema_migrations(name) VALUES($1)', [f]);
      await client.query('COMMIT');
      console.log('applied', f);
    } catch (e) {
      await client.query('ROLLBACK');
      console.error('FAILED ', f, e.message);
      process.exit(1);
    } finally {
      client.release();
    }
  }
  await db.pool.end();
})();
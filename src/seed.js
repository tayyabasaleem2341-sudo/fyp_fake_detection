// Dev data: one admin, one demo user, model versions.
const bcrypt = require('bcryptjs');
const db = require('./db');

(async () => {
  const users = [
    ['Admin', 'admin@fakedetection.app', 'Admin@12345', 'admin'],
    ['Demo User', 'demo@fakedetection.app', 'Demo@12345', 'user'],
  ];
  for (const [name, email, pass, role] of users) {
    const hash = await bcrypt.hash(pass, 10);
    await db.query(
      `INSERT INTO users(name,email,password_hash,role) VALUES($1,$2,$3,$4)
       ON CONFLICT (email) DO NOTHING`,
      [name, email, hash, role]
    );
    console.log('user:', email, '/', pass, `(${role})`);
  }
  const has = await db.query('SELECT 1 FROM model_versions LIMIT 1');
  if (!has.rowCount) {
    const models = [
      ['image', 'Image deepfake', 'mock-v0'],
      ['forgery', 'Forgery localization', 'mock-v0'],
      ['message', 'Scam message', 'mock-v0'],
      ['url', 'URL analysis', 'mock-v0'],
      ['fusion', 'Evidence fusion', 'rule-v1'],
    ];
    for (const [module, name, version] of models) {
      await db.query('INSERT INTO model_versions(module,name,version) VALUES($1,$2,$3)', [module, name, version]);
    }
    console.log('model versions seeded');
  }
  await db.pool.end();
})();
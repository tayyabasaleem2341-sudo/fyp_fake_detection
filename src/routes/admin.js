const express = require('express');
const db = require('../db');

const router = express.Router();

router.get('/stats', async (req, res, next) => {
  try {
    const [u, c, a, usage, models] = await Promise.all([
      db.query('SELECT count(*)::int AS n FROM users'),
      db.query('SELECT count(*)::int AS n FROM cases'),
      db.query('SELECT count(*)::int AS n FROM analysis_results'),
      db.query('SELECT module, count(*)::int AS n FROM analysis_results GROUP BY module ORDER BY n DESC'),
      db.query('SELECT module, name, version, active FROM model_versions ORDER BY module'),
    ]);
    res.json({
      users: u.rows[0].n,
      cases: c.rows[0].n,
      analyses: a.rows[0].n,
      usage: Object.fromEntries(usage.rows.map((r) => [r.module, r.n])),
      models: models.rows,
    });
  } catch (e) { next(e); }
});

module.exports = router;
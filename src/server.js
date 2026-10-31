require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { ZodError } = require('zod');
const multer = require('multer');
const db = require('./db');
const { required, adminOnly } = require('./middleware/auth');

if (!process.env.JWT_SECRET || !process.env.DATABASE_URL) {
  console.error('Missing JWT_SECRET or DATABASE_URL in .env');
  process.exit(1);
}

const app = express();
app.set('trust proxy', 1); // Render sits behind a proxy
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use('/api', rateLimit({ windowMs: 15 * 60 * 1000, limit: 600, standardHeaders: true, legacyHeaders: false }));

// Public: used by the "Server Status" screen in the app.
app.get('/api/health', async (req, res) => {
  let dbOk = false;
  try { await db.query('SELECT 1'); dbOk = true; } catch (_) {}
  res.json({
    status: dbOk ? 'ok' : 'degraded',
    db: dbOk,
    ai: process.env.AI_SERVICE_URL ? 'worker' : 'mock',
    version: '0.1.0',
    time: new Date().toISOString(),
  });
});

app.use('/api/auth', require('./routes/auth'));
app.use('/api/cases', required, require('./routes/cases'));
app.use('/api/analyze', required, require('./routes/analyze'));
app.use('/api/admin', required, adminOnly, require('./routes/admin'));

app.use((req, res) => res.status(404).json({ error: 'Not found' }));

// Central error handler
app.use((err, req, res, next) => {
  if (err instanceof ZodError) {
    return res.status(400).json({ error: 'Invalid input', details: err.issues.map((i) => `${i.path.join('.')}: ${i.message}`) });
  }
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'File too large' : err.message });
  }
  if (err.message === 'Unsupported file type') return res.status(415).json({ error: err.message });
  console.error(err);
  res.status(500).json({ error: 'Server error' });
});

const port = process.env.PORT || 3000;
app.listen(port, '0.0.0.0', () => console.log(`Fake Detection API on http://0.0.0.0:${port}`));
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const { z } = require('zod');
const db = require('../db');
const audit = require('../audit');
const { required } = require('../middleware/auth');

const router = express.Router();
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false });

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email, role: u.role });

async function issueTokens(user) {
  const accessToken = jwt.sign({ sub: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '15m' });
  const refreshToken = crypto.randomBytes(48).toString('hex');
  await db.query(
    `INSERT INTO refresh_tokens(user_id,token_hash,expires_at) VALUES($1,$2, now() + interval '30 days')`,
    [user.id, sha(refreshToken)]
  );
  return { user: publicUser(user), accessToken, refreshToken };
}

const registerSchema = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.string().trim().toLowerCase().email().max(200),
  password: z.string().min(6).max(100),
});
const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1).max(100),
});

router.post('/register', limiter, async (req, res, next) => {
  try {
    const b = registerSchema.parse(req.body);
    const exists = await db.query('SELECT 1 FROM users WHERE email=$1', [b.email]);
    if (exists.rowCount) return res.status(409).json({ error: 'Email already registered' });
    const hash = await bcrypt.hash(b.password, 10);
    const r = await db.query(
      'INSERT INTO users(name,email,password_hash) VALUES($1,$2,$3) RETURNING *',
      [b.name, b.email, hash]
    );
    req.user = { id: r.rows[0].id };
    audit(req, 'register', 'user', r.rows[0].id);
    res.status(201).json(await issueTokens(r.rows[0]));
  } catch (e) { next(e); }
});

router.post('/login', limiter, async (req, res, next) => {
  try {
    const b = loginSchema.parse(req.body);
    const r = await db.query('SELECT * FROM users WHERE email=$1', [b.email]);
    const u = r.rows[0];
    if (!u || !(await bcrypt.compare(b.password, u.password_hash))) {
      return res.status(401).json({ error: 'Wrong email or password' });
    }
    req.user = { id: u.id };
    audit(req, 'login', 'user', u.id);
    res.json(await issueTokens(u));
  } catch (e) { next(e); }
});

// Refresh with rotation: old refresh token is revoked, a new pair is returned.
router.post('/refresh', limiter, async (req, res, next) => {
  try {
    const { refreshToken } = z.object({ refreshToken: z.string().min(10) }).parse(req.body);
    const r = await db.query(
      `SELECT rt.id AS rt_id, u.* FROM refresh_tokens rt JOIN users u ON u.id = rt.user_id
       WHERE rt.token_hash=$1 AND rt.revoked=false AND rt.expires_at > now()`,
      [sha(refreshToken)]
    );
    if (!r.rowCount) return res.status(401).json({ error: 'Invalid refresh token' });
    await db.query('UPDATE refresh_tokens SET revoked=true WHERE id=$1', [r.rows[0].rt_id]);
    res.json(await issueTokens(r.rows[0]));
  } catch (e) { next(e); }
});

router.post('/logout', async (req, res, next) => {
  try {
    const { refreshToken } = z.object({ refreshToken: z.string().optional() }).parse(req.body);
    if (refreshToken) await db.query('UPDATE refresh_tokens SET revoked=true WHERE token_hash=$1', [sha(refreshToken)]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.get('/me', required, async (req, res, next) => {
  try {
    const r = await db.query('SELECT * FROM users WHERE id=$1', [req.user.id]);
    if (!r.rowCount) return res.status(404).json({ error: 'User not found' });
    res.json({ user: publicUser(r.rows[0]) });
  } catch (e) { next(e); }
});

module.exports = router;
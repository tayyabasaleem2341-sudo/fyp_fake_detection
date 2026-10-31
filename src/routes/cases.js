const express = require('express');
const { z } = require('zod');
const db = require('../db');
const audit = require('../audit');

const router = express.Router();
const isUuid = (s) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

const toEvidence = (r) => ({ id: r.id, type: r.module, title: r.title, result: r.result });
const toCase = (c, evidence) => ({
  id: c.id, title: c.title, status: c.status, notes: c.notes, createdAt: c.created_at, evidence,
});

async function ownCase(req, res) {
  const id = req.params.id;
  if (!isUuid(id)) { res.status(404).json({ error: 'Case not found' }); return null; }
  const r = await db.query('SELECT * FROM cases WHERE id=$1 AND user_id=$2', [id, req.user.id]);
  if (!r.rowCount) { res.status(404).json({ error: 'Case not found' }); return null; }
  return r.rows[0];
}

router.get('/', async (req, res, next) => {
  try {
    const cs = await db.query('SELECT * FROM cases WHERE user_id=$1 ORDER BY created_at DESC', [req.user.id]);
    const ids = cs.rows.map((c) => c.id);
    const ev = ids.length
      ? await db.query('SELECT * FROM evidence_items WHERE case_id = ANY($1) ORDER BY created_at', [ids])
      : { rows: [] };
    res.json(cs.rows.map((c) => toCase(c, ev.rows.filter((e) => e.case_id === c.id).map(toEvidence))));
  } catch (e) { next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const { title } = z.object({ title: z.string().trim().min(1).max(120) }).parse(req.body);
    const r = await db.query('INSERT INTO cases(user_id,title) VALUES($1,$2) RETURNING *', [req.user.id, title]);
    audit(req, 'case.create', 'case', r.rows[0].id);
    res.status(201).json(toCase(r.rows[0], []));
  } catch (e) { next(e); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const c = await ownCase(req, res);
    if (!c) return;
    const ev = await db.query('SELECT * FROM evidence_items WHERE case_id=$1 ORDER BY created_at', [c.id]);
    res.json(toCase(c, ev.rows.map(toEvidence)));
  } catch (e) { next(e); }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const c = await ownCase(req, res);
    if (!c) return;
    const b = z.object({
      status: z.enum(['open', 'analyzing', 'completed']).optional(),
      title: z.string().trim().min(1).max(120).optional(),
    }).parse(req.body);
    const r = await db.query(
      'UPDATE cases SET status=COALESCE($1,status), title=COALESCE($2,title), updated_at=now() WHERE id=$3 RETURNING *',
      [b.status ?? null, b.title ?? null, c.id]
    );
    const ev = await db.query('SELECT * FROM evidence_items WHERE case_id=$1 ORDER BY created_at', [c.id]);
    audit(req, 'case.update', 'case', c.id);
    res.json(toCase(r.rows[0], ev.rows.map(toEvidence)));
  } catch (e) { next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const c = await ownCase(req, res);
    if (!c) return;
    await db.query('DELETE FROM cases WHERE id=$1', [c.id]);
    audit(req, 'case.delete', 'case', c.id);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.post('/:id/evidence', async (req, res, next) => {
  try {
    const c = await ownCase(req, res);
    if (!c) return;
    const b = z.object({
      type: z.string().min(1).max(30),
      title: z.string().trim().min(1).max(300),
      analysisId: z.string().optional().nullable(),
      result: z.any().optional(),
    }).parse(req.body);
    await db.query('INSERT INTO evidence_items(case_id,analysis_id,module,title,result) VALUES($1,$2,$3,$4,$5)', [
      c.id, b.analysisId && isUuid(b.analysisId) ? b.analysisId : null, b.type, b.title, b.result ?? null,
    ]);
    await db.query('UPDATE cases SET updated_at=now() WHERE id=$1', [c.id]);
    const ev = await db.query('SELECT * FROM evidence_items WHERE case_id=$1 ORDER BY created_at', [c.id]);
    audit(req, 'evidence.add', 'case', c.id);
    res.status(201).json(toCase(c, ev.rows.map(toEvidence)));
  } catch (e) { next(e); }
});

router.delete('/:id/evidence/:eid', async (req, res, next) => {
  try {
    const c = await ownCase(req, res);
    if (!c) return;
    if (isUuid(req.params.eid)) {
      await db.query('DELETE FROM evidence_items WHERE id=$1 AND case_id=$2', [req.params.eid, c.id]);
    }
    const ev = await db.query('SELECT * FROM evidence_items WHERE case_id=$1 ORDER BY created_at', [c.id]);
    audit(req, 'evidence.remove', 'case', c.id);
    res.json(toCase(c, ev.rows.map(toEvidence)));
  } catch (e) { next(e); }
});

module.exports = router;
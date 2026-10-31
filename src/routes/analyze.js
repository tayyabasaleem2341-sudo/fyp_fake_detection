const express = require('express');
const multer = require('multer');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { z } = require('zod');
const db = require('../db');
const audit = require('../audit');
const { runAi } = require('../mockAi');

const router = express.Router();
const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || 'uploads');

const IMAGE_MODULES = ['image', 'forgery', 'document', 'ocr', 'metadata', 'reverse'];
const TEXT_MODULES = ['message', 'email', 'url', 'qr'];
const ALL = [...IMAGE_MODULES, 'video', ...TEXT_MODULES];

const IMAGE_MIME = ['image/jpeg', 'image/png', 'image/webp'];
const VIDEO_MIME = ['video/mp4', 'video/quicktime', 'video/webm'];
const MAX_IMAGE = 15 * 1024 * 1024;
const MAX_VIDEO = 100 * 1024 * 1024;

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(UPLOAD_DIR, req.user.id);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  // Never trust the client filename: random name, keep only a safe extension.
  filename: (req, file, cb) => {
    const ext = (path.extname(file.originalname) || '').toLowerCase().replace(/[^.a-z0-9]/g, '').slice(0, 6);
    cb(null, crypto.randomBytes(16).toString('hex') + ext);
  },
});

const IMAGE_EXT = ['.jpg', '.jpeg', '.png', '.webp'];
const VIDEO_EXT = ['.mp4', '.mov', '.webm'];

const upload = multer({
  storage,
  limits: { fileSize: MAX_VIDEO, files: 1 },
  fileFilter: (req, file, cb) => {
    const isVideo = req.params.module === 'video';
    const ext = path.extname(file.originalname || '').toLowerCase();
    const mimeOk = (isVideo ? VIDEO_MIME : IMAGE_MIME).includes(file.mimetype);
    const extOk = (isVideo ? VIDEO_EXT : IMAGE_EXT).includes(ext);
    const ok = mimeOk || (file.mimetype === 'application/octet-stream' && extOk);
    cb(ok ? null : new Error('Unsupported file type'), ok);
  },
});

router.post('/:module', (req, res, next) => {
  if (!ALL.includes(req.params.module)) return res.status(404).json({ error: 'Unknown module' });
  next();
}, upload.single('file'), async (req, res, next) => {
  const module = req.params.module;
  try {
    let text = null;
    let uploadId = null;

    if (TEXT_MODULES.includes(module)) {
      text = z.object({ text: z.string().trim().min(1).max(20000) }).parse(req.body).text;
    } else {
      if (!req.file) return res.status(400).json({ error: 'File is required' });
      if (module !== 'video' && req.file.size > MAX_IMAGE) {
        fs.unlink(req.file.path, () => {});
        return res.status(413).json({ error: 'Image too large (max 15 MB)' });
      }
      const sha = crypto.createHash('sha256').update(fs.readFileSync(req.file.path)).digest('hex');
      const up = await db.query(
        `INSERT INTO uploads(user_id,module,original_name,stored_path,mime,size_bytes,sha256)
         VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
        [req.user.id, module, req.file.originalname?.slice(0, 200), req.file.path, req.file.mimetype, req.file.size, sha]
      );
      uploadId = up.rows[0].id;
    }

    const result = await runAi(module, { text, filePath: req.file?.path });
    const saved = await db.query(
      `INSERT INTO analysis_results(user_id,upload_id,module,score,label,reliability,signals,explanation,regions,timeline,model_version,input_preview)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
      [req.user.id, uploadId, module, result.score, result.label, result.reliability,
        JSON.stringify(result.signals), result.explanation, JSON.stringify(result.regions),
        JSON.stringify(result.timeline), result.modelVersion, text ? text.slice(0, 200) : req.file?.originalname?.slice(0, 200)]
    );
    audit(req, 'analyze.' + module, 'analysis', saved.rows[0].id);
    res.json({ analysisId: saved.rows[0].id, ...result });
  } catch (e) { next(e); }
});

module.exports = router;
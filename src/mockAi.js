// Placeholder "AI" used until the real models are trained in Colab (Phases 4-6).
// Same JSON shape the real inference worker will return.
const crypto = require('crypto');

const NOTE = 'Mock result for testing. Further verification recommended.';
const S = (label, description, weight) => ({ label, description, weight });

const RESULTS = {
  image: { score: 0.72, label: 'AI manipulation signal detected', reliability: 'medium',
    signals: [S('Texture inconsistency', 'Skin texture looks unnaturally smooth', 0.42),
      S('Lighting mismatch', 'Face and background lighting differ', 0.31),
      S('Metadata missing', 'Weak signal only: social apps strip EXIF', 0.05)],
    regions: [{ x: 0.3, y: 0.2, w: 0.35, h: 0.4, score: 0.8 }] },
  forgery: { score: 0.64, label: 'Edited region signals', reliability: 'medium',
    signals: [S('Compression mismatch', 'One region has a different error level', 0.4),
      S('Edge artifacts', 'Unnatural edges around an object', 0.26)],
    regions: [{ x: 0.35, y: 0.25, w: 0.3, h: 0.35, score: 0.8 }, { x: 0.6, y: 0.6, w: 0.25, h: 0.2, score: 0.55 }] },
  video: { score: 0.76, label: 'Video manipulation signals', reliability: 'medium',
    signals: [S('Face blending', 'Face edge inconsistency across frames', 0.4),
      S('Temporal flicker', 'Unstable texture between frames', 0.3)],
    timeline: [{ seconds: 4, label: 'Face boundary artifacts', score: 0.82 },
      { seconds: 11, label: 'Lighting flicker', score: 0.7 }, { seconds: 23, label: 'Lip-sync mismatch', score: 0.77 }] },
  document: { score: 0.69, label: 'Possible tampering signals', reliability: 'medium',
    signals: [S('Amount field edited', 'Font and spacing differ from nearby text', 0.45),
      S('Date inconsistency', 'Date and time format do not match', 0.24)],
    regions: [{ x: 0.15, y: 0.42, w: 0.55, h: 0.12, score: 0.85 }] },
  ocr: { score: 0.7, label: 'Text extracted, scam signals found', reliability: 'medium',
    signals: [S('Text extracted', '86% OCR confidence', 0.1), S('Urgency wording', 'Asks you to act within minutes', 0.4),
      S('Payment request', 'Asks for money transfer', 0.3)] },
  metadata: { score: 0.38, label: 'Some metadata signals', reliability: 'low',
    signals: [S('Editing software tag', 'Software field mentions an image editor', 0.3),
      S('Date mismatch', 'Created and modified dates differ', 0.2),
      S('Metadata missing', 'Weak signal only: social apps remove EXIF', 0.05)] },
  reverse: { score: 0.55, label: 'Similar image found', reliability: 'medium',
    signals: [S('Near-duplicate match', '91% similar to a previously reported image', 0.5),
      S('First seen', 'First reported 12 days ago', 0.15)] },
  message: { score: 0.86, label: 'Scam signals detected', reliability: 'high',
    signals: [S('Urgency pressure', 'Asks you to act immediately', 0.4), S('Suspicious link', 'Contains a shortened or unusual URL', 0.33),
      S('Sensitive request', 'Asks for OTP, PIN or payment', 0.25)] },
  email: { score: 0.74, label: 'Phishing signals detected', reliability: 'medium',
    signals: [S('Sender mismatch', 'Display name does not match sender domain', 0.38),
      S('Credential request', 'Asks you to verify your account', 0.3), S('External link', 'Link points to a different domain', 0.22)] },
  url: { score: 0.81, label: 'Risky link signals detected', reliability: 'medium',
    signals: [S('Brand look-alike', 'Domain is similar to a popular brand', 0.41),
      S('Suspicious structure', 'Many subdomains and hyphens', 0.27), S('Newly seen domain', 'Not in the trusted top-domain list', 0.2)] },
  qr: { score: 0.62, label: 'QR payload signals', reliability: 'medium',
    signals: [S('Payment request payload', 'QR asks you to send money', 0.4), S('Unknown receiver', 'Receiver is not in a trusted list', 0.22)] },
};

// Small deterministic variation from the input so different inputs do not look identical.
function jitter(seed) {
  const h = crypto.createHash('sha1').update(seed || 'x').digest();
  return (h[0] / 255 - 0.5) * 0.1; // -0.05 .. +0.05
}

async function analyzeMock(module, { text, filePath } = {}) {
  await new Promise((r) => setTimeout(r, 600));
  const base = RESULTS[module] || RESULTS.image;
  const score = Math.min(0.99, Math.max(0.01, base.score + jitter(text || filePath)));
  return {
    score: Math.round(score * 1000) / 1000,
    label: base.label,
    reliability: base.reliability,
    signals: base.signals,
    explanation: NOTE,
    regions: base.regions || [],
    timeline: base.timeline || [],
    modelVersion: 'mock-v0',
  };
}

// Phase 4+: if AI_SERVICE_URL is set, forward to the private Python worker here.
async function runAi(module, input) {
  return analyzeMock(module, input);
}

module.exports = { runAi };
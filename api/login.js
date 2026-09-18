import { signToken, timingSafeStringEqual } from './_auth.js';

// Very small per-IP rate limit to slow down password guessing. This is a
// single serverless-function-instance memory map, so it's best-effort
// (Vercel may route retries to a fresh instance) — not a substitute for a
// strong password, but it costs nothing and blunts naive brute forcing.
const attempts = new Map();
const WINDOW_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 8;

// Entries are only removed on a successful login, so on a long-lived warm
// instance the map would otherwise grow for every distinct IP that ever
// failed. Sweep expired windows whenever it gets big.
function pruneAttempts(now) {
  if (attempts.size < 500) return;
  for (const [key, rec] of attempts) {
    if (now - rec.first >= WINDOW_MS) attempts.delete(key);
  }
}

export default function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'method not allowed' });
      return;
    }

    const ip = (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown')
      .toString()
      .split(',')[0]
      .trim();
    const now = Date.now();
    pruneAttempts(now);
    const record = attempts.get(ip);
    if (record && now - record.first < WINDOW_MS && record.count >= MAX_ATTEMPTS) {
      res.status(429).json({ error: 'too many attempts, try again later' });
      return;
    }

    if (!process.env.CMS_PASSWORD || !process.env.CMS_SECRET) {
      res.status(500).json({ error: 'CMS is not configured on the server yet' });
      return;
    }

    const body = req.body || {};
    const password = typeof body.password === 'string' ? body.password : '';

    if (!password || !timingSafeStringEqual(password, process.env.CMS_PASSWORD)) {
      const next = record && now - record.first < WINDOW_MS
        ? { first: record.first, count: record.count + 1 }
        : { first: now, count: 1 };
      attempts.set(ip, next);
      res.status(401).json({ error: 'incorrect password' });
      return;
    }

    attempts.delete(ip);
    const exp = now + 1000 * 60 * 60 * 4; // 4-hour session
    res.status(200).json({ token: signToken({ exp }), exp });
  } catch (err) {
    // Without this a thrown error renders Vercel's HTML crash page, which
    // the CMS then fails to parse as JSON and reports as a confusing
    // "Unexpected token" instead of the real problem.
    res.status(500).json({ error: 'login failed: ' + (err && err.message ? err.message : String(err)) });
  }
}

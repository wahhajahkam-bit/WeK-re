import { put, list } from '@vercel/blob';
import { verifyToken, bearerToken } from './_auth.js';

const ALLOWED_SLOTS = new Set([
  'who-1', 'who-2', 'who-3', 'who-4', 'who-5',
  'team-1', 'team-2', 'team-3', 'team-4',
  'mentor-hero',
  'home-story-1', 'home-story-2',
  'story-1', 'story-2', 'story-3', 'story-4', 'story-5', 'story-6',
]);

const ALLOWED_TYPES = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };
const MAX_BYTES = 8 * 1024 * 1024;

async function getManifest() {
  const { blobs } = await list({ prefix: 'manifest.json', limit: 1 });
  if (!blobs.length) return {};
  const r = await fetch(blobs[0].url, { cache: 'no-store' });
  if (!r.ok) return {};
  try {
    return await r.json();
  } catch {
    return {};
  }
}

async function saveManifest(manifest) {
  await put('manifest.json', JSON.stringify(manifest), {
    access: 'public',
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: 'application/json',
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method not allowed' });
    return;
  }

  if (!verifyToken(bearerToken(req))) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }

  const slot = (req.query.slot || '').toString();
  if (!ALLOWED_SLOTS.has(slot)) {
    res.status(400).json({ error: 'unknown slot' });
    return;
  }

  const contentType = (req.headers['content-type'] || '').split(';')[0].trim();
  const ext = ALLOWED_TYPES[contentType];
  if (!ext) {
    res.status(400).json({ error: 'unsupported image type (use PNG, JPEG, or WebP)' });
    return;
  }

  const buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body || '');
  if (!buffer.length) {
    res.status(400).json({ error: 'empty upload' });
    return;
  }
  if (buffer.length > MAX_BYTES) {
    res.status(413).json({ error: 'image too large (max 8MB)' });
    return;
  }

  const blob = await put(`images/${slot}.${ext}`, buffer, {
    access: 'public',
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType,
  });

  const manifest = await getManifest();
  manifest[slot] = `${blob.url}?v=${Date.now()}`;
  await saveManifest(manifest);

  res.status(200).json({ url: manifest[slot], slot });
}

export const config = {
  api: { bodyParser: { sizeLimit: '9mb' } },
};

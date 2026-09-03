import { list } from '@vercel/blob';

// Public, read-only: the manifest only ever contains image URLs, nothing
// sensitive, and every page fetches it on load to know which slots have a
// real photo uploaded via the CMS.
export default async function handler(req, res) {
  try {
    const { blobs } = await list({ prefix: 'manifest.json', limit: 1 });
    if (!blobs.length) {
      res.status(200).json({});
      return;
    }
    // See the matching comment in api/upload.js's getManifest() — the
    // cache-busting query string is what actually guarantees freshness,
    // not the response header alone.
    const r = await fetch(`${blobs[0].url}?t=${Date.now()}`, { cache: 'no-store' });
    if (!r.ok) {
      res.status(200).json({});
      return;
    }
    const data = await r.json();
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json(data);
  } catch (err) {
    res.status(200).json({});
  }
}

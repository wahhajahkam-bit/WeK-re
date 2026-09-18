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
    // Every page load hits this before it can show any photo, so serving
    // it uncached meant each visitor paid a cold start plus two round
    // trips (list, then fetch the blob) before the placeholders could
    // swap. Let the edge hold it briefly instead: max-age=0 keeps the
    // browser honest, s-maxage lets the CDN answer instantly, and a CMS
    // upload is visible within ~30s. The CMS itself appends a
    // cache-busting query so an admin always sees the truth immediately.
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=30, stale-while-revalidate=300');
    res.status(200).json(data);
  } catch (err) {
    res.status(200).json({});
  }
}

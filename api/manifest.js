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
    const r = await fetch(blobs[0].url, { cache: 'no-store' });
    if (!r.ok) {
      res.status(200).json({});
      return;
    }
    const data = await r.json();
    res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
    res.status(200).json(data);
  } catch (err) {
    res.status(200).json({});
  }
}

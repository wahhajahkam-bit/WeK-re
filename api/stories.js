import { list, put } from '@vercel/blob';
import { verifyToken, bearerToken } from './_auth.js';

// Same seed content as WEKARE_DEFAULT_STORIES in site/Success-Stories.dc.html
// — used only to initialize stories.json the very first time it's read, so
// the CMS has something real to edit/delete from day one.
const DEFAULT_STORIES = [
  { id: 'story-1', category: 'Career transition', photo: '',
    who: 'Fifteen years in logistics operations, wanting to move into project management before another restructure decided it for them.',
    struggle: 'Eleven months of applications, almost no replies. Every rejection read as a verdict on the whole career.',
    did: 'An advisor rewrote how the operations work was described, then made two direct introductions inside the network.',
    now: 'Programme manager at a regional distributor. Started in March.' },
  { id: 'story-2', category: 'Returning after a gap', photo: '',
    who: 'A treasury analyst who stepped out for four years to raise two children.',
    struggle: 'Assumed she would have to restart at the bottom, and was applying to roles two grades below her last one.',
    did: 'Matched her with a mentor who had made the same return, and reframed the gap as four years of unbroken competence.',
    now: 'Back in treasury at her previous level, four days a week.' },
  { id: 'story-3', category: 'New to the region', photo: '',
    who: "A civil engineer who relocated to the Gulf with a spouse's posting, with eight years of experience elsewhere.",
    struggle: 'No local references, no idea which firms were actually hiring, and a portfolio that read as foreign.',
    did: 'Explained how his projects would be read here, and put him in front of three consultancies in our network.',
    now: 'Senior engineer on an infrastructure programme, seven weeks after his first call.' },
  { id: 'story-4', category: 'Retired professional', photo: '',
    who: 'A commercial director in his fifties, made redundant when his division was folded into another.',
    struggle: 'Reaching final rounds and losing to cheaper, younger candidates. Beginning to consider retiring early by default.',
    did: 'Pointed him at firms that needed exactly his judgement, and told two of them so directly.',
    now: 'Commercial lead at a family group turning professional. Not retired.' },
  { id: 'story-5', category: 'Recent graduate', photo: '',
    who: 'A marketing graduate, one year out, working retail shifts to cover rent.',
    struggle: 'Around two hundred applications, four interviews, no offer. Every entry role wanted two years of experience.',
    did: 'Built a case out of her university campaign work, ran two mock interviews, and vouched for her to a founder.',
    now: 'Marketing associate at an eight-person company. Off the shift rota.' },
  { id: 'story-6', category: 'Career transition', photo: '',
    who: 'A secondary school teacher of nine years, wanting to move into corporate learning and development.',
    struggle: 'Told repeatedly that teaching was not commercial experience, and had begun to believe it.',
    did: 'A mentor from an L&D function spent three sessions translating the classroom into the language of capability building.',
    now: 'Learning designer at a professional services firm.' },
];

async function readStories() {
  const { blobs } = await list({ prefix: 'stories.json', limit: 1 });
  if (!blobs.length) {
    await writeStories(DEFAULT_STORIES);
    return DEFAULT_STORIES;
  }
  // See the matching comment in api/upload.js's getManifest() — the
  // cache-busting query is what guarantees freshness against Blob's CDN,
  // not the fetch cache mode or the write's cacheControlMaxAge alone.
  const r = await fetch(`${blobs[0].url}?t=${Date.now()}`, { cache: 'no-store' });
  if (!r.ok) return DEFAULT_STORIES;
  try {
    const data = await r.json();
    return Array.isArray(data) ? data : DEFAULT_STORIES;
  } catch {
    return DEFAULT_STORIES;
  }
}

async function writeStories(stories) {
  await put('stories.json', JSON.stringify(stories), {
    access: 'public',
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: 'application/json',
    // Overwritten at the same fixed URL on every save — without this,
    // Blob's CDN keeps serving the pre-edit stories list for up to a year
    // even though the underlying object changed.
    cacheControlMaxAge: 0,
  });
}

// Mirrors the maxLength values in site/cms.html's STORY_FIELDS — this is
// the real enforcement (the CMS's maxlength is just UX), so the two
// should stay in sync: long unbroken text otherwise breaks the equal-width
// card grid on Success Stories.
function sanitizeStory(s) {
  const id = String((s && s.id) || '').trim();
  if (!/^[a-z0-9-]{1,64}$/i.test(id)) return null;
  return {
    id,
    category: String((s && s.category) || '').slice(0, 40),
    who: String((s && s.who) || '').slice(0, 260),
    struggle: String((s && s.struggle) || '').slice(0, 260),
    did: String((s && s.did) || '').slice(0, 260),
    now: String((s && s.now) || '').slice(0, 140),
    photo: typeof (s && s.photo) === 'string' ? s.photo.slice(0, 600) : '',
  };
}

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const stories = await readStories();
      res.setHeader('Cache-Control', 'no-store');
      res.status(200).json({ stories });
      return;
    }

    if (req.method === 'POST') {
      if (!verifyToken(bearerToken(req))) {
        res.status(401).json({ error: 'unauthorized' });
        return;
      }
      const body = req.body || {};
      const incoming = Array.isArray(body.stories) ? body.stories : null;
      if (!incoming) {
        res.status(400).json({ error: 'stories array required' });
        return;
      }
      if (incoming.length > 60) {
        res.status(400).json({ error: 'too many stories (max 60)' });
        return;
      }
      const clean = [];
      for (const raw of incoming) {
        const s = sanitizeStory(raw);
        if (!s) {
          res.status(400).json({ error: 'invalid story id: ' + JSON.stringify(raw && raw.id) });
          return;
        }
        clean.push(s);
      }
      await writeStories(clean);
      res.status(200).json({ stories: clean });
      return;
    }

    res.status(405).json({ error: 'method not allowed' });
  } catch (err) {
    res.status(500).json({ error: 'request failed: ' + (err && err.message ? err.message : String(err)) });
  }
}

export const config = {
  api: { bodyParser: { sizeLimit: '2mb' } },
};

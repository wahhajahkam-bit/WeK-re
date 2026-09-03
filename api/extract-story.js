import { verifyToken, bearerToken } from './_auth.js';

const GEMINI_MODEL = 'gemini-2.5-flash';

// Same caps as sanitizeStory() in api/stories.js / STORY_FIELDS in
// site/cms.html — long unbroken text breaks the equal-width card grid on
// Success Stories, so every path that can create a story enforces this.
const LIMITS = { category: 40, who: 260, struggle: 260, did: 260, now: 140 };

const EXTRACT_PROMPT = `You turn a free-form job-search success story into five short fields for a
nonprofit's website card. Read the pasted text and produce:

- category: a short 2-4 word situation label. Prefer one of: "Career transition",
  "Returning after a gap", "New to the region", "Retired professional",
  "Recent graduate" — pick the closest fit, or a similarly short label if none fit.
- who: 1-2 sentences on who this person was before, under ${LIMITS.who} characters.
- struggle: 1-2 sentences on the challenge they faced, under ${LIMITS.struggle} characters.
- did: 1-2 sentences on what the mentor/organization did to help, under ${LIMITS.did} characters.
- now: a short outcome, under ${LIMITS.now} characters.

Write concretely and specifically, third person, no invented names or details beyond
what's implied by the text. No generic filler phrasing. If the input doesn't clearly
cover one of these fields, make the smallest reasonable inference from context —
never fabricate specifics that aren't implied.`;

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    category: { type: 'STRING' },
    who: { type: 'STRING' },
    struggle: { type: 'STRING' },
    did: { type: 'STRING' },
    now: { type: 'STRING' },
  },
  required: ['category', 'who', 'struggle', 'did', 'now'],
};

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'method not allowed' });
      return;
    }

    if (!verifyToken(bearerToken(req))) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      res.status(500).json({ error: 'Story extraction is not configured on the server yet (missing GEMINI_API_KEY)' });
      return;
    }

    const body = req.body || {};
    const text = typeof body.text === 'string' ? body.text.trim().slice(0, 6000) : '';
    if (!text) {
      res.status(400).json({ error: 'paste some story text first' });
      return;
    }

    const upstream = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text }] }],
          systemInstruction: { parts: [{ text: EXTRACT_PROMPT }] },
          generationConfig: {
            responseMimeType: 'application/json',
            responseSchema: RESPONSE_SCHEMA,
            maxOutputTokens: 500,
          },
        }),
      }
    );

    if (!upstream.ok) {
      const detail = await upstream.text();
      res.status(502).json({ error: 'extraction backend error', detail: detail.slice(0, 500) });
      return;
    }

    const data = await upstream.json();
    const raw = ((data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) || [])
      .map((part) => part.text || '')
      .join('');

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      res.status(502).json({ error: 'extraction returned unparseable output, try again or fill fields manually' });
      return;
    }

    const result = {};
    for (const key of Object.keys(LIMITS)) {
      result[key] = String(parsed[key] || '').slice(0, LIMITS[key]);
    }

    res.status(200).json(result);
  } catch (err) {
    res.status(500).json({ error: 'extraction failed: ' + (err && err.message ? err.message : String(err)) });
  }
}

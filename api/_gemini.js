// Shared Gemini call path for /api/chat and /api/extract-story.
//
// Two things here are not obvious and were the cause of real bugs:
//
// 1. maxOutputTokens is a COMBINED budget for thinking tokens + visible
//    output on Gemini 3.x, not just the reply. Thinking is on by default
//    and at the default level will happily expand to fill whatever budget
//    it is given — so a "generous sounding" 500-600 could be spent
//    entirely on thinking, leaving a candidate with no text at all
//    (finishReason MAX_TOKENS). That surfaced as empty/garbage replies and
//    as unparseable JSON in the extractor. Hence thinkingLevel 'low' plus
//    a budget with real headroom above the text we actually want.
//
// 2. Google returns transient 429/503s under load ("high demand, try
//    again later"). A single retry turns most of those into a normal
//    reply instead of an error the visitor sees.
export const GEMINI_MODEL = 'gemini-3.6-flash';

const RETRY_STATUSES = new Set([429, 500, 502, 503, 504]);
const RETRY_DELAY_MS = 700;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Calls generateContent and returns a normalized result:
 *   { ok: true, text }
 *   { ok: false, status, error, detail }
 */
export async function callGemini({ apiKey, contents, systemInstruction, generationConfig, timeoutMs = 25000 }) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const payload = JSON.stringify({
    contents,
    systemInstruction,
    generationConfig: {
      // Keep reasoning short: this is a website FAQ bot and a field
      // extractor, neither needs deep deliberation, and thinking tokens
      // are both the latency and the budget problem described above.
      thinkingConfig: { thinkingLevel: 'low' },
      ...generationConfig,
    },
  });

  let lastDetail = '';
  let lastStatus = 502;

  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) await sleep(RETRY_DELAY_MS);

    let upstream;
    try {
      upstream = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: payload,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      lastStatus = 504;
      lastDetail = err && err.message ? err.message : String(err);
      continue; // network error / timeout — worth one retry
    }

    if (!upstream.ok) {
      lastStatus = upstream.status;
      lastDetail = (await upstream.text()).slice(0, 400);
      if (RETRY_STATUSES.has(upstream.status)) continue;
      return { ok: false, status: 502, error: 'chat backend error', detail: lastDetail };
    }

    const data = await upstream.json();
    const candidate = (data.candidates && data.candidates[0]) || null;
    const text = (((candidate && candidate.content && candidate.content.parts) || [])
      .map((part) => part.text || '')
      .join('')).trim();

    if (text) return { ok: true, text };

    // No text came back. MAX_TOKENS here means thinking ate the budget;
    // anything else usually means a safety block.
    const finish = candidate && candidate.finishReason;
    if (finish === 'MAX_TOKENS') {
      lastStatus = 502;
      lastDetail = 'model hit its token limit before producing a reply';
      continue; // a retry often lands a shorter reasoning path
    }
    return {
      ok: false,
      status: 502,
      error: 'empty response from the model',
      detail: finish ? 'finishReason: ' + finish : 'no content returned',
    };
  }

  return { ok: false, status: 502, error: 'chat backend error', detail: lastDetail || 'upstream status ' + lastStatus };
}

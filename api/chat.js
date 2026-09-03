// Open-ended chatbot for visitors. Calls the Gemini API server-side so the
// API key never reaches the browser. No conversation is stored — the
// client sends its own running history each turn.
const GEMINI_MODEL = 'gemini-3.6-flash';

const SYSTEM_PROMPT = `You are the We Käre assistant, embedded on the We Käre website.

We Käre is a free, no-login, no-cost job-help service, part of the Konsälidön
ecosystem. It helps people the job market often overlooks: those in career transition,
people returning after a gap, people new to a region, retired professionals,
and recent graduates. It connects them with mentors and support to find
work, at no cost to the person being helped.

Your job: answer visitor questions about We Käre conversationally and
helpfully — who it's for, how it works, how to get help, how to become a
mentor, what to expect. If someone describes their situation, be warm and
encouraging, and point them to the "Get Help" page/form to start. If someone
wants to volunteer expertise, point them to "For Mentors". If you don't know
something specific (exact response times, staff names, partnership details),
say so honestly rather than inventing it, and suggest they use the Get Help
or contact form instead. Keep replies concise and conversational, not
corporate. You may discuss general job-search, career-change, or interview
topics helpfully, but always stay in character as We Käre's assistant and
steer back to how We Käre can help when relevant. Do not claim to be able to
take actions (booking, emailing, storing data) — only the forms on the site
do that.`;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method not allowed' });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'Chat is not configured on the server yet' });
    return;
  }

  const body = req.body || {};
  const incoming = Array.isArray(body.messages) ? body.messages : [];

  const messages = incoming
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .slice(-20)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }));

  if (!messages.length || messages[messages.length - 1].role !== 'user') {
    res.status(400).json({ error: 'no user message' });
    return;
  }

  // Gemini uses 'model' where Claude/OpenAI-style APIs use 'assistant'.
  const contents = messages.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  try {
    const upstream = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          contents,
          systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
          generationConfig: { maxOutputTokens: 600 },
        }),
      }
    );

    if (!upstream.ok) {
      const detail = await upstream.text();
      res.status(502).json({ error: 'chat backend error', detail: detail.slice(0, 500) });
      return;
    }

    const data = await upstream.json();
    const text = ((data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) || [])
      .map((part) => part.text || '')
      .join('\n')
      .trim();

    res.status(200).json({ reply: text || "Sorry, I didn't catch that — could you try again?" });
  } catch (err) {
    res.status(502).json({ error: 'chat backend unreachable' });
  }
}

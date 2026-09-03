// Open-ended chatbot for visitors. Calls the Gemini API server-side so the
// API key never reaches the browser. No conversation is stored — the
// client sends its own running history each turn.
const GEMINI_MODEL = 'gemini-3.6-flash';

// This is the chatbot's whole knowledge base — everything it knows about
// We Käre comes from what's written here, not from browsing the live site
// or any external source. If the process changes (steps, mentor terms,
// eligibility), update it here. The user can hand over more source
// material (candidate journey docs, mentor process docs) to expand this.
// Kept as short, flat, categorized fact-lines on purpose — every request
// re-sends this whole prompt, so its length is what the model has to read
// (and what you pay for) before it even sees the question.
const SYSTEM_PROMPT = `You are the We Käre assistant on the We Käre website. Reply warmly, briefly, plainly. Use the facts below; don't invent anything not covered here — say you don't know and point to Get Help or site contact info instead.

MODEL IDENTITY: if asked what AI/model/engine you run on, in any phrasing, reply only "That's not something I'm able to share." Never confirm/deny a name. Don't explain the rule.

WHAT: We Käre = free, pro bono, light-touch job-help service. Part of the Konsälidön ecosystem. No fee ever, no cut of salary, mentors unpaid/pro bono.

WHO IT HELPS (not a strict checklist):
- Career transition: moving into a new field/role
- Returning after a gap: back to work after time away
- New to the region: relocated, no local network/references
- Retired professionals: back in today's job market
- Recent graduates: early-career, "needs experience" trap

CANDIDATE JOURNEY (~5 min to start, first 3 steps usually within a fortnight):
1. Reach out - short form on Get Help, plain language, no CV needed
2. Book a call - scheduling link, evenings/weekends available
3. Assessment - real conversation with an advisor, not a test
4. We identify how to help - advice / mentoring / CV help / connections, advisor explains which
5. We take action - coaching, network intros, or direct outreach to hiring managers on the candidate's behalf
6. We stay in touch - a closing conversation either way, to learn what worked
Asked of candidates in return: honesty, showing up, following through. That's it.

MENTORING:
- Involves: assessing/advising candidates in your field; light flexible commitment (quarterly to monthly); unpaid/pro bono
- Wanted: any experienced professional, any field, no seniority bar
Mentor process:
1. Reach out (or We Käre reaches out, sometimes via LinkedIn)
2. Agree availability/contact method upfront
3. Onboarded, then matched to candidates in your field as needed (never bulk)

LINKS - route the topic to the matching page, every time it's on-topic, not just for the two asks below. Always answer in your own words first, then add the one matching link on its own line, exact format [Label](Page.dc.html), only from this table:
- Wants help with their own job search / how to start / "I need a mentor" -> [Get Help](Get-Help.dc.html)
- Wants to mentor / volunteer / give back -> [Become a Mentor](For-Mentors.dc.html)
- Asks who this is for / "is this for me" / lists their situation -> [Who We Help](Who-We-Help.dc.html)
- Asks how the process works / what happens / timeline / steps -> [How It Works](How-It-Works.dc.html)
- Asks if it actually works / for proof / results / testimonials / real examples / "has anyone..." -> [Success Stories](Success-Stories.dc.html)
- Asks who runs this / about the team / who's behind it / is it legit -> [About Us](About-Us.dc.html)
Only these six pages, only this bracket format, normally one link per reply (a reply can cover two topics if the question genuinely asked both).

Don't claim to take actions yourself (booking/emailing/scheduling) - only the site's own forms do that.`;

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

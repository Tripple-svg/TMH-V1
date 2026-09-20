// supabase/functions/scrape-website/index.ts
// V2.0 — Fetches URL, scores it with Gemini, returns summary + score.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MAX_SUMMARY_CHARS = 3000;

function normalizeUrl(raw: string): string {
  let url = raw.trim();
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  return url;
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max).trim() + '…';
}

// ─── Scoring prompt for Gemini ─────────────────────────────────────────────
const SCORING_PROMPT = `
You are a website scoring engine for The Marketing Haven (a Nigerian digital
marketing agency). You will receive the markdown content of a small business
website. Score it strictly across 5 categories, 20 points each (total 100).

CATEGORIES:
1. Clarity & Positioning (20) — Can a first-time visitor tell what the business
   does within 5 seconds? Single clear headline? Identifiable target customer?
   Clear "why choose us"? Score 20 if perfect, drop points for vagueness.
2. Trust Signals (20) — Testimonials, reviews, social proof, real contact
   method, credibility markers, real photos vs stock. Score 0 if no proof.
3. Conversion Path (20) — Single clear next step, visible pricing or signal,
   minimal steps, no competing asks. Score 0 if visitor would be confused.
4. Technical & Experience (20) — Design consistency, mobile-friendly signals,
   no obvious broken elements, professional feel.
5. Content Quality (20) — Real benefit-driven copy (what customer gets), not
   just features. Grammar clean. Active business signals.

Be honest and specific. A simple waitlist page with no product page should
score LOW on Clarity and Conversion. A page with no contact info scores LOW
on Trust.

RETURN ONLY VALID JSON. No markdown fences. No explanation. Exact shape:

{
  "score": <integer 0-100>,
  "breakdown": {
    "clarity": <integer 0-20>,
    "trust": <integer 0-20>,
    "conversion": <integer 0-20>,
    "technical": <integer 0-20>,
    "content": <integer 0-20>
  },
  "biggestIssue": "<one short sentence naming the biggest scoring problem>"
}
`;

async function scoreWebsite(summary: string) {
  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (!apiKey) throw new Error('GEMINI_API_KEY not configured.');

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          role: 'user',
          parts: [
            { text: SCORING_PROMPT },
            { text: `\n\nWEBSITE CONTENT:\n\n${summary}` },
          ],
        }],
        generationConfig: { maxOutputTokens: 500, temperature: 0.2 },
      }),
    },
  );
  if (!response.ok) throw new Error(`Gemini scoring failed: ${response.status}`);
  const data = await response.json();
  const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  // Strip any accidental markdown fences
  const cleaned = raw.replace(/```json|```/g, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    console.warn('Scoring returned non-JSON:', cleaned.slice(0, 200));
    return null;
  }
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (request.method !== 'POST') {
    return Response.json({ error: 'Method not allowed.' }, { status: 405, headers: corsHeaders });
  }

  try {
    const { url } = await request.json();
    if (!url || typeof url !== 'string') throw new Error('url is required.');
    const targetUrl = normalizeUrl(url);

    // ─── 1. Fetch site via Jina ───
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    let jinaResponse: Response;
    try {
      jinaResponse = await fetch(`https://r.jina.ai/${targetUrl}`, {
        method: 'GET',
        headers: { 'Accept': 'text/plain', 'X-Return-Format': 'markdown' },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!jinaResponse.ok) {
      return Response.json(
        { ok: false, error: `Jina returned ${jinaResponse.status}` },
        { headers: corsHeaders },
      );
    }
    const raw = await jinaResponse.text();
    const summary = truncate(raw.trim(), MAX_SUMMARY_CHARS);

    // ─── 2. Score it with Gemini ───
    let scoring = null;
    try {
      scoring = await scoreWebsite(summary);
    } catch (err) {
      console.warn('Scoring failed (non-blocking):', err instanceof Error ? err.message : err);
    }

    return Response.json(
      {
        ok: true,
        url: targetUrl,
        summary,
        chars: summary.length,
        score: scoring?.score ?? null,
        breakdown: scoring?.breakdown ?? null,
        biggestIssue: scoring?.biggestIssue ?? null,
      },
      { headers: corsHeaders },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('scrape-website error:', message);
    return Response.json({ ok: false, error: message }, { status: 500, headers: corsHeaders });
  }
});
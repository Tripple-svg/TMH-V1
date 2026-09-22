// supabase/functions/scrape-website/index.ts
// V3.1 — Deterministic scoring (temperature 0).

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

const SCORING_PROMPT = `
You are a website scoring engine for The Marketing Haven (a Nigerian digital
marketing agency). You will receive the markdown content of a small business
website. Score it strictly across 5 categories, 20 points each (total 100).

CATEGORIES:
1. Clarity & Positioning (20) — Can a first-time visitor tell what the business
   does within 5 seconds? Single clear headline? Identifiable target customer?
   Clear "why choose us"?
2. Trust Signals (20) — Testimonials, reviews, social proof, real contact
   method, credibility markers, real photos vs stock.
3. Conversion Path (20) — Single clear next step, visible pricing or signal,
   minimal steps, no competing asks.
4. Technical & Experience (20) — Design consistency, mobile-friendly signals,
   no obvious broken elements, professional feel.
5. Content Quality (20) — Real benefit-driven copy (what customer gets), not
   just features. Grammar clean. Active business signals.

Be honest and specific. A simple waitlist page with no product page should
score LOW on Clarity and Conversion. A page with no contact info scores LOW
on Trust.

Return ONLY valid JSON, no markdown, no explanation:

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

function parseScoreJson(raw: string) {
  if (!raw) return null;
  let cleaned = raw.trim();
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start >= 0 && end > start) cleaned = cleaned.slice(start, end + 1);
  try {
    const parsed = JSON.parse(cleaned);
    if (typeof parsed?.score !== 'number') return null;
    return parsed;
  } catch {
    return null;
  }
}

async function scoreWithGemini(summary: string): Promise<{ raw: string; status: number }> {
  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (!apiKey) throw new Error('GEMINI_API_KEY not configured.');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [{
            role: 'user',
            parts: [
              { text: SCORING_PROMPT },
              { text: `\n\nWEBSITE CONTENT:\n\n${summary}` },
            ],
          }],
          generationConfig: {
            maxOutputTokens: 500,
            temperature: 0,
            responseMimeType: 'application/json',
          },
        }),
      },
    );
    const status = response.status;
    if (!response.ok) {
      const body = await response.text();
      return { raw: body, status };
    }
    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    return { raw: text, status: 200 };
  } finally {
    clearTimeout(timeout);
  }
}

async function scoreWithGroq(summary: string): Promise<string> {
  const apiKey = Deno.env.get('GROQ_API_KEY');
  if (!apiKey) throw new Error('GROQ_API_KEY not configured.');

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'openai/gpt-oss-120b',
      messages: [
        { role: 'system', content: SCORING_PROMPT },
        { role: 'user', content: `WEBSITE CONTENT:\n\n${summary}` },
      ],
      max_tokens: 500,
      temperature: 0,
      response_format: { type: 'json_object' },
    }),
  });
  if (!response.ok) throw new Error(`Groq ${response.status}: ${await response.text()}`);
  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

async function scoreWebsite(summary: string) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { raw, status } = await scoreWithGemini(summary);
      if (status === 200) {
        const parsed = parseScoreJson(raw);
        if (parsed) {
          console.log(`[scoring] Gemini OK on attempt ${attempt + 1} — score ${parsed.score}`);
          return parsed;
        }
        console.warn(`[scoring] Gemini unparseable JSON (attempt ${attempt + 1}):`, raw.slice(0, 200));
      } else if (status === 503 || status === 502 || status === 504) {
        console.warn(`[scoring] Gemini ${status} on attempt ${attempt + 1}`);
      } else {
        console.warn(`[scoring] Gemini ${status} — not retryable`);
        break;
      }
    } catch (err) {
      console.warn(`[scoring] Gemini threw on attempt ${attempt + 1}:`, err instanceof Error ? err.message : err);
    }
    if (attempt === 0) await new Promise(r => setTimeout(r, 1500));
  }

  try {
    const raw = await scoreWithGroq(summary);
    const parsed = parseScoreJson(raw);
    if (parsed) {
      console.log(`[scoring] Groq fallback OK — score ${parsed.score}`);
      return parsed;
    }
    console.warn('[scoring] Groq unparseable JSON:', raw.slice(0, 200));
  } catch (err) {
    console.warn('[scoring] Groq fallback failed:', err instanceof Error ? err.message : err);
  }

  return null;
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

    const scoring = await scoreWebsite(summary);

    return Response.json(
      {
        ok: true,
        url: targetUrl,
        summary,
        chars: summary.length,
        score: scoring?.score ?? null,
        breakdown: scoring?.breakdown ?? null,
        biggestIssue: scoring?.biggestIssue ?? null,
        scoringFailed: !scoring,
      },
      { headers: corsHeaders },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('scrape-website error:', message);
    return Response.json({ ok: false, error: message }, { status: 500, headers: corsHeaders });
  }
});
// supabase/functions/score-social/index.ts
// V1.0 — Reads a social media screenshot via Gemini vision, scores 4 categories.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function screenshotPart(screenshot: string) {
  const [meta, data] = screenshot.split(',', 2);
  const mimeType = meta.replace('data:', '').replace(';base64', '');
  if (!data || !mimeType.startsWith('image/')) {
    throw new Error('Screenshot must be an image data URL.');
  }
  return { inline_data: { mime_type: mimeType, data } };
}

const SOCIAL_SCORING_PROMPT = `
You are a social media scoring engine for The Marketing Haven, a Nigerian
digital marketing agency. You will receive a screenshot of a small business's
social media profile (Instagram, TikTok, etc.).

Score it strictly across 4 categories, 25 points each (total 100).

CATEGORIES:

1. Profile & Bio (25) — Does the bio clearly state what they sell and who
   it's for? Is there a clear next step (link, DM prompt, shop now)? Is the
   profile photo / branding professional and consistent? Score 0 if the bio
   is empty or vague. Score 25 if it's sharp and action-oriented.

2. Content Consistency (25) — Is posting frequent (daily/weekly) or sporadic
   (monthly/abandoned)? Is there a consistent visual style? Does content mix
   value/education with promotion, or is it 100% "buy this"? Deduct heavily
   for 30+ day gaps or obviously abandoned profiles.

3. Engagement Quality (25) — Look at engagement relative to followers. Flag
   unusually low ratios (suggesting bought followers). Are comments being
   replied to (visible on the screenshot)? Do captions include a clear call
   to action, or just describe the product? Score lower for generic captions
   with no hook.

4. Conversion Readiness (25) — Is pricing findable? Is there urgency or a
   reason to buy now in recent content? Is there visible customer proof
   (testimonials, before/after, screenshots)?

RED FLAGS to detect and reflect in the score:
- 30+ day gaps between posts
- Purely product-description captions with no hook
- No bio link, or broken bio link
- Same caption template repeated with zero variation
- Zero visible engagement despite many followers

Be honest. A small profile that posts consistently with clear value should
score higher than a large profile that just spams product photos.

Return ONLY valid JSON, no markdown, no explanation:

{
  "score": <integer 0-100>,
  "breakdown": {
    "profile":     <integer 0-25>,
    "consistency": <integer 0-25>,
    "engagement":  <integer 0-25>,
    "readiness":   <integer 0-25>
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
    if (!parsed.breakdown || typeof parsed.breakdown !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
}

async function scoreWithGemini(screenshot: string): Promise<{ raw: string; status: number }> {
  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (!apiKey) throw new Error('GEMINI_API_KEY not configured.');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

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
              { text: SOCIAL_SCORING_PROMPT },
              screenshotPart(screenshot),
              { text: '\n\nScore the profile in this screenshot.' },
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

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (request.method !== 'POST') {
    return Response.json({ error: 'Method not allowed.' }, { status: 405, headers: corsHeaders });
  }

  try {
    const { screenshot } = await request.json();
    if (!screenshot || typeof screenshot !== 'string') {
      throw new Error('screenshot (data URL) is required.');
    }

    // Only Gemini has vision. No Groq fallback possible.
    let lastErr: string = '';
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const { raw, status } = await scoreWithGemini(screenshot);
        if (status === 200) {
          const parsed = parseScoreJson(raw);
          if (parsed) {
            console.log(`[social-scoring] Gemini OK on attempt ${attempt + 1} — score ${parsed.score}`);
            return Response.json(
              {
                ok: true,
                score: parsed.score,
                breakdown: parsed.breakdown,
                biggestIssue: parsed.biggestIssue,
              },
              { headers: corsHeaders },
            );
          }
          lastErr = 'Gemini returned unparseable JSON';
          console.warn('[social-scoring] unparseable:', raw.slice(0, 200));
        } else if (status === 503 || status === 502 || status === 504) {
          lastErr = `Gemini ${status}`;
          console.warn(`[social-scoring] Gemini ${status} on attempt ${attempt + 1}`);
        } else {
          lastErr = `Gemini ${status}: ${raw.slice(0, 200)}`;
          console.warn(`[social-scoring] Gemini ${status} — not retryable`);
          break;
        }
      } catch (err) {
        lastErr = err instanceof Error ? err.message : String(err);
        console.warn(`[social-scoring] threw on attempt ${attempt + 1}:`, lastErr);
      }
      if (attempt === 0) await new Promise(r => setTimeout(r, 1500));
    }

    return Response.json(
      { ok: false, error: lastErr || 'Social scoring failed' },
      { headers: corsHeaders },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('score-social error:', message);
    return Response.json({ ok: false, error: message }, { status: 500, headers: corsHeaders });
  }
});
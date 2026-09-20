// supabase/functions/haven-chat/index.ts
// V5.5 — Chain: Gemini (retries) → GPT-4.1-mini → Groq. Model tracked in response.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type HavenMessage = { role?: string; content?: string };
type ModelUsed = 'gemini' | 'gpt-4.1-mini' | 'groq';

function parseChips(rawText: string) {
  const match = rawText.match(/\[\[CHIPS:\s*(.*?)\]\]/s);
  const chips = match?.[1].match(/"([^"]+)"/g)?.map((chip) => chip.replaceAll('"', '')) ?? [];
  return { text: rawText.replace(/\[\[CHIPS:.*?\]\]/s, '').trim(), chips };
}

function screenshotPart(screenshot: string) {
  const [meta, data] = screenshot.split(',', 2);
  const mimeType = meta.replace('data:', '').replace(';base64', '');
  if (!data || !mimeType.startsWith('image/')) throw new Error('Screenshot must be an image data URL.');
  return { inline_data: { mime_type: mimeType, data } };
}

// ─── Gemini (vision + best instruction-following) ─────────────────────────

async function askGemini(
  systemPrompt: string,
  messages: HavenMessage[],
  screenshot: string | null,
): Promise<string> {
  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (!apiKey) throw new Error('GEMINI_API_KEY not configured.');

  const contents: Array<{ role: string; parts: Array<Record<string, unknown>> }> = [];
  contents.push({ role: 'user',  parts: [{ text: `SYSTEM INSTRUCTIONS:\n\n${systemPrompt}` }] });
  contents.push({
    role: 'model',
    parts: [{ text: "Understood. I am Haven — TMH's Elite Digital Marketing Strategist. I will follow these rules exactly." }],
  });

  messages.forEach((message, idx) => {
    const isLast = idx === messages.length - 1;
    const role = message.role === 'agent' ? 'model' : 'user';
    const parts: Array<Record<string, unknown>> = [];
    if (isLast && role === 'user' && screenshot) parts.push(screenshotPart(screenshot));
    parts.push({ text: message.content || (screenshot ? 'Please review this screenshot.' : '') });
    contents.push({ role, parts });
  });

  if (contents[contents.length - 1].role !== 'user') {
    const parts: Array<Record<string, unknown>> = [];
    if (screenshot) parts.push(screenshotPart(screenshot));
    parts.push({ text: 'Please continue.' });
    contents.push({ role: 'user', parts });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          contents,
          generationConfig: { maxOutputTokens: 1200, temperature: 0.7 },
        }),
      },
    );
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Gemini ${response.status}: ${body}`);
    }
    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  } finally {
    clearTimeout(timeout);
  }
}

async function askGeminiWithRetry(
  systemPrompt: string,
  messages: HavenMessage[],
  screenshot: string | null,
  maxRetries = 2,
): Promise<string> {
  let lastErr: Error | null = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const text = await askGemini(systemPrompt, messages, screenshot);
      if (text && text.trim().length > 0) return text;
      throw new Error('Gemini returned empty response');
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));
      const msg = lastErr.message;
      const isRetryable =
        msg.includes(' 503:') ||
        msg.includes(' 502:') ||
        msg.includes(' 504:') ||
        msg.includes('UNAVAILABLE') ||
        msg.includes('high demand');
      if (!isRetryable || attempt === maxRetries) break;
      const waitMs = 1500 * Math.pow(2, attempt);
      console.warn(`Gemini retry ${attempt + 1}/${maxRetries} in ${waitMs}ms — ${msg.slice(0, 120)}`);
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }
  throw lastErr || new Error('Gemini failed after retries');
}

// ─── OpenAI (middle fallback, text-only) ──────────────────────────────────

async function askOpenAI(
  systemPrompt: string,
  messages: HavenMessage[],
  apiKey: string,
): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: 'gpt-4.1-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages.map((m) => ({
            role: m.role === 'agent' ? 'assistant' : 'user',
            content: m.content || '',
          })),
        ],
        max_tokens: 1200,
        temperature: 0.7,
      }),
    });
    if (!response.ok) throw new Error(`OpenAI ${response.status}: ${await response.text()}`);
    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
  } finally {
    clearTimeout(timeout);
  }
}

// ─── Groq (last-resort fallback) ──────────────────────────────────────────

async function askGroq(systemPrompt: string, messages: HavenMessage[]): Promise<string> {
  const apiKey = Deno.env.get('GROQ_API_KEY');
  if (!apiKey) throw new Error('GROQ_API_KEY not configured.');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
      body: JSON.stringify({
        model: 'openai/gpt-oss-120b',
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages.map((m) => ({
            role: m.role === 'agent' ? 'assistant' : 'user',
            content: m.content || '',
          })),
        ],
        max_tokens: 1200,
        temperature: 0.7,
      }),
    });
    if (!response.ok) throw new Error(`Groq ${response.status}: ${await response.text()}`);
    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
  } finally {
    clearTimeout(timeout);
  }
}

// ─── Fallback chain orchestrator ──────────────────────────────────────────

async function callModel(
  systemPrompt: string,
  messages: HavenMessage[],
  screenshot: string | null,
): Promise<{ text: string; model: ModelUsed }> {
  // 1. Gemini — vision + best instruction-following
  try {
    const text = await askGeminiWithRetry(systemPrompt, messages, screenshot);
    return { text, model: 'gemini' };
  } catch (err) {
    console.warn('Gemini chain failed:', err instanceof Error ? err.message : err);
  }

  // 2. GPT-4.1-mini — text-only fallback
  if (!screenshot) {
    const openAIKey = Deno.env.get('OPENAI_API_KEY');
    if (openAIKey) {
      try {
        const text = await askOpenAI(systemPrompt, messages, openAIKey);
        return { text, model: 'gpt-4.1-mini' };
      } catch (oaiErr) {
        console.warn('GPT-4.1-mini fallback failed:', oaiErr instanceof Error ? oaiErr.message : oaiErr);
      }
    }
  }

  // 3. Groq — last resort. If a screenshot was attached, add a system note
  //    telling the model it can't see the image (Groq has no vision).
  const augmented = screenshot
    ? messages.map((m, i) =>
        i === messages.length - 1 && m.role !== 'agent'
          ? {
              ...m,
              content:
                `[SYSTEM NOTE: The user uploaded a screenshot, but vision is ` +
                `temporarily busy and you cannot see the image. Politely tell ` +
                `the user in ONE sentence that you can't read it right now, ` +
                `and ask them to describe the main issue in a few words. ` +
                `Do NOT pretend to see the image. Do NOT guess its content.]\n\n` +
                `User message: ${m.content || '(no text — screenshot only)'}`,
            }
          : m,
      )
    : messages;

  const text = await askGroq(systemPrompt, augmented);
  return { text, model: 'groq' };
}

// ─── Server ───────────────────────────────────────────────────────────────

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (request.method !== 'POST') {
    return Response.json({ error: 'Method not allowed.' }, { status: 405, headers: corsHeaders });
  }

  try {
    const { systemPrompt = '', messages = [], screenshot = null } = await request.json();
    if (!systemPrompt || !Array.isArray(messages)) {
      throw new Error('systemPrompt and messages are required.');
    }

    const { text: rawText, model } = await callModel(systemPrompt, messages, screenshot);
    const parsed = parseChips(rawText);
    return Response.json({ ...parsed, model }, { headers: corsHeaders });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('haven-chat error:', message);
    return Response.json({ error: message }, { status: 500, headers: corsHeaders });
  }
});
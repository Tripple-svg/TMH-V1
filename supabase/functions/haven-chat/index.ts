// supabase/functions/haven-chat/index.ts
// V6.2 — Gemini 3.8 Flash primary → Groq fallback. Auto-continuation.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type HavenMessage = { role?: string; content?: string };
type ModelUsed = 'gemini' | 'groq';

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

function looksTruncated(text: string): boolean {
  if (!text || text.length < 20) return false;
  const trimmed = text.trimEnd();
  return /[a-zA-Z,\-]$/.test(trimmed);
}

// ─── Gemini (primary + vision) ────────────────────────────────────────────

async function askGemini(
  systemPrompt: string,
  messages: HavenMessage[],
  screenshot: string | null,
): Promise<string> {
  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (!apiKey) throw new Error('GEMINI_API_KEY not configured.');

  const contents: Array<{ role: string; parts: Array<Record<string, unknown>> }> = [];
  contents.push({ role: 'user', parts: [{ text: `SYSTEM INSTRUCTIONS:\n\n${systemPrompt}` }] });
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
  const timeout = setTimeout(() => controller.abort(), 45000);

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          contents,
          generationConfig: { maxOutputTokens: 2000, temperature: 0.7 },
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
  maxRetries = 1,
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
        msg.includes(' 503:') || msg.includes(' 502:') || msg.includes(' 504:') ||
        msg.includes('UNAVAILABLE') || msg.includes('high demand');
      if (!isRetryable || attempt === maxRetries) break;
      const waitMs = 1500 * Math.pow(2, attempt);
      console.warn(`Gemini retry ${attempt + 1}/${maxRetries} in ${waitMs}ms — ${msg.slice(0, 120)}`);
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }
  throw lastErr || new Error('Gemini failed after retries');
}

// ─── Groq (last resort) ───────────────────────────────────────────────────

async function askGroq(systemPrompt: string, messages: HavenMessage[]): Promise<string> {
  const apiKey = Deno.env.get('GROQ_API_KEY');
  if (!apiKey) throw new Error('GROQ_API_KEY not configured.');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

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
        max_tokens: 2000,
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

// ─── Auto-continuation on cut-off ─────────────────────────────────────────

async function continueIfTruncated(
  text: string,
  model: ModelUsed,
  systemPrompt: string,
  messages: HavenMessage[],
  screenshot: string | null,
): Promise<string> {
  if (!looksTruncated(text)) return text;

  console.log(`[continuation] Truncated (ends "${text.slice(-30)}"). Requesting finish.`);

  const contMessages: HavenMessage[] = [
    ...messages,
    { role: 'agent', content: text },
    { role: 'user', content: 'Continue from exactly where you stopped. Do not repeat anything. Do not add a greeting. Just finish the sentence and the thought.' },
  ];

  try {
    let continuation = '';
    if (model === 'gemini') {
      continuation = await askGemini(systemPrompt, contMessages, screenshot);
    } else {
      continuation = await askGroq(systemPrompt, contMessages);
    }
    if (continuation && continuation.trim().length > 0) {
      const joiner = /[a-zA-Z]$/.test(text.trimEnd()) ? ' ' : '';
      console.log(`[continuation] Merged (+${continuation.length} chars).`);
      return text.trimEnd() + joiner + continuation.trim();
    }
  } catch (err) {
    console.warn('[continuation] Failed:', err instanceof Error ? err.message : err);
  }
  return text;
}

// ─── Orchestrator ─────────────────────────────────────────────────────────

async function callModel(
  systemPrompt: string,
  messages: HavenMessage[],
  screenshot: string | null,
): Promise<{ text: string; model: ModelUsed }> {
  let text = '';
  let model: ModelUsed = 'groq';

  // Vision requires Gemini
  if (screenshot) {
    try {
      text = await askGeminiWithRetry(systemPrompt, messages, screenshot);
      model = 'gemini';
    } catch (err) {
      console.warn('Gemini vision failed:', err instanceof Error ? err.message : err);
      const augmented = messages.map((m, i) =>
        i === messages.length - 1 && m.role !== 'agent'
          ? { ...m, content: `[SYSTEM NOTE: The user uploaded a screenshot, but vision is temporarily busy and you cannot see the image. Politely tell the user in ONE sentence that you can't read it right now, and ask them to describe the main issue in a few words. Do NOT pretend to see the image.]\n\nUser message: ${m.content || '(no text — screenshot only)'}` }
          : m,
      );
      text = await askGroq(systemPrompt, augmented);
      model = 'groq';
    }
  } else {
    // 1. Gemini primary
    try {
      text = await askGeminiWithRetry(systemPrompt, messages, null);
      if (text && text.trim().length > 0) {
        model = 'gemini';
      } else {
        throw new Error('Gemini returned empty');
      }
    } catch (gErr) {
      console.warn('Gemini failed, trying Groq:', gErr instanceof Error ? gErr.message : gErr);
    }

    // 2. Groq fallback
    if (!text) {
      text = await askGroq(systemPrompt, messages);
      model = 'groq';
    }
  }

  text = await continueIfTruncated(text, model, systemPrompt, messages, screenshot);

  return { text, model };
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
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
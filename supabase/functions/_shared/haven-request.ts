import { STEPS } from './haven-prompts.js';

export class HavenRequestError extends Error {
  constructor(message: string, public status = 400, public retryAfter?: number) { super(message); }
}

export const ALLOWED_ORIGINS = [
  'https://themarketinghaven.xyz', 'https://www.themarketinghaven.xyz',
  'http://localhost:5173', 'http://localhost:5175', 'http://localhost:3000',
];

export function responseHeaders(request: Request) {
  const origin = request.headers.get('origin');
  return {
    'Content-Type': 'application/json', 'Cache-Control': 'no-store', Vary: 'Origin',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    ...(origin && ALLOWED_ORIGINS.includes(origin) ? { 'Access-Control-Allow-Origin': origin } : {}),
  };
}

export function verifyOrigin(request: Request) {
  const origin = request.headers.get('origin');
  if (origin && !ALLOWED_ORIGINS.includes(origin)) throw new HavenRequestError('Origin not allowed.', 403);
}

export async function readBoundedJson(request: Request, maxBytes = 8 * 1024 * 1024) {
  if (Number(request.headers.get('content-length')) > maxBytes) throw new HavenRequestError('Request is too large.', 413);
  const reader = request.body?.getReader();
  if (!reader) throw new HavenRequestError('A JSON body is required.');
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let size = 0, raw = '';
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new HavenRequestError('Request is too large.', 413);
      }
      raw += decoder.decode(value, { stream: true });
    }
    raw += decoder.decode();
    const body = JSON.parse(raw);
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Object required');
    return body;
  } catch (error) {
    if (error instanceof HavenRequestError) throw error;
    throw new HavenRequestError('Invalid JSON body.');
  } finally { reader.releaseLock(); }
}

export function screenshotPart(screenshot: unknown) {
  if (typeof screenshot !== 'string' || screenshot.length > 7 * 1024 * 1024) {
    throw new HavenRequestError('Please upload a PNG, JPEG or WebP image smaller than 5 MB.', 413);
  }
  const match = screenshot.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/);
  if (!match || match[2].length % 4 !== 0) throw new HavenRequestError('Screenshot must be a PNG, JPEG or WebP data URL.');
  const size = match[2].length * 3 / 4 - (match[2].endsWith('==') ? 2 : match[2].endsWith('=') ? 1 : 0);
  if (size > 5 * 1024 * 1024) throw new HavenRequestError('Screenshot exceeds 5 MB.', 413);
  return { inline_data: { mime_type: match[1], data: match[2] } };
}

export function textValue(value: unknown, max: number, fallback = '') {
  return typeof value === 'string' ? value.slice(0, max).replace(/[\u0000-\u001f\u007f]/g, ' ').trim() : fallback;
}

export function validateChatBody(body: Record<string, unknown>) {
  if ('systemPrompt' in body) throw new HavenRequestError('Browser-provided system instructions are not accepted.');
  const scope = body.scope || 'support';
  if (!['audit', 'support', 'service'].includes(String(scope))) throw new HavenRequestError('Invalid conversation scope.');
  const context = body.context || {};
  if (typeof context !== 'object' || Array.isArray(context)) throw new HavenRequestError('Invalid conversation context.');
  if ('systemPrompt' in context) throw new HavenRequestError('Browser-provided system instructions are not accepted.');
  if (!Array.isArray(body.messages) || body.messages.length === 0 || body.messages.length > 40) {
    throw new HavenRequestError('Send between 1 and 40 conversation messages.');
  }
  let total = 0;
  const messages = body.messages.map((item) => {
    if (!item || !['user', 'agent'].includes(item.role) || typeof item.content !== 'string' || item.content.length > 4000) {
      throw new HavenRequestError('Messages must contain a user or agent role and at most 4000 characters.');
    }
    total += item.content.length;
    return { role: item.role as 'user' | 'agent', content: item.content };
  });
  if (total > 24000 || messages[messages.length - 1].role !== 'user') {
    throw new HavenRequestError('Conversation history is too long or does not end with your message.');
  }
  const screenshot = body.screenshot || null;
  if (screenshot) screenshotPart(screenshot);
  if (!messages[messages.length - 1].content.trim() && !screenshot) throw new HavenRequestError('A message or screenshot is required.');
  return { scope: scope as 'audit' | 'support' | 'service', context: context as Record<string, unknown>, messages, screenshot: screenshot as string | null };
}

export function savedStep(value: unknown) {
  return Object.values(STEPS).includes(value as string) && value !== STEPS.GREETING
    ? value as string : STEPS.AWAITING_DIAGNOSTIC_Q1;
}

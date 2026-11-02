import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.118.0';

const MAX_BYTES = 64 * 1024;
const MAILBOX = 'info@themarketinghaven.xyz';
const encoder = new TextEncoder();
const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
const plain = (value: unknown, max: number) => typeof value === 'string'
  ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max) : '';

async function rawBody(request: Request) {
  if (Number(request.headers.get('content-length')) > MAX_BYTES) return null;
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const parts: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) { await reader.cancel(); return null; }
      parts.push(value);
    }
    const result = new Uint8Array(size);
    let offset = 0;
    for (const part of parts) { result.set(part, offset); offset += part.byteLength; }
    return result;
  } finally { reader.releaseLock(); }
}

async function hmacKey(secret: string, usages: KeyUsage[]) {
  return await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, usages);
}

// WebCrypto verifies the proof in constant time rather than comparing secret
// strings character by character. Enrollment is disabled when the env is absent.
async function enrollmentMatches(expected: string | undefined, supplied: string | null) {
  if (!expected || !/^[a-f0-9]{64}$/i.test(expected) || !supplied || !/^[a-f0-9]{64}$/i.test(supplied)) return false;
  const message = encoder.encode('tmh:zoho-support:enrollment:v1');
  const candidate = await hmacKey(supplied.toLowerCase(), ['sign']);
  const proof = await crypto.subtle.sign('HMAC', candidate, message);
  return await crypto.subtle.verify('HMAC', await hmacKey(expected.toLowerCase(), ['verify']), proof, message);
}

export async function verifyZohoSignature(raw: Uint8Array, signature: string | null, secret: string) {
  if (!signature || !/^[A-Za-z0-9+/]{43}=$/.test(signature) || !secret || secret.length > 512) return false;
  const digest = Uint8Array.from(atob(signature), character => character.charCodeAt(0));
  return await crypto.subtle.verify('HMAC', await hmacKey(secret, ['verify']), new Uint8Array(digest).buffer, new Uint8Array(raw).buffer);
}

async function hash(bytes: Uint8Array) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(bytes).buffer)), byte => byte.toString(16).padStart(2, '0')).join('');
}

function addresses(value: unknown) {
  if (typeof value !== 'string' || value.length > 2000) return [];
  return (value.match(/[^\s<>(),;:"\\]+@[^\s<>(),;:"\\]+\.[^\s<>(),;:"\\]+/g) || [])
    .map(email => email.toLowerCase()).filter(email => email.length <= 254);
}

export async function zohoSupportMetadata(body: Record<string, unknown>, raw: Uint8Array) {
  if (!addresses(body.toAddress).includes(MAILBOX)) return null;
  const senders = addresses(body.fromAddress);
  if (senders.length !== 1) throw new Error('invalid_sender');
  const subject = plain(body.subject, 300) || '(No subject)';
  const rawTime = typeof body.receivedTime === 'number' || typeof body.receivedTime === 'string' ? String(body.receivedTime) : '';
  const milliseconds = /^\d{1,16}$/.test(rawTime) ? Number(rawTime) : NaN;
  const time = Number.isSafeInteger(milliseconds) && Number.isFinite(new Date(milliseconds).getTime())
    ? new Date(milliseconds).toISOString() : 'Not supplied';
  // Zoho's documented numeric IDs can exceed Number.MAX_SAFE_INTEGER. Never
  // stringify a parsed number as the dedup key: two distinct emails could collide.
  const messageId = typeof body.messageId === 'string' && body.messageId.length > 0 && body.messageId.length <= 300
    ? body.messageId : null;
  const externalId = messageId ? `zoho:id:${await hash(encoder.encode(messageId))}` : `zoho:body:${await hash(raw)}`;
  return {
    id: crypto.randomUUID(), category: 'other', source: 'zoho', name: '', email: senders[0],
    message: `Email received in Zoho Mail.\nSubject: ${subject}\nReceived: ${time}\nSender address is unverified. Open Zoho Mail to read and reply. Email bodies and attachments are not copied to this workspace.`,
    visitor_id: null, network_bucket: null, external_id: externalId,
  };
}

/**
 * Zoho sends x-hook-secret only during registration. A public first-request
 * secret alone is NOT authentication: pin it only after explicit enrollment
 * authorization and verification of Zoho's raw-byte HMAC. Do not log headers,
 * request URLs (which can contain the enrollment token), or payloads.
 */
export async function handleZohoSupportWebhook(request: Request, db: SupabaseClient, enrollmentToken?: string) {
  if (request.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405);
  try {
    const raw = await rawBody(request);
    if (!raw) return json({ ok: false, error: 'Request is too large' }, 413);
    const signature = request.headers.get('x-hook-signature');
    if (!signature || !/^[A-Za-z0-9+/]{43}=$/.test(signature)) return json({ ok: false, error: 'Invalid webhook authentication' }, 401);
    const read = await db.from('mail_webhook_integrations').select('signing_secret').eq('provider', 'zoho').maybeSingle();
    if (read.error) return json({ ok: false, error: 'Integration unavailable' }, 503);
    let secret = read.data?.signing_secret as string | undefined;
    if (!secret) {
      const candidate = request.headers.get('x-hook-secret');
      if (!await enrollmentMatches(enrollmentToken, new URL(request.url).searchParams.get('setup'))
        || !candidate || candidate.length > 512 || /[\u0000-\u001f\u007f]/.test(candidate)
        || !await verifyZohoSignature(raw, signature, candidate)) return json({ ok: false, error: 'Invalid webhook authentication' }, 401);
      const saved = await db.from('mail_webhook_integrations').insert({ provider: 'zoho', signing_secret: candidate });
      if (saved.error?.code === '23505') {
        // Concurrent registration cannot replace the first authorized secret.
        const pinned = await db.from('mail_webhook_integrations').select('signing_secret').eq('provider', 'zoho').maybeSingle();
        if (pinned.error || !pinned.data?.signing_secret) return json({ ok: false, error: 'Integration unavailable' }, 503);
        secret = pinned.data.signing_secret;
        if (!await verifyZohoSignature(raw, signature, secret!)) return json({ ok: false, error: 'Invalid webhook authentication' }, 401);
      } else if (saved.error) return json({ ok: false, error: 'Integration unavailable' }, 503);
      // The initial POST is a registration probe, not proof a real inbox message
      // has arrived. Zoho requires exactly HTTP 200 to save its configuration.
      return json({ ok: true, registered: true });
    }
    if (!await verifyZohoSignature(raw, signature, secret)) return json({ ok: false, error: 'Invalid webhook authentication' }, 401);
    if (raw.length === 0) return json({ ok: true, ignored: true });
    let body;
    try { body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw)); }
    catch { return json({ ok: false, error: 'Invalid JSON' }, 400); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return json({ ok: false, error: 'Invalid mail metadata' }, 400);
    let metadata;
    try { metadata = await zohoSupportMetadata(body, raw); }
    catch { return json({ ok: false, error: 'Invalid mail metadata' }, 400); }
    if (!metadata) return json({ ok: true, ignored: true });
    const inserted = await db.from('support_requests').insert(metadata);
    if (inserted.error?.code === '23505') return json({ ok: true, duplicate: true });
    if (inserted.error) return json({ ok: false, error: 'Support queue unavailable' }, 503);
    // The existing support notification worker delivers to both team inboxes.
    // Sender metadata is not ownership proof and cannot unlock reviews/purchases.
    return json({ ok: true, queued: true });
  } catch {
    return json({ ok: false, error: 'Webhook unavailable' }, 503);
  }
}

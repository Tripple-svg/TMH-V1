import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHmac, webcrypto } from 'node:crypto';
import vm from 'node:vm';
import { transformSync } from 'esbuild';
import { PGlite } from '@electric-sql/pglite';

const enrollment = 'a'.repeat(64);
const secret = 'fixture-zoho-signing-secret';
const source = readFileSync('supabase/functions/_shared/zoho-support.ts', 'utf8');
const context = { module: { exports: {} }, crypto: webcrypto, Request, Response, TextEncoder, TextDecoder, URL, Uint8Array, atob };
vm.runInNewContext(transformSync(source, { loader: 'ts', format: 'cjs' }).code, context);
const { handleZohoSupportWebhook: handle, verifyZohoSignature } = context.module.exports;
const mail = (extra = {}) => JSON.stringify({ subject: 'Help with my saved review', fromAddress: 'owner@example.com',
  toAddress: '"TMH Support"<info@themarketinghaven.xyz>', receivedTime: 1793440800000, messageId: 'mail-1', ...extra });
const signature = (raw, key = secret) => createHmac('sha256', key).update(raw).digest('base64');
const request = (raw = mail(), options = {}) => new Request(`https://functions.example/zoho-support-webhook${options.enroll ? `?setup=${options.enroll}` : ''}`, {
  method: 'POST', body: raw, headers: { 'x-hook-signature': signature(raw, options.key || secret),
    ...(options.first ? { 'x-hook-secret': options.key || secret } : {}), ...options.headers },
});
function database(initialSecret = secret, options = {}) {
  const rows = [], external = new Set();
  let pinned = initialSecret, reads = 0;
  const db = { from(table) {
    if (table === 'mail_webhook_integrations') return {
      select() { return { eq() { return { async maybeSingle() { reads++; return { data: pinned ? { signing_secret: pinned } : null, error: options.readError || null }; } }; } }; },
      async insert(row) {
        if (options.concurrentSecret) { pinned = options.concurrentSecret; return { error: { code: '23505' } }; }
        if (pinned) return { error: { code: '23505' } };
        pinned = row.signing_secret; return { error: null };
      },
    };
    assert.equal(table, 'support_requests');
    return { async insert(row) {
      if (options.queueError) return { error: { code: 'XX000', message: 'Sensitive backend failure' } };
      if (external.has(row.external_id)) return { error: { code: '23505' } };
      external.add(row.external_id); rows.push(row); return { error: null };
    } };
  } };
  return { db, rows, get pinned() { return pinned; }, get reads() { return reads; } };
}

test('Zoho enrollment requires the configured token and valid raw-byte signature before pinning its secret', async () => {
  for (const options of [{ first: true }, { first: true, enroll: 'b'.repeat(64) }, { first: true, enroll: enrollment, headers: { 'x-hook-signature': signature('tampered') } }]) {
    const storage = database(null);
    assert.equal((await handle(request('{}', options), storage.db, enrollment)).status, 401);
    assert.equal(storage.pinned, null); assert.equal(storage.rows.length, 0);
  }
  const storage = database(null);
  const result = await handle(request('{}', { first: true, enroll: enrollment }), storage.db, enrollment);
  assert.equal(result.status, 200); assert.deepEqual(await result.json(), { ok: true, registered: true });
  assert.equal(storage.pinned, secret); assert.equal(storage.rows.length, 0);
});

test('Zoho normal delivery needs no enrollment token and cannot replace a pinned secret', async () => {
  const storage = database();
  assert.equal((await handle(request(), storage.db)).status, 200);
  assert.equal(storage.rows.length, 1);
  const replacement = await handle(request('{}', { first: true, enroll: enrollment, key: 'attacker-secret' }), storage.db, enrollment);
  assert.equal(replacement.status, 401); assert.equal(storage.pinned, secret);
  assert.equal(storage.rows.length, 1);
});

test('a concurrent enrollment cannot replace a different pinned signing key', async () => {
  const storage = database(null, { concurrentSecret: 'different-first-registrant' });
  const result = await handle(request('{}', { first: true, enroll: enrollment }), storage.db, enrollment);
  assert.equal(result.status, 401); assert.equal(storage.rows.length, 0);
});

test('Zoho signatures authenticate the exact original UTF-8 bytes, not a reserialized object', async () => {
  const raw = '{ "subject": "Help ₦9,639", "fromAddress": "owner@example.com" }';
  assert.equal(await verifyZohoSignature(new TextEncoder().encode(raw), signature(raw), secret), true);
  assert.equal(await verifyZohoSignature(new TextEncoder().encode(JSON.stringify(JSON.parse(raw))), signature(raw), secret), false);
  const storage = database();
  assert.equal((await handle(request(mail(), { headers: { 'x-hook-signature': signature(mail() + ' ') } }), storage.db)).status, 401);
  assert.equal(storage.rows.length, 0);
});

test('inbound support stores limited unverified metadata, never message bodies, attachments or recovery authority', async () => {
  const storage = database();
  const result = await handle(request(mail({ subject: '<img src=x onerror=alert(1)>',
    summary: 'PRIVATE-MAIL-BODY', html: '<div>PRIVATE-HTML</div>', attachments: ['SECRET-FILE'],
    visitor_id: 'claimed-device', accessToken: 'claimed-key', sender: 'Claimed Name' })), storage.db);
  assert.deepEqual(await result.json(), { ok: true, queued: true });
  const row = storage.rows[0];
  assert.equal(row.source, 'zoho'); assert.equal(row.category, 'other'); assert.equal(row.email, 'owner@example.com');
  assert.equal(row.name, ''); assert.equal(row.visitor_id, null); assert.equal(row.network_bucket, null);
  assert.match(row.message, /Sender address is unverified/);
  assert.doesNotMatch(JSON.stringify(row), /PRIVATE-MAIL-BODY|PRIVATE-HTML|SECRET-FILE|claimed-device|claimed-key|Claimed Name/);
  // Subject is data; the admin UI/notification template must escape it when rendered.
  assert.match(row.message, /Subject: <img/);
});

test('duplicate signed mail does not create more requests or overwrite an existing request', async () => {
  const storage = database();
  assert.equal((await handle(request(), storage.db)).status, 200);
  const duplicate = await handle(request(mail({ subject: 'Changed subject, same message ID' })), storage.db);
  assert.deepEqual(await duplicate.json(), { ok: true, duplicate: true });
  assert.equal(storage.rows.length, 1); assert.match(storage.rows[0].message, /Help with my saved review/);
});

test('large numeric message IDs cannot collide after JavaScript precision loss; exact retries deduplicate', async () => {
  const first = mail().replace('"mail-1"', '1560840837125110000');
  const second = mail().replace('"mail-1"', '1560840837125110001');
  assert.equal(JSON.parse(first).messageId, JSON.parse(second).messageId);
  const storage = database();
  await handle(request(first), storage.db); await handle(request(second), storage.db);
  const repeated = await handle(request(first), storage.db);
  assert.equal(storage.rows.length, 2); assert.deepEqual(await repeated.json(), { ok: true, duplicate: true });
  assert.notEqual(storage.rows[0].external_id, storage.rows[1].external_id);
});

test('unrelated recipients are ignored and malformed senders/JSON fail without persisting anything', async () => {
  const storage = database();
  assert.deepEqual(await (await handle(request(mail({ toAddress: 'unrelated@example.com' })), storage.db)).json(), { ok: true, ignored: true });
  assert.equal((await handle(request(mail({ fromAddress: 'not-an-email' })), storage.db)).status, 400);
  assert.equal((await handle(request('{not-json}'), storage.db)).status, 400);
  assert.equal(storage.rows.length, 0);
});

test('missing signatures, oversized streams and database outages fail closed with bounded generic errors', async () => {
  const storage = database();
  assert.equal((await handle(new Request('https://functions.example', { method: 'POST', body: '{}' }), storage.db)).status, 401);
  assert.equal(storage.reads, 0);
  const oversized = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(65537)); controller.close(); } });
  const streamed = new Request('https://functions.example', { method: 'POST', body: oversized, duplex: 'half' });
  assert.equal((await handle(streamed, storage.db)).status, 413);
  assert.equal(storage.reads, 0);
  const outage = database(secret, { queueError: true });
  const failed = await handle(request(), outage.db);
  assert.equal(failed.status, 503); assert.doesNotMatch(await failed.text(), /Sensitive backend failure|signing-secret/);
});

test('Zoho integration secret has no anonymous/authenticated access and service cannot update it', async () => {
  const db = new PGlite();
  try {
    await db.exec('create role anon; create role authenticated; create role service_role bypassrls;');
    await db.exec(readFileSync('supabase/migrations/20261031000002_zoho_support.sql', 'utf8'));
    for (const role of ['anon', 'authenticated']) {
      await db.exec(`set role ${role}`);
      await assert.rejects(db.query('select * from public.mail_webhook_integrations'), /permission denied/);
      await assert.rejects(db.query("insert into public.mail_webhook_integrations(provider,signing_secret) values('zoho','x')"), /permission denied/);
      await db.exec('reset role');
    }
    await db.exec('set role service_role');
    await db.query("insert into public.mail_webhook_integrations(provider,signing_secret) values('zoho','fixture')");
    assert.equal((await db.query('select provider from public.mail_webhook_integrations')).rows.length, 1);
    await assert.rejects(db.query("update public.mail_webhook_integrations set signing_secret='replacement'"), /permission denied/);
  } finally { await db.close(); }
});

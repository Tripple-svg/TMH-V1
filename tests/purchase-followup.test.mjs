import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, webcrypto } from 'node:crypto';
import vm from 'node:vm';
import { buildSync } from 'esbuild';
import { editorialEmail, purchaseEmail } from '../supabase/functions/_shared/email-template.js';

const ID = '30000000-0000-4000-8000-000000000001';
const CLAIM = '40000000-0000-4000-8000-000000000001';
const ENV = { SUPABASE_URL: 'https://project.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'service-secret', RESEND_API_KEY: 'resend-secret' };
const compiled = new Map();
function source(path) {
  if (!compiled.has(path)) compiled.set(path, buildSync({ entryPoints: [new URL('../' + path, import.meta.url).pathname.replace(/^\/(\w:)/, '$1')], bundle: true, write: false, format: 'cjs', platform: 'node', external: ['https://*'], logLevel: 'silent' }).outputFiles[0].text);
  return compiled.get(path);
}
function sandbox(extra = {}) {
  return { module: { exports: {} }, Response, Request, Headers, URL, URLSearchParams, AbortSignal, TextEncoder,TextDecoder, Uint8Array, crypto: webcrypto,
    console: { error() {}, warn() {}, log() {} }, ...extra };
}
function helper() {
  const context = sandbox(); vm.runInNewContext(source('supabase/functions/_shared/purchase-followup.ts'), context); return context.module.exports;
}
function fixture({ name = '<Ada>', status = 200, markerFails = false, cancelledAfterClaim = false, seed = true } = {}) {
  const rows = seed ? [{ id: ID, claim_id: CLAIM, reference: 'UNSEEN_receipt', email: 'buyer@example.com', first_name: name, due_at: new Date(Date.now() - 1000).toISOString(), provider_email_id: null, sent_at: null, cancelled_at: null, attempts: 0 }] : [];
  const mail = [], calls = [], env = { ...ENV };
  const db = {
    async rpc(name, args) {
      calls.push({ name, args }); const row = rows.find(row => !args?.p_id || row.id === args.p_id);
      if (name === 'claim_playbook_followups') return { data: rows.filter(row => !row.sent_at && !row.cancelled_at).map(row => { row.claim_id = CLAIM; row.attempts++; return { ...row }; }) };
      if (name === 'save_playbook_followup_payload') {
        if (cancelledAfterClaim) { row.cancelled_at = 'now'; return { data: null }; }
        row.email_payload ||= structuredClone(args.p_payload); return { data: row.email_payload };
      }
      if (name === 'complete_playbook_followup') {
        if (args.p_email_id && markerFails) { markerFails = false; return { error: { code: 'XX000' } }; }
        row.provider_email_id ||= args.p_email_id; row.last_error = args.p_error; row.claim_id = null;
        if (args.p_email_id) row.sent_at = 'accepted';
        return { data: true };
      }
      if (name === 'cancel_playbook_followup') { if (row) row.cancelled_at = 'cancelled'; return { data: null }; }
      throw new Error('Unexpected RPC: ' + name);
    },
    from(table) {
      assert.equal(table, 'playbook_purchase_followups'); let patch; const filters = [];
      return { update(value) { patch = value; return this; }, eq(key, value) { filters.push([key, value]); return this; }, then(resolve) {
        rows.filter(row => filters.every(([key, value]) => row[key] === value)).forEach(row => Object.assign(row, patch)); return Promise.resolve({ error: null }).then(resolve);
      } };
    },
  };
  function load(name) {
    let handler;
    const context = sandbox({ require: spec => spec.includes('server.ts') ? { serve: fn => { handler = fn; } } : { createClient: () => db },
      Deno: { env: { get: key => env[key] } }, fetch: async (url, options) => {
        assert.equal(url, 'https://api.resend.com/emails'); mail.push({ body: JSON.parse(options.body), headers: options.headers });
        return Response.json(status === 200 ? { id: 'accepted-email' } : { name: 'restricted_api_key', message: 'private provider body' }, { status });
      } });
    vm.runInNewContext(source('supabase/functions/' + name + '/index.ts'), context); return handler;
  }
  const request = (authorised = true) => new Request(ENV.SUPABASE_URL + '/functions/v1/send-purchase-followup', { method: 'POST', headers: authorised ? { 'x-haven-internal-key': ENV.SUPABASE_SERVICE_ROLE_KEY } : {}, body: JSON.stringify({ email: 'attacker@example.com' }) });
  return { rows, mail, calls, env, worker: load('send-purchase-followup'), unsubscribe: load('playbook-followup-unsubscribe'), request };
}

test('email v3 updates the brand signoff while queued v1/v2 purchase payloads remain byte-identical', () => {
  const snapshots = { 'editorial-v1': 'a1b659e7db87f410e18f247abfaea29b08e66e1aea4888ba00c2a7155346690f', 'editorial-v2': '5f530368488ed5a0dbc58b7804b67c26d72967f7f69246e7b58c936848c46184' };
  for (const [version, expected] of Object.entries(snapshots)) assert.equal(createHash('sha256').update(JSON.stringify(purchaseEmail('UNSEEN_snapshot', version))).digest('hex'), expected);
  const email = purchaseEmail('UNSEEN_new'); assert.match(email.html, /Your friends over at Team Haven/); assert.match(email.text, /Building with intention/);
  assert.doesNotMatch(email.html + email.text, /Talk soon|Clarity\. Direction\. Work that matters/);
  const old = editorialEmail({ version: 'editorial-v2', title: 'Snapshot', paragraphs: ['Hello.'] });
  assert.equal(createHash('sha256').update(old).digest('hex'), '375b4c1f08a1b216ca32b1bcfb07a0105fcef7f3f601e6ee44e804690a502064');
});

test('follow-up worker rejects public callers before queue/provider work and cannot accept a caller recipient', async () => {
  const f = fixture(); assert.equal((await f.worker(f.request(false))).status, 401); assert.equal(f.calls.length, 0); assert.equal(f.mail.length, 0);
  assert.equal((await f.worker(f.request())).status, 200); assert.deepEqual(f.mail[0].body.to, ['buyer@example.com']);
  assert.equal(f.calls[0].args.p_limit, 5); assert.match(f.mail[0].body.html, /&lt;Ada&gt;/);
  assert.match(f.mail[0].body.html, />Explore TMH Services</); assert.match(f.mail[0].body.html, /https:\/\/themarketinghaven.xyz\/#services/);
  assert.match(f.mail[0].body.text, /Chapter 5, The Shift From Knowing to Doing/); assert.match(f.mail[0].body.text, /one-time/);
  assert.ok(!JSON.stringify(f.mail[0].body).includes(ENV.SUPABASE_SERVICE_ROLE_KEY)); assert.equal(f.rows[0].sent_at, 'accepted');
  assert.equal((await f.worker(f.request())).status, 200); assert.equal(f.mail.length, 1);
});

test('follow-up mail uses Hey there when there is no payment-provided name', async () => {
  const f = fixture({ name: null }); await f.worker(f.request()); assert.match(f.mail[0].body.text, /^Hey there,/);
});

test('a marker outage retains provider acceptance so the next lease repairs status without another email', async () => {
  const f = fixture({ markerFails: true }); assert.equal((await f.worker(f.request())).status, 502);
  assert.equal(f.rows[0].provider_email_id, 'accepted-email'); assert.equal(f.rows[0].sent_at, null);
  assert.equal((await f.worker(f.request())).status, 200); assert.equal(f.mail.length, 1); assert.equal(f.rows[0].sent_at, 'accepted');
});

test('provider failures remain pending with sanitized diagnostics and frozen retry payload/sender', async () => {
  const f = fixture({ status: 403 });
  const result = await (await f.worker(f.request())).json(); assert.equal(result.pending, 1); assert.equal(f.rows[0].last_error, 'resend_key_restricted');
  assert.equal(f.rows[0].sent_at, null); f.env.RESEND_FROM_EMAIL = 'Changed <new@example.com>';
  await f.worker(f.request()); assert.deepEqual(f.mail[1].body, f.mail[0].body); assert.equal(f.mail[1].headers['Idempotency-Key'], f.mail[0].headers['Idempotency-Key']);
  assert.ok(!JSON.stringify(result).includes('private provider body'));
});

test('cancellation after claiming but before freezing mail prevents sending', async () => {
  const f = fixture({ cancelledAfterClaim: true }); await f.worker(f.request()); assert.equal(f.mail.length, 0);
});

test('signed opt-out GET is read-only; POST cancels only the signed job and rejects tampering/expiry', async () => {
  const f = fixture(), h = helper(); const url = await h.followupOptOutUrl(ENV.SUPABASE_URL, ID, new Date().toISOString(), ENV.SUPABASE_SERVICE_ROLE_KEY);
  const get = await f.unsubscribe(new Request(url)); assert.equal(get.status, 200); assert.equal(f.calls.length, 0);
  assert.match(await get.text(), /form method="post"/); assert.match(get.headers.get('content-security-policy'), /default-src 'none'/);
  assert.equal((await f.unsubscribe(new Request(url, { method: 'POST' }))).status, 200); assert.equal(f.rows[0].cancelled_at, 'cancelled');
  assert.equal(f.calls[0].name, 'cancel_playbook_followup'); assert.equal(f.calls[0].args.p_id, ID);
  const tampered = new URL(url); tampered.searchParams.set('id', '30000000-0000-4000-8000-000000000002');
  assert.equal((await f.unsubscribe(new Request(tampered, { method: 'POST' }))).status, 400);
  const expired = await h.followupOptOutUrl(ENV.SUPABASE_URL, ID, new Date(Date.now() - 40 * 86400000).toISOString(), ENV.SUPABASE_SERVICE_ROLE_KEY);
  assert.equal((await f.unsubscribe(new Request(expired, { method: 'POST' }))).status, 400); assert.equal(f.calls.length, 1);
});

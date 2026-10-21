import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { transformSync } from 'esbuild';

const ID = '7ccf900a-0bfe-4d54-8f49-5c22cdca8326';
const ENV = {
  SUPABASE_URL: 'https://project.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-test',
  RESEND_API_KEY: 'resend-test',
};
const json = (body, status = 200) => new Response(JSON.stringify(body), { status });
const request = (body = { notificationId: ID }, headers = {}, method = 'POST') => new Request('https://project.supabase.co/functions/v1/send-flag-alert', {
  method,
  headers: { 'Content-Type': 'application/json', Authorization: 'Bearer service-test', ...headers },
  ...(method === 'POST' ? { body: JSON.stringify(body) } : {}),
});

function database(options = {}) {
  const rows = structuredClone(options.rows ?? [{ id: ID, email: 'owner@example.com', status: 'red', reason: 'Terms violation', sent_at: null }]);
  const calls = [];
  const client = { from(table) {
    assert.equal(table, 'flag_alert_notifications');
    let values, id, fields;
    let pendingOnly = false;
    const run = async (single = false) => {
      calls.push({ action: values ? 'update' : 'select', id, fields, values: values && structuredClone(values), pendingOnly });
      if (!values && options.readError) return { data: null, error: { message: 'Read failed' } };
      if (values && options.updateError) return { data: null, error: { message: 'Write failed' } };
      if (options.throwQuery) throw new Error('Database unavailable');
      const selected = rows.filter((row) => row.id === id && (!pendingOnly || row.sent_at === null));
      if (values) selected.forEach((row) => Object.assign(row, values));
      return { data: single ? selected[0] || null : selected, error: null };
    };
    return {
      select(value) { fields = value; return this; },
      eq(column, value) { assert.equal(column, 'id'); id = value; return this; },
      is(column, value) { assert.equal(column, 'sent_at'); assert.equal(value, null); pendingOnly = true; return this; },
      update(value) { values = value; return this; },
      maybeSingle() { return run(true); },
      then(resolve, reject) { return run().then(resolve, reject); },
    };
  } };
  return { rows, calls, client };
}

function load({ db = database(), env = {}, fetch: send = async () => json({ id: 'message-1' }) } = {}) {
  let handler;
  const mail = [];
  const code = transformSync(readFileSync(new URL('../supabase/functions/send-flag-alert/index.ts', import.meta.url), 'utf8'), { loader: 'ts', format: 'cjs' }).code;
  vm.runInNewContext(code, {
    require: (specifier) => specifier.includes('server.ts') ? { serve: (fn) => { handler = fn; } } : { createClient: () => db.client },
    Deno: { env: { get: (key) => ({ ...ENV, ...env })[key] } },
    fetch: async (url, options) => { mail.push({ url, ...options, body: JSON.parse(options.body) }); return send(url, options); },
    Request, Response, Headers, AbortSignal,
    console: { error() {} },
  });
  return { handler, mail, db };
}

test('flag alert: only the exact service-role bearer can read notifications or send email', async () => {
  const forged = `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url')}.forged`;
  for (const authorization of ['', 'Bearer anon-test', 'Bearer admin-session', `Bearer ${forged}`, 'service-test']) {
    const { handler, db, mail } = load();
    const result = await handler(request({ notificationId: ID, password: 'admin-test' }, { Authorization: authorization }));
    assert.equal(result.status, 401);
    assert.deepEqual(await result.json(), { ok: false, error: 'Unauthorised' });
    assert.equal(db.calls.length, 0);
    assert.equal(mail.length, 0);
  }
});

test('flag alert: content comes from the database snapshot and recipients are fixed', async () => {
  const { handler, db, mail } = load();
  const result = await handler(request({
    notificationId: ID, to: ['attacker@example.com'], email: 'spoof@example.com',
    status: 'yellow', reason: 'Spoofed reason',
  }));
  assert.equal(result.status, 200);
  assert.deepEqual(await result.json(), { ok: true });
  assert.equal(result.headers.get('Cache-Control'), 'no-store');
  assert.equal(mail.length, 1);
  assert.equal(mail[0].url, 'https://api.resend.com/emails');
  assert.equal(mail[0].method, 'POST');
  assert.equal(mail[0].headers.Authorization, 'Bearer resend-test');
  assert.equal(mail[0].headers['Idempotency-Key'], `flag-alert/${ID}`);
  assert.deepEqual(mail[0].body.to, ['francis.teamhaven@gmail.com', 'paschal.tmh@gmail.com']);
  assert.equal(mail[0].body.from, 'The Marketing Haven <info@themarketinghaven.xyz>');
  assert.equal(mail[0].body.reply_to, 'info@themarketinghaven.xyz');
  assert.equal(mail[0].body.subject, 'URGENT: User Flagged - red');
  assert.equal(mail[0].body.text, 'User owner@example.com has been flagged as red. Reason Haven flagged them: Terms violation. Please review in the Admin Dashboard.');
  assert.equal(mail[0].body.html, undefined);
  assert.ok(db.rows[0].sent_at);
  assert.ok(Number.isFinite(Date.parse(db.rows[0].sent_at)));
  assert.equal(db.calls[1].pendingOnly, true);
  assert.deepEqual(Object.keys(db.calls[1].values), ['sent_at']);
});

test('flag alert: yellow status and missing reason use snapshot values and fallback text', async () => {
  const db = database({ rows: [{ id: ID, email: 'yellow@example.com', status: 'yellow', reason: null, sent_at: null }] });
  const { handler, mail } = load({ db });
  assert.equal((await handler(request())).status, 200);
  assert.equal(mail[0].body.subject, 'URGENT: User Flagged - yellow');
  assert.equal(mail[0].body.text, 'User yellow@example.com has been flagged as yellow. Reason Haven flagged them: Not provided. Please review in the Admin Dashboard.');
});

test('flag alert: a durable sent marker skips delivery even long after provider idempotency expires', async () => {
  const db = database({ rows: [{ id: ID, email: 'owner@example.com', status: 'red', reason: 'Old', sent_at: '2020-01-01T00:00:00.000Z' }] });
  const { handler, mail } = load({ db, env: { RESEND_API_KEY: undefined } });
  const result = await handler(request());
  assert.equal(result.status, 200);
  assert.deepEqual(await result.json(), { ok: true, skipped: 'already sent' });
  assert.equal(mail.length, 0);
  assert.equal(db.calls.length, 1);
  assert.equal(db.rows[0].sent_at, '2020-01-01T00:00:00.000Z');
});

test('flag alert: repeated calls after success send once and then skip', async () => {
  const { handler, db, mail } = load();
  assert.equal((await handler(request())).status, 200);
  const sentAt = db.rows[0].sent_at;
  const retry = await handler(request());
  assert.equal(retry.status, 200);
  assert.deepEqual(await retry.json(), { ok: true, skipped: 'already sent' });
  assert.equal(mail.length, 1);
  assert.equal(db.rows[0].sent_at, sentAt);
});

test('flag alert: failed provider responses or thrown network errors leave the outbox pending', async () => {
  for (const send of [async () => json({ error: 'Provider down' }, 503), async () => { throw new Error('Network failure'); }]) {
    const { handler, db, mail } = load({ fetch: send });
    const result = await handler(request());
    assert.equal(result.status, 502);
    assert.equal((await result.json()).ok, false);
    assert.equal(db.rows[0].sent_at, null);
    assert.equal(db.calls.filter((call) => call.action === 'update').length, 0);
    assert.equal(mail.length, 1);
  }
});

test('flag alert: a failed delivery retry reuses the same event idempotency key', async () => {
  let attempts = 0;
  const { handler, db, mail } = load({ fetch: async () => json({}, ++attempts === 1 ? 503 : 200) });
  assert.equal((await handler(request())).status, 502);
  assert.equal(db.rows[0].sent_at, null);
  assert.equal((await handler(request())).status, 200);
  assert.ok(db.rows[0].sent_at);
  assert.equal(mail.length, 2);
  assert.equal(mail[0].headers['Idempotency-Key'], mail[1].headers['Idempotency-Key']);
  assert.equal(mail[0].headers['Idempotency-Key'], `flag-alert/${ID}`);
});

test('flag alert: delivery marker failures return an error and retries retain the provider key', async () => {
  const options = { updateError: true };
  const db = database(options);
  const { handler, mail } = load({ db });
  const result = await handler(request());
  assert.equal(result.status, 500);
  assert.match((await result.json()).error, /sent.*could not be recorded/i);
  assert.equal(db.rows[0].sent_at, null);
  options.updateError = false;
  assert.equal((await handler(request())).status, 200);
  assert.equal(mail[0].headers['Idempotency-Key'], mail[1].headers['Idempotency-Key']);
  assert.ok(db.rows[0].sent_at);
});

test('flag alert: missing notification or database errors cannot send email', async () => {
  for (const [options, expected] of [[{ rows: [] }, 404], [{ readError: true }, 500], [{ throwQuery: true }, 500]]) {
    const { handler, db, mail } = load({ db: database(options) });
    const result = await handler(request());
    assert.equal(result.status, expected);
    assert.equal((await result.json()).ok, false);
    assert.equal(db.calls.filter((call) => call.action === 'update').length, 0);
    assert.equal(mail.length, 0);
  }
});

test('flag alert: invalid IDs and malformed JSON are rejected without database or provider calls', async () => {
  const { handler, db, mail } = load();
  for (const body of [{}, { notificationId: null }, { notificationId: 'not-a-uuid' }, { notificationId: `${ID}/escape` }]) {
    assert.equal((await handler(request(body))).status, 400);
  }
  const malformed = new Request('https://project.supabase.co/functions/v1/send-flag-alert', {
    method: 'POST', headers: { Authorization: 'Bearer service-test', 'Content-Type': 'application/json' }, body: '{',
  });
  assert.equal((await handler(malformed)).status, 400);
  assert.equal(db.calls.length, 0);
  assert.equal(mail.length, 0);
});

test('flag alert: missing server secrets or email configuration cannot mark delivery', async () => {
  for (const env of [{ SUPABASE_URL: undefined }, { SUPABASE_SERVICE_ROLE_KEY: undefined }, { RESEND_API_KEY: undefined }]) {
    const { handler, db, mail } = load({ env });
    const result = await handler(request());
    assert.equal(result.status, 500);
    assert.equal(db.rows[0].sent_at, null);
    assert.equal(db.calls.filter((call) => call.action === 'update').length, 0);
    assert.equal(mail.length, 0);
  }
});

test('flag alert: unsupported methods and preflight do not touch notifications', async () => {
  const { handler, db, mail } = load();
  assert.equal((await handler(request({}, {}, 'OPTIONS'))).status, 204);
  assert.equal((await handler(request({}, {}, 'GET'))).status, 405);
  assert.equal(db.calls.length, 0);
  assert.equal(mail.length, 0);
});

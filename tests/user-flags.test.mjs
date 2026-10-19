import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { transformSync } from 'esbuild';

const ENV = {
  SUPABASE_URL: 'https://project.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-test',
  ADMIN_PASSWORD: 'admin-test',
  RESEND_API_KEY: 'resend-test',
};
const json = (body, status = 200) => new Response(JSON.stringify(body), { status });
const request = (body, headers = {}, method = 'POST') => new Request('https://project.supabase.co/functions/v1/test', {
  method,
  headers: { 'Content-Type': 'application/json', origin: 'http://localhost:5175', ...headers },
  ...(method === 'POST' ? { body: JSON.stringify(body) } : {}),
});
const flag = (status = 'red', extras = {}) => ({ email: 'owner@example.com', status, reason: 'Terms violation', ...extras });

function database(seed = [{ id: 'review-1', email: 'Owner@Example.com', flag_status: 'white', flag_reason: null }], options = {}) {
  const rows = structuredClone(seed);
  const writes = [], reads = [], authTokens = [];
  const client = {
    auth: { async getUser(token) {
      authTokens.push(token);
      return options.authResult || { data: { user: null }, error: { message: 'Invalid token' } };
    } },
    from(table) {
      assert.equal(table, 'brand_reviews');
      let values, fields, column, pattern, cap = Infinity;
      const run = async (single = false) => {
        if (options.throwQuery) throw new Error('Database network failure');
        if (options.queryError) return { data: null, error: { message: 'Database unavailable' } };
        const exactEmail = pattern.replace(/\\([\\%_])/g, '$1').toLowerCase();
        const matches = rows.filter((row) => String(row[column]).toLowerCase() === exactEmail).slice(0, cap);
        const call = { table, fields, column, pattern };
        if (values) {
          writes.push({ ...call, values: structuredClone(values) });
          matches.forEach((row) => Object.assign(row, values));
        } else reads.push(call);
        const projected = matches.map((row) => Object.fromEntries(fields.split(',').map((field) => field.trim()).map((field) => [field, row[field]])));
        return { data: single ? projected[0] || null : projected, error: null };
      };
      return {
        update(value) { values = value; return this; },
        select(value) { fields = value; return this; },
        ilike(name, value) { column = name; pattern = value; return this; },
        limit(value) { cap = value; return this; },
        maybeSingle() { return run(true); },
        then(resolve, reject) { return run().then(resolve, reject); },
      };
    },
  };
  return { client, rows, writes, reads, authTokens };
}

function load(name, { db = database(), env = {}, fetch: send = async () => json({ id: 'email-1' }) } = {}) {
  let handler;
  const mail = [];
  const code = transformSync(readFileSync(new URL(`../supabase/functions/${name}/index.ts`, import.meta.url), 'utf8'), { loader: 'ts', format: 'cjs' }).code;
  vm.runInNewContext(code, {
    require: (specifier) => specifier.includes('server.ts') ? { serve: (fn) => { handler = fn; } } : { createClient: () => db.client },
    Deno: { env: { get: (key) => ({ ...ENV, ...env })[key] } },
    fetch: async (url, options) => { mail.push({ url, ...options, body: JSON.parse(options.body) }); return send(url, options); },
    Response, Request, Headers, AbortSignal, TextEncoder, Uint8Array, crypto: webcrypto,
    console: { error() {}, warn() {}, log() {} },
  });
  return { handler, db, mail };
}

test('flags: service-role and existing admin password each authorize moderation', async () => {
  for (const [body, headers] of [
    [flag(), { Authorization: 'Bearer service-test' }],
    [flag('red', { password: 'admin-test' }), { Authorization: 'Bearer public-anon-key' }],
  ]) {
    const { handler, db, mail } = load('flag-user');
    const result = await handler(request(body, headers));
    assert.equal(result.status, 200);
    assert.equal((await result.json()).ok, true);
    assert.equal(db.rows[0].flag_status, 'red');
    assert.equal(db.writes.length, 1);
    assert.equal(db.authTokens.length, 0);
    assert.equal(mail.length, 0);
  }
});

test('flags: server-verified app_metadata admin claim authorizes moderation', async () => {
  const db = database(undefined, { authResult: { data: { user: { app_metadata: { role: 'admin' } } }, error: null } });
  const { handler } = load('flag-user', { db });
  const result = await handler(request(flag(), { Authorization: 'Bearer verified-admin-session' }));
  assert.equal(result.status, 200);
  assert.deepEqual(db.authTokens, ['verified-admin-session']);
  assert.equal(db.writes.length, 1);
});

test('flags: missing credentials, wrong password, anon key and forged token cannot write or send mail', async () => {
  const forged = `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ role: 'service_role', app_metadata: { role: 'admin' } })).toString('base64url')}.forged`;
  for (const [body, headers] of [
    [flag('yellow'), {}],
    [flag('yellow', { password: 'wrong' }), {}],
    [flag('yellow'), { Authorization: 'Bearer public-anon-key' }],
    [flag('yellow'), { Authorization: `Bearer ${forged}` }],
  ]) {
    const { handler, db, mail } = load('flag-user');
    const result = await handler(request(body, headers));
    assert.equal(result.status, 401);
    assert.deepEqual(await result.json(), { ok: false, error: 'Unauthorised' });
    assert.equal(db.writes.length, 0);
    assert.equal(db.reads.length, 0);
    assert.equal(mail.length, 0);
  }
});

test('flags: user-controlled metadata and unverified admin claims do not authorize', async () => {
  for (const authResult of [
    { data: { user: { user_metadata: { role: 'admin' }, app_metadata: { role: 'user' } } }, error: null },
    { data: { user: { app_metadata: { role: 'admin' } } }, error: { message: 'Token verification failed' } },
  ]) {
    const db = database(undefined, { authResult });
    const { handler, mail } = load('flag-user', { db });
    assert.equal((await handler(request(flag('yellow'), { Authorization: 'Bearer session' }))).status, 401);
    assert.equal(db.writes.length, 0);
    assert.equal(mail.length, 0);
  }
});

test('flags: unset admin password does not authenticate an empty password', async () => {
  const { handler, db } = load('flag-user', { env: { ADMIN_PASSWORD: undefined } });
  assert.equal((await handler(request(flag('red', { password: '' })))).status, 401);
  assert.equal(db.writes.length, 0);
  assert.equal((await handler(request(flag(), { Authorization: 'Bearer service-test' }))).status, 200);
});

test('flags: invalid email, status and reason are rejected before writes or email', async () => {
  const invalid = [
    { email: 'invalid' }, { email: '' }, { email: `${'a'.repeat(243)}@example.com` },
    { status: 'green' }, { status: 'RED' }, { status: null },
    { reason: { text: 'bad' } }, { reason: 1 }, { reason: 'a'.repeat(2001) },
  ];
  const { handler, db, mail } = load('flag-user');
  for (const patch of invalid) {
    const result = await handler(request(flag('yellow', patch), { Authorization: 'Bearer service-test' }));
    assert.equal(result.status, 400, JSON.stringify(patch));
    assert.equal((await result.json()).ok, false);
  }
  assert.equal(db.writes.length, 0);
  assert.equal(mail.length, 0);
});

test('flags: moderation matches a trimmed case-insensitive literal email and changes only flag columns', async () => {
  const db = database([
    { id: 'target', email: 'A_%@Example.com', flag_status: 'white', flag_reason: null, full_name: 'Original' },
    { id: 'other', email: 'another@example.com', flag_status: 'white', flag_reason: null },
  ]);
  const { handler } = load('flag-user', { db });
  const result = await handler(request(flag('red', {
    email: ' A_%@EXAMPLE.COM ', reason: '  Restricted for testing  ', full_name: 'Changed', converted_to_call: true,
  }), { Authorization: 'Bearer service-test' }));
  assert.equal(result.status, 200);
  assert.equal(db.writes[0].pattern, 'a\\_\\%@example.com');
  assert.deepEqual(db.writes[0].values, { flag_status: 'red', flag_reason: 'Restricted for testing' });
  assert.equal(db.rows[0].full_name, 'Original');
  assert.equal(db.rows[0].flag_status, 'red');
  assert.equal(db.rows[1].flag_status, 'white');
});

test('flags: null, omitted and blank reasons clear the reason; 2000 characters are accepted', async () => {
  const { handler, db } = load('flag-user');
  for (const reason of [null, undefined, '  ', 'x'.repeat(2000)]) {
    const result = await handler(request(flag('white', { reason }), { Authorization: 'Bearer service-test' }));
    assert.equal(result.status, 200);
    assert.equal(db.rows[0].flag_reason, typeof reason === 'string' && reason.trim() ? reason.trim() : null);
  }
});

test('flags: yellow sends the warning with plain text, sender, subject and normalized recipient', async () => {
  const { handler, mail } = load('flag-user');
  const result = await handler(request(flag('yellow', { email: ' Owner@EXAMPLE.com ', reason: '<script>unsafe</script>' }), { Authorization: 'Bearer service-test' }));
  assert.equal(result.status, 200);
  assert.equal(mail.length, 1);
  assert.equal(mail[0].url, 'https://api.resend.com/emails');
  assert.equal(mail[0].method, 'POST');
  assert.equal(mail[0].headers.Authorization, 'Bearer resend-test');
  assert.deepEqual(mail[0].body.to, ['owner@example.com']);
  assert.equal(mail[0].body.from, 'The Marketing Haven <info@themarketinghaven.xyz>');
  assert.equal(mail[0].body.reply_to, 'info@themarketinghaven.xyz');
  assert.equal(mail[0].body.subject, 'Warning regarding your usage of Haven.');
  assert.match(mail[0].body.text, /Warning regarding your usage of Haven\./);
  assert.match(mail[0].body.text, /Reason: <script>unsafe<\/script>/);
  assert.equal(mail[0].body.html, undefined);
  assert.match(mail[0].headers['Idempotency-Key'], /^haven-flag-warning\/review-1\/[a-f0-9]{64}$/);
});

test('flags: white and red never send warning email', async () => {
  const { handler, db, mail } = load('flag-user');
  for (const status of ['white', 'red']) {
    assert.equal((await handler(request(flag(status), { Authorization: 'Bearer service-test' }))).status, 200);
    assert.equal(db.rows[0].flag_status, status);
  }
  assert.equal(mail.length, 0);
});

test('flags: failed Resend response, network error or missing key preserves flag and reports partial failure', async () => {
  for (const options of [
    { fetch: async () => json({ error: 'delivery failed' }, 503) },
    { fetch: async () => { throw new Error('Resend unavailable'); } },
    { env: { RESEND_API_KEY: undefined } },
  ]) {
    const { handler, db, mail } = load('flag-user', options);
    const result = await handler(request(flag('yellow'), { Authorization: 'Bearer service-test' }));
    assert.equal(result.status, 502);
    const body = await result.json();
    assert.equal(body.ok, false);
    assert.equal(body.review.flag_status, 'yellow');
    assert.match(body.error, /Flag saved.*retry/i);
    assert.equal(db.rows[0].flag_status, 'yellow');
    assert.equal(db.rows[0].flag_reason, 'Terms violation');
    if (options.env) assert.equal(mail.length, 0);
  }
});

test('flags: warning retries reuse an idempotency key; changed warning text receives a different key', async () => {
  let attempt = 0;
  const { handler, mail } = load('flag-user', { fetch: async () => json({}, ++attempt === 1 ? 503 : 200) });
  assert.equal((await handler(request(flag('yellow'), { Authorization: 'Bearer service-test' }))).status, 502);
  assert.equal((await handler(request(flag('yellow'), { Authorization: 'Bearer service-test' }))).status, 200);
  assert.equal((await handler(request(flag('yellow', { reason: 'Different violation' }), { Authorization: 'Bearer service-test' }))).status, 200);
  assert.equal(mail[0].headers['Idempotency-Key'], mail[1].headers['Idempotency-Key']);
  assert.notEqual(mail[1].headers['Idempotency-Key'], mail[2].headers['Idempotency-Key']);
});

test('flags: missing review and database errors never send a warning or falsely report success', async () => {
  for (const [db, expected] of [[database([]), 404], [database(undefined, { queryError: true }), 500]]) {
    const { handler, mail } = load('flag-user', { db });
    const result = await handler(request(flag('yellow'), { Authorization: 'Bearer service-test' }));
    assert.equal(result.status, expected);
    assert.equal((await result.json()).ok, false);
    assert.equal(mail.length, 0);
  }
});

test('flags: preflight, methods, origins and missing server configuration perform no writes', async () => {
  const { handler, db, mail } = load('flag-user');
  const preflight = await handler(request({}, {}, 'OPTIONS'));
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('Access-Control-Allow-Origin'), 'http://localhost:5175');
  assert.equal((await handler(request({}, {}, 'GET'))).status, 405);
  assert.equal((await handler(request(flag('yellow'), { origin: 'https://evil.example', Authorization: 'Bearer service-test' }))).status, 403);
  for (const env of [{ SUPABASE_URL: undefined }, { SUPABASE_SERVICE_ROLE_KEY: undefined }]) {
    const missing = load('flag-user', { db, env });
    assert.equal((await missing.handler(request(flag('yellow'), { Authorization: 'Bearer service-test' }))).status, 500);
  }
  assert.equal(db.writes.length, 0);
  assert.equal(mail.length, 0);
});

test('flag lookup: legacy email-check response remains exactly { exists } without moderation data', async () => {
  const db = database([{ id: 'review-1', email: 'Owner@Example.com', flag_status: 'red', flag_reason: 'Private reason' }]);
  const { handler } = load('check-email-exists', { db });
  const result = await handler(request({ email: ' Owner@Example.com ' }));
  assert.equal(result.status, 200);
  assert.deepEqual(await result.json(), { exists: true });
  assert.equal(db.reads[0].fields, 'id');
  assert.deepEqual(await (await handler(request({ email: 'missing@example.com' }))).json(), { exists: false });
});

test('flag lookup: includeFlag returns current red or white without exposing reason, email or review ID', async () => {
  const db = database([
    { id: 'red', email: 'A_%@Example.com', flag_status: 'red', flag_reason: 'Private reason' },
    { id: 'legacy', email: 'legacy@example.com', flag_status: null },
  ]);
  const { handler } = load('check-email-exists', { db });
  const result = await handler(request({ email: ' A_%@EXAMPLE.com ', includeFlag: true }));
  assert.equal(result.status, 200);
  assert.equal(result.headers.get('Cache-Control'), 'no-store');
  assert.deepEqual(await result.json(), { exists: true, flag_status: 'red' });
  assert.equal(db.reads[0].pattern, 'A\\_\\%@EXAMPLE.com');
  assert.equal(db.reads[0].fields, 'id, flag_status');
  assert.deepEqual(await (await handler(request({ email: 'legacy@example.com', includeFlag: true }))).json(), { exists: true, flag_status: 'white' });
  assert.deepEqual(await (await handler(request({ email: 'missing@example.com', includeFlag: true }))).json(), { exists: false, flag_status: 'white' });
});

test('flag lookup: includeFlag errors are non-200 while legacy database failures retain their response shape', async () => {
  for (const options of [{ queryError: true }, { throwQuery: true }]) {
    const { handler } = load('check-email-exists', { db: database(undefined, options) });
    const lookup = await handler(request({ email: 'owner@example.com', includeFlag: true }));
    assert.ok(lookup.status >= 400, `includeFlag failure returned HTTP ${lookup.status}`);
    assert.equal((await lookup.json()).flag_status, undefined);
    const legacy = await handler(request({ email: 'owner@example.com' }));
    assert.equal(legacy.status, 200);
    assert.deepEqual(await legacy.json(), { exists: false });
  }
});

test('flag lookup: invalid email or missing secrets cannot silently return a white flag', async () => {
  for (const [body, env] of [
    [{ email: 'invalid', includeFlag: true }, {}],
    [{ email: 'owner@example.com', includeFlag: true }, { SUPABASE_SERVICE_ROLE_KEY: undefined }],
  ]) {
    const { handler, db } = load('check-email-exists', { env });
    const result = await handler(request(body));
    assert.ok(result.status >= 400);
    assert.equal((await result.json()).flag_status, undefined);
    assert.equal(db.reads.length, 0);
  }
});

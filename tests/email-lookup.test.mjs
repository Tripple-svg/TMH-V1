import { withSecurityRpc } from './helpers/security-fixture.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { transformSync, buildSync } from 'esbuild';

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
  const writes = [], reads = [], authTokens = [], notifications = [], alerts = [];
  const client = {
    auth: { async getUser(token) {
      authTokens.push(token);
      return options.authResult || { data: { user: null }, error: { message: 'Invalid token' } };
    } },
    functions: { async invoke(name, { body }) {
      assert.equal(name, 'send-flag-alert');
      alerts.push(body);
      if (options.alertThrows) throw new Error('Team alert unavailable');
      if (options.alertFailure) return { data: { ok: false }, error: null };
      notifications.find((row) => row.id === body.notificationId).sent_at = new Date().toISOString();
      return { data: { ok: true }, error: null };
    } },
    from(table) {
      if (table === 'flag_alert_notifications') {
        let cap = Infinity;
        const filters = [];
        return {
          select() { return this; },
          limit(value) { cap = value; return this; },
          eq(column, value) { filters.push((row) => row[column] === value); return this; },
          is(column, value) { filters.push((row) => row[column] === value); return this; },
          order() { return this; },
          then(resolve, reject) {
            return Promise.resolve(options.outboxUnavailable || (cap > 0 && options.pendingFailure)
              ? { data: null, error: { message: 'Outbox unavailable' } }
              : { data: notifications.filter((row) => filters.every((filter) => filter(row))).slice(0, cap), error: null }).then(resolve, reject);
          },
        };
      }
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
          matches.forEach((row) => {
            if (['yellow', 'red'].includes(values.flag_status) && row.flag_status !== values.flag_status) {
              notifications.push({
                id: `00000000-0000-4000-8000-${String(notifications.length + 1).padStart(12, '0')}`,
                review_id: row.id, email: row.email, status: values.flag_status, reason: values.flag_reason, sent_at: null,
              });
            }
            Object.assign(row, values);
          });
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
  return { client, rows, writes, reads, authTokens, notifications, alerts };
}

function load(name, { db = database(), env = {}, fetch: send = async () => json({ id: 'email-1' }) } = {}) {
  let handler;
  const mail = [];
  const code = buildSync({entryPoints:[`supabase/functions/${name}/index.ts`],bundle:true,write:false,format:'cjs',platform:'node',external:['https://*']}).outputFiles[0].text;
  vm.runInNewContext(code, {
    require: (specifier) => specifier.includes('server.ts') ? { serve: (fn) => { handler = fn; } } : { createClient: () => withSecurityRpc(db.client) },
    Deno: { env: { get: (key) => ({ ...ENV, ...env })[key] } },
    fetch: async (url, options) => { mail.push({ url, ...options, body: JSON.parse(options.body) }); return send(url, options); },
    Response, Request, Headers, AbortSignal, TextEncoder, Uint8Array, crypto: webcrypto,
    console: { error() {}, warn() {}, log() {} },
  });
  return { handler, db, mail };
}

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

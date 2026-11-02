import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import vm from 'node:vm';
import { buildSync, transformSync } from 'esbuild';
import { PGlite } from '@electric-sql/pglite';

const token = '11111111-1111-4111-8111-111111111111' + 'a'.repeat(32);
const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const request = (body = { token }, origin = 'https://themarketinghaven.xyz', method = 'POST') => new Request('https://project.supabase.co/functions/v1/confirm-data-deletion', {
  method, headers: { 'Content-Type': 'application/json', origin }, ...(!['GET', 'HEAD'].includes(method) ? { body: JSON.stringify(body) } : {}),
});

function fixture({ storageFails = false, denied = false, preparedError, sendStatus = 200 } = {}) {
  let handler; const calls = [], emails = [], logs = [];
  const db = {
    async rpc(name, args) {
      calls.push({ name, args });
      if (name === 'consume_playbook_limit') return { data: !denied };
      if (name === 'prepare_saved_review_deletion') return { data: preparedError ? { error: preparedError } : { requestId: 'request-id', email: 'owner@example.com', paths: ['review-id/screenshot.png'], deleted: 1 } };
      if (name === 'complete_saved_review_deletion') return { data: true };
      throw Error('Unexpected RPC');
    },
    storage: { from: () => ({ remove: async paths => { calls.push({ remove: paths }); return { error: storageFails ? { message: 'private provider error' } : null }; } }) },
  };
  const code = buildSync({ entryPoints: ['supabase/functions/confirm-data-deletion/index.ts'], bundle: true, write: false, format: 'cjs', platform: 'node', external: ['https://*'] }).outputFiles[0].text;
  vm.runInNewContext(code, {
    require: specifier => specifier.includes('server.ts') ? { serve: fn => { handler = fn; } } : { createClient: () => db },
    Deno: { env: { get: () => 'test-secret' } }, Request, Response, Headers, TextEncoder, TextDecoder, AbortSignal, Uint8Array, crypto: webcrypto,
    fetch: async (_, options) => { emails.push(JSON.parse(options.body)); return new Response('private-recipient-details', { status: sendStatus }); },
    console: { error: (...args) => logs.push(args.join(' ')) },
  });
  return { handler, calls, emails, logs };
}

test('deletion rejects methods, cross-origin, malformed/oversized tokens before database access', async () => {
  const f = fixture();
  assert.equal((await f.handler(request({}, undefined, 'GET'))).status, 405);
  assert.equal((await f.handler(request({ token }, 'https://evil.example'))).status, 403);
  assert.equal((await f.handler(request({ token: 'bad' }))).status, 400);
  assert.equal((await f.handler(request({ token, extra: true }))).status, 400);
  assert.equal((await f.handler(request({ token: 'a'.repeat(1100) }))).status, 413);
  assert.equal(f.calls.length, 0);
});

test('deletion applies a request budget and distinguishes expired/used links without deleting', async () => {
  const denied = fixture({ denied: true }); const response = await denied.handler(request());
  assert.equal(response.status, 429); assert.equal(response.headers.get('Retry-After'), '600');
  assert.equal(denied.calls.length, 1);
  for (const error of ['Link expired', 'Already used', 'Invalid token']) {
    const f = fixture({ preparedError: error }); const result = await f.handler(request());
    assert.equal(result.status, 400); assert.equal((await result.json()).error, error);
    assert.equal(f.emails.length, 0); assert.ok(!f.calls.some(c => c.remove));
  }
});

test('storage cleanup failure leaves the confirmation retryable and never claims completion', async () => {
  const f = fixture({ storageFails: true }); const response = await f.handler(request());
  assert.equal(response.status, 503); assert.match((await response.json()).error, /cleanup is still pending/);
  assert.ok(!f.calls.some(c => c.name === 'complete_saved_review_deletion')); assert.equal(f.emails.length, 0);
});

test('completion sends a scoped receipt; provider rejection logs exclude email bodies and tokens', async () => {
  const f = fixture({ sendStatus: 403 }); const response = await f.handler(request());
  assert.equal(response.status, 200); assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.equal((await response.json()).deleted, 1); assert.equal(f.emails.length, 1);
  assert.match(f.emails[0].text, /Purchase, booking/); assert.match(f.emails[0].text, /unlinked guest chats/);
  assert.match(f.logs.join(' '), /403/); assert.doesNotMatch(f.logs.join(' '), /owner@example|private-recipient|11111111/);
});

test('opening the deletion page only renders confirmation; double clicking starts one request', async () => {
  const effects = [], calls = [], removed = []; let release;
  const code = transformSync(read('src/pages/DataDeletionConfirmPage.jsx').replace(/^import[^\n]*\r?\n/gm, '').replace('export default function ', 'function ') + '\nmodule.exports=DataDeletionConfirmPage;', { loader: 'jsx', format: 'cjs' }).code;
  const context = {
    module: { exports: {} }, React: { Fragment: 'fragment', createElement: (type, props, ...children) => ({ type, props: { ...props, children } }) },
    useState: value => [value, () => {}], useRef: value => ({ current: value }), useEffect: fn => effects.push(fn),
    useSearchParams: () => [new URLSearchParams({ token })], Link: 'link', AlertTriangle: 'icon', CheckCircle2: 'icon', LoaderCircle: 'icon',
    window: { scrollTo() {}, localStorage: { removeItem: key => removed.push(key) } },
    supabase: { functions: { invoke: (...args) => { calls.push(args); return new Promise(resolve => { release = resolve; }); } } },
  };
  vm.runInNewContext(code, context); const tree = context.module.exports(); effects.forEach(fn => fn());
  const find = node => Array.isArray(node) ? node.flatMap(find) : node && typeof node === 'object' ? [node, ...find(node.props.children)] : [];
  const button = find(tree).find(n => n.type === 'button' && n.props.children.includes('Delete my saved review'));
  assert.ok(button); assert.equal(calls.length, 0);
  const pending = button.props.onClick(); await button.props.onClick(); assert.equal(calls.length, 1);
  release({ data: { ok: true }, error: null }); await pending;
  assert.equal(removed.length, 3); assert.ok(!removed.some(key => /playbook|purchase/i.test(key)));
});

test('PostgreSQL deletion is atomic, service-only and preserves retry paths after expiry', async () => {
  const db = new PGlite();
  const call = async (name, value) => (await db.query(`select public.${name}($1) as result`, [value])).rows[0].result;
  try {
    await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;
      create function auth.role() returns text language sql as $$select current_setting('request.jwt.claim.role',true)$$;
      create table brand_reviews(id text primary key,email text,screenshot_url text);
      create table haven_sessions(id text primary key,review_id text references brand_reviews(id));
      select set_config('request.jwt.claim.role','service_role',false);`);
    await db.exec(read('supabase/migrations/20261013000000_create_data_deletion_requests.sql'));
    await db.exec(read('supabase/migrations/20261031000001_deletion_cleanup.sql'));
    await db.query("insert into brand_reviews values('review-1','OWNER@example.com','review-1/screenshot.png')");
    await db.query("insert into haven_sessions values('session-1','review-1')");
    await db.query("insert into data_deletion_requests(email,token,expires_at) values('owner@example.com',$1,now()+interval '1 hour')", [token]);
    await db.exec("select set_config('request.jwt.claim.role','authenticated',false)");
    await assert.rejects(() => call('prepare_saved_review_deletion', token), e => e.code === '42501');
    await db.exec("select set_config('request.jwt.claim.role','service_role',false)");
    const first = await call('prepare_saved_review_deletion', token);
    assert.deepEqual(first.paths, ['review-1/screenshot.png']); assert.equal(first.deleted, 1);
    assert.equal((await db.query('select count(*)::int n from brand_reviews')).rows[0].n, 0);
    assert.equal((await db.query('select count(*)::int n from haven_sessions')).rows[0].n, 0);
    await db.query("update data_deletion_requests set expires_at=now()-interval '1 hour'");
    const retry = await call('prepare_saved_review_deletion', token); assert.deepEqual(retry, first);
    assert.equal(await call('complete_saved_review_deletion', first.requestId), true);
    assert.equal(await call('complete_saved_review_deletion', first.requestId), false);
    assert.equal((await call('prepare_saved_review_deletion', token)).error, 'Already used');
    assert.deepEqual((await db.query('select cleanup_paths from data_deletion_requests')).rows[0].cleanup_paths, []);
    await db.query("insert into brand_reviews values('review-2','other@example.com','other-review/screenshot.png')");
    await db.query("insert into haven_sessions values('session-2','review-2')");
    await db.query("insert into data_deletion_requests(email,token,expires_at) values('other@example.com','other-token',now()+interval '1 hour')");
    await assert.rejects(() => call('prepare_saved_review_deletion', 'other-token'), e => e.code === '22023');
    assert.equal((await db.query("select count(*)::int n from haven_sessions where id='session-2'")).rows[0].n, 1);
    assert.equal((await db.query("select count(*)::int n from brand_reviews where id='review-2'")).rows[0].n, 1);
  } finally { await db.close(); }
});

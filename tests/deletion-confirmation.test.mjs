import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import vm from 'node:vm';
import { buildSync, transformSync } from 'esbuild';
import { productionDb, rpc, scalar, seedReview } from './helpers/production-db.mjs';

const token = '11111111-1111-4111-8111-111111111111' + 'a'.repeat(32);
const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const request = (body = { token }, origin = 'https://themarketinghaven.xyz', method = 'POST') => new Request('https://project.supabase.co/functions/v1/confirm-data-deletion', {
  method, headers: { 'Content-Type': 'application/json', origin }, ...(!['GET', 'HEAD'].includes(method) ? { body: JSON.stringify(body) } : {}),
});

function fixture({ storageFails = false, denied = false, preparedError, sendStatus = 200 } = {}) {
  let handler; const calls = [], emails = [], logs = [];
  const db = {
    from: () => ({ select() { return this; }, eq() { return this; }, async maybeSingle() { return { data: { email: 'owner@example.com' } }; } }),
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
  assert.match(f.emails[0].text, /purchase, booking/i); assert.match(f.emails[0].text, /unlinked guest chats/);
  const prepare = f.calls.find(call => call.name === 'prepare_saved_review_deletion');
  assert.match(prepare.args.p_email_hash, /^[a-f0-9]{64}$/);
  assert.equal(prepare.args.p_network_hash, null);
  assert.match(f.logs.join(' '), /403/); assert.doesNotMatch(f.logs.join(' '), /owner@example|private-recipient|11111111/);
});

test('opening the deletion page only renders confirmation; double clicking starts one request', async () => {
  const effects = [], calls = [], removed = []; let release;
  const code = transformSync(read('src/pages/DataDeletionConfirmPage.jsx').replace(/^import[^\n]*\r?\n/gm, '').replace('export default function ', 'function ') + '\nmodule.exports=DataDeletionConfirmPage;', { loader: 'jsx', format: 'cjs' }).code;
  const context = {
    module: { exports: {} }, React: { Fragment: 'fragment', createElement: (type, props, ...children) => ({ type, props: { ...props, children } }) },
    useState: value => [value, () => {}], useRef: value => ({ current: value }), useEffect: fn => effects.push(fn),
    useSearchParams: () => [new URLSearchParams({ token })], Link: 'link', AlertTriangle: 'icon', CheckCircle2: 'icon', LoaderCircle: 'icon',
    clearReviewFormData: () => removed.push('review-draft'),
    window: { scrollTo() {}, localStorage: {
      getItem: key => ({ haven_review_id: 'review-1', haven_chat_identity_v1: '{"visitorId":"visitor-1"}' })[key],
      removeItem: key => removed.push(key),
    }, sessionStorage: { getItem: () => 'pending-1', removeItem: key => removed.push(key) } },
    supabase: { functions: { invoke: (...args) => { calls.push(args); return new Promise(resolve => { release = resolve; }); } } },
  };
  vm.runInNewContext(code, context); const tree = context.module.exports(); effects.forEach(fn => fn());
  const find = node => Array.isArray(node) ? node.flatMap(find) : node && typeof node === 'object' ? [node, ...find(node.props.children)] : [];
  const button = find(tree).find(n => n.type === 'button' && n.props.children.includes('Delete my saved review'));
  assert.ok(button); assert.equal(calls.length, 0);
  const pending = button.props.onClick(); await button.props.onClick(); assert.equal(calls.length, 1);
  release({ data: { ok: true, reviewIds: ['review-1'], visitorIds: ['visitor-1'] }, error: null }); await pending;
  for (const key of ['haven_review_id', 'tmh_haven_support_sessions', 'tmh_haven_service_sessions', 'haven_review_creation_pending-1']) {
    assert.ok(removed.includes(key));
  }
  assert.ok(!removed.some(key => /playbook|purchase/i.test(key)));
});

test('PostgreSQL deletion is atomic, service-only and preserves retry paths after expiry', async () => {
  const db = await productionDb({ baselineOnly: true });
  const emailHash = 'a'.repeat(64), networkHash = 'b'.repeat(64);
  const prepare = value => rpc(db, 'prepare_saved_review_deletion', [value, emailHash, networkHash]);
  try {
    await seedReview(db, 'review-1', 'OWNER@example.com');
    await db.exec(`update brand_reviews set screenshot_url = 'review-1/screenshot.png' where id = 'review-1';
      insert into haven_chat_visitors(id,token_hash,review_id) values ('visitor-1',repeat('a',64),'review-1'),('guest',repeat('b',64),null);
      insert into haven_sessions(id,review_id,scope,visitor_id) values
        ('session-1','review-1','audit','visitor-1'),('session-2',null,'support','visitor-1'),
        ('session-3',null,'service','visitor-1'),('guest-session',null,'support','guest');
      insert into support_requests(id,category,email,message,visitor_id) values
        (gen_random_uuid(),'other','owner@EXAMPLE.com','Synthetic support ticket',null),
        (gen_random_uuid(),'other','alternate@example.com','Synthetic support ticket','visitor-1'),
        (gen_random_uuid(),'other','guest@example.com','Synthetic support ticket','guest');`);
    await db.query("insert into data_deletion_requests(email,token,expires_at) values('owner@example.com',$1,now()+interval '1 hour')", [token]);
    await db.exec("select set_config('request.jwt.claim.role','authenticated',false)");
    await assert.rejects(() => prepare(token), e => e.code === '42501');
    assert.equal(await scalar(db, "select has_table_privilege('anon','deleted_visitor_emails','select')"), false);
    await db.exec("select set_config('request.jwt.claim.role','service_role',false)");
    const first = await prepare(token);
    assert.deepEqual(first.paths, ['review-1/screenshot.png']); assert.equal(first.deleted, 1);
    assert.deepEqual(first.visitorIds, ['visitor-1']);
    assert.equal((await db.query('select count(*)::int n from brand_reviews')).rows[0].n, 0);
    assert.deepEqual((await db.query('select id from haven_sessions')).rows, [{ id: 'guest-session' }]);
    assert.deepEqual((await db.query('select email from support_requests')).rows, [{ email: 'guest@example.com' }]);
    assert.equal(await scalar(db, 'select email_hash from deleted_visitor_emails'), emailHash);
    assert.equal(await rpc(db, 'review_deletion_status', ['OWNER@EXAMPLE.COM', 'c'.repeat(64), null]), 'email');
    assert.equal(await rpc(db, 'review_deletion_status', ['new@example.com', 'c'.repeat(64), networkHash]), 'network');
    assert.deepEqual(await rpc(db, 'create_haven_review_after_deletion_check', [{ email: 'owner@example.com' }, 'another-session', emailHash, emailHash, null]), { deletionBlock: 'email' });
    await db.exec("update deleted_review_networks set blocked_until = now() - interval '1 minute'");
    assert.equal(await rpc(db, 'review_deletion_status', ['new@example.com', 'c'.repeat(64), networkHash]), null);
    await rpc(db, 'production_private_retention');
    assert.equal(await scalar(db, 'select count(*)::int from deleted_review_networks'), 0);
    await db.query("update data_deletion_requests set expires_at=now()-interval '1 hour'");
    const retry = await prepare(token); assert.deepEqual(retry, first);
    assert.equal(await rpc(db, 'complete_saved_review_deletion', [first.requestId]), true);
    assert.equal(await rpc(db, 'complete_saved_review_deletion', [first.requestId]), false);
    assert.equal((await prepare(token)).error, 'Already used');
    assert.deepEqual((await db.query('select cleanup_paths from data_deletion_requests')).rows[0].cleanup_paths, []);
    await seedReview(db, 'review-2', 'other@example.com');
    await db.exec("update brand_reviews set screenshot_url='other-review/screenshot.png' where id='review-2'; insert into haven_sessions(id,review_id,scope) values('session-2','review-2','audit')");
    await db.query("insert into data_deletion_requests(email,token,expires_at) values('other@example.com','other-token',now()+interval '1 hour')");
    await assert.rejects(() => rpc(db, 'prepare_saved_review_deletion', ['other-token', 'c'.repeat(64), networkHash]), e => e.code === '22023');
    assert.equal((await db.query("select count(*)::int n from haven_sessions where id='session-2'")).rows[0].n, 1);
    assert.equal((await db.query("select count(*)::int n from brand_reviews where id='review-2'")).rows[0].n, 1);
  } finally { await db.close(); }
});

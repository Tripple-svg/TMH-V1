import * as production from '../src/lib/adminProduction.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { buildSync, transformSync } from 'esbuild';
import { PGlite } from '@electric-sql/pglite';

const ACTOR = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const VISITOR = '11111111-1111-4111-8111-111111111111';
const OTHER_VISITOR = '22222222-2222-4222-8222-222222222222';
const REQUEST_ID = '33333333-3333-4333-8333-333333333333';
const TOKEN = 'c'.repeat(64);
const digest = async token => Buffer.from(await webcrypto.subtle.digest('SHA-256', new TextEncoder().encode(token))).toString('hex');
const codes = Object.fromEntries(['support-request', 'admin-support', 'send-support-notification'].map(name => [name, buildSync({ entryPoints: [`supabase/functions/${name}/index.ts`], bundle: true, write: false, format: 'cjs', platform: 'node', external: ['https://*'] }).outputFiles[0].text]));

function endpoint(name, { visitorHash, captcha = true, limited = false, admin = true, rpcResult = { ok: true, changed: 1 }, providerFails = false, markerFails = false, row = {} } = {}) {
  let handler; const queries = [], writes = [], calls = [], mail = [];
  const savedRow = { id: REQUEST_ID, created_at: '2026-01-01T00:00:00Z', name: '<script>Buyer</script>', email: 'buyer@example.com', category: 'review_access', message: 'Sensitive full message that must stay in Admin', ...row };
  const db = {
    auth: { getUser: async token => token === 'good-admin' ? { data: { user: admin ? { id: ACTOR, app_metadata: { role: 'admin' } } : { id: ACTOR, user_metadata: { role: 'admin' } } } } : { data: { user: null }, error: { message: 'Invalid JWT' } } },
    async rpc(rpc, args) { calls.push({ rpc, args }); return { data: rpc === 'record_worker_success' ? true : rpc === 'consume_playbook_limit' ? !limited : rpc === 'admin_access_allowed' ? true : rpc === 'claim_support_notifications' ? [savedRow] : rpcResult, error: null }; },
    from(table) {
      const query = { table, filters: [] }; queries.push(query);
      const builder = {
        select(fields) { query.fields = fields; return this; },
        eq(field, value) { query.filters.push([field, value]); return this; },
        order() { return this; }, limit() { return this; },
        insert(value) { writes.push({ table, insert: value }); return Promise.resolve({ error: null }); },
        update(value) { writes.push({ table, update: value }); query.update = value; return this; },
        async maybeSingle() {
          return { data: table === 'haven_chat_visitors' && query.filters.some(([field, value]) => field === 'id' && value === VISITOR) && query.filters.some(([field, value]) => field === 'token_hash' && value === visitorHash) ? { id: VISITOR } : null, error: null };
        },
        then(resolve, reject) { return Promise.resolve({ data: table === 'support_requests' && !query.update ? [savedRow] : [], count: 1, error: markerFails && query.update?.notification_accepted_at ? { message: 'db unavailable' } : null }).then(resolve, reject); },
      };
      return builder;
    },
  };
  const env = { SUPABASE_URL: 'https://project.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'private-service', CLOUDFLARE_TURNSTILE_SECRET_KEY: 'captcha-secret', INTERNAL_POLL_SECRET: 'cron-secret', RESEND_API_KEY: 'resend-key' };
  vm.runInNewContext(codes[name], {
    module: { exports: {} }, exports: {}, require: () => ({ createClient: () => db }),
    Deno: { serve: fn => { handler = fn; }, env: { get: key => env[key] } },
    fetch: async (url, init) => {
      if (url.includes('turnstile')) return Response.json({ success: captcha, action:'support_request', hostname:'themarketinghaven.xyz' });
      mail.push({ body: JSON.parse(init.body), headers: init.headers });
      return Response.json(providerFails ? { message: 'Provider unavailable' } : { id: 'accepted-mail-id' }, { status: providerFails ? 503 : 200 });
    },
    crypto: webcrypto, TextEncoder, TextDecoder, Uint8Array, Request, Response, Headers, URL, URLSearchParams, AbortSignal, setTimeout, clearTimeout, console: { error() {} },
  });
  return {
    queries, writes, calls, mail,
    call: (body = {}, headers = {}) => handler(new Request(`https://project.supabase.co/functions/v1/${name}`, { method: 'POST', headers: { origin: 'https://themarketinghaven.xyz', 'content-type': 'application/json', 'cf-connecting-ip': '203.0.113.10', ...headers }, body: JSON.stringify(body) })),
  };
}
const ticket = { email: 'contact@example.com', name: 'Customer', message: 'My saved review cannot be reopened.', category: 'review_access', agreed: true, captchaToken: 'captcha-test-token' };

test('support intake cannot use a known visitor ID, email or claimed review to bypass private proof', async () => {
  const f = endpoint('support-request', { visitorHash: await digest(TOKEN) });
  const response = await f.call({ ...ticket, visitorId: VISITOR, visitorToken: 'd'.repeat(64), reviewId: 'private-review', source: 'zoho' });
  assert.equal(response.status, 201);
  assert.equal(f.writes[0].insert.visitor_id, null);
  assert.equal(f.writes[0].insert.review_id, undefined);
  assert.equal(f.writes[0].insert.source, undefined);
  assert.match(f.writes[0].insert.network_bucket, /^[a-f0-9]{64}$/);
  const body = await response.json(); assert.equal(body.ok, true); assert.ok(body.reference);
  assert.doesNotMatch(JSON.stringify(body), /network_bucket|token_hash|private-review/);
});
test('support intake attaches only the browser whose token digest matched and uses a separate support budget', async () => {
  const f = endpoint('support-request', { visitorHash: await digest(TOKEN) });
  assert.equal((await f.call({ ...ticket, visitorId: VISITOR, visitorToken: TOKEN })).status, 201);
  assert.equal(f.writes[0].insert.visitor_id, VISITOR);
  assert.match(f.calls[0].args.p_bucket, /^public:support-request:[a-f0-9]{64}$/);
  assert.equal(f.calls[0].args.p_max, 3); assert.equal(f.calls[0].args.p_seconds, 900);
  assert.equal(f.mail.length, 0);
});
test('support intake rejects missing consent, failed CAPTCHA and exhausted budget before saving', async () => {
  const invalid = endpoint('support-request'); assert.equal((await invalid.call({ ...ticket, agreed: false })).status, 400); assert.equal(invalid.writes.length, 0);
  const captcha = endpoint('support-request', { captcha: false }); assert.equal((await captcha.call(ticket)).status, 403); assert.equal(captcha.writes.length, 0);
  const limited = endpoint('support-request', { limited: true }); const result = await limited.call(ticket);
  assert.equal(result.status, 429); assert.equal(result.headers.get('retry-after'), '900'); assert.equal(limited.writes.length, 0);
});
test('admin support rejects anonymous, service-key and editable-role callers before private reads', async () => {
  const f = endpoint('admin-support');
  for (const authorization of ['', 'Bearer private-service', 'Bearer bad-token']) assert.equal((await f.call({ action: 'list' }, authorization ? { authorization } : {})).status, 401);
  assert.equal(f.queries.length, 0);
  const customer = endpoint('admin-support', { admin: false });
  assert.equal((await customer.call({ action: 'list' }, { authorization: 'Bearer good-admin' })).status, 403);
  assert.equal(customer.queries.length, 0);
});
test('admin support list excludes network secrets, uses the verified actor and reports revision conflicts', async () => {
  const f = endpoint('admin-support');
  assert.equal((await f.call({ action: 'list' }, { authorization: 'Bearer good-admin' })).status, 200);
  assert.doesNotMatch(f.queries[0].fields, /network_bucket|token_hash/);
  const update = { action: 'update', id: REQUEST_ID, revision: 2, notes: 'Investigated ownership.', reason: 'Verified the request and reviewed the error.', status: 'in_progress', resolution: 'reset_review_attempts', actor: 'attacker' };
  assert.equal((await f.call(update, { authorization: 'Bearer good-admin' })).status, 200);
  const rpc = f.calls.find(item => item.rpc === 'run_admin_mutation'); assert.equal(rpc.args.p_actor, ACTOR); assert.equal(rpc.args.p_payload.revision, 2);assert.match(rpc.args.p_network_hash,/^[a-f0-9]{64}$/);assert.equal(rpc.args.p_payload.actor,undefined);
  const stale = endpoint('admin-support', { rpcResult: { conflict: true } });
  assert.equal((await stale.call(update, { authorization: 'Bearer good-admin' })).status, 409);
  const reason = endpoint('admin-support');
  assert.equal((await reason.call({ ...update, reason: 'short' }, { authorization: 'Bearer good-admin' })).status, 400);
  assert.equal(reason.calls.some(item => item.rpc === 'run_admin_mutation'), false);
});
test('support worker rejects public callers and sends all three inboxes only a safely escaped summary', async () => {
  const f = endpoint('send-support-notification');
  assert.equal((await f.call()).status, 401); assert.equal(f.calls.length, 0);
  assert.equal((await f.call({}, { 'x-internal-poll-key': 'cron-secret' })).status, 200);
  assert.deepEqual(f.mail[0].body.to, ['francis.teamhaven@gmail.com', 'paschal.tmh@gmail.com', 'chimburuomac@gmail.com']);
  assert.equal(f.mail[0].headers['Idempotency-Key'], `support/${REQUEST_ID}`);
  assert.doesNotMatch(f.mail[0].body.html, /<script>/);
  assert.doesNotMatch(JSON.stringify(f.mail[0].body), /Sensitive full message|private-service|resend-key|captcha-secret/);
  assert.ok(f.writes[0].update.notification_accepted_at);
});
test('support worker provider failure stays pending, and a saved provider receipt prevents re-sending', async () => {
  const f = endpoint('send-support-notification', { providerFails: true });
  assert.equal((await f.call({}, { 'x-haven-internal-key': 'private-service' })).status, 503);
  assert.equal(f.writes[0].update.notification_error, 'resend_http_503'); assert.equal(f.writes[0].update.notification_accepted_at, undefined);
  const accepted = endpoint('send-support-notification', { row: { notification_email_id: 'already-accepted' } });
  assert.equal((await accepted.call({}, { 'x-internal-poll-key': 'cron-secret' })).status, 200); assert.equal(accepted.mail.length, 0); assert.equal(accepted.writes[0].update.notification_email_id, 'already-accepted');
  const marker = endpoint('send-support-notification', { markerFails: true });
  assert.equal((await marker.call({}, { 'x-internal-poll-key': 'cron-secret' })).status, 503);
  assert.equal(marker.writes.at(-1).update.notification_email_id, 'accepted-mail-id');
});

test('support conflict retains the draft after refresh and requires explicit saved-version loading before another write', async () => {
  const states = [], calls = []; let cursor = 0, saved = 0;
  let row = { id: REQUEST_ID, revision: 0, status: 'new', notes: 'Initial server note', category: 'review_access', source: 'web', email: 'customer@example.com', created_at: '2026-10-31T12:00:00Z' };
  const context = {
    module: { exports: {} }, require: name => name.includes('adminProduction')?production:({ useState(initial) { const index = cursor++; if (!(index in states)) states[index] = initial; return [states[index], value => { states[index] = typeof value === 'function' ? value(states[index]) : value; }]; } }),
    React: { createElement: (type, props, ...children) => ({ type, props: { ...props, children } }) },
  };
  const source = await readFile('src/components/admin/SupportRequestsPanel.jsx', 'utf8');
  vm.runInNewContext(transformSync(source + '\nexport {SupportRequest};', { loader: 'jsx', format: 'cjs' }).code, context);
  const render = () => {
    cursor = 0; const nodes = [];
    const walk = node => { if (Array.isArray(node)) return node.forEach(walk); if (!node || typeof node !== 'object') return; nodes.push(node); walk(node.props.children); };
    walk(context.module.exports.SupportRequest({ row, onRequest: async payload => { calls.push(payload); return calls.length === 1 ? { ok: false, error: 'Another admin changed this request.' } : { ok: true }; }, onSaved: () => { saved++; } }));
    return nodes;
  };
  render().find(node => node.type === 'textarea').props.onChange({ target: { value: 'My unsaved investigation notes' } });
  render().find(node => node.type === 'input').props.onChange({ target: { value: 'Investigated this specific support problem.' } });
  await render().find(node => node.type === 'form').props.onSubmit({ preventDefault() {} });
  assert.equal(render().find(node => node.type === 'textarea').props.value, 'My unsaved investigation notes');
  row = { ...row, revision: 1, notes: 'Newer server investigation', status: 'waiting_customer' };
  let nodes = render();
  assert.equal(nodes.find(node => node.type === 'textarea').props.value, 'My unsaved investigation notes');
  assert.equal(nodes.find(node => node.type === 'button' && node.props.type === 'submit').props.disabled, true);
  await nodes.find(node => node.type === 'form').props.onSubmit({ preventDefault() {} }); assert.equal(calls.length, 1);
  nodes.find(node => node.type === 'button' && node.props.children[0] === 'loading the saved status and notes').props.onClick();
  nodes = render(); assert.equal(nodes.find(node => node.type === 'textarea').props.value, 'Newer server investigation');
  await nodes.find(node => node.type === 'form').props.onSubmit({ preventDefault() {} });
  assert.equal(calls[1].revision, 1); assert.equal(saved, 1);
});

test('PostgreSQL support operations: full migration chain, private access, scoped resets, audit and notification leasing', async t => {
  const db = new PGlite();
  const scalar = async (sql, args = []) => Object.values((await db.query(sql, args)).rows[0])[0];
  const call = (name, args = []) => scalar(`select public.${name}(${args.map((_, i) => '$' + (i + 1)).join(',')})`, args);
  const update = (id, revision = 0, action = 'update', actor = ACTOR, reason = 'Confirmed the support issue with the customer.') => call('update_support_request', [id, revision, 'in_progress', 'Internal investigation notes.', actor, action, reason]);
  try {
    await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create schema storage;
      create function auth.role() returns text language sql as $$select current_setting('request.jwt.claim.role',true)$$;
      create function auth.jwt() returns jsonb language sql as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
      create function auth.uid() returns uuid language sql as $$select (auth.jwt()->>'sub')::uuid$$;
      create table auth.users(id uuid primary key,raw_app_meta_data jsonb not null default '{}',deleted_at timestamptz,banned_until timestamptz);
      create table auth.sessions(id uuid primary key,user_id uuid);
      create table auth.mfa_factors(id uuid primary key,user_id uuid references auth.users(id),status text);
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(id uuid primary key,bucket_id text,name text);alter table storage.objects enable row level security;
      create function storage.foldername(text) returns text[] language sql as $$select string_to_array($1,'/')$$;
      grant usage on schema public,auth,storage to anon,authenticated,service_role;
      select set_config('request.jwt.claim.role','service_role',false);`);
    await db.exec(await readFile('supabase/schema.sql', 'utf8'));
    for (const name of (await readdir('supabase/migrations')).filter(name => name.endsWith('.sql') && !/cron/.test(name)).sort()) {
      const sql = (await readFile('supabase/migrations/' + name, 'utf8')).replace(/^create extension[^;]*;/gim, '');
      try { await db.exec(sql); } catch (error) { throw Error(name + ': ' + error.message, { cause: error }); }
    }
    await db.query('insert into haven_chat_visitors(id,token_hash) values($1,$2),($3,$2)', [VISITOR, await digest(TOKEN), OTHER_VISITOR]);
    const bucket = 'a'.repeat(64), otherBucket = 'b'.repeat(64);
    await db.query('insert into support_requests(id,email,message,category,visitor_id,network_bucket) values($1,$2,$3,$4,$5,$6)', [REQUEST_ID, 'support@example.com', 'My review is locked after several attempts.', 'rate_limit', VISITOR, bucket]);
    await db.exec('set role service_role');
    await t.test('anonymous and authenticated users, including admin claims, cannot read support rows or execute resolution RPCs directly', async () => {
      for (const role of ['anon', 'authenticated']) {
        await db.exec(`set role ${role};select set_config('request.jwt.claim.role','${role}',false);select set_config('request.jwt.claims','{"app_metadata":{"role":"admin"}}',false);`);
        await assert.rejects(() => db.query('select * from support_requests'), error => error.code === '42501');
        await assert.rejects(() => db.query('select * from support_actions'), error => error.code === '42501');
        await assert.rejects(() => update(REQUEST_ID), error => error.code === '42501');
        await assert.rejects(() => db.query('select * from claim_support_notifications()'), error => error.code === '42501');
        await db.exec("reset role;select set_config('request.jwt.claim.role','service_role',false);set role service_role");
      }
    });
    await t.test('review reset clears only its two network budgets, preserves OTP/admin/support budgets and writes an actor/reason audit', async () => {
      const limits = [`public:email-lookup:${bucket}`, `public:review-submit:${bucket}`, `public:email-lookup:${otherBucket}`, `public:admin-api:${bucket}`, `public:support-request:${bucket}`, `public:purchase:${bucket}`];
      for (const limit of limits) await call('consume_playbook_limit', [limit, 5, 600]);
      const result = await update(REQUEST_ID, 0, 'reset_review_attempts'); assert.equal(result.ok, true); assert.equal(result.changed, 2);
      const remaining = (await db.query('select bucket from playbook_security_limits')).rows.map(row => row.bucket);
      for (const value of limits.slice(2)) assert.ok(remaining.includes(value));
      assert.equal(remaining.includes(limits[0]), false); assert.equal(remaining.includes(limits[1]), false);
      const audit = (await db.query('select actor_id,action,reason from support_actions where request_id=$1', [REQUEST_ID])).rows[0];
      assert.equal(audit.actor_id, ACTOR); assert.equal(audit.action, 'reset_review_attempts'); assert.match(audit.reason, /Confirmed/);
      assert.equal((await update(REQUEST_ID, 1, 'reset_review_attempts')).cooldown, true);
    });
    await t.test('optimistic revision rejects a stale overwrite; missing actor and short reason cannot write', async () => {
      assert.equal((await update(REQUEST_ID, 0)).conflict, true);
      await assert.rejects(() => update(REQUEST_ID, 1, 'update', null), /Invalid support update/);
      await assert.rejects(() => update(REQUEST_ID, 1, 'update', ACTOR, 'tiny'), /Invalid support update/);
      assert.equal(await scalar('select revision from support_requests where id=$1', [REQUEST_ID]), 1);
      assert.equal((await update(REQUEST_ID, 1)).ok, true);
      assert.equal(await scalar('select revision from support_requests where id=$1', [REQUEST_ID]), 2);
    });
    await t.test('device reset does not clear another visitor or a network lock and cannot operate on an unproven email-only request', async () => {
      await db.query("insert into verification_attempts(bucket,visitor_id,attempts,locked_at) values('visitor:one',$1,7,now()),('visitor:two',$2,7,now()),('network:one',null,7,now())", [VISITOR, OTHER_VISITOR]);
      assert.equal((await update(REQUEST_ID, 2, 'reset_verification')).changed, 1);
      const locks = (await db.query('select bucket,attempts,locked_at from verification_attempts order by bucket')).rows;
      assert.equal(locks.find(row => row.bucket === 'visitor:one').attempts, 0);
      assert.ok(locks.find(row => row.bucket === 'visitor:two').locked_at); assert.ok(locks.find(row => row.bucket === 'network:one').locked_at);
      const id = '44444444-4444-4444-8444-444444444444';
      await db.query("insert into support_requests(id,email,message,category,source) values($1,'same@example.com','I claim this email owns the account.','review_access','zoho')", [id]);
      assert.equal((await update(id, 0, 'reset_verification')).unavailable, true);
      assert.equal((await update(id, 0, 'reset_review_attempts')).unavailable, true);
      assert.equal(await scalar('select revision from support_requests where id=$1', [id]), 0);
    });
    await t.test('notification workers serialize claims, measure the 23-hour retry window from first attempt, and accept old new requests', async () => {
      await db.exec("update support_requests set created_at=now()-interval '2 months'");
      const claims = await Promise.all([db.query('select * from claim_support_notifications()'), db.query('select * from claim_support_notifications()')]);
      assert.equal(claims.reduce((count, result) => count + result.rows.length, 0), 2);
      assert.equal(claims.filter(result => result.rows.length).length, 1);
      assert.ok(claims.flatMap(result => result.rows).every(row => row.notification_first_attempt_at));
      await db.exec("update support_requests set notification_attempted_at=now()-interval '3 minutes',notification_first_attempt_at=now()-interval '24 hours'");
      assert.equal((await db.query('select * from claim_support_notifications()')).rows.length, 0);
      await db.query("update support_requests set notification_first_attempt_at=now()-interval '22 hours' where id=$1", [REQUEST_ID]);
      assert.equal((await db.query('select * from claim_support_notifications()')).rows.length, 1);
      await db.query("update support_requests set notification_first_attempt_at=now()-interval '24 hours',notification_attempted_at=now()-interval '3 minutes',notification_email_id='accepted-earlier' where id=$1", [REQUEST_ID]);
      const repair = (await db.query('select * from claim_support_notifications()')).rows;
      assert.equal(repair.length, 1); assert.equal(repair[0].notification_email_id, 'accepted-earlier');
      await db.query("update support_requests set notification_accepted_at=now(),notification_attempted_at=now()-interval '3 minutes' where id=$1", [REQUEST_ID]);
      assert.equal((await db.query('select * from claim_support_notifications()')).rows.length, 0);
    });
    await t.test('resolved retention removes only old resolved requests and their private audit history', async () => {
      await db.query("update support_requests set status='resolved',updated_at=now()-interval '91 days' where id=$1", [REQUEST_ID]);
      await db.exec('select purge_resolved_support()');
      assert.equal(await scalar('select count(*)::int from support_requests where id=$1', [REQUEST_ID]), 0);
      assert.equal(await scalar('select count(*)::int from support_actions where request_id=$1', [REQUEST_ID]), 0);
      assert.equal(await scalar('select count(*)::int from support_requests'), 1);
    });
  } finally { await db.close(); }
});

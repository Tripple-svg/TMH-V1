import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { buildSync } from 'esbuild';

const ID = '7ccf900a-0bfe-4d54-8f49-5c22cdca8326';
const CUSTOMER_EVENT = { id: ID, email: 'owner@example.com', status: 'red', customer_required: true, customer_sent_at: null };
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
  const calls = [], deliveries = [];
  const client = { functions: { async invoke(name, { body }) {
    deliveries.push({ name, body }); const row=rows.find((item)=>item.id===body.notificationId);
    row[name==='send-flag-alert'?'sent_at':'customer_sent_at']=new Date().toISOString();
    return {data:{ok:true},error:null};
  } }, from(table) {
    assert.equal(table, 'flag_alert_notifications');
    let values, id, fields;
    let pendingOnly = false, pendingColumn = 'sent_at', allPending=false, cap=Infinity;
    const run = async (single = false) => {
      calls.push({ action: values ? 'update' : 'select', id, fields, values: values && structuredClone(values), pendingOnly });
      if (!values && options.readError) return { data: null, error: { message: 'Read failed' } };
      if (values && (options.updateError || (values.sent_at && options.markerError))) return { data: null, error: { message: 'Write failed' } };
      if (options.throwQuery) throw new Error('Database unavailable');
      const selected = rows.filter((row) => (!id || row.id === id) && (!pendingOnly || row[pendingColumn] === null)
        && (!allPending || !row.sent_at || (row.customer_required && !row.customer_sent_at))).slice(0,cap);
      if (values) selected.forEach((row) => Object.assign(row, values));
      return { data: single ? selected[0] || null : selected, error: null };
    };
    return {
      select(value) { fields = value; return this; },
      eq(column, value) { assert.equal(column, 'id'); id = value; return this; },
      is(column, value) { assert.ok(['sent_at','customer_sent_at'].includes(column)); assert.equal(value, null); pendingOnly = true; pendingColumn = column; return this; },
      update(value) { values = value; return this; },
      or() { allPending=true;return this; }, order() { return this; }, limit(value) { cap=value;return this; },
      maybeSingle() { return run(true); },
      then(resolve, reject) { return run().then(resolve, reject); },
    };
  } };
  return { rows, calls, client, deliveries };
}

function load({ db = database(), env = {}, fetch: send = async () => json({ id: 'message-1' }), name = 'send-flag-alert' } = {}) {
  let handler;
  const mail = [];
  const code = buildSync({ entryPoints: [new URL(`../supabase/functions/${name}/index.ts`, import.meta.url).pathname.replace(/^\/(\w:)/, '$1')],
    bundle: true, write: false, platform: 'node', format: 'cjs', external: ['https://*'], logLevel: 'silent' }).outputFiles[0].text;
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
  assert.ok(mail[0].body.text.startsWith('User owner@example.com has been flagged as red. Reason Haven flagged them: Terms violation. Please review in the Admin Dashboard.'));
  assert.match(mail[0].body.text, /Name: Not recorded/);
  assert.match(mail[0].body.html, /Review in Admin/);
  assert.ok(db.rows[0].sent_at);
  assert.ok(Number.isFinite(Date.parse(db.rows[0].sent_at)));
  assert.equal(db.rows[0].team_email_id, 'message-1');
  assert.equal(db.rows[0].team_last_error, null);
  assert.ok(db.rows[0].team_attempted_at);
});

test('flag alert: yellow status and missing reason use snapshot values and fallback text', async () => {
  const db = database({ rows: [{ id: ID, email: 'yellow@example.com', status: 'yellow', reason: null, sent_at: null }] });
  const { handler, mail } = load({ db });
  assert.equal((await handler(request())).status, 200);
  assert.equal(mail[0].body.subject, 'URGENT: User Flagged - yellow');
  assert.ok(mail[0].body.text.startsWith('User yellow@example.com has been flagged as yellow. Reason Haven flagged them: Not provided. Please review in the Admin Dashboard.'));
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
    assert.ok(db.rows[0].team_last_error);
    assert.equal(mail.length, 1);
  }
});

test('flag alert: a failed delivery retry reuses the same event idempotency key', async () => {
  let attempts = 0;
  const { handler, db, mail } = load({ fetch: async () => json({ id: 'accepted-retry' }, ++attempts === 1 ? 503 : 200) });
  assert.equal((await handler(request())).status, 502);
  assert.equal(db.rows[0].sent_at, null);
  assert.equal((await handler(request())).status, 200);
  assert.ok(db.rows[0].sent_at);
  assert.equal(mail.length, 2);
  assert.equal(mail[0].headers['Idempotency-Key'], mail[1].headers['Idempotency-Key']);
  assert.equal(mail[0].headers['Idempotency-Key'], `flag-alert/${ID}`);
});

test('flag alert: delivery marker failures return an error and retries retain the provider key', async () => {
  const options = { markerError: true };
  const db = database(options);
  const { handler, mail } = load({ db });
  const result = await handler(request());
  assert.equal(result.status, 500);
  assert.match((await result.json()).error, /accepted.*status needs repair/i);
  assert.equal(db.rows[0].sent_at, null);
  options.markerError = false;
  assert.equal((await handler(request())).status, 200);
  assert.equal(mail.length, 1, 'Stored acceptance repairs the marker without sending again');
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
    assert.equal(result.status, Object.hasOwn(env, 'RESEND_API_KEY') ? 503 : 500);
    assert.equal(db.rows[0].sent_at, null);
    if (Object.hasOwn(env, 'RESEND_API_KEY')) assert.equal(db.rows[0].team_last_error, 'missing_resend_key');
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


test("flag customer: red sends a restriction email to saved recipient, ignoring caller recipient", async () => {
  const app=load({name:"send-flag-customer",db:database({rows:[CUSTOMER_EVENT]})});
  const response=await app.handler(request({notificationId:ID,email:"attacker@example.com"}));
  assert.equal(response.status,200);assert.deepEqual(app.mail[0].body.to,["owner@example.com"]);
  assert.match(app.mail[0].body.subject,/restricted/);assert.ok(app.db.rows[0].customer_sent_at);
});
test("flag customer: yellow warning and red restriction have separate durable event keys", async () => {
  for(const status of ["yellow","red"]){const app=load({name:"send-flag-customer",db:database({rows:[{...CUSTOMER_EVENT,status}]})});
    await app.handler(request());assert.match(app.mail[0].headers["Idempotency-Key"],/flag-customer/);
    assert.match(app.mail[0].body.subject,status==="red"?/restricted/:/Warning/);
  }
});
test("flag customer: anonymous callers, guests and already sent events cannot send mail", async () => {
  const denied=load({name:"send-flag-customer"});assert.equal((await denied.handler(request(undefined,{Authorization:"Bearer anon"}))).status,401);
  for(const event of [{...CUSTOMER_EVENT,customer_required:false,email:null},{...CUSTOMER_EVENT,customer_sent_at:"2026-10-23T00:00:00Z"}]){
    const app=load({name:"send-flag-customer",db:database({rows:[event]})});assert.equal((await app.handler(request())).status,200);assert.equal(app.mail.length,0);
  }
});
test("flag customer: provider failure and failed sent marker leave the durable event retryable", async () => {
  const failed=load({name:"send-flag-customer",db:database({rows:[CUSTOMER_EVENT]}),fetch:async()=>json({},503)});
  assert.equal((await failed.handler(request())).status,502);assert.equal(failed.db.rows[0].customer_sent_at,null);
  const marker=load({name:"send-flag-customer",db:database({rows:[CUSTOMER_EVENT],updateError:true})});
  assert.equal((await marker.handler(request())).status,500);assert.equal(marker.db.rows[0].customer_sent_at,null);
});

test("flag worker: service-only retry drains both channels independently from durable pending snapshots", async () => {
  const row={...CUSTOMER_EVENT,sent_at:null}; const app=load({db:database({rows:[row]})});
  const response=await app.handler(request({retryPending:true}));assert.equal(response.status,200);
  assert.deepEqual(app.db.deliveries.map(item=>item.name),["send-flag-alert","send-flag-customer"]);
  assert.ok(app.db.rows[0].sent_at);assert.ok(app.db.rows[0].customer_sent_at);
  const denied=load();assert.equal((await denied.handler(request({retryPending:true},{Authorization:"Bearer anon"}))).status,401);
});

test('flag alert: known names and each chat source/session come from saved context', async () => {
  for (const [source, label] of [['lead','Lead / Brand review'],['support','Support'],['service','Services']]) {
    const db = database({ rows: [{ id: ID, email: 'owner@example.com', full_name: 'Ada Owner', source,
      session_id: 'session-saved-123', status: 'yellow', reason: 'Abuse', sent_at: null }] });
    const app = load({ db });
    assert.equal((await app.handler(request({ notificationId: ID, full_name: 'Forged name', source: 'lead', session_id: 'forged-session' }))).status, 200);
    assert.ok(app.mail[0].body.text.includes(`Name: Ada Owner\nSource: ${label}\nSession ID: session-saved-123`));
    assert.ok(!app.mail[0].body.text.includes('Forged name'));
  }
});

test('flag alert: anonymous guests stay dashboard-only; malformed provider acceptance stays pending', async () => {
  const db = database({ rows: [{ id: ID, visitor_id: 'guest-123', source: 'support', session_id: 'guest-session', status: 'yellow', sent_at: null }] });
  const app = load({ db }); await app.handler(request());
  assert.equal(app.mail.length,0);assert.ok(db.rows[0].team_skipped_at);assert.equal(db.rows[0].sent_at,null);
  const pending = load({ fetch: async () => json({}) });
  assert.equal((await pending.handler(request())).status, 502); assert.equal(pending.db.rows[0].sent_at, null);
});

test('flag customer: a 2xx without a provider email ID cannot mark the warning as sent', async () => {
  const app = load({name:'send-flag-customer',db:database({rows:[{...CUSTOMER_EVENT,customer_sent_at:null}]}),fetch:async()=>json({})});
  assert.equal((await app.handler(request())).status,502); assert.equal(app.db.rows[0].customer_sent_at,null);
});

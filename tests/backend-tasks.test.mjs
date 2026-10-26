import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { webcrypto, createHmac } from 'node:crypto';
import { buildSync } from 'esbuild';

const secrets = { SUPABASE_URL: 'https://project.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'service-test', PAYSTACK_SECRET_KEY: 'paystack-test', CALENDLY_WEBHOOK_SECRET: 'signing-test', RESEND_API_KEY: 'resend-test', ADMIN_PASSWORD: 'admin-test' };
function loadHandler(name, { client = {}, fetch = () => { throw new Error('Unexpected network call'); }, env = {} } = {}) {
  let handler;
  const source = readFileSync(new URL(`../supabase/functions/${name}/index.ts`, import.meta.url), 'utf8');
  const code = buildSync({ stdin: { contents: source, loader: 'ts', resolveDir: new URL(`../supabase/functions/${name}/`, import.meta.url).pathname.replace(/^\/(\w:)/, '$1') }, bundle: true, write: false, format: 'cjs', platform: 'node', external: ['https://*'] }).outputFiles[0].text;
  vm.runInNewContext(code, {
    require: (specifier) => specifier.includes('server.ts') ? { serve: (fn) => { handler = fn; } } : { createClient: () => client },
    Deno: { serve(fn) { handler = fn; }, env: { get: (name) => ({ ...secrets, ...env })[name] } },
    fetch, Response, Request, Headers, AbortSignal, URL, TextEncoder, TextDecoder, Uint8Array, crypto: webcrypto,
    console: { error() {}, warn() {}, log() {} },
  });
  return handler;
}
const request = (body, headers = {}, method = 'POST') => new Request('https://project.supabase.co/functions/v1/test', {
  method, headers: { 'Content-Type': 'application/json', origin: 'http://localhost:5175', ...headers },
  ...(method === 'POST' ? { body: JSON.stringify(body) } : {}),
});
const response = (body, status = 200) => new Response(JSON.stringify(body), { status });

test('Task 6: email lookup trims input, matches case-insensitively and escapes SQL wildcards', async () => {
  let lookedUp = '';
  const handler = loadHandler('check-email-exists', { client: { from: (table) => {
    assert.equal(table, 'brand_reviews');
    return { select: () => ({ ilike: (column, pattern) => {
      assert.equal(column, 'email'); lookedUp = pattern;
      return { limit: async () => ({ data: pattern.toLowerCase() === 'owner@example.com' ? [{ id: 'review' }] : [] }) };
    } }) };
  } } });
  assert.equal((await (await handler(request({ email: ' Owner@Example.com ' }))).json()).exists, true);
  assert.equal(lookedUp, 'Owner@Example.com');
  assert.equal((await (await handler(request({ email: 'new@example.com' }))).json()).exists, false);
  await handler(request({ email: 'a_%@example.com' }));
  assert.equal(lookedUp, 'a\\_\\%@example.com');
  lookedUp = '';
  await handler(request({ email: 'invalid' }));
  assert.equal(lookedUp, '');
});

const GRANT = 'a'.repeat(64);
function grantDatabase({ publicBucket = false, validGrant = true } = {}) {
  let signed = 0;
  return { get signed() { return signed; }, client: {
    rpc: async () => ({ data: true }),
    from(table) { return { select() { return this; }, eq() { return this; },
      async maybeSingle() { return { data: validGrant ? { reference:'UNSEEN_123',email:'buyer@example.com',expires_at:'2099-01-01T00:00:00Z',revoked_at:null } : null }; },
      async single() { assert.equal(table,'playbook_checkout_policy'); return { data:{legacy_cutover_at:'2026-10-26T00:00:00Z'} }; } }; },
    storage: { getBucket: async () => ({ data:{public:publicBucket} }), from: () => ({
      async createSignedUrl(path,ttl) { signed++; assert.equal(ttl,600); return { data:{signedUrl:'https://private.example/signed'} }; }
    }) },
  }};
}
const paid = (patch={}) => ({status:true,data:{reference:'UNSEEN_123',status:'success',amount:963900,currency:'NGN',customer:{email:'buyer@example.com'},paid_at:'2026-10-25T12:00:00Z',...patch}});
test('download security: email/reference alone never receive a URL or reader capability', async () => {
  const db=grantDatabase();
  const handler=loadHandler('verify-paystack',{client:db.client,fetch:async()=>{throw new Error('Must reject before Paystack');}});
  const response=await handler(request({reference:'UNSEEN_123',email:'buyer@example.com'}));
  assert.equal(response.status,403);
  const body=await response.json();assert.equal(body.code,'recovery_required');assert.equal(body.url,undefined);assert.equal(body.playbookAccessToken,undefined);assert.equal(db.signed,0);
});
test('download security: verified device grants get short-lived URLs; historical test purchases remain recoverable', async () => {
  for(const amount of [963900,10000]) {
    const db=grantDatabase();
    const handler=loadHandler('verify-paystack',{client:db.client,fetch:async()=>response(paid({amount}))});
    const result=await handler(request({reference:'UNSEEN_123',email:'buyer@example.com',downloadToken:GRANT}));
    const body=await result.json();assert.equal(body.ok,true);assert.equal(body.expiresIn,600);assert.ok(body.playbookAccessToken);assert.equal(db.signed,1);
  }
});
test('download security: invalid references, origins, methods and missing service configuration fail closed', async () => {
  const handler=loadHandler('verify-paystack');
  assert.equal((await handler(request({reference:'OTHER_123'}))).status,400);
  assert.equal((await handler(request({}, {origin:'https://evil.example'}))).status,403);
  assert.equal((await handler(request({}, {}, 'GET'))).status,405);
  assert.equal((await handler(request({}, {}, 'OPTIONS'))).status,204);
  const missing=loadHandler('verify-paystack',{env:{SUPABASE_SERVICE_ROLE_KEY:undefined}});
  assert.equal((await missing(request({reference:'UNSEEN_123',email:'buyer@example.com'}))).status,503);
});
test('download security: invalid payments, post-cutover underpayments and public buckets never receive a URL', async () => {
  for(const patch of [{status:'failed'},{reference:'UNSEEN_wrong'},{currency:'USD'},{customer:{email:'other@example.com'}},{amount:1},{amount:10000,paid_at:'2099-01-01T00:00:00Z'},{}]) {
    const db=grantDatabase({publicBucket:Object.keys(patch).length===0});
    const handler=loadHandler('verify-paystack',{client:db.client,fetch:async()=>response(paid(patch))});
    const result=await (await handler(request({reference:'UNSEEN_123',email:'buyer@example.com',downloadToken:GRANT}))).json();
    assert.equal(result.ok,false);assert.equal(result.url,undefined);assert.equal(db.signed,0);
  }
});

function database(seed) {
  const rows = structuredClone(seed);
  const calls = [];
  const client = { rpc: async (name, args = {}) => { calls.push({ action: 'rpc', name, values: args.p_booking }); return { error: null }; }, from(table) {
    let filters = [], sort = null, cap = Infinity, offset = 0, action = 'select', values;
    const run = async (single = false) => {
      calls.push({ table, action, values });
      let matches = (rows[table] || []).filter((row) => filters.every((filter) => filter(row)));
      if (sort) matches.sort((a, b) => String(b[sort]).localeCompare(String(a[sort])));
      matches = matches.slice(offset, offset + cap);
      if (action === 'insert') {
        rows[table] ||= []; rows[table].push({ id: `new-${rows[table].length}`, confirmation_sent: false, ...values });
      }
      if (action === 'update') matches.forEach((row) => Object.assign(row, values));
      return { data: single ? matches[0] || null : matches, error: null };
    };
    const query = {
      select() { return this; },
      or() { filters.push(row=>row.service_id==null||row.service_id!=='team-inquiry'); return this; },
      ilike(column, pattern) { filters.push((row) => String(row[column]).toLowerCase() === pattern.replace(/\\([\\%_])/g, '$1').toLowerCase()); return this; },
      eq(column, value) { filters.push((row) => row[column] === value); return this; },
      is(column, value) { filters.push((row) => value === null ? row[column] == null : row[column] === value); return this; },
      in(column, values) { filters.push((row) => values.includes(row[column])); return this; },
      order(column) { sort = column; return this; },
      range(start, end) { offset = start; cap = end - start + 1; return this; },
      limit(value) { cap = value; return this; },
      insert(value) { action = 'insert'; values = value; return this; },
      update(value) { action = 'update'; values = value; return this; },
      maybeSingle() { return run(true); },
      then(resolve, reject) { return run().then(resolve, reject); },
    };
    return query;
  } };
  return { client, rows, calls };
}

const booking = (email = 'owner@example.com') => ({ event: 'invitee.created', payload: { email, name: 'Owner', uri: 'https://api.calendly.com/scheduled_events/event/invitees/invitee', event: { uri: 'https://api.calendly.com/scheduled_events/event', start_time: '2026-10-20T17:00:00Z' } } });
function signedRequest(body, { timestamp = Math.floor(Date.now() / 1000), signatureBody = body, secret = 'signing-test' } = {}) {
  const signature = createHmac('sha256', secret).update(`${timestamp}.${JSON.stringify(signatureBody)}`).digest('hex');
  return request(body, { 'Calendly-Webhook-Signature': `t=${timestamp},v1=${signature}` });
}

test('purchase recovery: another email cannot use a valid device token', async () => {
  const db=grantDatabase();
  const handler=loadHandler('verify-paystack',{client:db.client});
  const result=await (await handler(request({reference:'UNSEEN_123',email:'someone@example.com',downloadToken:GRANT}))).json();
  assert.equal(result.ok,false);assert.equal(db.signed,0);
});

test('Calendly cancellation is signature checked, saved and never sends a customer confirmation', async () => {
  const db = database({ brand_reviews: [], booking_intents: [] });
  const handler = loadHandler('calendly-webhook', { client: db.client });
  const body = booking(); body.event = 'invitee.canceled';
  assert.equal((await handler(signedRequest(body))).status, 200);
  const record = db.calls.find((call) => call.name === 'record_strategy_call_booking');
  assert.equal(record.values.status, 'canceled');
  assert.equal(record.values.source, 'calendly');
  assert.equal(record.values.invitee_uri, body.payload.uri);
});

test('Task 7: capture validates service/email and logs abandoned intent without sending email', async () => {
  const db = database({ booking_intents: [] });
  const handler = loadHandler('capture-booking-lead', { client: db.client });
  for (const serviceId of ['web', 'growth', 'content', null]) {
    const result = await handler(request({ email: ' Buyer@Example.com ', serviceId }, { 'x-forwarded-for': '192.0.2.1, 10.0.0.1' }));
    assert.equal(result.status, 200);
  }
  assert.equal(db.rows.booking_intents.length, 4);
  assert.equal(db.rows.booking_intents[0].service_id, 'web');
  assert.equal(db.rows.booking_intents[0].email, 'buyer@example.com');
  assert.equal(db.rows.booking_intents[0].ip_address, '192.0.2.1');
  assert.equal(db.rows.booking_intents[0].confirmation_sent, false);
  assert.equal((await handler(request({ email: 'bad', serviceId: 'web' }))).status, 400);
  assert.equal((await handler(request({ email: 'buyer@example.com', serviceId: 'other' }))).status, 400);
  assert.equal(db.rows.booking_intents.length, 4);
});

test('Task 7: webhook rejects forged, tampered, expired, future and missing signatures before DB access', async () => {
  const handler = loadHandler('calendly-webhook');
  assert.equal((await handler(request(booking()))).status, 401);
  assert.equal((await handler(signedRequest(booking(), { secret: 'wrong' }))).status, 401);
  assert.equal((await handler(signedRequest(booking(), { signatureBody: booking('other@example.com') }))).status, 401);
  assert.equal((await handler(signedRequest(booking(), { timestamp: Math.floor(Date.now() / 1000) - 181 }))).status, 401);
  assert.equal((await handler(signedRequest(booking(), { timestamp: Math.floor(Date.now() / 1000) + 181 }))).status, 401);
  assert.equal((await handler(signedRequest({ event: 'routing_form_submission.created' }))).status, 200);
});

test('Task 7: review path creates briefing with only last five audit messages and sends once across webhook retries', async () => {
  const db = database({
    brand_reviews: [{ id: 'r1', email: 'Owner@Example.com', haven_score: 72, biggest_leak: 'Weak CTA', assessment_summary: 'Clear brand', platform_type: 'website', main_goal: 'Growth', booking_confirmation_sent: false }],
    haven_sessions: [
      { review_id: 'r1', scope: 'audit', updated_at: '2026-10-15', messages: Array.from({ length: 7 }, (_, i) => ({ role: i % 2 ? 'user' : 'agent', content: `audit-${i}`, image: 'base64-private' })) },
      { review_id: 'r1', scope: 'support', updated_at: '2026-10-16', messages: [{ content: 'support-private' }] },
    ], booking_intents: [],
  });
  const emails = [];
  const sender = loadHandler('send-tmh-booking-confirmation', { client: db.client, fetch: async (_, options) => { emails.push(JSON.parse(options.body)); return response({ id: 'email-1' }); } });
  db.client.functions = { invoke: async (name, { body }) => {
    assert.equal(name, 'send-tmh-booking-confirmation');
    const result = await sender(request(body, { Authorization: 'Bearer service-test' }));
    return { data: await result.json(), error: result.ok ? null : 'error' };
  } };
  const webhook = loadHandler('calendly-webhook', { client: db.client });
  for (let i = 0; i < 2; i++) assert.equal((await webhook(signedRequest(booking('OWNER@example.com')))).status, 200);
  const review = db.rows.brand_reviews[0];
  assert.equal(review.call_booked_at, '2026-10-20T17:00:00Z');
  for (const expected of ['72', 'Weak CTA', 'Clear brand', 'website', 'Growth', 'audit-2', 'audit-6']) assert.ok(review.pre_call_briefing.includes(expected));
  for (const excluded of ['audit-0', 'audit-1', 'support-private', 'base64-private']) assert.ok(!review.pre_call_briefing.includes(excluded));
  assert.equal(emails.length, 1);
  assert.match(emails[0].text, /discuss our services\./);
  assert.equal(review.booking_confirmation_sent, true);
});

test('Task 7: services path selects the newest intent and sends correct service copy once', async () => {
  for (const [serviceId, friendly] of [['web', 'Brand & Web Engineering'], ['growth', 'Strategic Growth & Consulting'], ['content', 'Content & Social Architecture']]) {
    const db = database({ brand_reviews: [], booking_intents: [
      { id: 'old', email: 'owner@example.com', service_id: null, created_at: '2026-10-01', confirmation_sent: false },
      { id: 'new', email: 'owner@example.com', service_id: serviceId, created_at: '2026-10-15', confirmation_sent: false },
    ] });
    const emails = [];
    const sender = loadHandler('send-tmh-booking-confirmation', { client: db.client, fetch: async (_, options) => { emails.push(JSON.parse(options.body)); return response({ id: 'email' }); } });
    db.client.functions = { invoke: async (_, { body }) => {
      assert.equal(body.bookingIntentId, 'new');
      const result = await sender(request(body, { Authorization: 'Bearer service-test' }));
      return { data: await result.json(), error: null };
    } };
    const webhook = loadHandler('calendly-webhook', { client: db.client });
    // Current Calendly payload: event is a URI, scheduled_event holds the time.
    const body = booking(); body.payload.scheduled_event = body.payload.event; body.payload.event = 'https://api.calendly.com/scheduled_events/event';
    assert.equal((await webhook(signedRequest(body))).status, 200);
    assert.equal((await webhook(signedRequest(body))).status, 200);
    assert.equal(emails.length, 1); assert.ok(emails[0].text.includes(friendly));
    assert.equal(db.rows.booking_intents[0].confirmation_sent, false);
    assert.equal(db.rows.booking_intents[1].confirmation_sent, true);
  }
});

test('Task 7: unmatched webhook records a direct booking without sending a confirmation', async () => {
  const db = database({ brand_reviews: [], booking_intents: [] });
  const handler = loadHandler('calendly-webhook', { client: db.client });
  assert.deepEqual(await (await handler(signedRequest(booking()))).json(), { ok: true, matched: false });
  assert.equal(db.calls.filter((call) => call.name === 'record_strategy_call_booking').length, 1);
});

test('Task 7: sender rejects anon callers, retries failed delivery, and deduplicates concurrent deliveries', async () => {
  const db = database({ booking_intents: [{ id: 'intent', email: 'owner@example.com', service_id: 'web', confirmation_sent: false }] });
  let fail = true;
  const providerKeys = new Set();
  const sender = loadHandler('send-tmh-booking-confirmation', { client: db.client, fetch: async (_, options) => {
    if (fail) return response({ error: 'unavailable' }, 503);
    providerKeys.add(options.headers['Idempotency-Key']);
    return response({ id: 'email' });
  } });
  const body = { email: 'owner@example.com', name: null, serviceId: 'web' };
  assert.equal((await sender(request(body))).status, 401);
  assert.equal((await sender(request(body, { Authorization: 'Bearer service-test' }))).status, 502);
  assert.equal(db.rows.booking_intents[0].confirmation_sent, false);
  fail = false;
  const results = await Promise.all([sender(request(body, { Authorization: 'Bearer service-test' })), sender(request(body, { Authorization: 'Bearer service-test' }))]);
  assert.ok(results.every((result) => result.status === 200));
  assert.equal(providerKeys.size, 1);
  assert.equal(db.rows.booking_intents[0].confirmation_sent, true);
});

test('Task 7: admin indexes independent support sessions and loads their saved transcript on demand', async () => {
  const db = database({
    brand_reviews: [{ id: 'r1', email: 'owner@example.com', created_at: '2026-10-15' }],
    haven_sessions: [
      { id: 'audit', review_id: 'r1', scope: 'audit', messages: [], current_step: 'GREETING' },
      { id: 'support', review_id: null, scope: 'support', current_step: 'SUPPORT', total_exchanges: 65, updated_at: '2026-10-15', messages: Array.from({ length: 65 }, (_, i) => ({ id: String(i), role: 'user', content: `message-${i}`, image: 'private-base64', imageUrl: 'private-url' })) },
    ],
  });
  const handler = loadHandler('admin-fetch-leads', { client: db.client });
  assert.equal((await handler(request({ password: 'wrong' }))).status, 401);
  const body = await (await handler(request({ password: 'admin-test' }))).json();
  assert.equal(body.count, 1); assert.equal(body.leads[0].session.current_step, 'GREETING');
  assert.equal(body.support_sessions.length, 1); assert.equal(body.support_sessions[0].id, 'support');
  assert.equal(body.support_sessions[0].messages, undefined);
  const transcript = await (await handler(request({ password: 'admin-test', action: 'transcript', sessionId: 'support' }))).json();
  assert.equal(transcript.session.messages.length, 65);
  assert.equal(transcript.session.messages[0].content, 'message-0');
  assert.ok(!JSON.stringify(body).includes('private-base64')); assert.ok(!JSON.stringify(body).includes('private-url'));
  assert.ok(!JSON.stringify(transcript).includes('private-base64')); assert.ok(!JSON.stringify(transcript).includes('private-url'));
});

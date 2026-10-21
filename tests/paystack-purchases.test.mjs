import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { transformSync } from 'esbuild';

const ENV = {
  PAYSTACK_SECRET_KEY: 'paystack-test-secret', SUPABASE_URL: 'https://project.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-test-key', RESEND_API_KEY: 'resend-test-key',
};
const AUTH = { Authorization: `Bearer ${ENV.SUPABASE_SERVICE_ROLE_KEY}` };
const json = (body, status = 200) => new Response(JSON.stringify(body), { status });
const payment = (patch = {}) => ({
  event: 'charge.success', data: {
    status: 'success', reference: 'UNSEEN_purchase-123', amount: 10000, currency: 'NGN',
    customer: { email: ' Buyer@Example.com ', first_name: 'Adéọlá' }, ...patch,
  },
});
const senderRequest = (body = { email: 'buyer@example.com', reference: 'UNSEEN_purchase-123' }, headers = AUTH) => new Request('https://project.supabase.co/functions/v1/send-purchase-thankyou', {
  method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body),
});
function webhookRequest(body = payment(), { signature, secret = ENV.PAYSTACK_SECRET_KEY, signedBody } = {}) {
  const raw = typeof body === 'string' || body instanceof Uint8Array ? body : JSON.stringify(body);
  const digest = createHmac('sha512', secret).update(signedBody ?? raw).digest('hex');
  return new Request('https://project.supabase.co/functions/v1/paystack-webhook', {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(signature === null ? {} : { 'x-paystack-signature': signature ?? digest }) }, body: raw,
  });
}

function database(seed = [], faults = {}) {
  const rows = structuredClone(seed), calls = [];
  const client = {
    from(table) {
      assert.equal(table, 'playbook_purchases');
      let action = 'select', values;
      const filters = [];
      async function run(single = false) {
        calls.push({ action, values });
        if (faults[action] > 0) {
          faults[action]--;
          return { data: null, error: { code: 'XX000' } };
        }
        let selected = rows.filter((row) => filters.every((filter) => filter(row)));
        if (action === 'insert') {
          if (rows.some((row) => row.reference === values.reference)) return { data: null, error: { code: '23505' } };
          rows.push({ id: `purchase-${rows.length + 1}`, created_at: '2026-10-21T12:00:00Z', thankyou_sent: false, ...values });
        }
        if (action === 'update') selected.forEach((row) => Object.assign(row, values));
        return { data: structuredClone(single ? selected[0] ?? null : selected), error: null };
      }
      return {
        select() { return this; },
        eq(column, value) { filters.push((row) => row[column] === value); return this; },
        insert(value) { action = 'insert'; values = value; return this; },
        update(value) { action = 'update'; values = value; return this; },
        maybeSingle() { return run(true); },
        then(resolve, reject) { return run().then(resolve, reject); },
      };
    },
  };
  return { client, rows, calls, faults };
}

function load(name, { db = database(), env = {}, fetch = () => { throw new Error('Unexpected network call'); } } = {}) {
  let handler;
  const source = readFileSync(new URL(`../supabase/functions/${name}/index.ts`, import.meta.url), 'utf8');
  const code = transformSync(source, { loader: 'ts', format: 'cjs' }).code;
  vm.runInNewContext(code, {
    require: (specifier) => specifier.includes('server.ts') ? { serve: (fn) => { handler = fn; } } : { createClient: (url, key) => {
      assert.equal(url, ENV.SUPABASE_URL); assert.equal(key, ENV.SUPABASE_SERVICE_ROLE_KEY); return db.client;
    } },
    Deno: { env: { get: (key) => ({ ...ENV, ...env })[key] } },
    fetch, Request, Response, Headers, URL, AbortSignal, TextEncoder, TextDecoder, Uint8Array, crypto: webcrypto,
    console: { error() {} },
  });
  return handler;
}

function pipeline({ seed, faults, fetch } = {}) {
  const db = database(seed, faults), emails = [], invocations = [];
  const sender = load('send-purchase-thankyou', { db, fetch: fetch ?? (async (url, options) => {
    assert.equal(url, 'https://api.resend.com/emails');
    emails.push({ payload: JSON.parse(options.body), headers: options.headers });
    return json({ id: 'email-1' });
  }) });
  db.client.functions = { invoke: async (name, { body }) => {
    assert.equal(name, 'send-purchase-thankyou'); invocations.push(body);
    const result = await sender(senderRequest(body));
    return { data: await result.json(), error: result.ok ? null : { message: 'Sender failed' } };
  } };
  return { db, sender, webhook: load('paystack-webhook', { db }), emails, invocations };
}

test('rejects missing, malformed, forged and byte-tampered signatures before JSON or database work', async () => {
  const db = database();
  const handler = load('paystack-webhook', { db });
  for (const request of [
    webhookRequest('not JSON', { signature: null }),
    webhookRequest(payment(), { signature: 'garbage' }),
    webhookRequest(payment(), { signature: '0'.repeat(128) }),
    webhookRequest(payment(), { secret: 'wrong-secret' }),
    webhookRequest(`${JSON.stringify(payment())} `, { signedBody: JSON.stringify(payment()) }),
    webhookRequest(payment(), { signedBody: JSON.stringify(payment({ customer: { email: 'attacker@example.com' } })) }),
  ]) assert.equal((await handler(request)).status, 401);
  assert.equal(db.calls.length, 0);
});

test('accepts raw UTF-8 and whitespace signatures, records each supported NGN price in kobo, and sends the requested email', async () => {
  for (const amount of [10000, 963900]) {
    const { webhook, db, emails } = pipeline();
    const raw = `\n${JSON.stringify(payment({ amount }), null, 2)}\n`;
    const result = await webhook(webhookRequest(raw));
    assert.equal(result.status, 200); assert.deepEqual(await result.json(), { ok: true });
    assert.equal(db.rows.length, 1); assert.equal(db.rows[0].email, 'buyer@example.com');
    assert.equal(db.rows[0].amount, amount); assert.equal(db.rows[0].thankyou_sent, true);
    assert.equal(emails.length, 1);
    assert.equal(emails[0].payload.subject, 'Your copy of The Unseen Playbook');
    assert.deepEqual(emails[0].payload.to, ['buyer@example.com']);
    assert.equal(emails[0].payload.reply_to, 'info@themarketinghaven.xyz');
    for (const text of ['https://themarketinghaven.xyz/#shop', 'Thank you for purchasing The Unseen Playbook.', 'reply to this email', 'Team Haven.']) {
      assert.ok(emails[0].payload.text.includes(text));
    }
    assert.equal(emails[0].headers.Authorization, `Bearer ${ENV.RESEND_API_KEY}`);
    assert.equal(emails[0].headers['Idempotency-Key'], 'playbook-purchase-thankyou/UNSEEN_purchase-123');
  }
});

test('ignores unrelated signed events, references, statuses, currencies, and amounts without writes or sends', async () => {
  const { webhook, db, invocations } = pipeline();
  const unrelated = [
    { event: 'transfer.success' }, null, [], {}, payment({ status: 'failed' }),
    payment({ reference: 'OTHER_purchase-123' }), payment({ reference: 'UNSEEN_' }), payment({ reference: 'UNSEEN_../escape' }),
    payment({ currency: 'USD' }), payment({ amount: 1 }), payment({ amount: '10000' }), payment({ amount: 10000.5 }),
  ];
  for (const body of unrelated) {
    const result = await webhook(webhookRequest(body));
    assert.equal(result.status, 200); assert.deepEqual(await result.json(), { ok: true, ignored: true });
  }
  assert.equal(db.calls.length, 0); assert.equal(invocations.length, 0);
});

test('rejects authenticated malformed JSON, invalid UTF-8 and recognized purchases lacking a valid customer email', async () => {
  const { webhook, db } = pipeline();
  for (const body of ['not JSON', new Uint8Array([0xff, 0xfe]), payment({ customer: null }), payment({ customer: {} }), payment({ customer: { email: 'invalid' } })]) {
    const result = await webhook(webhookRequest(body)); assert.equal(result.status, 400);
  }
  assert.equal(db.calls.length, 0);
});

test('requires POST and the webhook signing secret', async () => {
  const handler = load('paystack-webhook');
  assert.equal((await handler(new Request('https://example.com'))).status, 405);
  assert.equal((await load('paystack-webhook', { env: { PAYSTACK_SECRET_KEY: undefined } })(webhookRequest())).status, 500);
});

test('duplicate webhooks preserve the original buyer and amount and do not repeat delivered mail', async () => {
  const { webhook, db, emails, invocations } = pipeline();
  assert.equal((await webhook(webhookRequest())).status, 200);
  assert.equal((await webhook(webhookRequest(payment({ amount: 963900, customer: { email: 'other@example.com' } })))).status, 200);
  assert.equal(db.rows.length, 1); assert.equal(db.rows[0].email, 'buyer@example.com'); assert.equal(db.rows[0].amount, 10000);
  assert.equal(emails.length, 1); assert.equal(invocations.length, 1);
});

test('saved unsent duplicates retry delivery to the original buyer, ignoring replay payload changes', async () => {
  const seed = [{ id: 'saved', email: 'original@example.com', reference: 'UNSEEN_purchase-123', amount: 10000, thankyou_sent: false }];
  const { webhook, db, emails, invocations } = pipeline({ seed });
  assert.equal((await webhook(webhookRequest(payment({ amount: 963900, customer: { email: 'other@example.com' } })))).status, 200);
  assert.equal(db.rows.length, 1); assert.equal(db.rows[0].amount, 10000); assert.equal(db.rows[0].email, 'original@example.com');
  assert.equal(db.rows[0].thankyou_sent, true);
  assert.equal(invocations[0].email, 'original@example.com'); assert.deepEqual(emails[0].payload.to, ['original@example.com']);
});

test('Resend failures keep the purchase and unsent flag so the next Paystack delivery retries', async () => {
  let fail = true;
  const keys = [];
  const { webhook, db } = pipeline({ fetch: async (_, options) => {
    keys.push(options.headers['Idempotency-Key']);
    return fail ? json({ message: 'Unavailable' }, 503) : json({ id: 'email-1' });
  } });
  const first = await webhook(webhookRequest());
  assert.equal(first.status, 502); assert.equal((await first.json()).ok, false);
  assert.equal(db.rows.length, 1); assert.equal(db.rows[0].thankyou_sent, false);
  fail = false;
  assert.equal((await webhook(webhookRequest())).status, 200);
  assert.equal(db.rows.length, 1); assert.equal(db.rows[0].thankyou_sent, true);
  assert.equal(new Set(keys).size, 1);
  assert.equal((await webhook(webhookRequest())).status, 200);
  assert.equal(keys.length, 2);
});

test('concurrent duplicate webhooks retain one purchase and use one provider idempotency key', async () => {
  const providerKeys = new Set();
  let providerCalls = 0, release;
  const gate = new Promise((resolve) => { release = resolve; });
  const { webhook, db } = pipeline({ fetch: async (_, options) => {
    providerKeys.add(options.headers['Idempotency-Key']); providerCalls++;
    if (providerCalls === 2) release();
    await gate;
    return json({ id: 'same-provider-email' });
  } });
  const results = await Promise.all([webhook(webhookRequest()), webhook(webhookRequest())]);
  assert.ok(results.every((result) => result.status === 200));
  assert.equal(db.rows.length, 1); assert.equal(db.rows[0].thankyou_sent, true);
  assert.equal(providerCalls, 2); assert.equal(providerKeys.size, 1);
});

test('database insert or lookup failures return non-200 without sending email', async () => {
  for (const action of ['insert', 'select']) {
    const { webhook, emails } = pipeline({ faults: { [action]: 1 } });
    assert.equal((await webhook(webhookRequest())).status, 500);
    assert.equal(emails.length, 0);
  }
});

test('a failed durable flag update remains retryable with the same provider key', async () => {
  const keys = [];
  const { webhook, db } = pipeline({ faults: { update: 1 }, fetch: async (_, options) => {
    keys.push(options.headers['Idempotency-Key']); return json({ id: 'same-email' });
  } });
  assert.equal((await webhook(webhookRequest())).status, 502);
  assert.equal(db.rows[0].thankyou_sent, false);
  assert.equal((await webhook(webhookRequest())).status, 200);
  assert.equal(db.rows[0].thankyou_sent, true); assert.equal(new Set(keys).size, 1);
});

test('sender accepts only the service-role key and cannot send to an address unrelated to the saved purchase', async () => {
  const { sender, db, emails } = pipeline({ seed: [{ id: 'saved', email: 'buyer@example.com', reference: 'UNSEEN_purchase-123', thankyou_sent: false }] });
  for (const headers of [{}, { Authorization: 'Bearer anon-key' }, { Authorization: 'Bearer user-jwt' }, { Authorization: `bearer ${ENV.SUPABASE_SERVICE_ROLE_KEY}` }]) {
    assert.equal((await sender(senderRequest(undefined, headers))).status, 401);
  }
  assert.equal(db.calls.length, 0);
  assert.equal((await sender(senderRequest({ email: 'other@example.com', reference: 'UNSEEN_purchase-123' }))).status, 404);
  assert.equal((await sender(senderRequest({ email: 'buyer@example.com', reference: 'UNSEEN_missing' }))).status, 404);
  assert.equal(emails.length, 0);
  assert.equal((await sender(senderRequest())).status, 200); assert.equal(emails.length, 1);
});

test('sender validates its payload and leaves failed network deliveries unsent', async () => {
  const { sender, db } = pipeline({ seed: [{ id: 'saved', email: 'buyer@example.com', reference: 'UNSEEN_purchase-123', thankyou_sent: false }], fetch: async () => { throw new Error('Network timeout'); } });
  for (const body of [{}, { email: 'bad', reference: 'UNSEEN_purchase-123' }, { email: 'buyer@example.com', reference: 'OTHER_123' }]) {
    assert.equal((await sender(senderRequest(body))).status, 400);
  }
  assert.equal((await sender(senderRequest())).status, 500);
  assert.equal(db.rows[0].thankyou_sent, false);
});

test('durable sent flags skip provider calls across new function instances', async () => {
  const db = database([{ id: 'saved', email: 'buyer@example.com', reference: 'UNSEEN_purchase-123', thankyou_sent: true }]);
  for (let instance = 0; instance < 2; instance++) {
    const sender = load('send-purchase-thankyou', { db });
    const result = await sender(senderRequest());
    assert.equal(result.status, 200); assert.deepEqual(await result.json(), { ok: true, skipped: 'already sent' });
  }
  assert.ok(db.calls.every((call) => call.action === 'select'));
});

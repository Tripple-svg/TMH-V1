import { withSecurityRpc } from './helpers/security-fixture.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, webcrypto } from 'node:crypto';
import vm from 'node:vm';
import { buildSync } from 'esbuild';

const ENV = {
  PAYSTACK_SECRET_KEY: 'paystack-test-secret', SUPABASE_URL: 'https://project.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-test-key', RESEND_API_KEY: 'resend-test-key',
  ADMIN_PASSWORD: 'admin-test-password',
};
const AUTH = { Authorization: `Bearer ${ENV.SUPABASE_SERVICE_ROLE_KEY}` };
const json = (body, status = 200) => new Response(JSON.stringify(body), { status });
const payment = (patch = {}) => ({
  event: 'charge.success', data: {
    status: 'success', reference: 'UNSEEN_purchase-123', amount: 963900, currency: 'NGN', paid_at:'2026-10-25T12:00:00Z',
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
      if(table==='playbook_checkout_policy')return {select(){return this;},eq(){return this;},single:async()=>({data:{legacy_cutover_at:'2026-10-26T00:00:00Z'}})};
      assert.equal(table, 'playbook_purchases');
      let action = 'select', values;
      const filters = [];
      async function run(single = false) {
        calls.push({ action, values });
        if (faults[action] > 0) {
          faults[action]--;
          return { data: null, error: { code: 'XX000' } };
        }
        if (action === 'update' && values.thankyou_sent === true && faults.updateSent > 0) {
          faults.updateSent--;
          return { data: null, error: { code: 'XX000' } };
        }
        if (action === 'update' && values.thankyou_sent === true && faults.updateSentNoRows > 0) {
          faults.updateSentNoRows--;
          return { data: null, error: null };
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

function load(name, { db = database(), env = {}, logs = [], fetch = () => { throw new Error('Unexpected network call'); } } = {}) {
  let handler;
  const code = buildSync({ entryPoints: [new URL(`../supabase/functions/${name}/index.ts`, import.meta.url).pathname.replace(/^\/(\w:)/, '$1')],
    bundle: true, write: false, platform: 'node', format: 'cjs', external: ['https://*'], logLevel: 'silent' }).outputFiles[0].text;
  vm.runInNewContext(code, {
    require: (specifier) => specifier.includes('server.ts') ? { serve: (fn) => { handler = fn; } } : { createClient: (url, key) => {
      assert.equal(url, ENV.SUPABASE_URL); assert.equal(key, ENV.SUPABASE_SERVICE_ROLE_KEY); return withSecurityRpc(db.client);
    } },
    Deno: { env: { get: (key) => ({ ...ENV, ...env })[key] } },
    fetch, Request, Response, Headers, URL, AbortSignal, TextEncoder, TextDecoder, Uint8Array, crypto: webcrypto,
    console: { log: (...args) => logs.push(args), error: (...args) => logs.push(args) },
  });
  return handler;
}

function pipeline({ seed, faults, fetch, env, logs } = {}) {
  const db = database(seed, faults), emails = [], invocations = [];
  const sender = load('send-purchase-thankyou', { db, env, logs, fetch: fetch ?? (async (url, options) => {
    assert.equal(url, 'https://api.resend.com/emails');
    emails.push({ payload: JSON.parse(options.body), headers: options.headers });
    return json({ id: 'email-1' });
  }) });
  db.client.functions = { invoke: async (name, { body }) => {
    assert.equal(name, 'send-purchase-thankyou'); invocations.push(body);
    const result = await sender(senderRequest(body));
    return { data: await result.json(), error: result.ok ? null : { message: 'Sender failed' } };
  } };
  return { db, sender, webhook: load('paystack-webhook', { db, env, logs }), emails, invocations };
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
    for (const text of ['https://themarketinghaven.xyz/#shop', 'Thank you for choosing The Unseen Playbook.', 'reply to this email', 'Your friends over at Team Haven']) {
      assert.ok(emails[0].payload.text.includes(text));
    }
    assert.equal(emails[0].headers.Authorization, `Bearer ${ENV.RESEND_API_KEY}`);
    assert.equal(emails[0].headers['Idempotency-Key'], 'playbook-purchase-thankyou/UNSEEN_purchase-123');
  }
});

test('editorial purchase email: new purchases get the CTA; legacy pending sends keep their exact original payload', async () => {
  for (const version of ['legacy', 'editorial-v1']) {
    const { sender, emails } = pipeline({ seed: [{ id: 'p1', email: 'buyer@example.com', reference: 'UNSEEN_purchase-123', thankyou_sent: false, email_template_version: version }] });
    assert.equal((await sender(senderRequest())).status, 200);
    assert.equal(emails[0].headers['Idempotency-Key'], 'playbook-purchase-thankyou/UNSEEN_purchase-123');
    if (version === 'legacy') {
      assert.equal(emails[0].payload.html, undefined);
      assert.match(emails[0].payload.text, /further stuff/);
    } else {
      assert.match(emails[0].payload.html, /Access Your Playbook/);
      assert.doesNotMatch(emails[0].payload.text, /further stuff/);
    }
  }
});

test('signed checkout consent is explicit, versioned and immutable across webhook replays', async () => {
  for (const metadata of [
    { playbook_followup_opt_in: true, playbook_followup_consent_version: '2026-10-27' },
    JSON.stringify({ playbook_followup_opt_in: true, playbook_followup_consent_version: '2026-10-27' }),
  ]) {
    const app = pipeline();
    assert.equal((await app.webhook(webhookRequest(payment({ metadata })))).status, 200);
    assert.equal(app.db.rows[0].followup_opt_in, true);
    assert.equal(app.db.rows[0].followup_consent_version, '2026-10-27');
    assert.equal(app.db.rows[0].buyer_first_name, 'Adéọlá');
    assert.equal(app.db.rows[0].paid_at, '2026-10-25T12:00:00.000Z');
    await app.webhook(webhookRequest(payment({ metadata: {}, customer: { email: 'changed@example.com', first_name: 'Changed' } })));
    assert.equal(app.db.rows[0].followup_opt_in, true); assert.equal(app.db.rows[0].buyer_first_name, 'Adéọlá');
  }
  for (const metadata of [null, {}, { playbook_followup_opt_in: 'true', playbook_followup_consent_version: '2026-10-27' }, { playbook_followup_opt_in: true, playbook_followup_consent_version: 'old' }]) {
    const app = pipeline(); await app.webhook(webhookRequest(payment({ metadata })));
    assert.equal(app.db.rows[0].followup_opt_in, false); assert.equal(app.db.rows[0].followup_consent_version, null);
  }
  const app = pipeline(); await app.webhook(webhookRequest(payment({ metadata: {} })));
  await app.webhook(webhookRequest(payment({ metadata: { playbook_followup_opt_in: true, playbook_followup_consent_version: '2026-10-27' } })));
  assert.equal(app.db.rows[0].followup_opt_in, false);
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
  assert.equal(db.rows.length, 1); assert.equal(db.rows[0].email, 'buyer@example.com'); assert.equal(db.rows[0].amount, 963900);
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
  const { webhook, db } = pipeline({ faults: { updateSent: 1 }, fetch: async (_, options) => {
    keys.push(options.headers['Idempotency-Key']); return json({ id: 'same-email' });
  } });
  assert.equal((await webhook(webhookRequest())).status, 502);
  assert.equal(db.rows[0].thankyou_sent, false);
  assert.equal(db.rows[0].thankyou_email_id, 'same-email');
  assert.equal(db.rows[0].thankyou_last_error, 'delivery_marker_update_failed');
  assert.equal((await webhook(webhookRequest())).status, 200);
  assert.equal(db.rows[0].thankyou_sent, true); assert.equal(new Set(keys).size, 1);
  assert.equal(keys.length, 1, 'A saved acceptance id repairs the marker without resending');
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
  assert.equal((await sender(senderRequest())).status, 502);
  assert.equal(db.rows[0].thankyou_last_error, 'resend_network_error');
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

test('webhook stage logs and failure diagnostics contain no buyer data, references, secrets or provider bodies', async () => {
  const logs = [];
  const { webhook, db } = pipeline({ logs, fetch: async () => json({ message: `private-provider-body ${ENV.RESEND_API_KEY} buyer@example.com` }, 403) });
  assert.equal((await webhook(webhookRequest())).status, 502);
  const stages = logs.map((args) => args[0]);
  for (const stage of ['Webhook received', 'Signature verified', 'Inserting into playbook_purchases', 'Triggering thank you email']) assert.ok(stages.includes(stage));
  assert.ok(stages.includes('Error in webhook: purchase_email_failed'));
  const output = JSON.stringify(logs);
  for (const privateValue of ['buyer@example.com', 'UNSEEN_purchase-123', 'private-provider-body', ENV.PAYSTACK_SECRET_KEY, ENV.RESEND_API_KEY, ENV.SUPABASE_SERVICE_ROLE_KEY]) assert.ok(!output.includes(privateValue));
  assert.equal(db.rows[0].thankyou_last_error, 'resend_http_403');
  assert.ok(db.rows[0].thankyou_attempted_at); assert.equal(db.rows[0].thankyou_sent, false);
});

test('a configured live environment accepts the intentional NGN 100 live purchase and logs key mode safely', async () => {
  const secret = 'sk_live_example-secret', logs = [];
  const { webhook, db } = pipeline({ env: { PAYSTACK_SECRET_KEY: secret, PAYSTACK_ENV: 'live' }, logs });
  const result = await webhook(webhookRequest(payment({ domain: 'live', amount: 10000 }), { secret }));
  assert.equal(result.status, 200); assert.equal(db.rows[0].amount, 10000); assert.equal(db.rows[0].thankyou_sent, true);
  const mode = logs.find((args) => args[0] === 'Paystack environment')[1];
  assert.equal(mode.key_mode, 'live'); assert.equal(mode.expected_mode, 'live');
  assert.ok(!JSON.stringify(logs).includes(secret));
});

test('optional environment guard rejects mismatched keys, signed payment domains and invalid configuration before writes', async () => {
  const secret = 'sk_live_example-secret';
  for (const [expected, domain, status] of [['test', 'test', 500], ['live', 'test', 400], ['live', undefined, 400], ['production', 'live', 500]]) {
    const { webhook, db } = pipeline({ env: { PAYSTACK_SECRET_KEY: secret, PAYSTACK_ENV: expected } });
    assert.equal((await webhook(webhookRequest(payment({ domain }), { secret }))).status, status);
    assert.equal(db.calls.length, 0);
  }
  const testSecret = 'sk_test_example-secret';
  const { webhook } = pipeline({ env: { PAYSTACK_SECRET_KEY: testSecret, PAYSTACK_ENV: 'test' } });
  assert.equal((await webhook(webhookRequest(payment({ domain: 'test' }), { secret: testSecret }))).status, 200);
});

test('Resend 2xx responses without a valid JSON acceptance ID remain pending with actionable diagnostics', async () => {
  for (const response of [() => json({}), () => json({ id: '' }), () => json({ id: 'buyer@example.com' }), () => new Response('not JSON')]) {
    const { sender, db } = pipeline({ seed: [{ id: 'saved', email: 'buyer@example.com', reference: 'UNSEEN_purchase-123', thankyou_sent: false }], fetch: response });
    assert.equal((await sender(senderRequest())).status, 502);
    assert.equal(db.rows[0].thankyou_sent, false);
    assert.equal(db.rows[0].thankyou_last_error, 'invalid_resend_acceptance');
    assert.ok(db.rows[0].thankyou_attempted_at); assert.equal(db.rows[0].thankyou_email_id, undefined);
  }
});

test('delivery timestamps and provider ID are saved only after valid provider acceptance and an acknowledged row update', async () => {
  const { webhook, db } = pipeline();
  assert.equal((await webhook(webhookRequest())).status, 200);
  assert.equal(db.rows[0].thankyou_email_id, 'email-1');
  assert.ok(Number.isFinite(Date.parse(db.rows[0].thankyou_sent_at)));
  assert.ok(Number.isFinite(Date.parse(db.rows[0].thankyou_attempted_at)));
  assert.equal(db.rows[0].thankyou_last_error, null);
  const missing = pipeline({ faults: { updateSentNoRows: 1 } });
  assert.equal((await missing.webhook(webhookRequest())).status, 502);
  assert.equal(missing.db.rows[0].thankyou_sent, false);
  assert.equal(missing.db.rows[0].thankyou_last_error, 'delivery_marker_update_failed');
});

test('sender fails safely before email when the delivery-tracking write is unavailable', async () => {
  const { webhook, db, emails } = pipeline({ faults: { update: 1 } });
  assert.equal((await webhook(webhookRequest())).status, 502);
  assert.equal(emails.length, 0); assert.equal(db.rows[0].thankyou_sent, false);
  assert.equal(db.rows[0].thankyou_last_error, 'delivery_tracking_unavailable');
});

test('webhook refuses success when a sender claims success without the durable sent marker', async () => {
  const db = database();
  db.client.functions = { invoke: async () => ({ data: { ok: true }, error: null }) };
  const webhook = load('paystack-webhook', { db });
  assert.equal((await webhook(webhookRequest())).status, 502);
  assert.equal(db.rows[0].thankyou_sent, false);
});

const adminRequest = (body = {}, origin) => new Request('https://project.supabase.co/functions/v1/admin-retry-purchase-email', {
  method: 'POST', headers: { 'Content-Type': 'application/json', ...(origin ? { Origin: origin } : {}) }, body: JSON.stringify(body),
});

test('admin email retry requires the existing admin password, a valid reference and allowed method/origin', async () => {
  const db = database(), handler = load('admin-retry-purchase-email', { db });
  for (const body of [{}, { password: 'wrong', reference: 'UNSEEN_purchase-123' }, { password: ENV.ADMIN_PASSWORD, reference: 'OTHER_123' }]) {
    assert.equal((await handler(adminRequest(body))).status, body.password === ENV.ADMIN_PASSWORD ? 400 : 401);
  }
  assert.equal((await handler(adminRequest({ password: ENV.ADMIN_PASSWORD, reference: 'UNSEEN_purchase-123' }, 'https://untrusted.example'))).status, 403);
  assert.equal((await handler(new Request('https://project.supabase.co'))).status, 405);
  assert.equal(db.calls.length, 0);
  assert.equal((await load('admin-retry-purchase-email', { env: { ADMIN_PASSWORD: undefined } })(adminRequest())).status, 500);
});

test('admin retry recovers an existing pending purchase using only its saved recipient and returns fresh delivery status', async () => {
  const { db, emails } = pipeline({ seed: [{ id: 'saved', email: 'buyer@example.com', reference: 'UNSEEN_purchase-123', amount: 10000, thankyou_sent: false }] });
  const handler = load('admin-retry-purchase-email', { db });
  const response = await handler(adminRequest({ password: ENV.ADMIN_PASSWORD, reference: 'UNSEEN_purchase-123', email: 'attacker@example.com' }, 'http://localhost:5175'));
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.ok, true); assert.equal(data.purchase.thankyou_sent, true);
  assert.equal(data.purchase.thankyou_email_id, 'email-1');
  assert.deepEqual(emails[0].payload.to, ['buyer@example.com']);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), 'http://localhost:5175');
});

test('admin retry returns saved sanitized failure diagnostics and can subsequently recover', async () => {
  let fails = true;
  const { db } = pipeline({ seed: [{ id: 'saved', email: 'buyer@example.com', reference: 'UNSEEN_purchase-123', thankyou_sent: false }],
    fetch: async () => fails ? json({ secret: ENV.RESEND_API_KEY, message: 'provider private data' }, 429) : json({ id: 'recovered-email' }) });
  const handler = load('admin-retry-purchase-email', { db });
  const body = { password: ENV.ADMIN_PASSWORD, reference: 'UNSEEN_purchase-123' };
  const failed = await handler(adminRequest(body));
  assert.equal(failed.status, 502);
  const status = await failed.json();
  assert.equal(status.purchase.thankyou_last_error, 'resend_http_429');
  assert.ok(!JSON.stringify(status).includes(ENV.RESEND_API_KEY));
  assert.ok(!JSON.stringify(status).includes('provider private data'));
  fails = false;
  assert.equal((await handler(adminRequest(body))).status, 200);
  assert.equal(db.rows[0].thankyou_last_error, null);
});

test('admin retry skips sent purchases, rejects unknown purchases and repairs stored acceptance without another email', async () => {
  const { db, emails } = pipeline({ seed: [
    { id: 'sent', email: 'buyer@example.com', reference: 'UNSEEN_sent', thankyou_sent: true },
    { id: 'accepted', email: 'buyer@example.com', reference: 'UNSEEN_accepted', thankyou_sent: false, thankyou_email_id: 'prior-accepted-email' },
  ] });
  const handler = load('admin-retry-purchase-email', { db });
  const call = (reference) => handler(adminRequest({ password: ENV.ADMIN_PASSWORD, reference }));
  assert.equal((await call('UNSEEN_unknown')).status, 404);
  assert.equal((await (await call('UNSEEN_sent')).json()).skipped, 'already sent');
  assert.equal((await call('UNSEEN_accepted')).status, 200);
  assert.equal(emails.length, 0); assert.equal(db.rows[1].thankyou_sent, true);
  assert.equal(db.rows[1].thankyou_email_id, 'prior-accepted-email');
});


test('mail setup check: service authentication is required and a read-only check never sends or touches purchases', async () => {
  const db = database(), requests = [];
  const handler = load('send-purchase-thankyou', { db, fetch: async (url, options) => {
    requests.push({ url, options });
    return json({ data: [{ name: 'themarketinghaven.xyz', status: 'verified', capabilities: { sending: 'enabled' } }], has_more: false });
  } });
  assert.equal((await handler(senderRequest({ action: 'checkConfiguration' }, {}))).status, 401);
  const response = await handler(senderRequest({ action: 'checkConfiguration' }));
  const result = await response.json(); assert.equal(result.verification, 'verified');
  assert.equal(db.calls.length, 0); assert.equal(requests.length, 1); assert.ok(requests[0].url.includes('/domains?'));
  assert.ok(!JSON.stringify(result).includes(ENV.RESEND_API_KEY));
});

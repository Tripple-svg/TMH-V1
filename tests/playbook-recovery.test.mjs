import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { webcrypto, createHash } from 'node:crypto';
import { buildSync } from 'esbuild';

const codes = new Map();
const sha = text => createHash('sha256').update(text).digest('hex');
function pipeline({ wrongBuyer = false, rateAllowed = true, mailStatus = 200, paidAt = '2026-10-25T12:00:00Z', amount = 963900, paymentFailureAt = 0 } = {}) {
  const rows = { playbook_recovery_otps: [], playbook_download_grants: [] }, mail = [], calls = [];
  let paymentCalls = 0;
  const paidReferences = new Set(['UNSEEN_paid']);
  const db = {
    async rpc(name, args) {
      calls.push({ name, args });
      if (name === 'consume_playbook_limit') return { data: rateAllowed };
      if (name === 'reserve_playbook_recovery') {
        rows.playbook_recovery_otps.push({ id: args.p_id, reference: args.p_reference, email: args.p_email, code_hash: args.p_code_hash });
        return { data: { created: true, id: args.p_id } };
      }
      if (name === 'redeem_playbook_recovery') {
        const row = rows.playbook_recovery_otps.find(row => row.id === args.p_id);
        if (!row || row.consumed_at || !row.sent_at || row.code_hash !== args.p_code_hash) return { data: { verified: false } };
        row.consumed_at = new Date().toISOString();
        rows.playbook_download_grants.push({ token_hash: args.p_grant_hash, reference: row.reference, email: row.email, expires_at: '2099-01-01T00:00:00Z' });
        return { data: { verified: true, reference: row.reference, email: row.email } };
      }
      throw new Error('Unexpected RPC: ' + name);
    },
    from(table) {
      let patch, inserted; const filters = [];
      const run = () => {
        if (inserted) { rows[table].push({ ...inserted, expires_at: '2099-01-01T00:00:00Z' }); return { error: null }; }
        if (table === 'playbook_checkout_policy') return { data: { legacy_cutover_at: '2026-10-26T00:00:00Z' } };
        const row = (rows[table] || []).find(row => filters.every(([key, value]) => row[key] === value));
        if (patch && row) Object.assign(row, patch);
        return { data: row || null };
      };
      return { insert(value) { inserted = value; return this; }, select() { return this; }, eq(key, value) { filters.push([key, value]); return this; }, update(value) { patch = value; return this; },
        single: async () => run(), maybeSingle: async () => run(), then(resolve) { return Promise.resolve(run()).then(resolve); } };
    },
    storage: { getBucket: async () => ({ data: { public: false } }), from: () => ({ createSignedUrl: async (path, ttl) => {
      assert.equal(ttl, 600); return { data: { signedUrl: 'https://private.example/verified' } };
    } }) },
  };
  function handler(name) {
    let serve;
    if (!codes.has(name)) codes.set(name, buildSync({ entryPoints: [new URL('../supabase/functions/' + name + '/index.ts', import.meta.url).pathname.replace(/^\/(\w:)/, '$1')],
      bundle: true, write: false, format: 'cjs', platform: 'node', external: ['https://*'], logLevel: 'silent' }).outputFiles[0].text);
    vm.runInNewContext(codes.get(name), {
      require: () => ({ createClient: () => db }),
      Deno: { serve(fn) { serve = fn; }, env: { get(key) { return { SUPABASE_URL: 'https://project.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'service-secret', PAYSTACK_SECRET_KEY: 'paystack-secret', RESEND_API_KEY: 'resend-secret' }[key]; } } },
      fetch: async (url, options) => {
        if (url === 'https://api.resend.com/emails') { mail.push(JSON.parse(options.body)); return Response.json(mailStatus === 200 ? { id: 'accepted-id' } : { message: 'Not available' }, { status: mailStatus }); }
        if (++paymentCalls === paymentFailureAt) throw new Error('Temporary network outage');
        assert.match(url, /^https:\/\/api.paystack.co\/transaction\/verify\/UNSEEN_/);
        const reference = decodeURIComponent(String(url).split('/').at(-1));
        return Response.json({ status: true, data: { reference, status: paidReferences.has(reference) ? 'success' : 'abandoned', amount, currency: 'NGN', paid_at: paidAt, customer: { email: wrongBuyer ? 'other@example.com' : 'buyer@example.com' } } });
      },
      Response, Request, Headers, URL, AbortSignal, TextEncoder, TextDecoder, Uint8Array, Uint32Array, crypto: webcrypto,
      console: { log() {}, warn() {}, error() {} },
    });
    return serve;
  }
  const request = (body, origin = 'https://themarketinghaven.xyz') => new Request('https://project.supabase.co/functions/v1/test', { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return { rows, calls, mail, request, markPaid: reference => paidReferences.add(reference), requestCode: handler('request-playbook-recovery'), verifyCode: handler('verify-playbook-recovery'), download: handler('verify-paystack') };
}
const details = { email: 'buyer@example.com', reference: 'UNSEEN_paid' };

test('a new checkout opens directly only after payment, without issuing an email code', async () => {
  const app = pipeline();
  const prepared = await (await app.download(app.request({ action: 'prepare-checkout', ...details }))).json();
  assert.equal(prepared.ok, true); assert.equal(prepared.amount, 963900);
  assert.notEqual(prepared.reference, details.reference); assert.match(prepared.downloadToken, /^[a-f0-9]{64}$/);
  assert.equal(app.rows.playbook_download_grants[0].token_hash, sha(prepared.downloadToken));
  const receipt = { reference: prepared.reference, email: prepared.email, downloadToken: prepared.downloadToken };
  const unpaid = await app.download(app.request(receipt));
  assert.equal(unpaid.status, 403); assert.equal((await unpaid.json()).code, 'payment_not_verified');
  app.markPaid(prepared.reference);
  const verified = await (await app.download(app.request(receipt))).json();
  assert.equal(verified.ok, true); assert.ok(verified.url); assert.ok(verified.playbookAccessToken);
  assert.equal(app.mail.length, 0); assert.equal(app.rows.playbook_recovery_otps.length, 0);
  assert.equal((await app.download(app.request({ ...receipt, reference: details.reference }))).status, 403);
});

test('preparing a checkout cannot claim an existing receipt or bypass a wrong buyer or amount', async () => {
  for (const options of [{ wrongBuyer: true }, { amount: 10000, paidAt: '2099-01-01T00:00:00Z' }]) {
    const app = pipeline(options);
    const prepared = await (await app.download(app.request({ action: 'prepare-checkout', ...details }))).json();
    app.markPaid(prepared.reference);
    const response = await app.download(app.request({ ...prepared }));
    assert.equal(response.status, 403); assert.equal((await response.json()).url, undefined);
  }
  const app = pipeline();
  assert.equal((await app.download(app.request(details))).status, 403);
  assert.equal(app.rows.playbook_download_grants.length, 0);
});

test('OTP request sends only to the Paystack-confirmed buyer and exposes no download, code or grant', async () => {
  const app = pipeline(); const response = await app.requestCode(app.request(details)); const data = await response.json();
  assert.equal(response.status, 200); assert.ok(data.challengeId); assert.equal(data.url, undefined); assert.equal(data.code, undefined); assert.equal(data.downloadToken, undefined);
  assert.deepEqual(app.mail[0].to, ['buyer@example.com']);
  const code = app.mail[0].text.match(/code is (\d{6})/)[1];
  assert.equal(app.rows.playbook_recovery_otps[0].code_hash.length, 64); assert.notEqual(app.rows.playbook_recovery_otps[0].code_hash, sha(code));
  assert.equal(response.headers.get('cache-control'), 'no-store');
});
test('wrong buyer details have the same public challenge shape and send no email', async () => {
  const app = pipeline({ wrongBuyer: true }); const data = await (await app.requestCode(app.request(details))).json();
  assert.equal(data.ok, true); assert.ok(data.challengeId); assert.equal(app.mail.length, 0); assert.equal(app.rows.playbook_recovery_otps.length, 0);
});
test('OTP proof returns a buyer-scoped grant, rejects replay and supports fresh signed downloads', async () => {
  const app = pipeline(); const { challengeId } = await (await app.requestCode(app.request(details))).json();
  const code = app.mail[0].text.match(/code is (\d{6})/)[1];
  const wrong = await app.verifyCode(app.request({ challengeId, code: code === '000000' ? '111111' : '000000' }));
  assert.equal(wrong.status, 400); assert.equal(app.rows.playbook_download_grants.length, 0);
  const verified = await app.verifyCode(app.request({ challengeId, code, email: 'attacker@example.com', reference: 'UNSEEN_forged' }));
  const result = await verified.json(); assert.equal(result.ok, true); assert.equal(result.email, details.email); assert.equal(result.reference, details.reference);
  assert.match(result.downloadToken, /^[a-f0-9]{64}$/); assert.equal(app.rows.playbook_download_grants[0].token_hash, sha(result.downloadToken));
  assert.equal((await app.verifyCode(app.request({ challengeId, code }))).status, 400);
  const fresh = await (await app.download(app.request({ ...details, downloadToken: result.downloadToken }))).json();
  assert.equal(fresh.ok, true); assert.equal(fresh.expiresIn, 600);
  assert.equal((await app.download(app.request({ ...details, email: 'attacker@example.com', downloadToken: result.downloadToken }))).status, 403);
});
test('rate limits reject before payment/provider work and blocked origins cannot request mail', async () => {
  const app = pipeline({ rateAllowed: false });
  assert.equal((await app.requestCode(app.request(details))).status, 429); assert.equal(app.mail.length, 0);
  assert.equal((await app.requestCode(app.request(details, 'https://evil.example'))).status, 403);
});
test('mail failure never activates an OTP and future NGN 100 underpayments never send codes', async () => {
  const down = pipeline({ mailStatus: 403 }); assert.equal((await down.requestCode(down.request(details))).status, 503);
  assert.equal(down.rows.playbook_recovery_otps[0].sent_at, undefined);
  const low = pipeline({ amount: 10000, paidAt: '2099-01-01T00:00:00Z' });
  assert.equal((await low.requestCode(low.request(details))).status, 200); assert.equal(low.mail.length, 0);
});


test('a temporary payment outage after code redemption preserves inbox proof but never exposes a download',async()=>{
  const app=pipeline({paymentFailureAt:2});
  const {challengeId}=await (await app.requestCode(app.request(details))).json();
  const code=app.mail[0].text.match(/code is (\d{6})/)[1];
  const result=await (await app.verifyCode(app.request({challengeId,code}))).json();
  assert.equal(result.ok,true);assert.equal(result.downloadPending,true);assert.match(result.downloadToken,/^[a-f0-9]{64}$/);
  assert.equal(result.url,undefined);assert.equal(result.playbookAccessToken,undefined);
  const resumed=await (await app.download(app.request({...details,downloadToken:result.downloadToken}))).json();
  assert.equal(resumed.ok,true);assert.ok(resumed.url);
});

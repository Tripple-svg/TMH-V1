import { withSecurityRpc } from './helpers/security-fixture.mjs';
import { PNG_DATA_URL } from './helpers/image-fixtures.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { webcrypto, createHash } from 'node:crypto';
import { buildSync } from 'esbuild';

const reviewId = '11111111-1111-4111-8111-111111111111';
const sessionId = '22222222-2222-4222-8222-222222222222';
const accessToken = 'a'.repeat(64);
const tokenHash = createHash('sha256').update(accessToken).digest('hex');
const snapshotAt = new Date().toISOString();
const credentials = { reviewId, sessionId, accessToken };
const request = (body, method = 'POST') => new Request('https://project.supabase.co/functions/v1/test', {
  method, headers: { origin: 'http://localhost:5173', 'Content-Type': 'application/json' },
  ...(method === 'POST' ? { body: JSON.stringify(body) } : {}),
});

function database({ present = true, failTable, rpcError, uploadError, deletionStatus = null, concurrentDeletionStatus = null } = {}) {
  const rows = {
    brand_reviews: present ? [{ id: reviewId, email: 'owner@example.com', platform_type:'website', website_url:'https://example.com/', screenshot_url: null }] : [],
    haven_sessions: present ? [{ id: sessionId, review_id: reviewId, scope: 'audit', current_step: 'AWAITING_DIAGNOSTIC_Q1' }] : [],
    review_access_tokens: present ? [{ review_id: reviewId, session_id: sessionId, token_hash: tokenHash }] : [],
  };
  const calls = [], uploads = [];
  const client = {
    from(table) {
      const filters = [];
      return { select() { return this; }, eq(key, value) { filters.push((row) => row[key] === value); return this; },
        ilike() { return this; }, async limit() { return { data: rows[table] || [], error: null }; },
        async maybeSingle() { return { data: rows[table]?.find((row) => filters.every((f) => f(row))) || null, error: failTable === table ? { message: 'database unavailable' } : null }; },
      };
    },
    async rpc(name, args) {
      if (name === 'review_deletion_status') return { data: deletionStatus };
      calls.push({ name, args });
      if (rpcError) return { error: rpcError };
      if (name === 'create_haven_review_after_deletion_check') {
        if (concurrentDeletionStatus) return { data: { deletionBlock: concurrentDeletionStatus } };
        rows.brand_reviews.push(args.p_review);
        rows.haven_sessions.push({ id: args.p_session_id, review_id: args.p_review.id, scope: 'audit' });
        rows.review_access_tokens.push({ review_id: args.p_review.id, session_id: args.p_session_id, token_hash: args.p_token_hash });
      }
      return { data: {}, error: null };
    },
    storage: { from(bucket) { return { async upload(path, bytes, options) { uploads.push({ bucket, path, bytes, options }); return { error: typeof uploadError === 'function' ? uploadError() : uploadError }; } }; } },
  };
  return { client, rows, calls, uploads };
}

function load(name, db, options = {}) {
  let handler;
  const env = { SUPABASE_URL: 'https://project.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'service-test', CLOUDFLARE_TURNSTILE_SECRET_KEY: 'captcha-test', CLOUDFLARE_TURNSTILE_HOSTNAMES:'localhost', ...options.env };
  const code=buildSync({entryPoints:[new URL('../supabase/functions/'+name+'/index.ts',import.meta.url).pathname.replace(/^\/(\w:)/,'$1')],bundle:true,write:false,format:'cjs',platform:'node',external:['https://*'],logLevel:'silent'}).outputFiles[0].text;
  vm.runInNewContext(code,{
    require: specifier=>specifier.includes('server.ts')?{serve:fn=>{handler=fn;}}:{createClient:()=>withSecurityRpc(db.client)},
    Deno:{serve:fn=>{handler=fn;},env:{get:key=>env[key]}},Response,Request,Headers,TextEncoder,TextDecoder,Uint8Array,
    crypto:webcrypto,URL,URLSearchParams,AbortSignal,atob,
    fetch:options.fetch||(async()=>Response.json({success:true,action:'brand_review',hostname:'localhost'})),
    console:{log(){},warn(){},error(){}},
  });
  return handler;
}

const syncPayload = () => ({ ...credentials, snapshotAt, messages: [{ id: 'one', role: 'user', content: 'Help me understand my review.' }], clickedBookingLink: true });
const creationPayload = () => ({ id: reviewId, sessionId, accessToken, fullName: 'Owner', brandName: 'Example Brand', email: 'owner@example.com', whatsapp: '+2348012345678', platformType: 'website', websiteUrl: 'https://example.com', agreedToTerms: true, turnstileToken: 'solved-captcha' });

test('social review rejects disguised and truncated image content before CAPTCHA, database writes or upload',async()=>{
  for(const screenshotBase64 of ['data:image/png;base64,PHN2Zy8+','data:image/png;base64,iVBORw0KGgo=','data:image/png;base64,YR==']){
    const db=database({present:false});let fetches=0;
    const handler=load('create-brand-review',db,{fetch:async()=>{fetches++;return Response.json({success:true});}});
    const response=await handler(request({...creationPayload(),platformType:'social',websiteUrl:null,screenshotBase64}));
    assert.equal(response.status,400);assert.equal(db.calls.length,0);assert.equal(db.uploads.length,0);assert.equal(fetches,0);
  }
});

test('sync verifies both row relationship and private token before making any write', async () => {
  for (const patch of [{ accessToken: 'b'.repeat(64) }, { reviewId: '33333333-3333-4333-8333-333333333333' }, { accessToken: undefined }, { sessionId: 'missing' }]) {
    const db = database();
    const response = await load('sync-haven-session', db)(request({ ...syncPayload(), ...patch }));
    assert.equal(response.status, 403);
    assert.equal((await response.json()).ok, false);
    assert.equal(db.calls.length, 0);
  }
});

test('sync rejects missing review or session instead of claiming a zero-row success', async () => {
  for (const table of ['brand_reviews', 'haven_sessions', 'review_access_tokens']) {
    const db = database(); db.rows[table] = [];
    assert.equal((await load('sync-haven-session', db)(request(syncPayload()))).status, 403);
    assert.equal(db.calls.length, 0);
  }
});

test('sync returns500 for any ownership lookup or atomic update database failure', async () => {
  for (const failure of [{ failTable: 'haven_sessions' }, { failTable: 'brand_reviews' }, { failTable: 'review_access_tokens' }, { rpcError: { message: 'update failed' } }]) {
    const db = database(failure);
    const response = await load('sync-haven-session', db)(request(syncPayload()));
    assert.equal(response.status, 500);
    assert.equal((await response.json()).ok, false);
  }
});

test('sync writes bounded transcript and clicks only; browser cannot overwrite score, flags or trusted steps', async () => {
  const db = database();
  const response = await load('sync-haven-session', db)(request({ ...syncPayload(), websiteScore: 100, scoreBreakdown: { fake: 100 }, leadTemperature: 'HOT', currentStep: 'CLEAN_EXIT', flag_status: 'white' }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
  assert.equal(db.calls[0].name, 'sync_haven_review');
  assert.deepEqual(Object.keys(db.calls[0].args).sort(), ['p_clicked_booking', 'p_clicked_playbook', 'p_messages', 'p_review_id', 'p_session_id', 'p_snapshot_at']);
  assert.equal(db.calls[0].args.p_clicked_booking, true);
  assert.equal(db.calls[0].args.p_messages[0].content, 'Help me understand my review.');
});

test('sync rejects invalid timestamp, oversized payloads and methods', async () => {
  const db = database(), handler = load('sync-haven-session', db);
  assert.equal((await handler(request({ ...syncPayload(), snapshotAt: 'nonsense' }))).status, 400);
  assert.equal((await handler(request({ ...syncPayload(), snapshotAt: new Date(Date.now() + 120000).toISOString() }))).status, 400);
  assert.equal((await handler(request({ ...syncPayload(), messages: [{ role: 'user', content: 'x'.repeat(300001) }] }))).status, 413);
  assert.equal((await handler(request({}, 'GET'))).status, 405);
  assert.equal(db.calls.length, 0);
});

test('creation validates CAPTCHA on the server and atomically creates review, session and hashed capability', async () => {
  const db = database({ present: false }); let captchaCalls = 0;
  const handler = load('create-brand-review', db, { fetch: async (url, options) => {
    captchaCalls++; assert.equal(url, 'https://challenges.cloudflare.com/turnstile/v0/siteverify');
    assert.equal(options.body.get('secret'), 'captcha-test');
    assert.equal(options.body.get('response'), 'solved-captcha');
    return Response.json({ success: true, action:'brand_review', hostname:'localhost' });
  } });
  const response = await handler(request(creationPayload()));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, reviewId, sessionId });
  assert.equal(captchaCalls, 1);
  assert.equal(db.calls[0].name, 'create_haven_review_after_deletion_check');
  assert.equal(db.calls[0].args.p_token_hash, tokenHash);
  assert.equal(JSON.stringify(db.rows).includes(accessToken), false);
});

test('review lookup and creation deny a deleted email with the same copy', async () => {
  const db = database({ present: false, deletionStatus: 'email' });
  const denied = 'This email has already utilized its free review and deleted its data. Please contact Team Haven.';
  for (const [name, body] of [['check-email-exists', { email: 'OWNER@example.com' }], ['create-brand-review', creationPayload()]]) {
    const response = await load(name, db, { fetch: () => assert.fail('A blocked email must not consume Turnstile') })(request(body));
    assert.equal(response.status, 403);
    assert.equal((await response.json()).error, denied);
  }
  assert.equal(db.calls.length, 0);
});

test('creation also denies a deletion committed after the initial review check', async () => {
  const db = database({ present: false, concurrentDeletionStatus: 'email' });
  const response = await load('create-brand-review', db)(request(creationPayload()));
  assert.equal(response.status, 403);
  assert.equal((await response.json()).code, 'review_email_deleted');
  assert.equal(db.rows.brand_reviews.length, 0);
});

test('failed or missing CAPTCHA and invalid required fields never create a review', async () => {
  for (const [patch, captchaSuccess] of [[{}, false], [{ turnstileToken: '' }, true], [{ agreedToTerms: false }, true], [{ email: 'invalid' }, true]]) {
    const db = database({ present: false });
    const handler = load('create-brand-review', db, { fetch: async () => new Response(JSON.stringify({ success: captchaSuccess })) });
    assert.ok((await handler(request({ ...creationPayload(), ...patch }))).status >= 400);
    assert.equal(db.calls.length, 0);
    assert.equal(db.uploads.length, 0);
  }
});

test('failed creation transaction returns failure; no screenshot is uploaded and no success IDs escape', async () => {
  const db = database({ present: false, rpcError: { message: 'session insert failed' } });
  const response = await load('create-brand-review', db)(request({ ...creationPayload(), platformType:'social', websiteUrl:null, screenshotBase64: PNG_DATA_URL }));
  assert.equal(response.status, 500);
  const body = await response.json(); assert.equal(body.ok, false); assert.equal(body.reviewId, undefined);
  assert.equal(db.uploads.length, 0);
});

test('response-lost creation retry uses the same capability and never consumes CAPTCHA or inserts twice', async () => {
  const db = database({ present: false }); let captchaCalls = 0;
  const handler = load('create-brand-review', db, { fetch: async () => { captchaCalls++; return Response.json({success:true,action:'brand_review',hostname:'localhost'}); } });
  assert.equal((await handler(request(creationPayload()))).status, 200);
  assert.equal((await handler(request({ ...creationPayload(), turnstileToken: '' }))).status, 200);
  assert.equal(db.calls.length, 1); assert.equal(captchaCalls, 1);
  assert.equal((await handler(request({ ...creationPayload(), accessToken: 'b'.repeat(64) }))).status, 403);
  assert.equal((await handler(request({ ...creationPayload(), email: 'different@example.com' }))).status, 409);
});

test('screenshot upload failure is recoverable with same saved credentials and path', async () => {
  let uploads = 0;
  const db = database({ present: false, uploadError: () => ++uploads === 1 ? { message: 'storage offline' } : null });
  const handler = load('create-brand-review', db);
  const payload = { ...creationPayload(), platformType:'social', websiteUrl:null, screenshotBase64: PNG_DATA_URL };
  assert.equal((await handler(request(payload))).status, 500);
  assert.equal((await handler(request({ ...payload, turnstileToken: '' }))).status, 200);
  assert.equal(db.calls.length, 1); assert.equal(db.uploads.length, 2);
  assert.equal(db.uploads[0].path, db.uploads[1].path);
  assert.equal(db.uploads[1].options.upsert, true);
});

test('creation cannot acknowledge or orphan a screenshot when its review is deleted during upload', async () => {
  const db = database({ present: false }), removed = [];
  db.client.storage.from = (bucket) => ({
    async upload() { db.rows.brand_reviews = []; db.rows.haven_sessions = []; db.rows.review_access_tokens = []; return { error: null }; },
    async remove(paths) { removed.push({ bucket, paths }); return { error: null }; },
  });
  const response = await load('create-brand-review', db)(request({ ...creationPayload(), platformType:'social', websiteUrl:null, screenshotBase64: PNG_DATA_URL }));
  assert.equal(response.status, 403);
  assert.equal((await response.json()).ok, false);
  assert.deepEqual(JSON.parse(JSON.stringify(removed)), [{ bucket: 'tmh-screenshots', paths: [`${reviewId}/review.png`] }]);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import vm from 'node:vm';

function fixture({ markerFails = false } = {}) {
  const saved = { id: 'review-id', email: 'owner@example.com', full_name: '<Folusho>', brand_name: '<Brand & Company>', platform_type: 'website', welcome_email_sent: false };
  const emails = [], reads = [];
  const client = { from(table) {
    assert.equal(table, 'brand_reviews');
    let update, filters = [];
    async function run() {
      reads.push(table);
      if (!filters.every(([key, value]) => saved[key] === value)) return { data: null, error: null };
      if (update?.welcome_email_sent && markerFails) { markerFails = false; return { data: null, error: { code: 'XX000' } }; }
      if (update) Object.assign(saved, update);
      return { data: { ...saved }, error: null };
    }
    return { select() { return this; }, eq(key, value) { filters.push([key,value]); return this; }, update(value) { update = value; return this; }, maybeSingle: run, then(resolve, reject) { return run().then(resolve, reject); } };
  } };
  let handler;
  const code = buildSync({ entryPoints: [new URL('../supabase/functions/send-welcome-email/index.ts', import.meta.url).pathname.replace(/^\/(\w:)/, '$1')], bundle: true, write: false, platform: 'node', format: 'cjs', external: ['https://*'] }).outputFiles[0].text;
  vm.runInNewContext(code, {
    require: (name) => name.includes('server.ts') ? { serve: (fn) => { handler = fn; } } : { createClient: () => client },
    Deno: { env: { get: (key) => ({ RESEND_API_KEY: ' re_key_with_whitespace ', SUPABASE_URL: 'https://project.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'server-secret' })[key] } },
    fetch: async (_, options) => { emails.push({ ...JSON.parse(options.body), headers: options.headers }); return Response.json({ id: 'accepted-1' }); },
    Request, Response, AbortSignal, console: { error() {} },
  });
  const request = (authorised = true) => new Request('https://project.supabase.co/functions/v1/send-welcome-email', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(authorised ? { 'x-haven-internal-key': 'server-secret' } : {}) }, body: JSON.stringify({ record: { id: saved.id, email: 'attacker@example.com', full_name: 'Forged Name' } }) });
  return { saved, emails, reads, handler, request };
}

test('welcome mail: anonymous callers are rejected before database or provider work', async () => {
  const f = fixture(); assert.equal((await f.handler(f.request(false))).status, 401);
  assert.equal(f.reads.length, 0); assert.equal(f.emails.length, 0);
});

test('welcome mail: uses the saved recipient, escaped names, verified default sender and a working resume button', async () => {
  const f = fixture(); assert.equal((await f.handler(f.request())).status, 200);
  const mail = f.emails[0];
  assert.deepEqual(mail.to, ['owner@example.com']);
  assert.equal(mail.headers.Authorization, 'Bearer re_key_with_whitespace');
  assert.equal(mail.from, 'The Marketing Haven <info@themarketinghaven.xyz>');
  assert.match(mail.html, /Continue the review/); assert.match(mail.html, /https:\/\/themarketinghaven.xyz\/\?review=continue/);
  assert.match(mail.html, /&lt;Brand &amp; Company&gt;/); assert.doesNotMatch(mail.html, /<Folusho>|Forged Name/);
  assert.equal(f.saved.welcome_email_sent, true);
  assert.equal((await f.handler(f.request())).status, 200); assert.equal(f.emails.length, 1);
});

test('welcome mail: an accepted email survives a marker failure and is repaired without sending again', async () => {
  const f = fixture({ markerFails: true });
  assert.equal((await f.handler(f.request())).status, 502);
  assert.equal(f.saved.welcome_email_id, 'accepted-1'); assert.equal(f.saved.welcome_email_sent, false);
  assert.equal((await f.handler(f.request())).status, 200);
  assert.equal(f.emails.length, 1); assert.equal(f.saved.welcome_email_sent, true);
});

test('retired onsite sender cannot be used to mail an arbitrary recipient', async () => {
  let handler;
  const code = buildSync({ entryPoints: [new URL('../supabase/functions/send-booking-confirmation/index.ts', import.meta.url).pathname.replace(/^\/(\w:)/, '$1')], bundle: true, write: false, platform: 'node', format: 'cjs' }).outputFiles[0].text;
  vm.runInNewContext(code, { Deno: { serve: (fn) => { handler = fn; } }, Response, fetch() { throw new Error('Unexpected email'); } });
  assert.equal(handler(new Request('https://project.supabase.co/old-mailer', { method: 'POST', body: '{"email":"attacker@example.com"}' })).status, 410);
  assert.equal(handler(new Request('https://project.supabase.co/old-mailer', { method: 'OPTIONS' })).status, 204);
});

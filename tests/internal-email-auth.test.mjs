import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { buildSync } from 'esbuild';
import { createClient } from '@supabase/supabase-js';
import { internalHeaders, isInternalRequest } from '../supabase/functions/_shared/internal-auth.js';

test('internal auth: only an exact server credential works, with legacy Bearer compatibility', () => {
  const req = (headers) => new Request('https://project.supabase.co', { headers });
  assert.equal(isInternalRequest(req(internalHeaders('private-key')), 'private-key'), true);
  assert.equal(isInternalRequest(req({ Authorization: 'Bearer private-key' }), 'private-key'), true);
  for (const headers of [{}, { apikey: 'anon' }, { 'x-haven-internal-key': 'anon' }, { Authorization: 'Bearer forged' }]) {
    assert.equal(isInternalRequest(req(headers), 'private-key'), false);
  }
  assert.equal(isInternalRequest(req({ 'x-haven-internal-key': 'undefined' }), undefined), false);
});

test('real SDK: modern secret-key internal invocation authenticates the actual sender without putting a non-JWT key in Bearer', async () => {
  let handler;
  const key = 'sb_secret_private-test-credential', requests = [], env = {
    SUPABASE_URL: 'https://project.supabase.co', SUPABASE_SERVICE_ROLE_KEY: key, RESEND_API_KEY: 're_private-test',
  };
  const code = buildSync({ entryPoints: ['supabase/functions/send-purchase-thankyou/index.ts'], bundle: true, write: false,
    format: 'cjs', platform: 'node', external: ['https://*'], logLevel: 'silent' }).outputFiles[0].text;
  vm.runInNewContext(code, {
    require: (specifier) => specifier.includes('server.ts') ? { serve: (fn) => { handler = fn; } }
      : { createClient() { throw new Error('Read-only configuration check must not touch purchases'); } },
    Deno: { env: { get: (name) => env[name] } }, Request, Response, Headers, AbortSignal,
    fetch: async () => Response.json({ data: [{ name: 'themarketinghaven.xyz', status: 'verified' }], has_more: false }),
    console: { error() {} },
  });
  const client = createClient(env.SUPABASE_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (url, options) => { const req = new Request(url, options); requests.push(req); return handler(req); } },
  });
  const omitted = await client.functions.invoke('send-purchase-thankyou', { body: { action: 'checkConfiguration' } });
  assert.ok(omitted.error); assert.equal(requests[0].headers.get('Authorization'), null);
  const explicit = await client.functions.invoke('send-purchase-thankyou', { body: { action: 'checkConfiguration' }, headers: internalHeaders(key) });
  assert.equal(explicit.error, null); assert.equal(explicit.data.verification, 'verified');
  assert.equal(requests[1].headers.get('Authorization'), null);
  assert.equal(requests[1].headers.get('x-haven-internal-key'), key);
  assert.ok(!JSON.stringify(explicit.data).includes(key));
});

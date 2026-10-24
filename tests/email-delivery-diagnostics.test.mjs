import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mailConfiguration, checkMailConfiguration, providerFailure, invocationFailure } from '../supabase/functions/_shared/resend-delivery.js';

test('mail configuration: reads and trims only the server secret, supports a verified subdomain sender, rejects header injection', () => {
  const env = (values) => ({ get: (name) => values[name] });
  const settings = mailConfiguration(env({ RESEND_API_KEY: '  re_test_secret\n', RESEND_FROM_EMAIL: 'Team Haven <info@mail.themarketinghaven.xyz>' }));
  assert.equal(settings.key, 're_test_secret'); assert.equal(settings.from, 'Team Haven <info@mail.themarketinghaven.xyz>');
  for (const from of ['Team <onboarding@resend.dev>', 'Team <info@example.com>\r\nBcc: attacker@example.com', 'not an address']) {
    assert.throws(() => mailConfiguration(env({ RESEND_API_KEY: 'key', RESEND_FROM_EMAIL: from })), { code: 'invalid_resend_sender' });
  }
  assert.throws(() => mailConfiguration(env({ RESEND_API_KEY: '  ' })), { code: 'missing_resend_key' });
});

test('mail diagnostics: distinguish sender verification, key, test recipient, limits and retry conflicts without exposing provider text', () => {
  for (const [status, name, message, code] of [
    [403, 'validation_error', 'The example.com domain is not verified', 'resend_domain_unverified'],
    [403, 'validation_error', 'You can only send testing emails to your own email address', 'resend_test_recipient_restricted'],
    [401, 'validation_error', 'API key is invalid', 'resend_key_invalid'],
    [403, 'restricted_api_key', 'This key is restricted', 'resend_key_restricted'],
    [429, 'daily_quota_exceeded', 'Limit reached', 'resend_daily_quota_exceeded'],
    [409, 'concurrent_idempotent_requests', 'In progress', 'resend_request_in_progress'],
    [409, 'invalid_idempotent_request', 'Changed payload', 'resend_payload_changed'],
  ]) {
    const error = providerFailure(status, { name, message, secret: 'never-display-this' });
    assert.equal(error.code, code); assert.ok(!error.message.includes('never-display-this'));
  }
});

test('internal sender failures: preserves safe codes from non-2xx invocation responses and identifies gateway/boot failures', async () => {
  const sender = await invocationFailure(null, { context: Response.json({ code: 'resend_domain_unverified', error: 'private response' }, { status: 502 }) });
  assert.equal(sender.code, 'resend_domain_unverified'); assert.ok(!sender.error.includes('private response'));
  const boot = await invocationFailure(null, { context: new Response('private boot log', { status: 503 }) });
  assert.equal(boot.code, 'email_function_http_503'); assert.ok(!boot.error.includes('private boot log'));
});

test('sender check: verifies the exact account domain, never a different verified subdomain, without sending an email', async () => {
  const original = globalThis.fetch;
  const env = { get: (name) => name === 'RESEND_API_KEY' ? 're_private' : undefined };
  const requests = [];
  try {
    globalThis.fetch = async (url, options) => {
      requests.push({ url, options });
      return Response.json({ data: [{ id: 'domain-1', name: 'themarketinghaven.xyz', status: 'verified', capabilities: { sending: 'enabled' } }], has_more: false });
    };
    assert.equal((await checkMailConfiguration(env)).verification, 'verified');
    assert.equal(requests[0].options.headers.Authorization, 'Bearer re_private');
    assert.ok(requests.every(({ url, options }) => url.startsWith('https://api.resend.com/domains?') && !options.body));
    globalThis.fetch = async () => Response.json({ data: [{ id: 'domain-1', name: 'mail.themarketinghaven.xyz', status: 'verified' }], has_more: false });
    assert.equal((await checkMailConfiguration(env)).verification, 'unverified');
  } finally { globalThis.fetch = original; }
});

test('sender check: sending-only keys require a dashboard check and cannot be falsely labelled verified', async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => Response.json({ name: 'restricted_api_key', message: 'Only send permissions' }, { status: 401 });
    const result = await checkMailConfiguration({ get: (name) => name === 'RESEND_API_KEY' ? 're_private' : undefined });
    assert.equal(result.verification, 'requires_dashboard'); assert.equal(result.configured, true);
    assert.ok(!JSON.stringify(result).includes('re_private'));
  } finally { globalThis.fetch = original; }
});

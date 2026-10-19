// Run after deployment with CALENDLY_API_TOKEN and SUPABASE_URL in the environment.
// The PAT must be supplied to this process; Supabase does not expose secret values.
import { randomBytes } from 'node:crypto';

const token = process.env.CALENDLY_API_TOKEN;
const supabaseUrl = process.env.SUPABASE_URL;
if (!token || !supabaseUrl) throw new Error('Set CALENDLY_API_TOKEN and SUPABASE_URL.');
const callbackUrl = `${supabaseUrl.replace(/\/$/, '')}/functions/v1/calendly-webhook`;
async function api(path, options = {}) {
  const result = await fetch(`https://api.calendly.com${path}`, {
    ...options, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(15000),
  });
  if (!result.ok) throw new Error(`Calendly request failed (${result.status}). Check PAT scopes and plan access.`);
  return result.json();
}
const { resource: user } = await api('/users/me');
const query = new URLSearchParams({ organization: user.current_organization, user: user.uri, scope: 'user' });
let next = `/webhook_subscriptions?${query}`;
while (next) {
  const existing = await api(next);
  if (existing.collection?.some((item) => item.callback_url === callbackUrl && item.events?.includes('invitee.created') && item.state === 'active')) {
    console.log('An active invitee.created subscription already exists for this URL. Reuse its original CALENDLY_WEBHOOK_SECRET; no duplicate created.');
    process.exit(0);
  }
  const page = existing.pagination?.next_page;
  if (page && new URL(page).origin !== 'https://api.calendly.com') throw new Error('Unexpected pagination origin.');
  next = page ? `${new URL(page).pathname}${new URL(page).search}` : null;
}
// PAT subscriptions accept a caller-supplied signing_key. Keep it outside source control.
const signingKey = process.env.CALENDLY_WEBHOOK_SECRET || randomBytes(32).toString('base64url');
const created = await api('/webhook_subscriptions', {
  method: 'POST',
  body: JSON.stringify({ url: callbackUrl, events: ['invitee.created'], organization: user.current_organization, user: user.uri, scope: 'user', signing_key: signingKey }),
});
console.log(`Subscription: ${created.resource.uri}`);
console.log(`CALENDLY_WEBHOOK_SECRET=${created.resource.signing_key || signingKey}`);
console.log('Save this exact value in Supabase Edge Function Secrets before testing.');

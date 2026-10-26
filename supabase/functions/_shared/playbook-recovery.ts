import { HavenRequestError } from './haven-request.ts';
import { issuePlaybookAccess } from './playbook-access.js';

export const PLAYBOOK_AMOUNT_KOBO = 963900;
export function purchaseDetails(body: Record<string, unknown>) {
  const reference = typeof body.reference === 'string' ? body.reference.trim() : '';
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!/^UNSEEN_[A-Za-z0-9_-]{1,120}$/.test(reference) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    throw new HavenRequestError('Enter your checkout email and Paystack reference.');
  }
  return { reference, email };
}
export async function digest(value: string) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), b => b.toString(16).padStart(2, '0')).join('');
}
export function privateToken() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join('');
}
export function recoveryCode() {
  const bytes = new Uint32Array(1);
  do { crypto.getRandomValues(bytes); } while (bytes[0] >= 4294000000);
  return String(bytes[0] % 1000000).padStart(6, '0');
}
export async function codeHash(id: string, code: string, secret: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode('haven-recovery-v1:' + secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return Array.from(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(id + ':' + code))), b => b.toString(16).padStart(2, '0')).join('');
}
export async function limitRecovery(supabase: any, bucket: string, max: number, seconds = 3600) {
  const { data, error } = await supabase.rpc('consume_playbook_limit', { p_bucket: bucket, p_max: max, p_seconds: seconds });
  if (error) throw new HavenRequestError('Purchase security checks are unavailable. Please try again shortly.', 503);
  if (data !== true) throw new HavenRequestError('Too many attempts. Please wait before trying again.', 429);
}
export async function requestBucket(request: Request, secret: string) {
  const ip = request.headers.get('cf-connecting-ip') || request.headers.get('x-real-ip') || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  return codeHash('rate-limit', ip.slice(0, 200), secret);
}
export async function acceptedPaymentAmount(supabase: any, amount: unknown, paidAt: unknown) {
  if (amount === PLAYBOOK_AMOUNT_KOBO) return true;
  if (amount !== 10000) return false;
  // The cutoff is captured once by the migration, never reset on deployment.
  const { data, error } = await supabase.from('playbook_checkout_policy').select('legacy_cutover_at').eq('id', true).single();
  if (error || !data) throw new HavenRequestError('Payment policy is unavailable.', 503);
  const paid = typeof paidAt === 'string' ? Date.parse(paidAt) : NaN;
  return Number.isFinite(paid) && paid <= Date.parse(data.legacy_cutover_at);
}
export async function verifyPurchasePayment(supabase: any, reference: string, email: string) {
  const key = Deno.env.get('PAYSTACK_SECRET_KEY')?.trim();
  if (!key) throw new HavenRequestError('Payment verification is not configured.', 503);
  const response = await fetch('https://api.paystack.co/transaction/verify/' + encodeURIComponent(reference), {
    headers: { Authorization: 'Bearer ' + key }, signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) throw new HavenRequestError('Payment verification is temporarily unavailable.', 502);
  const payment = await response.json();
  const data = payment?.data;
  if (payment?.status !== true || data?.status !== 'success' || data.reference !== reference || data.currency !== 'NGN'
    || typeof data.customer?.email !== 'string' || data.customer.email.trim().toLowerCase() !== email) return false;
  return acceptedPaymentAmount(supabase, data.amount, data.paid_at || data.paidAt);
}
export async function hasDownloadGrant(supabase: any, reference: string, email: string, token: unknown) {
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) return false;
  const { data, error } = await supabase.from('playbook_download_grants').select('reference,email,expires_at,revoked_at')
    .eq('token_hash', await digest(token)).maybeSingle();
  if (error) throw new HavenRequestError('Purchase access is unavailable.', 503);
  return data && data.reference === reference && data.email === email && !data.revoked_at && Date.parse(data.expires_at) > Date.now();
}
export async function downloadResult(supabase: any, reference: string, secret: string) {
  const { data: bucket, error: bucketError } = await supabase.storage.getBucket('playbook-private');
  if (bucketError || !bucket || bucket.public !== false) throw new HavenRequestError('Private download is unavailable.', 503);
  const { data, error } = await supabase.storage.from('playbook-private').createSignedUrl('The_Unseen_Playbook.pdf', 600, { download: 'The_Unseen_Playbook.pdf' });
  if (error || !data?.signedUrl) throw new HavenRequestError('Download is unavailable. Your purchase is safe; please retry.', 503);
  return { ok: true, url: data.signedUrl, expiresIn: 600, playbookAccessToken: await issuePlaybookAccess(reference, secret) };
}

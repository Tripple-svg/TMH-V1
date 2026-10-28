import { requestBucket } from './playbook-recovery.ts';
export class AdminAuthError extends Error {
  status: number;
  constructor(message: string, status: number) { super(message); this.status = status; }
}
export function adminPasswordQuality(value: string) {
  // This is a configuration check, not a reason to lock an existing team out.
  // Prefer a long randomly generated secret; do not demand arbitrary symbols
  // from a human passphrase or treat composition as proof of entropy.
  const weak = value.length < 16 || /^(?:password|admin|haven|tmh|themarketinghaven|welcome|letmein|123456|qwerty)[\W\d_]*$/i.test(value)
    || /^(.)\1{7,}$/.test(value) || /^(.{1,4})\1{3,}$/.test(value);
  return { strong: !weak, recommendation: weak ? 'Replace ADMIN_PASSWORD with a unique randomly generated secret of at least 20 characters. This dashboard does not create visitor passwords.' : 'Keep this unique secret private and rotate it if exposed.' };
}
export async function authenticateAdmin(db: any, request: Request, serviceKey: string, supplied: unknown, expected: string) {
  const bucket = 'admin-auth:' + await requestBucket(request, serviceKey);
  const { data: lease, error } = await db.rpc('begin_admin_auth', { p_bucket: bucket });
  if (error || !lease) throw new AdminAuthError('Admin security checks are unavailable. Apply the security migration and retry.', 503);
  if (!lease.allowed) throw new AdminAuthError('Too many sign-in attempts. Please wait 10 minutes before trying again.', 429);
  const text = typeof supplied === 'string' && supplied.length <= 1024 ? supplied : '';
  const encoder = new TextEncoder();
  const [left, right] = await Promise.all([crypto.subtle.digest('SHA-256', encoder.encode(text)), crypto.subtle.digest('SHA-256', encoder.encode(expected))]);
  const a = new Uint8Array(left), b = new Uint8Array(right);
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a[i] ^ b[i];
  if (difference !== 0 || !expected) return false;
  const { data: released, error: releaseError } = await db.rpc('finish_admin_auth', { p_bucket: bucket, p_started_at: lease.started_at });
  if (releaseError || released !== true) throw new AdminAuthError('Admin security checks could not finish. Try again shortly.', 503);
  return true;
}

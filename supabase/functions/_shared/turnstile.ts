import { edgeClientAddress } from './edge-client-address.ts';
import { HavenRequestError } from './haven-request.ts';

export const TURNSTILE_ACTIONS = ['brand_review', 'support_request'] as const;
type TurnstileAction = typeof TURNSTILE_ACTIONS[number];

export async function verifyTurnstile(request: Request, token: unknown, action: TurnstileAction) {
  if (typeof token !== 'string' || !token.trim() || token.length > 2048) {
    throw new HavenRequestError('Complete the security check before continuing.', 400);
  }
  const secret = Deno.env.get('CLOUDFLARE_TURNSTILE_SECRET_KEY')?.trim();
  const allowed = (Deno.env.get('CLOUDFLARE_TURNSTILE_HOSTNAMES') ?? 'themarketinghaven.xyz,www.themarketinghaven.xyz')
    .split(',').map(host => host.trim().toLowerCase()).filter(Boolean);
  if (!secret || !allowed.length) throw new HavenRequestError('The security check is temporarily unavailable.', 503);
  const origin = request.headers.get('origin');
  const originHost = origin ? new URL(origin).hostname.toLowerCase() : null;
  const body = new URLSearchParams({ secret, response: token });
  const ip = edgeClientAddress(request);
  if (ip !== 'unknown') body.set('remoteip', ip);
  let result;
  try {
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST', body, signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw Error('siteverify');
    result = await response.json();
  } catch {
    throw new HavenRequestError('The security check is temporarily unavailable. Please try again.', 503);
  }
  const errors = Array.isArray(result?.['error-codes']) ? result['error-codes'] : [];
  if (errors.some((code: string) => ['internal-error', 'invalid-input-secret', 'missing-input-secret'].includes(code))) {
    throw new HavenRequestError('The security check is temporarily unavailable. Please try again.', 503);
  }
  const hostname = typeof result?.hostname === 'string' ? result.hostname.toLowerCase() : '';
  if (result?.success !== true || result.action !== action || !allowed.includes(hostname) || (originHost && hostname !== originHost)) {
    throw new HavenRequestError('Verification failed. Please try again.', 403);
  }
}

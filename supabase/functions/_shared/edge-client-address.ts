// Supabase's public ingress must overwrite this Cloudflare header. Never use
// caller-controlled X-Forwarded-For or X-Real-IP as a rate-limit identity.
// Without a valid ingress address all requests share one conservative bucket.
export function edgeClientAddress(request: Request): string {
  const value = request.headers.get('cf-connecting-ip')?.trim() || '';
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(value)) {
    const parts = value.split('.').map(Number);
    return parts.every(part => part <= 255) ? parts.join('.') : 'unknown';
  }
  if (value.includes(':') && /^[a-f\d:]+$/i.test(value) && value.length <= 39) {
    try { return new URL(`http://[${value}]/`).hostname.slice(1, -1); }
    catch { /* Invalid IPv6 must not create a new bucket. */ }
  }
  return 'unknown';
}

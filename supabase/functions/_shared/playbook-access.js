const REFERENCE = /^UNSEEN_[A-Za-z0-9_-]{1,120}$/;
const encoder = new TextEncoder();
const hex = (bytes) => Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
async function signingKey(secret, usage) {
  return crypto.subtle.importKey('raw', encoder.encode(`haven-playbook-access-v1:${secret}`), { name: 'HMAC', hash: 'SHA-256' }, false, [usage]);
}

// Issued only after Paystack confirms the payment and matching checkout email.
// The token is a private, seven-day bearer capability, never a prompt claim.
export async function issuePlaybookAccess(reference, secret, now = Date.now()) {
  if (!REFERENCE.test(reference) || !secret) throw new Error('Invalid purchase access');
  const payload = `v1.${reference}.${Math.floor(now / 1000) + 7 * 86400}`;
  return `${payload}.${hex(await crypto.subtle.sign('HMAC', await signingKey(secret, 'sign'), encoder.encode(payload)))}`;
}

export async function verifyPlaybookAccess(token, secret, now = Date.now()) {
  if (!secret || typeof token !== 'string' || token.length > 250) return false;
  const [version, reference, expiry, signature, extra] = token.split('.');
  if (version !== 'v1' || !REFERENCE.test(reference || '') || !/^\d{10}$/.test(expiry || '') || extra !== undefined || !/^[a-f0-9]{64}$/.test(signature || '')) return false;
  if (Number(expiry) <= now / 1000 || Number(expiry) > now / 1000 + 7 * 86400 + 60) return false;
  const bytes = Uint8Array.from(signature.match(/.{2}/g), (pair) => parseInt(pair, 16));
  return crypto.subtle.verify('HMAC', await signingKey(secret, 'verify'), bytes, encoder.encode(`${version}.${reference}.${expiry}`));
}

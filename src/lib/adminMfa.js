export class AdminMfaError extends Error {
  constructor(message) { super(message); this.name = 'AdminMfaError'; }
}
const problem = () => new AdminMfaError('Authenticator verification is unavailable. Try again, or contact the owner if you have lost your authenticator.');
export const verifiedTotpFactors = factors => (Array.isArray(factors) ? factors : []).filter(factor => factor.factor_type === 'totp' && factor.status === 'verified');

export async function readAdminMfa(auth) {
  // listFactors calls Auth rather than trusting factors cached in a session.
  // Keep the verified factors even at AAL2: a sensitive change can require a
  // fresh code without first downgrading the current session.
  const listed = await auth.mfa.listFactors();
  if (listed.error || !Array.isArray(listed.data?.all)) throw problem();
  const freshFactors = listed.data.all;
  const { data, error } = await auth.mfa.getAuthenticatorAssuranceLevel();
  if (error || !['aal1', 'aal2'].includes(data?.currentLevel) || !['aal1', 'aal2'].includes(data?.nextLevel)) throw problem();
  const factors = verifiedTotpFactors(freshFactors);
  const enrolled = freshFactors.some(factor => factor.status === 'verified');
  return { required: enrolled && data.currentLevel !== 'aal2', factors, currentLevel: data.currentLevel, enrolled };
}

export async function verifiedAdminForMfa(auth) {
  const result = await auth.getUser();
  if (result.error || result.data?.user?.app_metadata?.role !== 'admin' || result.data.user.deleted_at || (result.data.user.banned_until && Date.parse(result.data.user.banned_until) > Date.now())) throw problem();
  return result.data.user;
}

export async function verifyAdminTotp(auth, factorId, code) {
  if (typeof code !== 'string' || !/^\d{6}$/.test(code) || typeof factorId !== 'string' || !factorId) throw new AdminMfaError('Enter the six-digit code from your authenticator app.');
  await verifiedAdminForMfa(auth);
  const challenge = await auth.mfa.challenge({ factorId });
  if (challenge.error || !challenge.data?.id) throw problem();
  const verified = await auth.mfa.verify({ factorId, challengeId: challenge.data.id, code });
  if (verified.error) throw new AdminMfaError('The code could not be verified. Use the latest code from your authenticator and try again.');
  const user = await verifiedAdminForMfa(auth), state = await readAdminMfa(auth, user);
  if (state.currentLevel !== 'aal2') throw problem();
  const session = await auth.getSession(); if (session.error || !session.data?.session) throw problem();
  return session.data.session;
}

export async function listAdminTotp(auth) {
  await verifiedAdminForMfa(auth);
  const result = await auth.mfa.listFactors(); if (result.error) throw problem();
  return (result.data?.all || result.data?.totp || []).filter(factor => factor.factor_type === 'totp');
}
export function authenticatorQrImage(value) {
  if (typeof value !== 'string' || value.length > 150000) throw problem();
  if (value.trim().startsWith('<svg')) return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(value);
  if (/^data:image\/svg\+xml(?:;[^,]*)?,/i.test(value)) return value;
  throw problem();
}
export async function enrollAdminTotp(auth) {
  const user = await verifiedAdminForMfa(auth), state = await readAdminMfa(auth, user);
  if (state.required) throw problem();
  const result = await auth.mfa.enroll({ factorType: 'totp', friendlyName: 'TMH authenticator ' + new Date().toISOString() });
  if (result.error || !result.data?.id || !result.data.totp?.qr_code) throw problem();
  return { id: result.data.id, qr: authenticatorQrImage(result.data.totp.qr_code), secret: result.data.totp.secret || '' };
}
export async function removeAdminTotp(auth, factorId, verifierId, code) {
  const factors = await listAdminTotp(auth), factor = factors.find(item => item.id === factorId);
  if (!factor) throw problem();
  if (factor.status === 'verified') {
    if (!verifiedTotpFactors(factors).some(item => item.id === verifierId)) throw problem();
    await verifyAdminTotp(auth, verifierId, code);
  }
  const result = await auth.mfa.unenroll({ factorId }); if (result.error) throw problem();
  const refreshed = await auth.refreshSession(); if (refreshed.error) throw problem();
}

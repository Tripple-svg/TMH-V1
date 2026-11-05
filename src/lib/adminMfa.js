export class AdminMfaError extends Error {
  constructor(message, code='mfa_unavailable', operation='settings') { super(message); this.name = 'AdminMfaError'; this.code=code; this.operation=operation; }
}
const MESSAGES={
  session_expired:'Your session expired. Reload the page and sign in again before changing your authenticator.',
  session_not_found:'Your session expired. Reload the page and sign in again before changing your authenticator.',
  refresh_token_not_found:'Your session expired. Reload the page and sign in again before changing your authenticator.',
  bad_jwt:'Your session expired. Reload the page and sign in again before changing your authenticator.',
  mfa_factor_name_conflict:'An authenticator with this name already exists. Reload settings, remove any incomplete setup, then add it again.',
  mfa_disabled:'Authenticator setup is disabled for this project. Ask the owner to enable TOTP enrollment in Supabase Auth.',
  mfa_totp_enroll_not_enabled:'Authenticator setup is disabled for this project. Ask the owner to enable TOTP enrollment in Supabase Auth.',
  mfa_totp_verify_not_enabled:'Authenticator verification is disabled for this project. Contact the owner to restore TOTP verification.',
  too_many_enrolled_mfa_factors:'This account has reached its authenticator limit. Reload settings and remove an incomplete setup before adding another.',
  mfa_factor_not_found:'This authenticator is no longer available. Reload settings and choose an enabled authenticator.',
  mfa_challenge_expired:'This verification attempt expired. Enter the latest authenticator code and try again.',
  mfa_verification_failed:'The code could not be verified. Use the latest code from your authenticator and try again.',
  over_request_rate_limit:'Too many authenticator attempts. Wait a few minutes, then reload settings and try again.',
};
// Never interpolate provider messages, tokens, factor secrets or request bodies.
export function adminMfaFailure(error,operation='settings'){
  if(error?.name==='AdminMfaError')return error;
  if(Object.hasOwn(MESSAGES,error?.code))return new AdminMfaError(MESSAGES[error.code],error.code,operation);
  if(error?.status===401)return new AdminMfaError(MESSAGES.session_expired,'session_expired',operation);
  if(error?.status===429)return new AdminMfaError(MESSAGES.over_request_rate_limit,'over_request_rate_limit',operation);
  if(['AbortError','TimeoutError','AuthRetryableFetchError','TypeError'].includes(error?.name))return new AdminMfaError('The authenticator request could not reach the server. Check your connection, reload settings, then retry. An incomplete setup may already be saved.','mfa_network_error',operation);
  return new AdminMfaError(operation==='verify'?MESSAGES.mfa_verification_failed:'Authenticator verification is unavailable. Reload settings and try again. Contact the owner if the problem continues.','mfa_unavailable',operation);
}
const problem = () => adminMfaFailure(null);
async function checked(operation,action){
  try{const result=await action();if(result?.error)throw adminMfaFailure(result.error,operation);return result;}
  catch(error){throw adminMfaFailure(error,operation);}
}
export const verifiedTotpFactors = factors => (Array.isArray(factors) ? factors : []).filter(factor => factor.factor_type === 'totp' && factor.status === 'verified');

export async function readAdminMfa(auth) {
  // listFactors calls Auth rather than trusting factors cached in a session.
  // Keep the verified factors even at AAL2: a sensitive change can require a
  // fresh code without first downgrading the current session.
  const listed = await checked('settings',()=>auth.mfa.listFactors());
  if (listed.error || !Array.isArray(listed.data?.all)) throw problem();
  const freshFactors = listed.data.all;
  const { data, error } = await checked('settings',()=>auth.mfa.getAuthenticatorAssuranceLevel());
  if (error || !['aal1', 'aal2'].includes(data?.currentLevel) || !['aal1', 'aal2'].includes(data?.nextLevel)) throw problem();
  const factors = verifiedTotpFactors(freshFactors);
  const enrolled = freshFactors.some(factor => factor.status === 'verified');
  return { required: enrolled && data.currentLevel !== 'aal2', factors, currentLevel: data.currentLevel, enrolled };
}

export async function verifiedAdminForMfa(auth) {
  const result = await checked('settings',()=>auth.getUser());
  if (result.error || result.data?.user?.app_metadata?.role !== 'admin' || result.data.user.deleted_at || (result.data.user.banned_until && Date.parse(result.data.user.banned_until) > Date.now())) throw problem();
  return result.data.user;
}

export async function verifyAdminTotp(auth, factorId, code) {
  if (typeof code !== 'string' || !/^\d{6}$/.test(code) || typeof factorId !== 'string' || !factorId) throw new AdminMfaError('Enter the six-digit code from your authenticator app.');
  await verifiedAdminForMfa(auth);
  const challenge = await checked('verify',()=>auth.mfa.challenge({ factorId }));
  if (challenge.error || !challenge.data?.id) throw problem();
  const verified = await checked('verify',()=>auth.mfa.verify({ factorId, challengeId: challenge.data.id, code }));
  if (verified.error) throw new AdminMfaError('The code could not be verified. Use the latest code from your authenticator and try again.');
  const user = await verifiedAdminForMfa(auth), state = await readAdminMfa(auth, user);
  if (state.currentLevel !== 'aal2') throw problem();
  const session = await checked('settings',()=>auth.getSession()); if (session.error || !session.data?.session) throw problem();
  return session.data.session;
}

export async function listAdminTotp(auth) {
  await verifiedAdminForMfa(auth);
  const result = await checked('settings',()=>auth.mfa.listFactors()); if (result.error) throw problem();
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
  const result = await checked('enroll',()=>auth.mfa.enroll({ factorType: 'totp', friendlyName: 'TMH authenticator ' + new Date().toISOString() }));
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
  const result = await checked('settings',()=>auth.mfa.unenroll({ factorId })); if (result.error) throw problem();
  const refreshed = await checked('settings',()=>auth.refreshSession()); if (refreshed.error) throw problem();
}

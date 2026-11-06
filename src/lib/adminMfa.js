export class AdminMfaError extends Error {
  constructor(message, code='mfa_unavailable', operation='settings') { super(message); this.name = 'AdminMfaError'; this.code=code; this.operation=operation; }
}
const MESSAGES={
  session_expired:'Your session expired. Reload the page and sign in again before changing your authenticator.',
  session_not_found:'Your session expired. Reload the page and sign in again before changing your authenticator.',
  refresh_token_not_found:'Your session expired. Reload the page and sign in again before changing your authenticator.',
  bad_jwt:'Your session expired. Reload the page and sign in again before changing your authenticator.',
  mfa_factor_name_conflict:'An authenticator with this name already exists. Reload settings, remove any incomplete setup, then add it again.',
  mfa_disabled:'In the Supabase project dashboard, open Authentication > Multi-Factor Authentication. Enable App Authenticator (TOTP) enrollment and verification, save, then reload these settings. This is the project setting, not your personal Supabase account security.',
  mfa_totp_enroll_not_enabled:'In the Supabase project dashboard, open Authentication > Multi-Factor Authentication and enable App Authenticator (TOTP) enrollment. Save, then reload these settings and try again.',
  mfa_totp_verify_not_enabled:'In the Supabase project dashboard, open Authentication > Multi-Factor Authentication and enable App Authenticator (TOTP) verification. Save, then enter a new code here.',
  too_many_enrolled_mfa_factors:'This account has reached its authenticator limit. Reload settings and remove an incomplete setup before adding another.',
  mfa_factor_not_found:'This authenticator is no longer available. Reload settings and choose an enabled authenticator.',
  mfa_challenge_expired:'This verification attempt expired. Enter the latest authenticator code and try again.',
  mfa_ip_address_mismatch:'Finish authenticator setup on the same connection where you started it. If your mobile network or VPN changed, reload settings and start a new setup on a stable connection.',
  mfa_verification_failed:'The code could not be verified. Use the latest code from your authenticator and try again.',
  insufficient_aal:'Verify your enabled authenticator at sign-in, then return here. An enabled authenticator will not be removed automatically.',
  over_request_rate_limit:'Too many authenticator attempts. Wait a few minutes, then reload settings and try again.',
};
const providerCode=error=>typeof error?.code==='string'&&/^[a-z][a-z0-9_]{0,79}$/.test(error.code)?error.code:null;
function logFailure(error,operation){
  console.log('TMH authenticator request failed',{operation,code:providerCode(error)||'code_not_supplied',status:Number.isInteger(error?.status)?error.status:null});
}
// Never interpolate provider messages, tokens, factor secrets or request bodies.
export function adminMfaFailure(error,operation='settings'){
  if(error?.name==='AdminMfaError')return error;
  if(Object.hasOwn(MESSAGES,error?.code))return new AdminMfaError(MESSAGES[error.code],error.code,operation);
  if(error?.status===401)return new AdminMfaError(MESSAGES.session_expired,'session_expired',operation);
  if(error?.status===429)return new AdminMfaError(MESSAGES.over_request_rate_limit,'over_request_rate_limit',operation);
  if(['AbortError','TimeoutError','AuthRetryableFetchError','TypeError'].includes(error?.name))return new AdminMfaError('The authenticator request could not reach the server. Check your connection, reload settings, then retry. An incomplete setup may already be saved.','mfa_network_error',operation);
  return new AdminMfaError(operation==='verify'?MESSAGES.mfa_verification_failed:'Supabase could not complete this authenticator request. Reload settings and try again. The project owner can check Authentication > Multi-Factor Authentication and Authentication > Logs using the error code below.',providerCode(error)||'mfa_unavailable',operation);
}
export function adminMfaErrorText(error){const safe=adminMfaFailure(error);return safe.message+' Error code: '+safe.code+' ('+safe.operation+').';}
const problem = () => adminMfaFailure(null);
async function checked(operation,action){
  let result;
  try{result=await action();}catch(error){logFailure(error,operation);throw adminMfaFailure(error,operation);}
  if(result?.error){logFailure(result.error,operation);throw adminMfaFailure(result.error,operation);}
  return result;
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
  const initial=await verifiedAdminForMfa(auth);
  const refreshed=await checked('refresh',()=>auth.refreshSession());
  if(!refreshed?.data?.session)throw adminMfaFailure({code:'session_expired'},'refresh');
  const user=await verifiedAdminForMfa(auth);
  if(!initial.id||user.id!==initial.id)throw new AdminMfaError('Your signed-in account changed. Sign out and sign in to your admin account before adding an authenticator.','mfa_account_changed','refresh');
  const state = await readAdminMfa(auth, user);
  if (state.required) throw problem();
  const listed=await checked('cleanup',()=>auth.mfa.listFactors());
  if(!Array.isArray(listed.data?.all))throw problem();
  // listFactors is scoped to the current Auth user. Never remove a verified
  // factor or another factor type as a shortcut around enrollment failures.
  const incomplete=listed.data.all.filter(factor=>factor.factor_type==='totp'&&factor.status==='unverified');
  for(const factor of incomplete){
    if(typeof factor.id!=='string'||!factor.id)throw problem();
    await checked('cleanup',()=>auth.mfa.unenroll({factorId:factor.id}));
  }
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

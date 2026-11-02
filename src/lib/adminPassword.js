import {readAdminMfa} from './adminMfa.js';
export const ADMIN_RECOVERY_CONFIRMATION = 'If this email has an account, a password reset link will arrive shortly. Check your spam folder too. Use the newest link once; it expires according to our sign-in security settings.';

export class AdminPasswordError extends Error {
  constructor(code, message) { super(message); this.name = 'AdminPasswordError'; this.code = code; }
}

// Capture only the outcome/type, never the credentials in an Auth callback URL.
export function readAdminAuthLink(href = '') {
  try {
    const url = new URL(href);
    const fragment = new URLSearchParams(url.hash.slice(1));
    const error = fragment.get('error_code') || url.searchParams.get('error_code') || fragment.get('error') || url.searchParams.get('error') || fragment.get('error_description') || url.searchParams.get('error_description');
    const callbackCredentials = Boolean(fragment.get('access_token')?.trim() && fragment.get('refresh_token')?.trim());
    return {
      problem: error ? error === 'otp_expired' ? 'expired' : 'invalid' : null,
      change: url.searchParams.get('flow') === 'change',
      type: callbackCredentials && ['recovery', 'invite'].includes(fragment.get('type')) ? fragment.get('type') : null,
    };
  } catch { return { problem: null, change: false, type: null }; }
}

export function adminLinkError(problem) {
  return problem === 'expired'
    ? 'This link has expired or has already been used. Request a fresh password reset from Team sign-in, then open only the newest email.'
    : 'This link could not be verified. Return to Team sign-in to request a fresh password reset. If this is your first invitation, ask the owner to check your account.';
}

export async function requestAdminPasswordReset(auth, email, origin) {
  const address = String(email || '').trim();
  if (address.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
    throw new AdminPasswordError('invalid_email', 'Enter a valid email address.');
  }
  const redirectTo = new URL('/admin/accept-invite', origin).href;
  const { error } = await auth.resetPasswordForEmail(address, { redirectTo });
  if (error) {
    if (error.status === 429 || error.code === 'over_email_send_rate_limit' || error.code === 'over_request_rate_limit') {
      throw new AdminPasswordError('rate_limited', 'Too many reset requests. Wait a few minutes before trying again.');
    }
    throw new AdminPasswordError('unavailable', 'Password reset is temporarily unavailable. Try again later or contact the owner.');
  }
  // Do not disclose whether the address belongs to an admin (or any account).
  return ADMIN_RECOVERY_CONFIRMATION;
}

export async function verifiedPasswordAdmin(auth) {
  const { data, error } = await auth.getSession();
  if (error || !data?.session) throw new AdminPasswordError('session_missing', 'Open the newest invitation or reset link, or sign in before changing your password.');
  const result = await auth.getUser(data.session.access_token);
  if (result.error || !result.data?.user) throw new AdminPasswordError('session_missing', 'Your sign-in session is no longer valid. Request a fresh password reset.');
  if (result.data.user.app_metadata?.role !== 'admin' || result.data.user.deleted_at || (result.data.user.banned_until && Date.parse(result.data.user.banned_until) > Date.now())) throw new AdminPasswordError('not_admin', 'This account has not been granted admin access. Contact the owner.');
  return result.data.user;
}

export async function saveAdminPassword(auth, { password, confirmation, currentPassword, requireCurrentPassword = false }) {
  if (typeof password !== 'string' || password.length < 15 || password.length > 128 || password !== confirmation) {
    throw new AdminPasswordError('invalid_password', 'Use 15–128 characters and enter the same new password twice.');
  }
  const user = await verifiedPasswordAdmin(auth);
  const mfa=await readAdminMfa(auth,user),hasMfa=mfa.enrolled;
  if(mfa.required)throw new AdminPasswordError('mfa_required','Verify your authenticator before changing the password.');
  if (requireCurrentPassword&&!hasMfa) {
    if (!currentPassword) throw new AdminPasswordError('current_password', 'Enter your current password to confirm this change.');
    const result = await auth.signInWithPassword({ email: user.email, password: currentPassword });
    if (result.error || !result.data?.session) throw new AdminPasswordError('current_password', 'Your current password could not be verified. Try again or use Forgot password from Team sign-in.');
    if (result.data.user?.id !== user.id || result.data.user?.app_metadata?.role !== 'admin') {
      await auth.signOut({ scope: 'local' });
      throw new AdminPasswordError('session_missing', 'Your account could not be verified. Sign in again.');
    }
  }
  // A password sign-in would replace the AAL2 session with AAL1. MFA accounts
  // confirm with their authenticator in the page and keep that verified session;
  // pass current_password through for projects that enforce it in Auth.
  const { error } = await auth.updateUser({ password,...(requireCurrentPassword&&hasMfa&&currentPassword?{current_password:currentPassword}:{}) });
  if (!error) return;
  if (error.code === 'same_password') throw new AdminPasswordError('invalid_password', 'Choose a new password that differs from your current password.');
  if (error.code === 'weak_password') throw new AdminPasswordError('invalid_password', 'Choose a longer unique password that meets the account security requirements.');
  if (['reauthentication_needed', 'reauthentication_not_valid', 'session_not_found', 'refresh_token_not_found'].includes(error.code) || error.status === 401) {
    throw new AdminPasswordError('session_missing', 'Your sign-in must be renewed. Request a fresh password reset from Team sign-in.');
  }
  throw new AdminPasswordError('unavailable', 'The password could not be saved. Try again shortly.');
}

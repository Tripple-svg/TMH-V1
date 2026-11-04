import { useEffect, useRef, useState } from 'react';
import {readAdminLockout,recordAdminFailure,clearAdminLockout} from '../../lib/adminLockout';
import { adminSupabase } from '../../lib/adminAuth';
import { requestAdminPasswordReset } from '../../lib/adminPassword';
import {readAdminMfa,verifiedAdminForMfa} from '../../lib/adminMfa';
import AdminMfaChallenge from './AdminMfaChallenge';

export default function AdminSignIn({ onAuth }) {
  const [email, setEmail] = useState(''), [password, setPassword] = useState('');
  const [checking, setChecking] = useState(false), [error, setError] = useState('');
  const [recovering, setRecovering] = useState(false), [notice, setNotice] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const [challenge,setChallenge]=useState(null);
  const [locked,setLocked]=useState(()=>readAdminLockout().remaining);
  const submitLock=useRef(false);
  useEffect(()=>{const refresh=()=>setLocked(readAdminLockout().remaining);const timer=setInterval(refresh,1000);window.addEventListener('storage',refresh);return()=>{clearInterval(timer);window.removeEventListener('storage',refresh);};},[]);
  useEffect(()=>{let live=true;void adminSupabase.auth.getSession().then(async({data})=>{if(!data?.session)return;const user=await adminSupabase.auth.getUser(data.session.access_token);if(user.error||user.data?.user?.app_metadata?.role!=='admin')return;const state=await readAdminMfa(adminSupabase.auth,user.data.user);if(live&&state.required)setChallenge(state);}).catch(()=>{if(live)setError('Your sign-in security could not be checked. Please try again.');});return()=>{live=false;};},[]);
  useEffect(() => {
    if (!cooldown) return;
    const timer = setTimeout(() => setCooldown(value => Math.max(0, value - 1)), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);
  const submit = async event => {
    event.preventDefault();
    if (submitLock.current || checking || (recovering ? cooldown : readAdminLockout().remaining)) return;
    submitLock.current=true;
    setChecking(true); setError(''); setNotice('');
    try {
      if (recovering) {
        const message = await requestAdminPasswordReset(adminSupabase.auth, email, window.location.origin);
        setNotice(message); setCooldown(60); return;
      }
      const { data, error } = await adminSupabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error || !data?.session || data.user?.app_metadata?.role !== 'admin') {
        const attempt=recordAdminFailure(error||{code:'invalid_credentials'});setLocked(attempt.remaining);
        if (data?.session) await adminSupabase.auth.signOut({ scope: 'local' });
        setError('Unable to sign in with these credentials. Please check your details or contact the team.'); return;
      }
      setPassword('');
      clearAdminLockout();setLocked(0);
      const user=await verifiedAdminForMfa(adminSupabase.auth);
      const mfa=await readAdminMfa(adminSupabase.auth,user);
      if(mfa.required){setChallenge(mfa);return;}
      onAuth(data.session.access_token);
    } catch (failure) {
      if(!recovering)setLocked(recordAdminFailure(failure).remaining);
      setError(recovering && failure?.name === 'AdminPasswordError' ? failure.message : recovering ? 'Password reset is temporarily unavailable. Please try again shortly.' : 'Sign-in is temporarily unavailable. Please try again shortly.');
      if (failure?.code === 'rate_limited') setCooldown(60);
    } finally { submitLock.current=false;setChecking(false); }
  };
  const toggleRecovery = () => { setRecovering(value => !value); setPassword(''); setError(''); setNotice(''); };
  if(challenge)return <main className="grid min-h-screen place-items-center bg-zinc-950 p-4 text-zinc-100"><section className="w-full max-w-sm rounded-2xl border border-white/10 bg-white/[0.025] p-6 sm:p-8"><AdminMfaChallenge onRecovered={async()=>{try{await adminSupabase.auth.signOut({scope:"local"});}finally{setChallenge(null);setPassword("");setNotice("Recovery complete. Sign in again, then add a new authenticator in Security & AI.");}}} factors={challenge.factors} onVerified={session=>{setChallenge(null);onAuth(session.access_token);}} onCancel={async()=>{await adminSupabase.auth.signOut({scope:'local'});setChallenge(null);setPassword('');}}/></section></main>;
  return <main className="grid min-h-screen place-items-center bg-zinc-950 p-4 text-zinc-100"><form onSubmit={submit} className="w-full max-w-sm rounded-2xl border border-white/10 bg-white/[0.025] p-6 sm:p-8">
    <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">The Marketing Haven</p>
    <h1 className="mt-4 text-2xl font-semibold">{recovering ? 'Reset your password' : 'Team sign-in'}</h1>
    <p className="mt-2 text-sm leading-relaxed text-zinc-400">{recovering ? 'Enter the email used for your team account. We will send a secure link to set a new password.' : 'Use your invited admin account to open the workspace.'}</p>
    <label className="mt-6 block text-xs text-zinc-400">Email<input autoFocus type="email" required maxLength={254} autoComplete="username" value={email} onChange={event => setEmail(event.target.value)} className="mt-2 block w-full rounded-lg border border-white/10 bg-black/20 p-3 text-sm text-zinc-100" /></label>
    {!recovering && <label className="mt-4 block text-xs text-zinc-400">Password<input type="password" required autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} className="mt-2 block w-full rounded-lg border border-white/10 bg-black/20 p-3 text-sm text-zinc-100" /></label>}
    {error && <p role="alert" className="mt-4 text-sm text-red-300">{error}</p>}
    {notice && <p role="status" className="mt-4 text-sm leading-relaxed text-zinc-300">{notice}</p>}
    {!recovering&&locked>0&&<p role="alert" className="mt-4 text-sm text-amber-200">Sign-in paused after repeated attempts. Try again in {Math.ceil(locked/60)} minutes.</p>}
    <button disabled={checking || !email.trim() || (recovering ? cooldown > 0 : !password||locked>0)} className="mt-6 w-full rounded-lg bg-zinc-100 p-3 text-sm font-medium text-zinc-950 disabled:opacity-40">{checking ? recovering ? 'Requesting link…' : 'Signing in…' : recovering ? cooldown ? `Request again in ${cooldown}s` : 'Send reset link' : 'Sign in'}</button>
    <button type="button" disabled={checking} onClick={toggleRecovery} className="mt-4 block w-full py-2 text-sm text-zinc-400 underline decoration-zinc-700 underline-offset-4 hover:text-zinc-100 disabled:opacity-40">{recovering ? 'Back to sign-in' : 'Forgot password?'}</button>
    {recovering && <p className="mt-3 text-xs leading-relaxed text-zinc-500">A reset link does not grant admin access. If your invitation or reset email does not arrive, <a href="mailto:info@themarketinghaven.xyz?subject=Admin%20account%20access" className="text-zinc-300 underline underline-offset-2">contact the owner</a>.</p>}
  </form></main>;
}

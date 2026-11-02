import { useEffect, useState } from 'react';
import { adminSupabase, initialAdminAuthLink } from '../lib/adminAuth';
import { adminLinkError, saveAdminPassword, verifiedPasswordAdmin } from '../lib/adminPassword';
import {readAdminMfa} from '../lib/adminMfa';
import AdminMfaChallenge from '../components/admin/AdminMfaChallenge';

export default function AdminInvitePage() {
  const [ready, setReady] = useState(false), [error, setError] = useState(''), [saved, setSaved] = useState(false);
  const [password, setPassword] = useState(''), [confirmation, setConfirmation] = useState(''), [busy, setBusy] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [challenge,setChallenge]=useState(null);
  const changing = initialAdminAuthLink.change || !initialAdminAuthLink.type;
  useEffect(() => {
    let live = true;
    if (initialAdminAuthLink.problem) {
      // The invalid callback takes precedence over a session left in this tab.
      Promise.resolve().then(() => { if (live) setError(adminLinkError(initialAdminAuthLink.problem)); });
      return () => { live = false; };
    }
    void verifiedPasswordAdmin(adminSupabase.auth)
      .then(async user => {const mfa=await readAdminMfa(adminSupabase.auth,user);if(live){if(mfa.required||(changing&&mfa.enrolled))setChallenge(mfa);else setReady(true);}})
      .catch(failure => { if (live) setError(failure?.name === 'AdminPasswordError' ? failure.message : 'Account verification is temporarily unavailable. Please try again shortly.'); });
    return () => { live = false; };
  }, [changing]);
  const submit = async event => {
    event.preventDefault(); if (busy) return;
    setBusy(true); setError('');
    try {
      await saveAdminPassword(adminSupabase.auth, { password, confirmation, currentPassword, requireCurrentPassword: changing });
      setPassword(''); setConfirmation(''); setCurrentPassword(''); setSaved(true);
    } catch (failure) {
      setError(failure?.name === 'AdminPasswordError' ? failure.message : 'The password could not be saved. Please try again shortly.');
      if (['session_missing', 'not_admin'].includes(failure?.code)) setReady(false);
      if(failure?.code==='mfa_required'){
        setReady(false);
        try{const user=await verifiedPasswordAdmin(adminSupabase.auth);setChallenge(await readAdminMfa(adminSupabase.auth,user));}
        catch{setError('Authenticator verification could not be loaded. Return to Team sign-in to retry.');}
      }
    } finally { setBusy(false); }
  };
  return <main className="grid min-h-screen place-items-center bg-zinc-950 px-4 py-8 text-zinc-100"><section className="w-full max-w-md rounded-2xl border border-white/10 p-7">
    <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">The Marketing Haven</p>
    <h1 className="mt-4 text-2xl font-medium">{changing ? 'Change your password' : 'Set your team password'}</h1>
    <p className="mt-3 text-sm leading-relaxed text-zinc-400">{changing ? 'Confirm your current password, then choose a unique new password.' : 'Use a unique password of at least 15 characters. Your account must already have admin access.'}</p>
    {error && <p role="alert" className="mt-5 text-sm text-red-300">{error}</p>}
    {challenge?<div className="mt-6"><AdminMfaChallenge factors={challenge.factors} onVerified={()=>{setChallenge(null);setReady(true);setError('');}} onCancel={async()=>{await adminSupabase.auth.signOut({scope:'local'});setChallenge(null);setReady(false);setError('You have signed out. Return to Team sign-in to continue.');}}/></div>:saved ? <p role="status" className="mt-5">Your password is saved. <a href="/admin" className="underline underline-offset-4">Open the admin workspace</a>.</p> : ready ? <form onSubmit={submit} className="mt-6 space-y-4">
      {changing && <label className="block text-sm">Current password<input type="password" autoComplete="current-password" required value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} className="mt-2 w-full rounded-lg border border-white/10 bg-black/20 p-3" /></label>}
      <label className="block text-sm">New password<input type="password" autoComplete="new-password" minLength={15} maxLength={128} required value={password} onChange={event => setPassword(event.target.value)} className="mt-2 w-full rounded-lg border border-white/10 bg-black/20 p-3" /></label>
      <label className="block text-sm">Confirm new password<input type="password" autoComplete="new-password" minLength={15} maxLength={128} required value={confirmation} onChange={event => setConfirmation(event.target.value)} className="mt-2 w-full rounded-lg border border-white/10 bg-black/20 p-3" /></label>
      <button disabled={busy} className="w-full rounded-lg bg-zinc-100 px-4 py-3 text-zinc-950 disabled:opacity-40">{busy ? 'Saving…' : 'Save password'}</button>
    </form> : !error && <p role="status" className="mt-5">Checking your secure link…</p>}
    {!saved && <a href="/admin" className="mt-6 inline-block py-2 text-sm text-zinc-400 underline underline-offset-4">{ready ? 'Back to workspace' : 'Return to Team sign-in'}</a>}
    {error && <p className="mt-3 text-xs leading-relaxed text-zinc-500">Do not forward invitation links or reset emails. <a href="mailto:info@themarketinghaven.xyz?subject=Admin%20account%20access" className="text-zinc-300 underline">Contact the owner</a> if access still fails.</p>}
  </section></main>;
}

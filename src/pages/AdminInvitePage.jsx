import { useEffect,useState } from 'react';
import { adminSupabase } from '../lib/adminAuth';

export default function AdminInvitePage(){
  const [ready,setReady]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState(false);
  const [password,setPassword]=useState(''),[confirmation,setConfirmation]=useState(''),[busy,setBusy]=useState(false);
  useEffect(()=>{let live=true;void adminSupabase.auth.getSession().then(async({data})=>{
    if(!data.session)throw Error('Open the latest invitation link from your inbox.');
    const result=await adminSupabase.auth.getUser(data.session.access_token);
    if(result.error||result.data.user?.app_metadata?.role!=='admin')throw Error('This account has not been granted admin access. Contact the owner.');
    if(live)setReady(true);
  }).catch(failure=>{if(live)setError(failure.message);});return()=>{live=false;};},[]);
  const submit=async event=>{event.preventDefault();if(password.length<15||password!==confirmation){setError('Use at least 15 characters and enter the same password twice.');return;}
    setBusy(true);setError('');try{const {error}=await adminSupabase.auth.updateUser({password});if(error)throw error;setPassword('');setConfirmation('');setSaved(true);}catch{setError('The password could not be saved. Use a longer unique password or request a fresh invitation.');}finally{setBusy(false);}};
  return <main className="grid min-h-screen place-items-center bg-zinc-950 px-4 text-zinc-100"><section className="w-full max-w-md rounded-2xl border border-white/10 p-7"><h1 className="text-2xl font-medium">Set up your team account</h1>{error&&<p role="alert" className="mt-5 text-sm text-red-300">{error}</p>}{saved?<p role="status" className="mt-5">Your password is saved. <a href="/admin" className="underline">Open the admin workspace</a>.</p>:ready?<form onSubmit={submit} className="mt-6 space-y-4"><label className="block text-sm">New password<input type="password" autoComplete="new-password" minLength={15} required value={password} onChange={event=>setPassword(event.target.value)} className="mt-2 w-full rounded-lg border border-white/10 bg-black/20 p-3"/></label><label className="block text-sm">Confirm password<input type="password" autoComplete="new-password" required value={confirmation} onChange={event=>setConfirmation(event.target.value)} className="mt-2 w-full rounded-lg border border-white/10 bg-black/20 p-3"/></label><button disabled={busy} className="rounded-lg bg-zinc-100 px-4 py-3 text-zinc-950 disabled:opacity-40">{busy?'Saving…':'Save password'}</button></form>:!error&&<p role="status" className="mt-5">Checking your invitation…</p>}</section></main>;
}

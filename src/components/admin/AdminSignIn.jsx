import { useState } from 'react';
import { adminSupabase } from '../../lib/adminAuth';

export default function AdminSignIn({onAuth}){
  const [email,setEmail]=useState(''),[password,setPassword]=useState('');
  const [checking,setChecking]=useState(false),[error,setError]=useState('');
  const submit=async event=>{
    event.preventDefault();if(checking)return;setChecking(true);setError('');
    try{
      const {data,error}=await adminSupabase.auth.signInWithPassword({email:email.trim(),password});
      if(error||!data.session||data.user?.app_metadata?.role!=='admin'){
        if(data.session)await adminSupabase.auth.signOut({scope:'local'});
        setError('Unable to sign in with these credentials. Please check your details or contact the team.');return;
      }
      setPassword('');onAuth(data.session.access_token);
    }catch{setError('Sign-in is temporarily unavailable. Please try again shortly.');}
    finally{setChecking(false);}
  };
  return <main className="grid min-h-screen place-items-center bg-zinc-950 p-4 text-zinc-100"><form onSubmit={submit} className="w-full max-w-sm rounded-2xl border border-white/10 bg-white/[0.025] p-6 sm:p-8">
    <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">The Marketing Haven</p><h1 className="mt-4 text-2xl font-semibold">Team sign-in</h1><p className="mt-2 text-sm leading-relaxed text-zinc-400">Use your invited admin account to open the workspace.</p>
    <label className="mt-6 block text-xs text-zinc-400">Email<input autoFocus type="email" required autoComplete="username" value={email} onChange={event=>setEmail(event.target.value)} className="mt-2 block w-full rounded-lg border border-white/10 bg-black/20 p-3 text-sm text-zinc-100"/></label>
    <label className="mt-4 block text-xs text-zinc-400">Password<input type="password" required autoComplete="current-password" value={password} onChange={event=>setPassword(event.target.value)} className="mt-2 block w-full rounded-lg border border-white/10 bg-black/20 p-3 text-sm text-zinc-100"/></label>
    {error&&<p role="alert" className="mt-4 text-sm text-red-300">{error}</p>}<button disabled={checking||!email.trim()||!password} className="mt-6 w-full rounded-lg bg-zinc-100 p-3 text-sm font-medium text-zinc-950 disabled:opacity-40">{checking?'Signing in…':'Sign in'}</button>
  </form></main>;
}

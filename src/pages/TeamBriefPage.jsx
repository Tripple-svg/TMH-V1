import { useCallback, useEffect, useRef, useState } from 'react';

export default function TeamBriefPage() {
  const [token] = useState(()=>new URLSearchParams(window.location.hash.slice(1)).get('token')||'');
  const [result,setResult]=useState(null);
  const [error,setError]=useState(()=>token?'':'Open the private link in your assignment email.');
  const [busy,setBusy]=useState(()=>Boolean(token));
  const alive=useRef(true);
  const load=useCallback(async(action='read')=>{
    setBusy(true);setError('');
    try{
      const response=await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/read-team-assignment`,{
        method:'POST',headers:{'Content-Type':'application/json',apikey:import.meta.env.VITE_SUPABASE_ANON_KEY},
        body:JSON.stringify({action,token}),referrerPolicy:'no-referrer',cache:'no-store',signal:AbortSignal.timeout(15000)});
      const body=await response.json();
      if(!response.ok||!body.ok)throw new Error(body.error||'The brief could not load.');
      if(alive.current)setResult(body);
    }catch(failure){if(alive.current){setResult(null);setError(failure.message||'The brief could not load.');}}
    finally{if(alive.current)setBusy(false);}
  },[token]);
  useEffect(()=>{
    alive.current=true;
    // Keep the credential out of referrers and the address bar after entry.
    window.history.replaceState(null,'',window.location.pathname);
    const tags=[['robots','noindex, nofollow'],['referrer','no-referrer']].map(([name,content])=>{const tag=document.createElement('meta');tag.name=name;tag.content=content;document.head.appendChild(tag);return tag;});
    const timer=window.setTimeout(()=>{if(token)load();},0);
    return()=>{alive.current=false;window.clearTimeout(timer);tags.forEach(tag=>tag.remove());};
  // The token belongs to this visit; it is never stored or sent to analytics.
  },[token,load]);
  const brief=result?.brief,assignment=result?.assignment;
  return <main className="min-h-screen bg-zinc-950 px-4 py-10 text-zinc-100 sm:py-16">
    <section className="mx-auto max-w-2xl rounded-2xl border border-white/10 bg-white/[0.025] p-5 sm:p-8">
      <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-zinc-400">The Marketing Haven · Private team brief</p>
      <h1 className="mt-4 text-2xl font-medium tracking-tight">{brief?.kind==='inquiry'?'Your inquiry assignment':'Prepare for your client conversation'}</h1>
      {busy&&<p role="status" className="mt-6 text-sm text-zinc-400">Loading saved details…</p>}
      {error&&<div className="mt-6 space-y-3"><p role="alert" className="text-sm text-zinc-300">{error}</p>{token&&<button type="button" disabled={busy} onClick={()=>load()} className="text-sm underline">Try again</button>}</div>}
      {brief&&<div className="mt-7 space-y-6 text-sm">
        <p>Assigned to {assignment.assigneeName}.</p>
        <dl className="space-y-4">{[['Client',brief.clientName],['Email',brief.clientEmail],['Brand',brief.brand],['Service',brief.service],['When',brief.meetingTime],['Status',brief.status],['Goal',brief.goal]].filter(([,value])=>value).map(([label,value])=><div key={label}><dt className="text-xs text-zinc-500">{label}</dt><dd className="mt-1 whitespace-pre-wrap break-words leading-relaxed">{value}</dd></div>)}</dl>
        {assignment.preparationNote&&<div className="rounded-xl border border-white/10 p-4"><h2 className="text-xs text-zinc-400">Preparation note</h2><p className="mt-3 whitespace-pre-wrap break-words leading-relaxed">{assignment.preparationNote}</p></div>}
        {brief.meetingLinkNote&&<p className="text-xs leading-relaxed text-zinc-400">{brief.meetingLinkNote}</p>}
        {['canceled','cancelled'].includes(brief.status)?<p role="alert" className="text-amber-200">This meeting has been cancelled. Check with the organizer before taking action.</p>:assignment.acknowledgedAt?<p role="status" className="text-zinc-300">You acknowledged this assignment on {new Date(assignment.acknowledgedAt).toLocaleString()}.</p>:<button type="button" disabled={busy} onClick={()=>load('acknowledge')} className="rounded-lg bg-zinc-100 px-4 py-3 font-medium text-zinc-950 disabled:opacity-40">Acknowledge assignment</button>}
        <p className="border-t border-white/10 pt-5 text-xs leading-relaxed text-zinc-500">Keep this link private. Access expires {new Date(assignment.expiresAt).toLocaleString()} and may be withdrawn earlier. For changes, contact <a href="mailto:info@themarketinghaven.xyz" className="underline">Team Haven</a>. Reloading requires reopening the email link.</p>
      </div>}
    </section>
  </main>;
}

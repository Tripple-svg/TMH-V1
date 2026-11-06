import {useState} from 'react';

export default function ReviewDetailsEditor({profile,onSave,onClose}){
  const [details,setDetails]=useState({name:profile.name||'',brandName:profile.brandName||'',whatsapp:profile.whatsapp||'',mainGoal:profile.mainGoal||''});
  const [restart,setRestart]=useState(false),[confirmed,setConfirmed]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const save=async event=>{
    event.preventDefault();if(busy||restart&&!confirmed)return;
    setBusy(true);setError('');
    try{await onSave(details,{restart});onClose();}catch(failure){setError(failure.message||'Your changes could not be saved. Try again or contact Support.');}finally{setBusy(false);}
  };
  return <form onSubmit={save} aria-label="Edit review details" className="space-y-4 rounded-2xl border border-white/15 bg-zinc-900 p-4">
    <h2 className="text-base font-medium text-white">Edit your review details</h2>
    <p className="text-xs leading-6 text-zinc-300">Correct these details so Haven uses the right information. Your review email stays the same. Use Review source to replace a website or screenshot.</p>
    {[['name','Your name',120],['brandName','Brand name',200],['whatsapp','WhatsApp number',40],['mainGoal','What would you like help with?',500]].map(([key,label,max])=><label key={key} className="block text-sm text-zinc-200">{label}<input value={details[key]} disabled={busy} required={key!=='mainGoal'} maxLength={max} type={key==='whatsapp'?'tel':'text'} autoComplete={key==='name'?'name':key==='whatsapp'?'tel':'off'} onChange={event=>setDetails(previous=>({...previous,[key]:event.target.value}))} className="mt-2 min-h-11 w-full min-w-0 rounded-lg border border-white/20 bg-zinc-950 px-3 py-2 text-base disabled:opacity-50"/></label>)}
    <label className="flex items-start gap-3 text-sm leading-6 text-zinc-200"><input type="checkbox" checked={restart} disabled={busy} onChange={event=>{setRestart(event.target.checked);setConfirmed(false);}} className="mt-1 h-4 w-4 shrink-0"/>Restart this review conversation</label>
    {restart&&<div className="rounded-xl border border-amber-200/20 p-3 text-xs leading-6 text-zinc-300"><p>This clears the saved Brand Review conversation and its diagnosis so you can begin again. It keeps your review access, website or screenshot, purchase and booking. Usage limits and safety restrictions still apply.</p><label className="mt-3 flex items-start gap-3"><input type="checkbox" checked={confirmed} disabled={busy} onChange={event=>setConfirmed(event.target.checked)} className="mt-1 h-4 w-4 shrink-0"/>I understand and want to restart this conversation.</label></div>}
    {error&&<div role="alert" className="text-xs leading-6 text-red-200"><p>{error}</p><a href="/support?issue=review_access" className="underline">Get help from the team</a></div>}
    <div className="flex flex-wrap gap-3"><button type="submit" disabled={busy||restart&&!confirmed} className="min-h-11 rounded-lg bg-white px-4 py-2 text-sm text-zinc-950 disabled:opacity-40">{busy?'Saving…':restart?'Save and restart':'Save changes'}</button><button type="button" disabled={busy} onClick={onClose} className="min-h-11 rounded-lg border border-white/20 px-4 py-2 text-sm text-zinc-200 disabled:opacity-40">Back to chat</button></div>
  </form>;
}

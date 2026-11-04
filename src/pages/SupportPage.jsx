import {useRef,useState} from 'react';
import {Link,useLocation} from 'react-router-dom';
import {supportPrefill} from '../lib/supportPrefill';
import HCaptcha from '@hcaptcha/react-hcaptcha';
import {supabase} from '../lib/supabase';
import {getHavenIdentity} from '../lib/havenIdentity';
import {TMH_CONTACT} from '../lib/tmhPublicInfo';
import {ArrowLeft, ArrowUpRight, BookOpen, CalendarDays, CheckCircle2, FileSearch, LifeBuoy, LockKeyhole, Mail, MessageSquare, ShieldCheck} from 'lucide-react';

const CATEGORIES=[
  ['review_access','My saved review','I cannot open my review, or something needs correcting.',FileSearch],
  ['rate_limit','A limit or blocked attempt','I see a limit, cooldown or restriction message.',ShieldCheck],
  ['purchase','My playbook purchase','I need help with a payment, receipt or download.',BookOpen],
  ['booking','My meeting or booking','I need help with an invitation or meeting time.',CalendarDays],
  ['other','Something else','My question does not fit the choices above.',MessageSquare],
];
export default function SupportPage(){
  const location=useLocation();
  const initial=supportPrefill(location.search);
  const [category,setCategory]=useState(initial.category);
  const [name,setName]=useState(''),[email,setEmail]=useState(''),[message,setMessage]=useState(initial.message),[agreed,setAgreed]=useState(false);
  const [captcha,setCaptcha]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[reference,setReference]=useState('');
  const captchaRef=useRef(null),submitLock=useRef(false);
  const submit=async event=>{
    event.preventDefault();if(submitLock.current)return;
    if(!captcha){setError('Complete the security check before sending.');return;}
    submitLock.current=true;setBusy(true);setError('');
    try{
      const {data,error:failure}=await supabase.functions.invoke('support-request',{body:{category,name:name.trim(),email:email.trim(),message:message.trim(),agreed,captchaToken:captcha,...getHavenIdentity()}});
      let diagnostic=data;
      if(failure?.context instanceof Response)diagnostic=await failure.context.clone().json().catch(()=>null);
      if(failure||data?.ok!==true)throw Error(diagnostic?.error||'Your request could not be confirmed. Please retry or email us.');
      setReference(data.reference);setMessage('');
    }catch(failure){setError(failure.message||'Support is unavailable. Email us instead.');}
    finally{setCaptcha(null);captchaRef.current?.resetCaptcha();submitLock.current=false;setBusy(false);}
  };
  const field='mt-2 w-full rounded-xl border border-zinc-200 bg-white/60 px-4 py-3 text-base text-zinc-950 outline-none transition-colors placeholder:text-zinc-400 focus:border-zinc-500 focus:ring-2 focus:ring-zinc-500/10 disabled:opacity-60 dark:border-white/10 dark:bg-black/15 dark:text-white dark:placeholder:text-zinc-600 dark:focus:border-white/40 dark:focus:ring-white/5';
  return <main className="relative isolate min-h-screen overflow-hidden bg-zinc-50 px-5 py-8 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100 sm:py-12">
    <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-96 bg-gradient-to-b from-zinc-200/35 to-transparent dark:from-white/[0.035]"/>
    <div className="mx-auto max-w-2xl">
      <div className="flex items-center justify-between border-b border-zinc-200/80 pb-5 dark:border-white/[0.08]">
        <Link to="/" className="inline-flex items-center gap-2 rounded-md text-xs font-medium text-zinc-600 outline-none transition-colors hover:text-zinc-950 focus-visible:ring-2 focus-visible:ring-zinc-500 dark:text-zinc-400 dark:hover:text-white"><ArrowLeft aria-hidden="true" className="h-3.5 w-3.5"/>Back to TMH</Link>
        <span className="text-[10px] font-medium uppercase tracking-[0.22em] text-zinc-500">Building with intention</span>
      </div>
      <header className="pb-8 pt-10 sm:pb-10 sm:pt-12">
        <div className="mb-5 inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-white bg-white/65 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_4px_20px_rgba(0,0,0,0.03)] backdrop-blur-lg dark:border-white/15 dark:bg-white/[0.04] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"><LifeBuoy aria-hidden="true" className="h-5 w-5 text-zinc-600 dark:text-zinc-300"/></div>
        <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-zinc-500">Team Haven · Support</p>
        <h1 className="mt-3 font-serif text-4xl leading-tight tracking-tight sm:text-5xl">How can we help?</h1>
        <p className="mt-4 max-w-lg text-sm leading-7 text-zinc-600 dark:text-zinc-400">Choose an issue, tell us what happened, then send your request. You’ll receive a reference to keep, and the team can reply by email.</p>
      </header>
      {reference?<section role="status" className="rounded-3xl border border-zinc-200 bg-white/70 p-6 shadow-sm backdrop-blur-xl dark:border-white/10 dark:bg-white/[0.025] sm:p-8">
        <CheckCircle2 aria-hidden="true" className="mb-5 h-7 w-7 text-zinc-700 dark:text-zinc-300"/>
        <h2 className="text-xl font-medium tracking-tight">Your request is saved.</h2>
        <p className="mt-3 text-sm leading-7 text-zinc-600 dark:text-zinc-400">Keep the reference below. If the team needs more information, they can reply to {email.trim()}. You can also email us and include this reference.</p>
        <p className="mt-2 text-xs leading-6 text-zinc-500">Sending a request does not automatically restore access or reset a limit. The team will review the issue first.</p>
        <div className="mt-6 rounded-2xl border border-dashed border-zinc-300 bg-zinc-50/80 p-4 dark:border-white/15 dark:bg-black/15"><p className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Your request reference</p><p className="mt-2 select-all break-all font-mono text-sm">{reference}</p></div>
        <a href={`mailto:${TMH_CONTACT.email}?subject=${encodeURIComponent('Support request '+reference)}`} className="mt-6 inline-flex items-center gap-2 rounded-md text-sm underline underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-zinc-500">Email about this request<ArrowUpRight aria-hidden="true" className="h-3.5 w-3.5"/></a>
      </section>
        :<form onSubmit={submit} className="space-y-7 rounded-3xl border border-zinc-200/80 bg-white/70 p-5 shadow-[0_8px_40px_rgba(0,0,0,0.025)] backdrop-blur-xl dark:border-white/10 dark:bg-white/[0.025] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.035)] sm:p-8">
          <fieldset disabled={busy} aria-describedby="support-category-hint">
            <legend className="text-base font-medium">1. Choose your issue</legend>
            <p id="support-category-hint" className="mt-2 text-xs leading-6 text-zinc-500">Select one option. Choose “Something else” if you are unsure.</p>
            <div className="mt-4 grid gap-2.5">
              {CATEGORIES.map(([id,label,description,Icon])=><label key={id} className="relative block">
                <input type="radio" name="support-category" value={id} checked={category===id} disabled={busy} onChange={()=>setCategory(id)} aria-labelledby={`support-category-label-${id}`} aria-describedby={`support-category-${id}`} className="peer sr-only"/>
                <span className="flex cursor-pointer items-start gap-3 rounded-2xl border border-zinc-200 bg-zinc-50/40 p-4 transition-colors hover:border-zinc-400 peer-checked:border-zinc-600 peer-checked:bg-white peer-checked:shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_2px_12px_rgba(0,0,0,0.025)] peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-zinc-500 peer-disabled:cursor-wait peer-disabled:opacity-60 dark:border-white/10 dark:bg-black/10 dark:hover:border-white/25 dark:peer-checked:border-white/35 dark:peer-checked:bg-white/[0.055] dark:peer-checked:shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
                  <Icon aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-zinc-500 dark:text-zinc-400"/>
                  <span className="min-w-0 flex-1"><span id={`support-category-label-${id}`} className="block text-sm font-medium text-zinc-800 dark:text-zinc-200">{label}</span><span id={`support-category-${id}`} className="mt-1 block text-xs leading-5 text-zinc-500">{description}</span></span>
                  <span aria-hidden="true" className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${category===id?'border-zinc-700 dark:border-zinc-300':'border-zinc-300 dark:border-zinc-700'}`}>{category===id&&<span className="h-1.5 w-1.5 rounded-full bg-zinc-700 dark:bg-zinc-300"/>}</span>
                </span>
              </label>)}
            </div>
          </fieldset>
          <div className="border-t border-zinc-200/70 pt-6 dark:border-white/[0.07]">
            <h2 className="text-base font-medium">2. Tell us what happened</h2>
            <p className="mt-2 text-xs leading-6 text-zinc-500">Add an email where we can contact you and describe the problem.</p>
            <div className="mt-4 grid gap-5 sm:grid-cols-2"><label className="block text-sm font-medium">Name <span className="font-normal text-zinc-500">(optional)</span><input className={field} maxLength={100} autoComplete="name" placeholder="Your name" disabled={busy} value={name} onChange={e=>setName(e.target.value)} /></label><label className="block text-sm font-medium">Your email<input className={field} type="email" maxLength={254} required autoComplete="email" placeholder="you@example.com" disabled={busy} value={email} onChange={e=>setEmail(e.target.value)} /></label></div>
          </div>
          <div><label className="block text-sm font-medium">What happened?<textarea className={`${field} resize-y`} minLength={10} maxLength={4000} required rows={5} placeholder="What were you trying to do, and what happened instead?" disabled={busy} value={message} onChange={e=>setMessage(e.target.value)} aria-describedby="support-sensitive" /></label>
            <div className="mt-3 flex items-start gap-2"><LockKeyhole aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-400"/><p id="support-sensitive" className="text-xs leading-5 text-zinc-500">Include the visible error and approximate time. Do not include passwords, one-time codes, private access links or card details. A contact email alone does not prove ownership of a review or purchase.</p></div>
          </div>
          <div className="space-y-5 border-t border-zinc-200/70 pt-6 dark:border-white/[0.07]">
            <div><h2 className="text-base font-medium">3. Send and save your reference</h2><p className="mt-2 text-xs leading-6 text-zinc-500">Tick the consent box and complete the security check to enable the send button. Your reference appears here once the request is saved.</p></div>
            <label className="flex gap-3 text-xs leading-6 text-zinc-600 dark:text-zinc-400"><input type="checkbox" checked={agreed} required disabled={busy} onChange={e=>setAgreed(e.target.checked)} className="mt-1 h-4 w-4 shrink-0 accent-zinc-700 dark:accent-zinc-300"/><span>I agree that TMH may save this request and contact me to help resolve it. <Link className="underline underline-offset-4" to="/privacy">Privacy notice</Link></span></label>
            <div className="max-w-full overflow-x-auto"><HCaptcha ref={captchaRef} sitekey={import.meta.env.VITE_HCAPTCHA_SITE_KEY||'2506b35e-f496-40aa-a6e4-32cc1eb84e4c'} onVerify={setCaptcha} onExpire={()=>setCaptcha(null)} onError={()=>setCaptcha(null)}/></div>
            {error&&<p role="alert" className="text-sm leading-6 text-red-600 dark:text-red-300">{error}</p>}
            <button type="submit" disabled={busy||!captcha||!agreed} className="flex w-full items-center justify-center gap-2 rounded-xl bg-zinc-950 px-5 py-3.5 text-sm font-medium text-white outline-none transition-colors hover:bg-zinc-800 focus-visible:ring-2 focus-visible:ring-zinc-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-white dark:focus-visible:ring-offset-zinc-950">{busy?'Saving request…':'Send support request'}<ArrowUpRight aria-hidden="true" className="h-4 w-4"/></button>
            <p className="text-center text-[11px] leading-5 text-zinc-500">Keep the reference shown after sending. Access and limit changes need a separate review.</p>
          </div>
        </form>}
      <div className="mt-6 flex items-start gap-3 rounded-2xl border border-zinc-200/70 px-5 py-4 dark:border-white/[0.07]"><Mail aria-hidden="true" className="mt-1 h-4 w-4 shrink-0 text-zinc-500"/><p className="text-xs leading-6 text-zinc-500">Prefer email? <a href={`mailto:${TMH_CONTACT.email}`} className="text-zinc-700 underline underline-offset-4 dark:text-zinc-300">{TMH_CONTACT.email}</a>.<br/>Email replies are handled by the team. Use this form when you want a website request reference.</p></div>
    </div>
  </main>;
}

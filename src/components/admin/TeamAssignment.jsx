import { useState } from 'react';
import { TMH_TEAM_NAMES } from '../../lib/tmhPublicInfo';

const emptyDraft = { name: '', email: '', note: '' };
export default function TeamAssignment({ kind, targetId, onRequest, onAuthLost, onSaved }) {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [assignment, setAssignment] = useState(null);
  const [draft, setDraft] = useState(emptyDraft);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [now, setNow] = useState(()=>Date.now());
  const apply = item => {
    setAssignment(item);
    setDraft(item ? { name:item.assignee_name,email:item.assignee_email,note:item.preparation_note } : emptyDraft);
  };
  const request = async (payload, success) => {
    if (busy) return;
    setBusy(true); setNow(Date.now()); setError(''); setNotice('');
    try {
      const result = await onRequest(payload);
      if (result.code === 'unauthorised') onAuthLost?.();
      if (!result.ok) { setError(result.error || 'The assignment could not be confirmed.'); return; }
      apply(result.assignment); setLoaded(true); setNotice(success || '');
      if (payload.action === 'save') onSaved?.(result.assignment);
    } catch { setError('The assignment could not be reached. Your draft is still here. Try again.'); }
    finally { setBusy(false); }
  };
  const load = () => request({action:'load',kind,targetId});
  const toggle = () => { setOpen(!open); if(!open&&!loaded) load(); };
  const field = name => event => setDraft(current=>({...current,[name]:event.target.value}));
  const expired = assignment && Date.parse(assignment.expires_at)<=now;
  const unsaved = assignment && (draft.name!==assignment.assignee_name||draft.email!==assignment.assignee_email||draft.note!==assignment.preparation_note);
  return <section className="mt-5 rounded-xl border border-white/10 bg-black/10 p-4" aria-label="Teammate assignment">
    <button type="button" onClick={toggle} aria-expanded={open} className="flex w-full items-center justify-between gap-3 text-left text-xs font-medium text-zinc-200">
      <span>Teammate &amp; preparation brief{assignment ? ` · ${assignment.assignee_name}` : ''}</span><span>{open?'−':'+'}</span>
    </button>
    {open && <div className="mt-4 space-y-4">
      <p className="text-xs leading-relaxed text-zinc-400">Select a teammate and enter their work email. Saving creates a private seven-day link; sending the email is a separate action. Each new save replaces the previous link.</p>
      {error && <p role="alert" className="text-xs text-red-300">{error}</p>}
      {notice && <p role="status" className="text-xs text-zinc-300">{notice}</p>}
      {!loaded ? <button type="button" disabled={busy} onClick={load} className="text-xs underline disabled:opacity-40">{busy?'Loading assignment…':'Retry loading assignment'}</button> : <>
        <label className="block text-xs text-zinc-400">Teammate<select value={draft.name} onChange={field('name')} disabled={busy} className="mt-2 block w-full rounded-lg border border-zinc-700 bg-zinc-950 p-2.5 text-sm text-zinc-200"><option value="">Select a teammate</option>{TMH_TEAM_NAMES.map(name=><option key={name}>{name}</option>)}</select></label>
        <label className="block text-xs text-zinc-400">Teammate email<input type="email" value={draft.email} onChange={field('email')} disabled={busy} maxLength={254} autoComplete="off" className="mt-2 block w-full rounded-lg border border-zinc-700 bg-zinc-950 p-2.5 text-sm text-zinc-200" /></label>
        <label className="block text-xs text-zinc-400">Preparation note<textarea value={draft.note} onChange={field('note')} disabled={busy} maxLength={2000} rows={3} placeholder="Relevant context and the next action. Avoid private credentials or unnecessary personal details." className="mt-2 block w-full rounded-lg border border-zinc-700 bg-zinc-950 p-2.5 text-sm text-zinc-200" /></label>
        <p className="text-[11px] leading-relaxed text-zinc-500">The brief shows this assignment and relevant saved client/meeting details. Full chats, screenshots and the admin workspace stay private. The recipient must keep their link private.</p>
        {assignment && <dl className="space-y-2 text-xs text-zinc-400">
          <div><dt className="inline">Email: </dt><dd className="inline">{assignment.email_sent_at?'Accepted by Resend':assignment.email_last_error?`Pending · ${assignment.email_last_error}`:assignment.email_attempted_at?'Attempted · refresh before retrying':'Not sent'}</dd></div>
          <div><dt className="inline">Acknowledgement: </dt><dd className="inline">{assignment.acknowledged_at?new Date(assignment.acknowledged_at).toLocaleString():'Waiting for teammate'}</dd></div>
          <div><dt className="inline">Brief access: </dt><dd className="inline">{assignment.revoked_at?'Withdrawn':expired?'Expired':`Until ${new Date(assignment.expires_at).toLocaleString()}`}</dd></div>
        </dl>}
        <div className="flex flex-wrap gap-2 text-xs">
          <button type="button" disabled={busy||!draft.name||!draft.email.trim()} onClick={()=>request({action:'save',kind,targetId,expectedRevision:assignment?.revision||0,...draft},'Assignment saved. Review the recipient, then send the notification.')} className="rounded-lg border border-white/20 bg-white/10 px-3 py-2 disabled:opacity-40">Save assignment / new link</button>
          {assignment && <button type="button" disabled={busy||unsaved||!!assignment.revoked_at||expired||!!assignment.email_sent_at} onClick={()=>request({action:'send',id:assignment.id,expectedRevision:assignment.revision},'Resend accepted the notification. This does not confirm inbox delivery.')} className="rounded-lg bg-zinc-100 px-3 py-2 font-medium text-zinc-950 disabled:opacity-40">{assignment.email_last_error?'Retry notification':'Send notification email'}</button>}
          {assignment && !assignment.revoked_at && <button type="button" disabled={busy} onClick={()=>request({action:'revoke',id:assignment.id,expectedRevision:assignment.revision},'The private brief link has been withdrawn.')} className="rounded-lg border border-red-400/20 px-3 py-2 text-red-300 disabled:opacity-40">Withdraw link</button>}
          <button type="button" onClick={load} disabled={busy} className="px-2 py-2 underline disabled:opacity-40">Reload saved details</button>
        </div>
        {unsaved && <p className="text-xs text-zinc-400">Save your changes before sending. Reload replaces your draft with the saved details.</p>}
      </>}
    </div>}
  </section>;
}

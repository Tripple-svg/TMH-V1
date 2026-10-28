import { useRef, useState } from 'react';
import { INQUIRY_STATUSES } from '../../lib/adminWorkspace';
import { TMH_TEAM_NAMES } from '../../lib/tmhPublicInfo';

const draftFor = session => ({ status: session.inquiry_status || 'new', owner: session.inquiry_owner || '', notes: session.inquiry_notes || '', followupOn: session.inquiry_next_followup_on || '' });
export default function InquiryWorkflow({ session, onSave, onSessionChange }) {
  const [draft, setDraft] = useState(() => draftFor(session));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState(null);
  const revision = useRef(session.inquiry_revision || 0);
  const lock = useRef(false);
  const field = name => event => setDraft(previous => ({ ...previous, [name]: event.target.value }));
  const applySaved = saved => {
    setDraft(draftFor(saved)); revision.current = saved.inquiry_revision || 0;
    onSessionChange(saved); setConflict(null); setError('');
  };
  const submit = async event => {
    event.preventDefault();
    if (lock.current) return;
    lock.current = true; setSaving(true); setError('');
    try {
      const result = await onSave({ action: 'updateInquiry', sessionId: session.id, expectedRevision: revision.current, ...draft, followupOn: draft.followupOn || null });
      if (result.ok) applySaved(result.session);
      else { setError(result.error || 'The inquiry could not be saved. Your draft is still here.'); if (result.code === 'conflict') setConflict(result.session); }
    } catch { setError('The inquiry could not be saved. Your draft is still here. Please retry.'); }
    finally { lock.current = false; setSaving(false); }
  };
  return <form onSubmit={submit} aria-label="Inquiry follow-up" className="mb-6 space-y-4 rounded-xl border border-white/10 bg-black/20 p-4">
    <div><h3 className="text-sm font-medium text-zinc-200">Internal follow-up</h3><p className="mt-1 text-xs leading-relaxed text-zinc-500">Assign responsibility and record the next action. These edits do not contact the visitor or book a call.</p></div>
    <div className="grid gap-4 sm:grid-cols-3">
      <label className="text-xs text-zinc-400">Inquiry status<select value={draft.status} onChange={field('status')} disabled={saving} className="mt-2 block w-full rounded-lg border border-zinc-700 bg-zinc-950 p-2.5 text-sm text-zinc-200">{INQUIRY_STATUSES.map(status => <option key={status} value={status}>{status[0].toUpperCase() + status.slice(1)}</option>)}</select></label>
      <label className="text-xs text-zinc-400">Assigned to<select value={draft.owner} onChange={field('owner')} disabled={saving} className="mt-2 block w-full rounded-lg border border-zinc-700 bg-zinc-950 p-2.5 text-sm text-zinc-200"><option value="">Unassigned</option>{draft.owner && !TMH_TEAM_NAMES.includes(draft.owner) && <option value={draft.owner}>{draft.owner} · saved assignment</option>}{TMH_TEAM_NAMES.map(name => <option key={name} value={name}>{name}</option>)}</select></label>
      <label className="text-xs text-zinc-400">Follow up on · Lagos date<input type="date" value={draft.followupOn} onChange={field('followupOn')} disabled={saving} className="mt-2 block w-full min-w-0 rounded-lg border border-zinc-700 bg-zinc-950 p-2.5 text-sm text-zinc-200" /></label>
    </div>
    <label className="block text-xs text-zinc-400">Next action and internal notes<textarea value={draft.notes} onChange={field('notes')} disabled={saving} maxLength={4000} rows={3} placeholder="What should happen next, and who needs to act?" className="mt-2 block w-full resize-y rounded-lg border border-zinc-700 bg-zinc-950 p-3 text-sm leading-relaxed text-zinc-200" /></label>
    {error && <p role="alert" className="text-xs leading-relaxed text-amber-200">{error}</p>}
    <div className="flex flex-wrap items-center gap-3"><button disabled={saving || Boolean(conflict)} className="rounded-lg bg-zinc-100 px-4 py-2.5 text-xs font-semibold text-zinc-950 disabled:opacity-40">{saving ? 'Saving…' : 'Save follow-up'}</button>{conflict && <button type="button" onClick={() => applySaved(conflict)} className="text-xs text-zinc-300 underline underline-offset-4">Reload saved details</button>}<span className="text-[11px] text-zinc-500">{session.inquiry_updated_at ? 'Last saved ' + new Date(session.inquiry_updated_at).toLocaleString('en-GB', { timeZone: 'Africa/Lagos' }) : 'No follow-up saved yet'}</span></div>
  </form>;
}

import { useEffect, useMemo, useState } from 'react';
import { getAllReviews, getScreenshotSignedUrl, updateFollowupStatus } from '../lib/brandReviewService';

const temperatures = ['All', 'Hot', 'Warm', 'Cold'];
const platforms = ['All', 'website', 'social', 'none'];
const followups = ['All', 'pending', 'contacted', 'booked', 'closed', 'lost'];
const formatDate = (value) => value ? new Intl.DateTimeFormat('en-NG', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '—';
const currency = (value) => new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(Number(value) || 0);
const temperatureClass = (value) => ({ Hot: 'bg-red-500/15 text-red-300 border-red-500/30', Warm: 'bg-amber-500/15 text-amber-300 border-amber-500/30', Cold: 'bg-sky-500/15 text-sky-300 border-sky-500/30' }[value] || 'bg-zinc-800 text-zinc-300 border-zinc-700');

function CsvButton({ leads }) {
  const exportCsv = () => {
    const columns = ['full_name', 'brand_name', 'email', 'whatsapp', 'platform_type', 'social_platform', 'social_link', 'website_url', 'haven_score', 'biggest_leak', 'assessment_summary', 'pre_call_briefing', 'biggest_problems', 'lead_temperature', 'utm_source', 'device_type', 'visit_count', 'days_to_convert', 'clicked_booking_link', 'clicked_playbook_link', 'converted_to_call', 'converted_to_purchase', 'deal_value', 'followup_status', 'followup_notes', 'call_booked_at', 'created_at'];
    const quote = (value) => `"${String(Array.isArray(value) ? value.join('; ') : value ?? '').replaceAll('"', '""')}"`;
    const content = [columns.join(','), ...leads.map(lead => columns.map(column => quote(lead[column])).join(','))].join('\n');
    const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8;' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'tmh-leads.csv'; anchor.click(); URL.revokeObjectURL(url);
  };
  return <button onClick={exportCsv} className="rounded-lg border border-zinc-700 px-3 py-2 text-sm hover:bg-zinc-800">Export CSV</button>;
}

function LeadCard({ lead, onChanged }) {
  const [expanded, setExpanded] = useState({ summary: false, briefing: false });
  const [saving, setSaving] = useState(false);
  const [notes, setNotes] = useState(lead.followup_notes || '');
  const [imageUrl, setImageUrl] = useState(null);
  const change = async (updates) => {
    setSaving(true);
    const result = await updateFollowupStatus(lead.id, updates);
    setSaving(false);
    if (result.success) onChanged({ ...lead, ...Object.fromEntries(Object.entries(updates).map(([key, value]) => [key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`), value])) });
    else window.alert(result.error?.message || 'Could not save this lead.');
  };
  const showScreenshot = async () => {
    const result = await getScreenshotSignedUrl(lead.screenshot_url);
    if (result.success) setImageUrl(result.signedUrl);
    else window.alert(result.error?.message || 'Could not open screenshot.');
  };
  const toggle = (key) => setExpanded(current => ({ ...current, [key]: !current[key] }));
  return <article className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4 shadow-lg sm:p-5">
    <div className="flex flex-col justify-between gap-3 sm:flex-row">
      <div><h2 className="text-lg font-bold text-white">{lead.full_name} <span className="font-normal text-zinc-400">· {lead.brand_name}</span></h2><p className="text-sm text-zinc-400">{lead.email} · {lead.whatsapp}</p></div>
      <div className="flex flex-wrap items-start gap-2"><span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${temperatureClass(lead.lead_temperature)}`}>{lead.lead_temperature || 'Cold'}</span><span className="rounded-full border border-zinc-700 px-2.5 py-1 text-xs text-zinc-300">{lead.haven_score ?? '—'} Haven</span></div>
    </div>
    <div className="mt-4 grid gap-3 text-sm text-zinc-300 sm:grid-cols-2 lg:grid-cols-3">
      <p><span className="text-zinc-500">Platform:</span> {lead.platform_type || '—'} {lead.social_platform ? `(${lead.social_platform})` : ''}</p>
      <p><span className="text-zinc-500">Social:</span> {lead.social_link || '—'}</p><p><span className="text-zinc-500">Website:</span> {lead.website_url || '—'}</p>
      <p><span className="text-zinc-500">Source/device:</span> {lead.utm_source || 'direct'} / {lead.device_type || '—'}</p><p><span className="text-zinc-500">Visits/conversion:</span> {lead.visit_count ?? 1} / {lead.days_to_convert ?? 0} days</p><p><span className="text-zinc-500">Created:</span> {formatDate(lead.created_at)}</p>
      <p><span className="text-zinc-500">Booking/playbook:</span> {lead.clicked_booking_link ? 'Yes' : 'No'} / {lead.clicked_playbook_link ? 'Yes' : 'No'}</p><p><span className="text-zinc-500">Converted:</span> call {lead.converted_to_call ? 'Yes' : 'No'}, purchase {lead.converted_to_purchase ? 'Yes' : 'No'}</p><p><span className="text-zinc-500">Value:</span> {currency(lead.deal_value)}</p>
    </div>
    {lead.screenshot_url && <div className="mt-4 flex items-center gap-3">{imageUrl && <img src={imageUrl} alt={`${lead.brand_name} screenshot`} className="h-16 w-16 rounded object-cover" />}<button onClick={showScreenshot} className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs hover:bg-zinc-800">View screenshot</button></div>}
    <div className="mt-4 space-y-3 border-t border-zinc-800 pt-4 text-sm"><p><span className="font-semibold text-zinc-400">Biggest leak:</span> <span className="ml-2 rounded bg-violet-500/15 px-2 py-1 text-violet-200">{lead.biggest_leak || 'Not assessed'}</span></p>
      <p><span className="font-semibold text-zinc-400">Problems:</span> {(lead.biggest_problems || []).map(problem => <span key={problem} className="ml-2 inline-block rounded bg-zinc-800 px-2 py-1 text-xs">{problem}</span>)}</p>
      <p><button onClick={() => toggle('summary')} className="font-semibold text-blue-300">{expanded.summary ? 'Hide' : 'Show'} assessment summary</button>{expanded.summary && <span className="ml-2 text-zinc-300">{lead.assessment_summary || '—'}</span>}</p>
      <p><button onClick={() => toggle('briefing')} className="font-semibold text-blue-300">{expanded.briefing ? 'Hide' : 'Show'} pre-call briefing</button>{expanded.briefing && <span className="ml-2 text-zinc-300">{lead.pre_call_briefing || '—'}</span>}</p>
    </div>
    <div className="mt-4 grid gap-3 border-t border-zinc-800 pt-4 md:grid-cols-[180px_1fr]">
      <label className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Follow-up status<select value={lead.followup_status || 'pending'} disabled={saving} onChange={event => change({ followupStatus: event.target.value })} className="mt-1 block w-full rounded-lg border border-zinc-700 bg-zinc-950 p-2 text-sm normal-case tracking-normal text-white">{followups.slice(1).map(status => <option key={status}>{status}</option>)}</select></label>
      <label className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Follow-up notes<textarea value={notes} onChange={event => setNotes(event.target.value)} onBlur={() => notes !== (lead.followup_notes || '') && change({ followupNotes: notes })} className="mt-1 block min-h-20 w-full rounded-lg border border-zinc-700 bg-zinc-950 p-2 text-sm normal-case tracking-normal text-white" placeholder="Add a note…" /></label>
    </div>
    <p className="mt-3 text-xs text-zinc-500">Call booked: {formatDate(lead.call_booked_at)} {saving && '· Saving…'}</p>
  </article>;
}

export default function AdminDashboard() {
  const [authorised, setAuthorised] = useState(() => sessionStorage.getItem('tmh_admin_authorised') === 'true');
  const [password, setPassword] = useState(''); const [loginError, setLoginError] = useState('');
  const [leads, setLeads] = useState([]); const [loading, setLoading] = useState(false); const [error, setError] = useState('');
  const [filters, setFilters] = useState({ temperature: 'All', platform: 'All', followup: 'All', search: '' });
  const load = async () => { setLoading(true); setError(''); const result = await getAllReviews(); setLoading(false); if (result.success) setLeads(result.data); else setError(result.error?.message || 'Unable to load leads.'); };
  useEffect(() => {
    if (!authorised) return undefined;
    const timeout = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timeout);
  }, [authorised]);
  const filtered = useMemo(() => leads.filter(lead => (filters.temperature === 'All' || lead.lead_temperature === filters.temperature) && (filters.platform === 'All' || lead.platform_type === filters.platform) && (filters.followup === 'All' || lead.followup_status === filters.followup) && (`${lead.full_name} ${lead.brand_name}`.toLowerCase().includes(filters.search.toLowerCase()))), [leads, filters]);
  const stats = useMemo(() => ({ total: leads.length, hot: leads.filter(lead => lead.lead_temperature === 'Hot').length, calls: leads.filter(lead => lead.converted_to_call).length, pipeline: leads.reduce((sum, lead) => sum + (Number(lead.deal_value) || 0), 0), score: leads.length ? leads.reduce((sum, lead) => sum + (Number(lead.haven_score) || 0), 0) / leads.length : 0 }), [leads]);
  const setFilter = (key, value) => setFilters(current => ({ ...current, [key]: value }));
  const updateLead = (updated) => setLeads(current => current.map(lead => lead.id === updated.id ? updated : lead));
  if (!authorised) return <main className="grid min-h-screen place-items-center bg-zinc-950 p-4 text-zinc-100"><form onSubmit={(event) => { event.preventDefault(); if (password === import.meta.env.VITE_ADMIN_PASSWORD) { sessionStorage.setItem('tmh_admin_authorised', 'true'); setAuthorised(true); } else setLoginError('Incorrect password.'); }} className="w-full max-w-sm rounded-2xl border border-zinc-800 bg-zinc-900 p-6"><h1 className="text-2xl font-bold">TMH Admin</h1><p className="mt-1 text-sm text-zinc-400">Enter the dashboard password.</p><input autoFocus type="password" value={password} onChange={event => setPassword(event.target.value)} className="mt-5 w-full rounded-lg border border-zinc-700 bg-zinc-950 p-3 outline-none focus:border-blue-500" />{loginError && <p className="mt-2 text-sm text-red-300">{loginError}</p>}<button className="mt-4 w-full rounded-lg bg-blue-600 p-3 font-semibold hover:bg-blue-500">Continue</button></form></main>;
  return <main className="min-h-screen bg-zinc-950 p-4 text-zinc-100 sm:p-6"><div className="mx-auto max-w-7xl"><header className="mb-6 flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-3xl font-bold">TMH leads</h1><p className="text-sm text-zinc-400">Haven brand diagnostics and follow-up pipeline</p></div><div className="flex gap-2"><CsvButton leads={filtered} /><button onClick={load} className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold hover:bg-blue-500">{loading ? 'Refreshing…' : 'Refresh'}</button></div></header>{error && <p className="mb-4 rounded-lg bg-red-500/10 p-3 text-red-200">{error}</p>}<section className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{[['Total leads', stats.total], ['Hot leads', stats.hot], ['Calls', stats.calls], ['Pipeline value', currency(stats.pipeline)], ['Avg Haven score', stats.score.toFixed(1)]].map(([label, value]) => <div key={label} className="rounded-xl border border-zinc-800 bg-zinc-900 p-4"><p className="text-xs uppercase tracking-wide text-zinc-500">{label}</p><p className="mt-1 text-2xl font-bold">{value}</p></div>)}</section><section className="mb-6 grid gap-3 rounded-xl border border-zinc-800 bg-zinc-900 p-4 md:grid-cols-4">{[["temperature", temperatures], ["platform", platforms], ["followup", followups]].map(([key, values]) => <select key={key} value={filters[key]} onChange={event => setFilter(key, event.target.value)} className="rounded-lg border border-zinc-700 bg-zinc-950 p-2 text-sm capitalize">{values.map(value => <option key={value}>{value}</option>)}</select>)}<input value={filters.search} onChange={event => setFilter('search', event.target.value)} placeholder="Search name or brand" className="rounded-lg border border-zinc-700 bg-zinc-950 p-2 text-sm" /></section><section className="space-y-4">{loading ? <p className="text-zinc-400">Loading leads…</p> : filtered.length ? filtered.map(lead => <LeadCard key={lead.id} lead={lead} onChanged={updateLead} />) : <p className="rounded-xl border border-dashed border-zinc-700 p-8 text-center text-zinc-500">No leads match these filters.</p>}</section></div></main>;
}

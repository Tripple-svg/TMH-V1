// src/pages/AdminDashboard.jsx
// Admin lead viewer. Password-gated. Data flows through
// admin-fetch-leads / admin-update-lead edge functions.
// Responsive: table on md+, stacked cards on mobile.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const FETCH_URL = `${SUPABASE_URL}/functions/v1/admin-fetch-leads`;
const UPDATE_URL = `${SUPABASE_URL}/functions/v1/admin-update-lead`;
const PASSWORD_KEY = 'tmh_admin_password';
const PAGE_SIZE = 25;

const TEMPERATURES = ['All', 'Hot', 'Warm', 'Cold'];
const FOLLOWUP_FILTERS = ['All', 'pending', 'contacted', 'booked', 'closed', 'lost'];
const FOLLOWUP_STATUSES = ['pending', 'contacted', 'booked', 'closed', 'lost'];
const DATE_RANGES = [
  { id: 'all', label: 'All time', days: null },
  { id: '7',   label: 'Last 7 days',  days: 7 },
  { id: '30',  label: 'Last 30 days', days: 30 },
  { id: '90',  label: 'Last 90 days', days: 90 },
];
const SORTS = [
  { id: 'newest',     label: 'Newest first' },
  { id: 'oldest',     label: 'Oldest first' },
  { id: 'score_desc', label: 'Highest score' },
  { id: 'score_asc',  label: 'Lowest score' },
  { id: 'hot_first',  label: 'Hot first' },
  { id: 'cold_first', label: 'Cold first' },
];

const WEBSITE_CATEGORIES = [
  { key: 'clarity',    label: 'Clarity',    max: 20 },
  { key: 'trust',      label: 'Trust',      max: 20 },
  { key: 'conversion', label: 'Conversion', max: 20 },
  { key: 'technical',  label: 'Technical',  max: 20 },
  { key: 'content',    label: 'Content',    max: 20 },
];
const SOCIAL_CATEGORIES = [
  { key: 'profile',     label: 'Profile',     max: 25 },
  { key: 'consistency', label: 'Consistency', max: 25 },
  { key: 'engagement',  label: 'Engagement',  max: 25 },
  { key: 'readiness',   label: 'Readiness',   max: 25 },
];

// ─── Helpers ────────────────────────────────────────────────────

function apiHeaders() {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    apikey: SUPABASE_ANON_KEY,
  };
}

async function apiFetchLeads(password) {
  const res = await fetch(FETCH_URL, {
    method: 'POST',
    headers: apiHeaders(),
    body: JSON.stringify({ password }),
  });
  if (res.status === 401) return { ok: false, code: 'unauthorised' };
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) return { ok: false, code: 'error', error: data.error || `Error ${res.status}` };
  return { ok: true, leads: data.leads || [] };
}

async function apiUpdateLead(password, updates) {
  const res = await fetch(UPDATE_URL, {
    method: 'POST',
    headers: apiHeaders(),
    body: JSON.stringify({ password, ...updates }),
  });
  if (res.status === 401) return { ok: false, code: 'unauthorised' };
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) return { ok: false, code: 'error', error: data.error || `Error ${res.status}` };
  return { ok: true, review: data.review };
}

function normaliseTemperature(value) {
  if (!value) return 'Cold';
  const v = String(value).toLowerCase();
  if (v === 'hot') return 'Hot';
  if (v === 'warm') return 'Warm';
  return 'Cold';
}

function temperatureClass(value) {
  const t = normaliseTemperature(value);
  if (t === 'Hot') return 'bg-red-500/15 text-red-300 border-red-500/30';
  if (t === 'Warm') return 'bg-amber-500/15 text-amber-300 border-amber-500/30';
  return 'bg-sky-500/15 text-sky-300 border-sky-500/30';
}

function temperatureRank(value) {
  const t = normaliseTemperature(value);
  if (t === 'Hot') return 3;
  if (t === 'Warm') return 2;
  return 1;
}

function urgencyClass(value) {
  const t = normaliseTemperature(value);
  if (t === 'Hot') return 'border-l-2 border-l-red-500/50 bg-red-500/[0.03]';
  if (t === 'Warm') return 'border-l-2 border-l-amber-500/40 bg-amber-500/[0.02]';
  return '';
}

function urgencyCardClass(value) {
  const t = normaliseTemperature(value);
  if (t === 'Hot') return 'border-red-500/40 bg-red-500/[0.03]';
  if (t === 'Warm') return 'border-amber-500/40 bg-amber-500/[0.02]';
  return 'border-zinc-800 bg-zinc-900';
}

function scoreClass(score) {
  if (score == null) return 'text-zinc-500';
  if (score >= 80) return 'text-blue-400';
  if (score >= 50) return 'text-zinc-200';
  return 'text-red-300';
}

function categoryScoreClass(score, max) {
  if (score == null || !max) return 'text-zinc-500';
  const pct = (Number(score) / Number(max)) * 100;
  if (pct < 50) return 'text-red-300';
  if (pct <= 75) return 'text-zinc-300';
  return 'text-blue-400';
}

function formatDate(value) {
  if (!value) return '—';
  try {
    return new Intl.DateTimeFormat('en-NG', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
  } catch {
    return '—';
  }
}

function formatTime(value) {
  if (!value) return '';
  try {
    return new Date(value).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

function relativeTime(value) {
  if (!value) return '';
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return '';
  const diffSec = Math.floor((Date.now() - then) / 1000);
  if (diffSec < 0) return 'just now';
  if (diffSec < 60) return `${diffSec}s ago`;
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  if (diffSec < 604800) return `${Math.floor(diffSec / 86400)}d ago`;
  if (diffSec < 2592000) return `${Math.floor(diffSec / 604800)}w ago`;
  return `${Math.floor(diffSec / 2592000)}mo ago`;
}

function currency(value) {
  const n = Number(value) || 0;
  return new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(n);
}

async function copyText(text, onResult) {
  try {
    await navigator.clipboard.writeText(text);
    onResult?.(true);
  } catch {
    onResult?.(false);
  }
}

// ─── Icons ──────────────────────────────────────────────────────

function ChevronRightIcon({ expanded }) {
  return (
    <svg
      width="14" height="14" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
      style={{ transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 150ms' }}
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

// ─── Login ──────────────────────────────────────────────────────

function LoginScreen({ onAuth }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!password) return;
    setChecking(true);
    setError('');
    const result = await apiFetchLeads(password);
    setChecking(false);
    if (result.ok) onAuth(password);
    else if (result.code === 'unauthorised') setError('Incorrect password.');
    else setError(result.error || 'Could not reach the server.');
  };

  return (
    <main className="grid min-h-screen place-items-center bg-zinc-950 p-4 text-zinc-100">
      <form onSubmit={submit} className="w-full max-w-sm rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
        <h1 className="text-2xl font-bold">TMH Admin</h1>
        <p className="mt-1 text-sm text-zinc-400">Enter the dashboard password.</p>
        <input
          autoFocus type="password" value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          className="mt-5 w-full rounded-lg border border-zinc-700 bg-zinc-950 p-3 text-sm outline-none focus:border-blue-500"
        />
        {error && <p className="mt-2 text-sm text-red-300">{error}</p>}
        <button
          type="submit" disabled={checking || !password}
          className="mt-4 w-full rounded-lg bg-blue-600 p-3 text-sm font-semibold hover:bg-blue-500 disabled:bg-zinc-700 disabled:cursor-not-allowed"
        >
          {checking ? 'Checking…' : 'Continue'}
        </button>
      </form>
    </main>
  );
}

// ─── Shared pieces ──────────────────────────────────────────────

function TranscriptViewer({ session }) {
  if (!session || !Array.isArray(session.messages) || session.messages.length === 0) {
    return <p className="text-xs text-zinc-500 italic">No chat transcript recorded for this lead.</p>;
  }

  return (
    <div className="space-y-2.5">
      <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium">
        Conversation · {session.messages_returned ?? session.messages.length} of {session.message_count ?? session.messages.length} messages
      </p>
      <div className="space-y-2.5 max-h-[420px] overflow-y-auto pr-2">
        {session.messages.map((msg, idx) => {
          const isAgent = msg.role === 'agent';
          return (
            <div key={msg.id || idx} className={`flex flex-col ${isAgent ? 'items-start' : 'items-end'}`}>
              <span className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1 px-1">
                {isAgent ? 'Haven' : 'User'}
              </span>
              <div
                className={`max-w-[85%] rounded-xl px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap break-words ${
                  isAgent
                    ? 'bg-zinc-800/70 text-zinc-200 border border-zinc-700/50'
                    : 'bg-blue-500/15 text-blue-100 border border-blue-500/25'
                }`}
              >
                {msg.content || <span className="italic text-zinc-500">(empty)</span>}
              </div>
              <span className="text-[10px] text-zinc-600 font-mono mt-1 px-1">
                {formatTime(msg.timestamp)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ScoreBreakdown({ lead }) {
  const breakdown = lead.score_breakdown;
  if (!breakdown) return null;

  const isSocial = lead.platform_type === 'social';
  const categories = isSocial ? SOCIAL_CATEGORIES : WEBSITE_CATEGORIES;

  const getScore = (key) => {
    if (Array.isArray(breakdown)) {
      const hit = breakdown.find((b) => b && (b.key === key || b.name === key));
      return hit ? (hit.score ?? hit.value ?? null) : null;
    }
    if (breakdown && typeof breakdown === 'object') return breakdown[key] ?? null;
    return null;
  };

  const total = lead.haven_score;

  return (
    <div className="rounded-lg border border-zinc-700/50 bg-zinc-950/40 p-3">
      <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium mb-2">Score breakdown</p>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
        {categories.map((cat) => {
          const score = getScore(cat.key);
          return (
            <div key={cat.key} className="flex items-center justify-between gap-2">
              <span className="text-zinc-400">{cat.label}</span>
              <span className={`font-mono font-medium ${categoryScoreClass(score, cat.max)}`}>
                {score ?? '—'} / {cat.max}
              </span>
            </div>
          );
        })}
        <div className="flex items-center justify-between gap-2 border-t border-zinc-700/50 pt-1.5 col-span-2">
          <span className="text-zinc-300 font-medium">Total</span>
          <span className={`font-mono font-bold ${scoreClass(total)}`}>{total ?? '—'} / 100</span>
        </div>
      </div>
    </div>
  );
}

function LeadDetails({ lead }) {
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1fr_1.4fr]">
      <div className="space-y-3">
        {lead.screenshot_signed_url && (
          <img
            src={lead.screenshot_signed_url}
            alt={`${lead.brand_name} screenshot`}
            className="w-full rounded-lg border border-zinc-700"
          />
        )}
        <ScoreBreakdown lead={lead} />
      </div>
      <div className="space-y-2 text-xs text-zinc-300 break-words">
        <p><span className="text-zinc-500">WhatsApp:</span> {lead.whatsapp || '—'}</p>
        <p><span className="text-zinc-500">Main goal:</span> {lead.main_goal || '—'}</p>
        <p><span className="text-zinc-500">Website:</span> {lead.website_url || '—'}</p>
        <p><span className="text-zinc-500">Social:</span> {lead.social_link || '—'}</p>
        <p><span className="text-zinc-500">Booking / Playbook:</span> {lead.clicked_booking_link ? 'Yes' : 'No'} / {lead.clicked_playbook_link ? 'Yes' : 'No'}</p>
        <p><span className="text-zinc-500">Deal value:</span> {currency(lead.deal_value)}</p>
        {lead.session && (
          <p>
            <span className="text-zinc-500">Session:</span>{' '}
            {lead.session.total_exchanges} exchanges · {lead.session.current_step || '—'} ·{' '}
            last update {formatDate(lead.session.last_session_update)}
          </p>
        )}
        {lead.assessment_summary && (
          <p><span className="text-zinc-500">Summary:</span> {lead.assessment_summary}</p>
        )}
        {lead.pre_call_briefing && (
          <p><span className="text-zinc-500">Briefing:</span> {lead.pre_call_briefing}</p>
        )}
      </div>
      <div className="lg:col-span-1">
        <TranscriptViewer session={lead.session} />
      </div>
    </div>
  );
}

function StatusSelect({ value, onChange, disabled }) {
  return (
    <div className="relative">
      <select
        value={value}
        disabled={disabled}
        onChange={onChange}
        className="w-full appearance-none rounded border border-zinc-700 bg-zinc-950 px-2 py-1 pr-7 text-xs text-white outline-none focus:border-blue-500 disabled:opacity-60 cursor-pointer"
      >
        {FOLLOWUP_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
      </select>
      <svg
        className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 h-3 w-3 text-zinc-500"
        viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
        strokeLinecap="round" strokeLinejoin="round"
      >
        <polyline points="6 9 12 15 18 9" />
      </svg>
    </div>
  );
}

function NotesField({ value, onChange, onBlur }) {
  return (
    <textarea
      value={value}
      onChange={onChange}
      onBlur={onBlur}
      placeholder="Notes…"
      rows={1}
      className="w-full resize-y rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs text-white placeholder:text-zinc-600 outline-none focus:border-blue-500 transition-colors"
    />
  );
}

function BookedBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-blue-500/30 bg-blue-500/10 px-1.5 py-0.5 text-[10px] text-blue-300">
      <CalendarIcon />
      Booked
    </span>
  );
}

// ─── Actions hook (shared between desktop and mobile) ───────────

function useLeadActions({ lead, password, onLeadChange, onAuthLost, showToast }) {
  const [saving, setSaving] = useState(false);
  const [notes, setNotes] = useState(lead.followup_notes || '');
  const notesRef = useRef(lead.followup_notes || '');

  useEffect(() => {
    setNotes(lead.followup_notes || '');
    notesRef.current = lead.followup_notes || '';
  }, [lead.id, lead.followup_notes]);

  const save = useCallback(async (updates) => {
    setSaving(true);
    const result = await apiUpdateLead(password, { reviewId: lead.id, ...updates });
    setSaving(false);
    if (result.ok) {
      onLeadChange({
        ...lead,
        ...Object.fromEntries(
          Object.entries(updates).map(([k, v]) => [k.replace(/[A-Z]/g, (l) => `_${l.toLowerCase()}`), v])
        ),
      });
    } else if (result.code === 'unauthorised') {
      onAuthLost();
    } else {
      showToast('error', result.error || 'Could not save.');
    }
  }, [lead, password, onLeadChange, onAuthLost, showToast]);

  const onStatusChange = (e) => save({ followupStatus: e.target.value });
  const onNotesBlur = () => {
    if (notes !== notesRef.current) {
      notesRef.current = notes;
      save({ followupNotes: notes });
    }
  };
  const handleCopy = async (text, label) => {
    if (!text) return;
    await copyText(text, (success) => {
      showToast(success ? 'success' : 'error', success ? `${label} copied` : 'Copy failed');
    });
  };

  return { saving, notes, setNotes, onStatusChange, onNotesBlur, handleCopy };
}

// ─── Desktop table row ─────────────────────────────────────────

function LeadRow({ lead, password, onLeadChange, onAuthLost, showToast }) {
  const [expanded, setExpanded] = useState(false);
  const { saving, notes, setNotes, onStatusChange, onNotesBlur, handleCopy } =
    useLeadActions({ lead, password, onLeadChange, onAuthLost, showToast });

  const toggleExpanded = () => setExpanded((v) => !v);
  const isBooked = Boolean(lead.call_booked_at);
  const urgency = urgencyClass(lead.lead_temperature);

  return (
    <>
      <tr className={`border-b border-zinc-800 hover:bg-zinc-900/40 transition-colors ${urgency}`}>
        <td className="p-2 align-middle">
          <button
            type="button" onClick={toggleExpanded}
            aria-label={expanded ? 'Collapse row' : 'Expand row'}
            className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-white"
          >
            <ChevronRightIcon expanded={expanded} />
          </button>
        </td>
        <td className="p-2 align-top">
          {lead.screenshot_signed_url ? (
            <button type="button" onClick={toggleExpanded} className="block" title="Toggle preview">
              <img
                src={lead.screenshot_signed_url} alt=""
                className="h-12 w-12 rounded border border-zinc-700 object-cover"
              />
            </button>
          ) : (
            <div className="h-12 w-12 rounded border border-dashed border-zinc-800" />
          )}
        </td>
        <td className="p-2 align-top">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-white">{lead.full_name || '—'}</span>
            {isBooked && <BookedBadge />}
          </div>
          <div className="text-xs text-zinc-400">{lead.brand_name || '—'}</div>
          <div className="mt-0.5 flex items-center gap-2 text-xs text-zinc-500 group">
            <span className="truncate max-w-[200px]">{lead.email || '—'}</span>
            {lead.email && (
              <button
                type="button" onClick={() => handleCopy(lead.email, 'Email')}
                title="Copy email"
                className="opacity-0 group-hover:opacity-100 transition-opacity text-zinc-500 hover:text-zinc-200"
              >
                <CopyIcon />
              </button>
            )}
            {lead.whatsapp && (
              <button
                type="button" onClick={() => handleCopy(lead.whatsapp, 'WhatsApp')}
                title="Copy WhatsApp"
                className="opacity-0 group-hover:opacity-100 transition-opacity text-zinc-500 hover:text-zinc-200 inline-flex items-center gap-1"
              >
                <CopyIcon />
                <span className="text-[10px] uppercase tracking-wider">WA</span>
              </button>
            )}
          </div>
        </td>
        <td className="p-2 align-top text-xs text-zinc-300">
          {lead.platform_type || '—'}
          {lead.social_platform ? <div className="text-zinc-500">{lead.social_platform}</div> : null}
        </td>
        <td className={`p-2 align-top text-sm font-bold ${scoreClass(lead.haven_score)}`}>
          {lead.haven_score ?? '—'}
        </td>
        <td className="p-2 align-top">
          <span className={`inline-block rounded-full border px-2 py-0.5 text-xs font-bold ${temperatureClass(lead.lead_temperature)}`}>
            {normaliseTemperature(lead.lead_temperature)}
          </span>
        </td>
        <td className="p-2 align-top text-xs text-zinc-300 max-w-[200px]">
          {lead.biggest_leak || '—'}
        </td>
        <td className="p-2 align-top text-xs text-zinc-400">{lead.utm_source || 'direct'}</td>
        <td className="p-2 align-top text-xs text-zinc-400" title={lead.pre_call_briefing ? 'Pre-call briefing ready' : 'No briefing'}>
          {lead.pre_call_briefing ? '✓' : '—'}
        </td>
        <td className="p-2 align-top text-xs text-zinc-400 whitespace-nowrap">
          <div>{formatDate(lead.created_at)}</div>
          <div className="text-[10px] text-zinc-600">{relativeTime(lead.created_at)}</div>
        </td>
        <td className="p-2 align-top min-w-[110px]">
          <StatusSelect value={lead.followup_status || 'pending'} onChange={onStatusChange} disabled={saving} />
        </td>
        <td className="p-2 align-top min-w-[180px]">
          <NotesField value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={onNotesBlur} />
        </td>
      </tr>
      {expanded && (
        <tr className="border-b border-zinc-800 bg-zinc-900/30">
          <td colSpan={12} className="p-4">
            <LeadDetails lead={lead} />
          </td>
        </tr>
      )}
    </>
  );
}

// ─── Mobile card ────────────────────────────────────────────────

function LeadCard({ lead, password, onLeadChange, onAuthLost, showToast }) {
  const [expanded, setExpanded] = useState(false);
  const { saving, notes, setNotes, onStatusChange, onNotesBlur, handleCopy } =
    useLeadActions({ lead, password, onLeadChange, onAuthLost, showToast });

  const toggleExpanded = () => setExpanded((v) => !v);
  const isBooked = Boolean(lead.call_booked_at);

  return (
    <article className={`rounded-xl border p-3 ${urgencyCardClass(lead.lead_temperature)}`}>
      <div className="flex items-start justify-between gap-2">
        <button
          type="button" onClick={toggleExpanded}
          aria-label={expanded ? 'Collapse' : 'Expand'}
          className="flex-1 text-left"
        >
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-white">{lead.full_name || '—'}</span>
            {isBooked && <BookedBadge />}
          </div>
          <div className="text-xs text-zinc-400 mt-0.5">{lead.brand_name || '—'}</div>
          <div className="text-xs text-zinc-500 mt-0.5 break-all">{lead.email || '—'}</div>
        </button>
        <button
          type="button" onClick={toggleExpanded}
          aria-label={expanded ? 'Collapse' : 'Expand'}
          className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-white flex-shrink-0"
        >
          <ChevronRightIcon expanded={expanded} />
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
        <span className={`rounded-full border px-2 py-0.5 font-bold ${temperatureClass(lead.lead_temperature)}`}>
          {normaliseTemperature(lead.lead_temperature)}
        </span>
        <span className={`rounded-full border border-zinc-700 bg-zinc-950 px-2 py-0.5 font-mono ${scoreClass(lead.haven_score)}`}>
          Score {lead.haven_score ?? '—'}
        </span>
        <span className="rounded-full border border-zinc-700 bg-zinc-950 px-2 py-0.5 text-zinc-400">
          {lead.platform_type || '—'}
        </span>
        <span className="ml-auto text-[10px] text-zinc-500">
          {relativeTime(lead.created_at)}
        </span>
      </div>

      {lead.biggest_leak && (
        <p className="mt-2 text-xs text-zinc-300">
          <span className="text-zinc-500">Leak:</span> {lead.biggest_leak}
        </p>
      )}

      <div className="mt-3 flex gap-2">
        {lead.email && (
          <button
            type="button" onClick={() => handleCopy(lead.email, 'Email')}
            className="inline-flex items-center gap-1 rounded border border-zinc-700 px-2 py-1 text-[11px] text-zinc-300 hover:bg-zinc-800"
          >
            <CopyIcon /> Email
          </button>
        )}
        {lead.whatsapp && (
          <button
            type="button" onClick={() => handleCopy(lead.whatsapp, 'WhatsApp')}
            className="inline-flex items-center gap-1 rounded border border-zinc-700 px-2 py-1 text-[11px] text-zinc-300 hover:bg-zinc-800"
          >
            <CopyIcon /> WhatsApp
          </button>
        )}
      </div>

      <div className="mt-3 space-y-2">
        <label className="block text-[10px] uppercase tracking-wider text-zinc-500">
          Follow-up
          <div className="mt-1">
            <StatusSelect value={lead.followup_status || 'pending'} onChange={onStatusChange} disabled={saving} />
          </div>
        </label>
        <label className="block text-[10px] uppercase tracking-wider text-zinc-500">
          Notes
          <div className="mt-1">
            <NotesField value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={onNotesBlur} />
          </div>
        </label>
      </div>

      {expanded && (
        <div className="mt-4 border-t border-zinc-800 pt-4">
          <LeadDetails lead={lead} />
        </div>
      )}
    </article>
  );
}

// ─── Dashboard ──────────────────────────────────────────────────

export default function AdminDashboard() {
  const [password, setPassword] = useState(() => sessionStorage.getItem(PASSWORD_KEY) || '');
  const [authorised, setAuthorised] = useState(false);
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState({
    temperature: 'All',
    followup: 'All',
    dateRange: 'all',
    search: '',
  });
  const [sortId, setSortId] = useState('newest');
  const [page, setPage] = useState(1);
  const [toast, setToast] = useState(null);

  const showToast = useCallback((kind, text) => {
    setToast({ kind, text, id: Date.now() });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const handleAuthLost = useCallback(() => {
    sessionStorage.removeItem(PASSWORD_KEY);
    setPassword('');
    setAuthorised(false);
    setLeads([]);
  }, []);

  const load = useCallback(async (pw) => {
    setLoading(true);
    setError('');
    const result = await apiFetchLeads(pw || password);
    setLoading(false);
    if (result.ok) {
      setLeads(result.leads);
      setAuthorised(true);
    } else if (result.code === 'unauthorised') {
      handleAuthLost();
    } else {
      setError(result.error || 'Could not load leads.');
    }
  }, [password, handleAuthLost]);

  useEffect(() => {
    const cached = sessionStorage.getItem(PASSWORD_KEY);
    if (cached) {
      setPassword(cached);
      void load(cached);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const onAuth = (pw) => {
    sessionStorage.setItem(PASSWORD_KEY, pw);
    setPassword(pw);
    setAuthorised(true);
    void load(pw);
  };

  const updateLead = (updated) => {
    setLeads((current) => current.map((l) => (l.id === updated.id ? { ...l, ...updated } : l)));
  };

  const processed = useMemo(() => {
    const now = Date.now();
    const rangeDays = DATE_RANGES.find((r) => r.id === filters.dateRange)?.days ?? null;

    const filtered = leads.filter((lead) => {
      if (filters.temperature !== 'All') {
        const norm = normaliseTemperature(lead.lead_temperature);
        if (norm !== filters.temperature) return false;
      }
      if (filters.followup !== 'All' && (lead.followup_status || 'pending') !== filters.followup) return false;
      if (rangeDays != null) {
        const created = lead.created_at ? new Date(lead.created_at).getTime() : 0;
        if (!created || now - created > rangeDays * 86400000) return false;
      }
      if (filters.search) {
        const q = filters.search.toLowerCase();
        const hay = `${lead.full_name || ''} ${lead.brand_name || ''} ${lead.email || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    const byCreated = (a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0);
    const comparators = {
      newest: byCreated,
      oldest: (a, b) => -byCreated(a, b),
      score_desc: (a, b) => (Number(b.haven_score) || -1) - (Number(a.haven_score) || -1),
      score_asc: (a, b) => {
        const av = a.haven_score == null ? 999 : Number(a.haven_score);
        const bv = b.haven_score == null ? 999 : Number(b.haven_score);
        return av - bv;
      },
      hot_first: (a, b) => temperatureRank(b.lead_temperature) - temperatureRank(a.lead_temperature) || byCreated(a, b),
      cold_first: (a, b) => temperatureRank(a.lead_temperature) - temperatureRank(b.lead_temperature) || byCreated(a, b),
    };

    return [...filtered].sort(comparators[sortId] || byCreated);
  }, [leads, filters, sortId]);

  useEffect(() => { setPage(1); }, [filters, sortId]);

  const totalPages = Math.max(1, Math.ceil(processed.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pagedLeads = processed.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const exportCsv = () => {
    const columns = [
      'id', 'full_name', 'brand_name', 'email', 'whatsapp', 'platform_type',
      'social_platform', 'social_link', 'website_url', 'haven_score',
      'biggest_leak', 'assessment_summary', 'lead_temperature',
      'utm_source', 'device_type', 'clicked_booking_link', 'clicked_playbook_link',
      'converted_to_call', 'converted_to_purchase', 'deal_value',
      'followup_status', 'followup_notes', 'call_booked_at', 'created_at', 'updated_at',
    ];
    const quote = (v) => `"${String(v ?? '').replaceAll('"', '""')}"`;
    const content = [
      columns.join(','),
      ...processed.map((lead) => columns.map((c) => quote(lead[c])).join(',')),
    ].join('\n');
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tmh-leads-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!authorised) return <LoginScreen onAuth={onAuth} />;

  return (
    <main className="min-h-screen bg-zinc-950 p-3 text-zinc-100 sm:p-6">
      <div className="mx-auto max-w-[1400px]">
        <header className="mb-4 sm:mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold">TMH Leads</h1>
            <p className="text-xs sm:text-sm text-zinc-400">
              {leads.length} total · {processed.length} shown
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => void load()}
              disabled={loading}
              className="rounded-lg border border-zinc-700 px-3 py-2 text-xs sm:text-sm hover:bg-zinc-800 disabled:opacity-50"
            >
              {loading ? 'Refreshing…' : 'Refresh'}
            </button>
            <button
              onClick={exportCsv}
              className="rounded-lg border border-zinc-700 px-3 py-2 text-xs sm:text-sm hover:bg-zinc-800"
            >
              Export CSV
            </button>
            <button
              onClick={handleAuthLost}
              className="rounded-lg border border-zinc-700 px-3 py-2 text-xs sm:text-sm hover:bg-zinc-800"
            >
              Log out
            </button>
          </div>
        </header>

        <section className="mb-4 grid gap-2 sm:gap-3 rounded-xl border border-zinc-800 bg-zinc-900 p-3 sm:p-4 grid-cols-2 md:grid-cols-4">
          <select
            value={filters.temperature}
            onChange={(e) => setFilters((f) => ({ ...f, temperature: e.target.value }))}
            className="rounded-lg border border-zinc-700 bg-zinc-950 p-2 text-sm"
          >
            {TEMPERATURES.map((t) => <option key={t} value={t}>{t === 'All' ? 'All temps' : t}</option>)}
          </select>
          <select
            value={filters.followup}
            onChange={(e) => setFilters((f) => ({ ...f, followup: e.target.value }))}
            className="rounded-lg border border-zinc-700 bg-zinc-950 p-2 text-sm"
          >
            {FOLLOWUP_FILTERS.map((s) => <option key={s} value={s}>{s === 'All' ? 'All follow-ups' : s}</option>)}
          </select>
          <select
            value={filters.dateRange}
            onChange={(e) => setFilters((f) => ({ ...f, dateRange: e.target.value }))}
            className="rounded-lg border border-zinc-700 bg-zinc-950 p-2 text-sm"
          >
            {DATE_RANGES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
          </select>
          <select
            value={sortId}
            onChange={(e) => setSortId(e.target.value)}
            className="rounded-lg border border-zinc-700 bg-zinc-950 p-2 text-sm"
          >
            {SORTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
          <input
            value={filters.search}
            onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
            placeholder="Search name, brand, email…"
            className="rounded-lg border border-zinc-700 bg-zinc-950 p-2 text-sm col-span-2 md:col-span-4"
          />
        </section>

        {error && <p className="mb-4 rounded-lg bg-red-500/10 p-3 text-sm text-red-200">{error}</p>}

        {/* Desktop table */}
        <section className="hidden md:block overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-900">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-zinc-800 text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="w-8 p-2"></th>
                <th className="p-2">Shot</th>
                <th className="p-2">Name / Brand</th>
                <th className="p-2">Platform</th>
                <th className="p-2">Score</th>
                <th className="p-2">Temp</th>
                <th className="p-2">Leak</th>
                <th className="p-2">UTM</th>
                <th className="p-2">Briefed</th>
                <th className="p-2">Created</th>
                <th className="p-2">Follow-up</th>
                <th className="p-2">Notes</th>
              </tr>
            </thead>
            <tbody>
              {loading && leads.length === 0 ? (
                <tr><td colSpan={12} className="p-6 text-center text-zinc-500">Loading…</td></tr>
              ) : pagedLeads.length === 0 ? (
                <tr><td colSpan={12} className="p-6 text-center text-zinc-500">No leads match these filters.</td></tr>
              ) : (
                pagedLeads.map((lead) => (
                  <LeadRow
                    key={lead.id}
                    lead={lead}
                    password={password}
                    onLeadChange={updateLead}
                    onAuthLost={handleAuthLost}
                    showToast={showToast}
                  />
                ))
              )}
            </tbody>
          </table>
        </section>

        {/* Mobile cards */}
        <section className="md:hidden space-y-3">
          {loading && leads.length === 0 ? (
            <p className="p-6 text-center text-zinc-500 text-sm">Loading…</p>
          ) : pagedLeads.length === 0 ? (
            <p className="p-6 text-center text-zinc-500 text-sm">No leads match these filters.</p>
          ) : (
            pagedLeads.map((lead) => (
              <LeadCard
                key={lead.id}
                lead={lead}
                password={password}
                onLeadChange={updateLead}
                onAuthLost={handleAuthLost}
                showToast={showToast}
              />
            ))
          )}
        </section>

        {processed.length > PAGE_SIZE && (
          <nav className="mt-4 flex items-center justify-between text-xs sm:text-sm">
            <span className="text-zinc-500">
              Page {safePage} of {totalPages} · {processed.length} leads
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={safePage <= 1}
                className="rounded-lg border border-zinc-700 px-3 py-1.5 hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Prev
              </button>
              <span className="px-1 text-zinc-400">{safePage} / {totalPages}</span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={safePage >= totalPages}
                className="rounded-lg border border-zinc-700 px-3 py-1.5 hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </nav>
        )}
      </div>

      {toast && (
        <div
          key={toast.id}
          className={`fixed bottom-6 right-6 z-50 rounded-lg border px-4 py-2.5 text-sm shadow-lg backdrop-blur-sm ${
            toast.kind === 'error'
              ? 'bg-red-500/15 border-red-500/30 text-red-200'
              : 'bg-emerald-500/15 border-emerald-500/30 text-emerald-200'
          }`}
        >
          {toast.text}
        </div>
      )}
    </main>
  );
}
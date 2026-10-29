import VerificationAttemptsPanel from '../components/admin/VerificationAttemptsPanel';
import APIUsagePanel from '../components/admin/APIUsagePanel';
import {observeAdminSession} from '../lib/adminSession';
import LoginScreen from '../components/admin/AdminSignIn';
import { adminSupabase as supabase } from '../lib/adminAuth';
import InquiryWorkflow from '../components/admin/InquiryWorkflow';
import TeamAssignment from '../components/admin/TeamAssignment';
import { SERVICE_NAMES } from '../../supabase/functions/_shared/team-assignment-public.js';
import { INQUIRY_STATUSES, lagosDate, inquiryDue, csvCell, splitSupportSessions, workspaceMetrics } from '../lib/adminWorkspace';
// src/pages/AdminDashboard.jsx
// Admin workspace. Password-gated. Data flows through
// admin-fetch-leads / admin-update-lead edge functions.
// Responsive: roomy cards on laptops, a contained table on wide screens.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const FETCH_URL = `${SUPABASE_URL}/functions/v1/admin-fetch-leads`;
const UPDATE_URL = `${SUPABASE_URL}/functions/v1/admin-update-lead`;
const FLAG_URL = `${SUPABASE_URL}/functions/v1/flag-user`;
const RETRY_PURCHASE_URL = `${SUPABASE_URL}/functions/v1/admin-retry-purchase-email`;
const ASSIGNMENT_URL = `${SUPABASE_URL}/functions/v1/admin-team-assignment`;

const PAGE_SIZE = 25;
const transcriptCache = new Map();
const transcriptRequests = new Map();
const ADMIN_TABS = [
  { id: 'leads', label: 'Leads' },
  { id: 'purchases', label: 'Playbook Purchases' },
  { id: 'bookings', label: 'Bookings' },
  { id: 'team', label: 'Team Inquiries' },
  { id: 'support', label: 'Support Chats' },
  { id: 'service', label: 'Service Chats' },
];

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
  { key: 'clarity', label: 'Clarity', max: 25 },
  { key: 'trust', label: 'Trust signals', max: 25 },
  { key: 'positioning', label: 'Positioning', max: 25 },
  { key: 'conversion', label: 'Conversion path', max: 25 },
];
const SOCIAL_CATEGORIES = [
  { key: 'profile', label: 'Profile setup', max: 25 },
  { key: 'direction', label: 'Visible content direction', max: 25 },
  { key: 'value', label: 'Value proposition', max: 25 },
  { key: 'readiness', label: 'Conversion readiness', max: 25 },
];
const LEGACY_WEBSITE_CATEGORIES = [
  { key: 'clarity',    label: 'Clarity',    max: 20 },
  { key: 'trust',      label: 'Trust',      max: 20 },
  { key: 'conversion', label: 'Conversion', max: 20 },
  { key: 'technical',  label: 'Technical',  max: 20 },
  { key: 'content',    label: 'Content',    max: 20 },
];
const LEGACY_SOCIAL_CATEGORIES = [
  { key: 'profile',     label: 'Profile',     max: 25 },
  { key: 'consistency', label: 'Consistency', max: 25 },
  { key: 'engagement',  label: 'Engagement',  max: 25 },
  { key: 'readiness',   label: 'Readiness',   max: 25 },
];

// ─── Helpers ────────────────────────────────────────────────────

function apiHeaders(accessToken) {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${accessToken}`,
    apikey: SUPABASE_ANON_KEY,
  };
}

async function apiRequest(url, accessToken, payload = {}) {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: apiHeaders(accessToken),
      body: JSON.stringify(payload),
      signal: typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(20000) : undefined,
    });
    if ((res.status === 401 || res.status === 403)) return { ok: false, code: 'unauthorised' };
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) return { ok: false, code: data.code === 'conflict' ? 'conflict' : 'error', session: data.session, error: data.error || `Error ${res.status}`, review: data.review, visitor: data.visitor, purchase: data.purchase };
    return data;
  } catch {
    return { ok: false, code: 'error', error: 'Could not reach the server. Please try again.' };
  }
}

async function apiFetchLeads(accessToken) {
  const data = await apiRequest(FETCH_URL, accessToken);
  return data.ok ? {
    ...data,
    bookings: Array.isArray(data.bookings) ? data.bookings : [],
    leads: Array.isArray(data.leads) ? data.leads : [],
    purchases: Array.isArray(data.playbook_purchases) ? data.playbook_purchases : Array.isArray(data.purchases) ? data.purchases : [],
    support_sessions: splitSupportSessions(data.support_sessions, data.team_inquiries).support,
    team_inquiries: splitSupportSessions(data.support_sessions, data.team_inquiries).team,
    service_sessions: Array.isArray(data.service_sessions) ? data.service_sessions : [],
  } : data;
}

async function apiUpdateLead(accessToken, updates) {
  return apiRequest(UPDATE_URL, accessToken, updates);
}

async function apiFlagUser(accessToken, email, status, reason) {
  const res = await fetch(FLAG_URL, {
    method: 'POST',
    headers: apiHeaders(accessToken),
    body: JSON.stringify({ email, status, reason }),
  });
  if (res.status === 401) return { ok: false, code: 'unauthorised' };
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) {
    return { ok: false, code: data.code === 'conflict' ? 'conflict' : 'error', session: data.session, error: data.error || `Error ${res.status}`, review: data.review };
  }
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
  if (score >= 80) return 'text-zinc-100';
  if (score >= 50) return 'text-zinc-200';
  return 'text-red-300';
}

function categoryScoreClass(score, max) {
  if (score == null || !max) return 'text-zinc-500';
  const pct = (Number(score) / Number(max)) * 100;
  if (pct < 50) return 'text-red-300';
  if (pct <= 75) return 'text-zinc-300';
  return 'text-zinc-100';
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
          const isAgent = msg.role === 'agent' || msg.role === 'assistant';
          return (
            <div key={msg.id || idx} className={`flex flex-col ${isAgent ? 'items-start' : 'items-end'}`}>
              <span className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1 px-1">
                {isAgent ? 'Haven' : 'User'}
              </span>
              <div
                className={`max-w-[85%] rounded-xl px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap break-words ${
                  isAgent
                    ? 'bg-white/[0.025] text-zinc-200 border border-white/[0.06]'
                    : 'bg-white/[0.07] text-zinc-100 border border-white/10'
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

function TranscriptPanel({ session, accessToken, onAuthLost }) {
  const cacheKey = `${session.id}:${session.updated_at || session.last_session_update || ''}`;
  const [transcript, setTranscript] = useState(() => transcriptCache.get(cacheKey) || (session.transcript_loaded !== false && Array.isArray(session.messages) ? session : null));
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (transcript) return;
    let active = true;
    let request = transcriptRequests.get(cacheKey);
    if (!request) {
      request = apiRequest(FETCH_URL, accessToken, { action: 'transcript', sessionId: session.id });
      transcriptRequests.set(cacheKey, request);
      request.finally(() => { if (transcriptRequests.get(cacheKey) === request) transcriptRequests.delete(cacheKey); });
    }
    request.then((result) => {
      if (!active) return;
      if (result.code === 'unauthorised') { onAuthLost?.(); return; }
      if (!result.ok || !Array.isArray(result.session?.messages)) {
        setError(result.error || 'Could not load this conversation. Please retry.');
        return;
      }
      transcriptCache.set(cacheKey, result.session);
      while (transcriptCache.size > 25) transcriptCache.delete(transcriptCache.keys().next().value);
      setTranscript(result.session);
    });
    return () => { active = false; };
  }, [attempt, cacheKey, onAuthLost, accessToken, session.id, transcript]);
  const refresh = () => { transcriptCache.delete(cacheKey); setTranscript(null); setError(''); setAttempt((value) => value + 1); };
  if (error) return <div role="alert" className="space-y-3 text-sm text-red-300"><p>{error}</p><button type="button" onClick={() => { setError(''); setAttempt((value) => value + 1); }} className="rounded-lg border border-white/15 px-3 py-2 text-xs text-zinc-200">Retry transcript</button></div>;
  if (!transcript) return <p role="status" className="animate-pulse text-xs text-zinc-500">Loading conversation…</p>;
  return <div className="space-y-3"><div className="flex flex-wrap items-center justify-between gap-3"><p className="text-[11px] leading-relaxed text-zinc-500">Saved conversation · up to the latest 200 stored messages. Uploaded image contents are omitted.</p><button type="button" onClick={refresh} className="rounded-lg border border-white/15 px-3 py-2 text-xs text-zinc-200">Refresh transcript</button></div><TranscriptViewer session={transcript} /></div>;
}

function LeadConversations({ lead, accessToken, onAuthLost }) {
  const sessions = Array.isArray(lead.sessions) ? lead.sessions : lead.session ? [{ scope: 'audit', ...lead.session }] : [];
  const [scope, setScope] = useState(() => sessions.some((session) => session.scope === 'audit') ? 'audit' : sessions[0]?.scope || 'audit');
  const [selectedId, setSelectedId] = useState('');
  const matching = sessions.filter((session) => session.scope === scope);
  const selected = matching.find((session) => session.id === selectedId) || matching[0];
  return <div className="space-y-4">
    <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Lead conversation scope">
      {['audit', 'support', 'service'].map((value, index) => {
        const count = sessions.filter((session) => session.scope === value).length;
        return <button key={value} id={`lead-${lead.id}-${value}`} type="button" role="tab" aria-selected={scope === value} aria-controls={`lead-${lead.id}-conversation`} tabIndex={scope === value ? 0 : -1} onClick={() => { setScope(value); setSelectedId(''); }} onKeyDown={(event) => {
          const delta = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
          if (!delta && !['Home','End'].includes(event.key)) return;
          event.preventDefault();
          const next = event.key === 'Home' ? 0 : event.key === 'End' ? 2 : (index + delta + 3) % 3;
          setScope(['audit','support','service'][next]); setSelectedId('');
          event.currentTarget.parentElement.querySelectorAll('[role="tab"]')[next]?.focus();
        }} className={`rounded-lg border px-3 py-2 text-xs capitalize transition-colors ${scope === value ? 'border-white/20 bg-white/10 text-white' : 'border-white/[0.06] text-zinc-500 hover:text-zinc-200'}`}>{value === 'audit' ? 'Brand review' : value} <span className="ml-1 text-zinc-500">{count}</span></button>;
      })}
    </div>
    {lead.sessions_error && <p role="alert" className="text-xs text-amber-300">{lead.sessions_error}</p>}
    {matching.length > 1 && <label className="block space-y-2 text-xs text-zinc-400"><span>Conversation</span><select value={selected?.id || ''} onChange={(event) => setSelectedId(event.target.value)} className="w-full rounded-lg border border-white/10 bg-zinc-950 p-2 text-zinc-200">{matching.map((session) => <option key={session.id} value={session.id}>{formatDate(session.updated_at || session.created_at)} · {session.service_id || session.id}</option>)}</select></label>}
    <div role="tabpanel" id={`lead-${lead.id}-conversation`} aria-labelledby={`lead-${lead.id}-${scope}`} tabIndex={0}>
      {selected && <p className="mb-3 break-all font-mono text-[11px] text-zinc-500">Session ID: {selected.id}{selected.service_id ? ` · ${selected.service_id}` : ''}</p>}
      {selected ? <TranscriptPanel key={`${selected.id}:${selected.updated_at || ''}`} session={selected} accessToken={accessToken} onAuthLost={onAuthLost} /> : <p className="text-xs text-zinc-500">No {scope === 'audit' ? 'brand review' : scope} conversation is linked to this lead.</p>}
    </div>
  </div>;
}

function ScoreBreakdown({ lead }) {
  const breakdown = lead.score_breakdown;
  if (!breakdown) return null;

  const isSocial = lead.platform_type === 'social';
  const currentRubric = lead.rubric_version === '2026-10-27';
  const categories = currentRubric ? (isSocial ? SOCIAL_CATEGORIES : WEBSITE_CATEGORIES) : (isSocial ? LEGACY_SOCIAL_CATEGORIES : LEGACY_WEBSITE_CATEGORIES);

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
      <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium mb-2">{currentRubric ? 'Visible material review' : 'Previous review method'}</p>
      <p className="mb-3 text-[11px] leading-relaxed text-zinc-500">{currentRubric ? `Based on the ${isSocial ? 'profile screenshot' : 'website text'} supplied. This is not a technical test or a sales forecast.` : 'Saved under the earlier rubric. These numbers have not been relabelled or recalculated.'}</p>
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

function LeadDetails({ lead, onDelete, saving, accessToken, onAuthLost }) {
  return (
    <div className="min-w-0 space-y-4 md:max-w-[calc(100vw-6rem)] 2xl:max-w-none">
    <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
      <div className="min-w-0 space-y-3">
        {lead.screenshot_signed_url && (
          <img
            src={lead.screenshot_signed_url}
            alt={`${lead.brand_name} screenshot`}
            className="w-full rounded-lg border border-zinc-700"
          />
        )}
        <ScoreBreakdown lead={lead} />
      </div>
      <div className="min-w-0 space-y-2 text-xs text-zinc-300 [overflow-wrap:anywhere]">
        <p><span className="text-zinc-500">WhatsApp:</span> {lead.whatsapp || '—'}</p>
        <p><span className="text-zinc-500">Main goal:</span> {lead.main_goal || '—'}</p>
        <p><span className="text-zinc-500">Website:</span> {lead.website_url || '—'}</p>
        <p><span className="text-zinc-500">Social:</span> {lead.social_link || '—'}</p>
        <p><span className="text-zinc-500">Booking / Playbook:</span> {lead.clicked_booking_link ? 'Yes' : 'No'} / {lead.clicked_playbook_link ? 'Yes' : 'No'}</p>
        <p><span className="text-zinc-500">Deal value:</span> {currency(lead.deal_value)}</p>
        <p><span className="text-zinc-500">Review email:</span> {lead.welcome_email_sent ? 'Accepted by email provider' : lead.welcome_email_id ? 'Provider accepted; saved status needs repair' : lead.welcome_email_attempted_at ? 'Pending' : 'Not attempted / not recorded'}</p>
        {lead.welcome_email_attempted_at && <p><span className="text-zinc-500">Last email attempt:</span> {formatDate(lead.welcome_email_attempted_at)}</p>}
        {lead.welcome_email_last_error && !lead.welcome_email_sent && <p className="text-red-300">Review email diagnostic: {lead.welcome_email_last_error}</p>}
        {lead.session && (
          <p>
            <span className="text-zinc-500">Session:</span>{' '}
            {lead.session.total_exchanges} exchanges · {lead.session.current_step || '—'} ·{' '}
            last update {formatDate(lead.session.updated_at || lead.session.last_session_update)}
          </p>
        )}
        {lead.assessment_summary && (
          <p><span className="text-zinc-500">Summary:</span> {lead.assessment_summary}</p>
        )}
        {lead.pre_call_briefing && (
          <p><span className="text-zinc-500">Briefing:</span> {lead.pre_call_briefing}</p>
        )}
      </div>
      <div className="min-w-0 lg:col-span-2 border-t border-white/[0.06] pt-4">
        <LeadConversations lead={lead} accessToken={accessToken} onAuthLost={onAuthLost} />
      </div>
    </div>
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-800 pt-4">
      <p className="text-xs text-zinc-500">Deleting this lead also removes its chat sessions. Purchases and booking history are retained. Manage meeting cancellations in Calendly.</p>
      <button type="button" onClick={onDelete} disabled={saving}
        className="rounded-lg border border-red-500/30 px-3 py-2 text-xs font-medium text-red-300 hover:bg-red-500/10 disabled:opacity-50">
        {saving ? 'Saving…' : 'Delete Lead'}
      </button>
    </div>
    </div>
  );
}

function WelcomeEmailStatus({ lead, retrying, onRetry }) {
  const accepted = lead.welcome_email_sent === true;
  const recordedAcceptance = Boolean(lead.welcome_email_id);
  const label = accepted ? 'Provider accepted' : recordedAcceptance ? 'Acceptance saved · status pending' : lead.welcome_email_last_error ? 'Needs retry' : lead.welcome_email_attempted_at ? 'Pending acceptance' : 'Not recorded';
  return <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[11px]" aria-label={`Review email for ${lead.email || lead.full_name || 'lead'}`}>
    <span className="text-zinc-500">Review email</span>
    <span title={accepted || recordedAcceptance ? 'Accepted by the email provider. Inbox delivery is not confirmed here.' : lead.welcome_email_last_error || 'No provider acceptance has been recorded.'}
      className={`rounded border px-1.5 py-0.5 ${accepted ? 'border-white/10 text-zinc-300' : 'border-amber-400/20 text-amber-200'}`}>{label}</span>
    {!accepted && lead.email && onRetry && <button type="button" disabled={retrying} onClick={onRetry} aria-label={`${recordedAcceptance ? 'Repair review email status' : 'Retry review email'} for ${lead.email}`}
      className="rounded border border-white/15 px-2 py-1 text-zinc-300 hover:bg-white/[0.06] disabled:opacity-50">{retrying ? 'Checking…' : recordedAcceptance ? 'Repair status' : 'Retry email'}</button>}
  </div>;
}

function AISetupPanel({ accessToken, onAuthLost }) {
  const [checking, setChecking] = useState(false);
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');
  const requestLock = useRef(false);
  const checkSetup = async () => {
    if (requestLock.current) return;
    requestLock.current = true; setChecking(true); setError('');
    try {
      const result = await apiRequest(FETCH_URL, accessToken, { action: 'aiHealth' });
      if (result.ok) setReport(result);
      else if (result.code === 'unauthorised') onAuthLost();
      else setError(result.error || 'The AI setup check could not finish. Try again shortly.');
    } finally { requestLock.current = false; setChecking(false); }
  };
  return <section aria-label="AI provider setup" className="mb-4 rounded-xl border border-white/[0.06] px-4 py-3 text-xs text-zinc-400">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><p className="font-medium text-zinc-300">AI provider setup</p><p className="mt-1 leading-relaxed text-zinc-500">Checks configuration and model access without generating a reply or sending chat content.</p></div>
      <button type="button" onClick={checkSetup} disabled={checking} className="shrink-0 rounded-lg border border-white/15 px-3 py-2 text-zinc-200 hover:bg-white/[0.04] disabled:opacity-50">{checking ? 'Checking AI setup…' : 'Check AI setup'}</button>
    </div>
    {error && <p role="alert" className="mt-3 text-amber-200">{error}</p>}
    {report && <div role="status" className="mt-4 space-y-3 border-t border-white/[0.06] pt-3">
      <dl className="grid min-w-0 gap-3 sm:grid-cols-2">
        <div className="min-w-0"><dt className="text-zinc-500">Gemini · primary</dt><dd className="mt-1 break-words font-medium text-zinc-200">{report.gemini?.model || 'No model reported'}</dd><dd className="mt-1 leading-relaxed">{report.gemini?.configured ? 'Key configured' : 'Key missing'} · {report.gemini?.enabled ? 'Enabled' : 'Disabled'}{report.gemini?.status != null && ` · ${report.gemini.status}`}</dd>{report.gemini?.code && <dd className="mt-1 break-all text-amber-200">{report.gemini.code}</dd>}</div>
        <div className="min-w-0"><dt className="text-zinc-500">Groq · fallback</dt><dd className="mt-1 break-words font-medium text-zinc-200">{report.groq?.model || 'No model reported'}</dd><dd className="mt-1">{report.groq?.configured ? 'Key configured' : 'Key missing'}</dd></div>
      </dl>
      <p className="leading-relaxed text-zinc-500">{report.note || 'A successful model check does not guarantee generation capacity. A 503 means temporary provider unavailability; it does not prove your token budget is exhausted.'}</p>
    </div>}
  </section>;
}

function StatusSelect({ value, onChange, disabled }) {
  return (
    <div className="relative">
      <select
        value={value}
        disabled={disabled}
        onChange={onChange}
        className="w-full appearance-none rounded-lg border border-white/10 bg-zinc-950/70 px-2 py-1.5 pr-7 text-xs text-white outline-none focus:border-white/30 disabled:opacity-60 cursor-pointer"
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
      className="w-full resize-y rounded-lg border border-white/10 bg-zinc-950/70 px-2 py-1.5 text-xs text-white placeholder:text-zinc-600 outline-none focus:border-white/30 transition-colors"
    />
  );
}

function FlagSelect({ lead, onChange, disabled }) {
  const status = ['yellow', 'red'].includes(lead.flag_status) ? lead.flag_status : 'white';
  const colour = status === 'red'
    ? 'border-red-500/40 bg-red-500/10 text-red-300'
    : status === 'yellow'
      ? 'border-yellow-500/40 bg-yellow-500/10 text-yellow-300'
      : 'border-zinc-700 bg-zinc-950 text-zinc-400';

  return (
    <span className="inline-flex flex-wrap items-center gap-2"><select
      value={status}
      onChange={onChange}
      disabled={disabled || (!lead.email && !lead.visitor_id)}
      aria-label={`User flag for ${lead.email || lead.visitor_id || lead.full_name || 'lead'}`}
      title={(lead.flag_reason || 'Change user access flag') + (lead.moderation_strikes ? ' · Recorded strikes: ' + lead.moderation_strikes : '')}
      className={`rounded-lg border px-2 py-1.5 text-xs outline-none focus:border-white/30 disabled:opacity-60 cursor-pointer ${colour}`}
    >
      <option value="white">{lead.moderation_strikes === 1 ? "White · 1 recorded strike" : "White · Normal"}</option>
      <option value="yellow">Yellow · Warning</option>
      <option value="red">Red · Restricted</option>
    </select>{status==='white' && Number(lead.moderation_strikes)>0 && <button type="button" disabled={disabled || (!lead.email && !lead.visitor_id)} onClick={()=>onChange({target:{value:'white'}})} className="text-[10px] text-zinc-400 underline underline-offset-4 disabled:opacity-40">Clear recorded strike</button>}</span>
  );
}

function BookedBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-white/15 bg-white/[0.05] px-1.5 py-0.5 text-[10px] text-zinc-300">
      <CalendarIcon />
      Booked
    </span>
  );
}

// ─── Actions hook (shared between desktop and mobile) ───────────

function useLeadActions({ lead, accessToken, onLeadChange, onLeadDelete, onAuthLost, showToast }) {
  const [saving, setSaving] = useState(false);
  const [notes, setNotes] = useState(lead.followup_notes || '');
  const [retryingWelcome, setRetryingWelcome] = useState(false);
  const notesRef = useRef(lead.followup_notes || '');
  const welcomeLock = useRef(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Mirror a refreshed server record into the editable draft.
    setNotes(lead.followup_notes || '');
    notesRef.current = lead.followup_notes || '';
  }, [lead.id, lead.followup_notes]);

  const save = useCallback(async (updates) => {
    setSaving(true);
    const result = await apiUpdateLead(accessToken, { reviewId: lead.id, ...updates });
    setSaving(false);
    if (result.ok) {
      if (updates.followupNotes !== undefined) notesRef.current = updates.followupNotes;
      onLeadChange({
        id: lead.id,
        ...Object.fromEntries(
          Object.entries(updates).map(([k, v]) => [k.replace(/[A-Z]/g, (l) => `_${l.toLowerCase()}`), v])
        ),
        ...result.review,
      });
    } else if (result.code === 'unauthorised') {
      onAuthLost();
    } else {
      showToast('error', result.error || 'Could not save.');
    }
  }, [lead, accessToken, onLeadChange, onAuthLost, showToast]);

  const onStatusChange = (e) => save({ followupStatus: e.target.value });
  const onDeleteLead = async () => {
    if (saving || !window.confirm(`Delete the lead for ${lead.brand_name || lead.full_name || 'this brand'} (${lead.email || lead.id})?\n\nThis permanently removes the review and its chat sessions. Purchases and booking history will be kept. Manage meeting cancellations in Calendly. This cannot be undone.`)) return;
    setSaving(true);
    try {
      const result = await apiUpdateLead(accessToken, { action: 'delete', reviewId: lead.id, confirmation: lead.id });
      if (result.ok && result.deletedId === lead.id) {
        onLeadDelete?.(lead.id);
        showToast(result.warning ? 'error' : 'success', result.warning || 'Lead deleted.');
      } else if (result.code === 'unauthorised') onAuthLost();
      else showToast('error', result.error || 'Could not delete the lead.');
    } finally {
      setSaving(false);
    }
  };
  const onFlagChange = async (e) => {
    const status = e.target.value;
    const reason = window.prompt('Reason for this flag (optional):', lead.flag_reason || '');
    if (reason === null) return;
    setSaving(true);
    try {
      const result = await apiFlagUser(accessToken, lead.email, status, reason.trim());
      if (result.review) onLeadChange({ id: lead.id, ...result.review });
      if (result.ok) {
        showToast('success', 'User flag updated.');
      } else if (result.code === 'unauthorised') {
        onAuthLost();
      } else {
        showToast('error', result.error || 'Could not update user flag.');
      }
    } catch {
      showToast('error', 'Could not reach the server.');
    } finally {
      setSaving(false);
    }
  };
  const onNotesBlur = () => {
    if (notes !== notesRef.current) {
      return save({ followupNotes: notes });
    }
  };
  const onRetryWelcome = async () => {
    if (welcomeLock.current) return;
    welcomeLock.current = true; setRetryingWelcome(true);
    try {
      const result = await apiRequest(UPDATE_URL, accessToken, { action: 'retryWelcome', reviewId: lead.id });
      if (result.review) onLeadChange({ id: lead.id, ...result.review });
      if (result.ok) showToast('success', 'Review email accepted by the provider. Inbox delivery is not confirmed here.');
      else if (result.code === 'unauthorised') onAuthLost();
      else showToast('error', result.error || 'The review email is still pending. Check its saved diagnostic and retry.');
    } finally { welcomeLock.current = false; setRetryingWelcome(false); }
  };
  const handleCopy = async (text, label) => {
    if (!text) return;
    await copyText(text, (success) => {
      showToast(success ? 'success' : 'error', success ? `${label} copied` : 'Copy failed');
    });
  };

  return { saving, notes, setNotes, onStatusChange, onFlagChange, onDeleteLead, onNotesBlur, handleCopy, retryingWelcome, onRetryWelcome };
}

// ─── Desktop table row ─────────────────────────────────────────

function LeadRow({ lead, accessToken, onLeadChange, onLeadDelete, onAuthLost, showToast }) {
  const [expanded, setExpanded] = useState(false);
  const { saving, notes, setNotes, onStatusChange, onFlagChange, onDeleteLead, onNotesBlur, handleCopy, retryingWelcome, onRetryWelcome } =
    useLeadActions({ lead, accessToken, onLeadChange, onLeadDelete, onAuthLost, showToast });

  const toggleExpanded = () => setExpanded((v) => !v);
  const isBooked = Boolean(lead.call_booked_at);
  const urgency = urgencyClass(lead.lead_temperature);

  return (
    <>
      <tr className={`border-b border-white/[0.06] hover:bg-white/[0.02] transition-colors ${urgency}`}>
        <td className="p-4 align-top">
          <button
            type="button" onClick={toggleExpanded}
            aria-label={expanded ? 'Collapse row' : 'Expand row'}
            className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-white"
          >
            <ChevronRightIcon expanded={expanded} />
          </button>
        </td>
        <td className="p-4 align-top">
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
        <td className="p-4 align-top">
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
          <WelcomeEmailStatus lead={lead} retrying={retryingWelcome} onRetry={onRetryWelcome} />
        </td>
        <td className="p-4 align-top text-xs text-zinc-300">
          {lead.platform_type || '—'}
          {lead.social_platform ? <div className="text-zinc-500">{lead.social_platform}</div> : null}
        </td>
        <td className={`p-4 align-top text-sm font-bold ${scoreClass(lead.haven_score)}`}>
          {lead.haven_score ?? '—'}
        </td>
        <td className="p-4 align-top">
          <span className={`inline-block whitespace-nowrap rounded-md border px-2 py-0.5 text-xs font-medium ${temperatureClass(lead.lead_temperature)}`}>
            {normaliseTemperature(lead.lead_temperature)}
          </span>
        </td>
        <td className="p-4 align-top">
          <FlagSelect lead={lead} onChange={onFlagChange} disabled={saving} />
        </td>
        <td className="p-4 align-top text-xs text-zinc-300 min-w-[280px] max-w-[360px] leading-relaxed">
          {lead.biggest_leak || '—'}
        </td>
        <td className="p-4 align-top text-xs text-zinc-400">{lead.utm_source || 'direct'}</td>
        <td className="p-4 align-top text-xs text-zinc-400" title={lead.pre_call_briefing ? 'Pre-call briefing ready' : 'No briefing'}>
          {lead.pre_call_briefing ? '✓' : '—'}
        </td>
        <td className="p-4 align-top text-xs text-zinc-400 whitespace-nowrap">
          <div>{formatDate(lead.created_at)}</div>
          <div className="text-[10px] text-zinc-600">{relativeTime(lead.created_at)}</div>
        </td>
        <td className="p-4 align-top min-w-[110px]">
          <StatusSelect value={lead.followup_status || 'pending'} onChange={onStatusChange} disabled={saving} />
        </td>
        <td className="p-4 align-top min-w-[180px]">
          <NotesField value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={onNotesBlur} />
        </td>
      </tr>
      {expanded && (
        <tr className="border-b border-white/[0.06] bg-black/10">
          <td colSpan={13} className="p-4">
            <LeadDetails lead={lead} onDelete={onDeleteLead} saving={saving} accessToken={accessToken} onAuthLost={onAuthLost} />
          </td>
        </tr>
      )}
    </>
  );
}

// ─── Mobile card ────────────────────────────────────────────────

function LeadCard({ lead, accessToken, onLeadChange, onLeadDelete, onAuthLost, showToast }) {
  const [expanded, setExpanded] = useState(false);
  const { saving, notes, setNotes, onStatusChange, onFlagChange, onDeleteLead, onNotesBlur, handleCopy, retryingWelcome, onRetryWelcome } =
    useLeadActions({ lead, accessToken, onLeadChange, onLeadDelete, onAuthLost, showToast });

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
        <FlagSelect lead={lead} onChange={onFlagChange} disabled={saving} />
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

      <WelcomeEmailStatus lead={lead} retrying={retryingWelcome} onRetry={onRetryWelcome} />

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
          <LeadDetails lead={lead} onDelete={onDeleteLead} saving={saving} accessToken={accessToken} onAuthLost={onAuthLost} />
        </div>
      )}
    </article>
  );
}

// ─── Dashboard ──────────────────────────────────────────────────

function PurchasesPanel({ purchases, error, accessToken, onAuthLost, onPurchaseChange, showToast }) {
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState('');
  const [retrying, setRetrying] = useState({});
  const [retryErrors, setRetryErrors] = useState({});
  const [checkingSetup, setCheckingSetup] = useState(false);
  const [emailSetup, setEmailSetup] = useState(null);
  const checkEmailSetup = async () => {
    setCheckingSetup(true);
    try {
      const result = await apiRequest(RETRY_PURCHASE_URL, accessToken, { action: 'checkConfiguration' });
      if (result.code === 'unauthorised') onAuthLost?.();
      setEmailSetup(result);
    } finally { setCheckingSetup(false); }
  };
  const retryLocks = useRef(new Set());
  const filtered = purchases.filter((purchase) => `${purchase.email || ''} ${purchase.reference || ''}`.toLowerCase().includes(query.trim().toLowerCase()));
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pages);
  const rows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const retryEmail = async (purchase) => {
    if (retryLocks.current.has(purchase.reference)) return;
    retryLocks.current.add(purchase.reference);
    setRetrying((current) => ({ ...current, [purchase.reference]: true }));
    setRetryErrors((current) => ({ ...current, [purchase.reference]: '' }));
    try {
      const result = await apiRequest(RETRY_PURCHASE_URL, accessToken, { reference: purchase.reference });
      if (result.purchase) onPurchaseChange?.(result.purchase);
      if (result.ok) showToast?.('success', result.skipped ? 'Thank-you email was already sent.' : 'Thank-you email sent.');
      else if (result.code === 'unauthorised') onAuthLost?.();
      else setRetryErrors((current) => ({ ...current, [purchase.reference]: result.error || 'Could not resend this email. Please retry.' }));
    } finally {
      retryLocks.current.delete(purchase.reference);
      setRetrying((current) => ({ ...current, [purchase.reference]: false }));
    }
  };
  return (
    <section aria-labelledby="purchases-heading" className="min-w-0 max-w-full overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.025] shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-zinc-800 p-4">
        <h2 id="purchases-heading" className="text-base font-semibold">Playbook Purchases</h2>
        <button type="button" disabled={checkingSetup} onClick={checkEmailSetup} className="rounded-lg border border-white/15 px-3 py-2 text-xs text-zinc-200 disabled:opacity-50">{checkingSetup ? 'Checking…' : 'Check email setup'}</button>
        <p className="text-xs text-zinc-500">{filtered.length} shown / {purchases.length} loaded · newest 500 maximum · NGN</p>
      </div>
      {emailSetup && <p role="status" className="border-b border-white/[0.06] px-4 py-3 text-xs leading-relaxed text-zinc-300">{emailSetup.from && <span className="mr-2">Sender: {emailSetup.from}.</span>}{emailSetup.message || emailSetup.error}</p>}
      <div className="p-4"><input aria-label="Search purchases" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Search buyer email or payment reference" className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-2.5 text-sm outline-none focus:border-white/30" /></div>
      {error ? <p role="alert" className="p-4 text-sm text-red-300">{error}</p> : rows.length === 0 ? (
        <p className="p-4 text-sm text-zinc-500">{query ? 'No purchases match this search.' : 'No purchases recorded yet.'}</p>
      ) : (
        <div className="max-w-full overflow-x-auto overscroll-x-contain">
          <table className="w-full min-w-[640px] text-left text-sm [&_td]:p-4 [&_td]:align-top [&_th]:p-4">
            <thead className="text-xs uppercase tracking-wide text-zinc-500">
              <tr><th className="p-3">Buyer email</th><th className="p-3">Reference</th><th className="p-3">Amount</th><th className="p-3">Purchased</th><th className="p-3">Thank-you email</th></tr>
            </thead>
            <tbody>{rows.map((purchase) => (
              <tr key={purchase.id || purchase.reference} className="border-t border-zinc-800">
                <td className="p-3 break-all text-zinc-200">{purchase.email}</td>
                <td className="p-3 break-all font-mono text-xs text-zinc-400">{purchase.reference}</td>
                <td className="p-3 whitespace-nowrap">{purchase.amount == null ? '—' : currency(Number(purchase.amount) / 100)}</td>
                <td className="p-3 whitespace-nowrap text-xs text-zinc-400">{formatDate(purchase.created_at)}</td>
                <td className="p-3 text-xs text-zinc-400">
                  <span title={purchase.thankyou_sent || purchase.thankyou_email_id ? 'Accepted by the email provider. Inbox delivery is not confirmed here.' : 'Waiting for provider acceptance.'} className={purchase.thankyou_sent ? 'text-zinc-200' : 'text-amber-300'}>{purchase.thankyou_sent ? 'Sent' : purchase.thankyou_email_id ? 'Accepted · tracking pending' : 'Pending'}</span>
                  {purchase.thankyou_sent_at && <p className="mt-1 text-[10px] text-zinc-500">{formatDate(purchase.thankyou_sent_at)}</p>}
                  {!purchase.thankyou_sent && <button type="button" disabled={retrying[purchase.reference]} onClick={() => retryEmail(purchase)} className="mt-2 block rounded-lg border border-white/15 px-3 py-1.5 text-xs text-zinc-200 hover:bg-white/[0.06] disabled:opacity-50">{retrying[purchase.reference] ? 'Retrying…' : purchase.thankyou_email_id ? 'Repair status' : 'Retry email'}</button>}
                  {purchase.thankyou_attempted_at && !purchase.thankyou_sent && <p className="mt-2 text-[10px] text-zinc-500">Last attempt {formatDate(purchase.thankyou_attempted_at)}</p>}
                  {(retryErrors[purchase.reference] || purchase.thankyou_last_error) && !purchase.thankyou_sent && <p role="alert" className="mt-2 max-w-xs text-xs leading-relaxed text-red-300">{retryErrors[purchase.reference] || purchase.thankyou_last_error}</p>}
                </td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      {pages > 1 && <nav aria-label="Purchase pages" className="flex items-center justify-end gap-3 border-t border-zinc-800 p-3 text-xs">
        <button type="button" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)} className="rounded border border-zinc-700 px-3 py-1.5 disabled:opacity-40">Prev</button>
        <span>{currentPage} / {pages}</span>
        <button type="button" disabled={currentPage >= pages} onClick={() => setPage(currentPage + 1)} className="rounded border border-zinc-700 px-3 py-1.5 disabled:opacity-40">Next</button>
      </nav>}
    </section>
  );
}

function BookingsPanel({ bookings, error, now = 0, accessToken, onAuthLost }) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);
  const [serviceFilter, setServiceFilter] = useState('all');
  const upcoming = bookings.filter((booking) => ['active','confirmed'].includes(booking.status) && Date.parse(booking.start_time) >= now);
  const filtered = bookings.filter((booking) => (serviceFilter==='all'||booking.service_id===serviceFilter||(serviceFilter==='unspecified'&&!booking.service_id)) && (status === 'all' || (status === 'upcoming' ? ['active','confirmed'].includes(booking.status) && Date.parse(booking.start_time) >= now : (status === 'active' ? ['active','confirmed'].includes(booking.status) : ['canceled','cancelled'].includes(booking.status)))) &&
    `${booking.full_name || ''} ${booking.email || ''} ${SERVICE_NAMES[booking.service_id] || ''} ${booking.service_id || ''} ${booking.source || ''}`.toLowerCase().includes(query.trim().toLowerCase()));
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)), current = Math.min(page, pages);
  return <section aria-label="Strategy call bookings" className="space-y-4">
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-base font-semibold">Bookings</h2><p className="mt-2 text-xs leading-relaxed text-zinc-400">Synced Calendly records and historical onsite bookings, including cancellations. Opening a booking link alone does not create a booking.</p></div><p className="text-xs text-zinc-400">{upcoming.length} upcoming · {bookings.length} loaded / 500 maximum</p></div>
      <div className="mt-5 flex flex-col gap-3 sm:flex-row"><input aria-label="Search bookings" placeholder="Search name, email or service" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/20 px-4 py-2.5 text-sm outline-none focus:border-white/30" /><select aria-label="Filter bookings" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }} className="rounded-xl border border-white/10 bg-zinc-950 p-3 text-xs"><option value="all">All bookings</option><option value="upcoming">Upcoming</option><option value="active">Active (including past)</option><option value="canceled">Canceled</option></select></div>
    </div>
    <label className="block text-xs text-zinc-400">Service<select aria-label="Filter booking service" value={serviceFilter} onChange={event=>{setServiceFilter(event.target.value);setPage(1);}} className="mt-2 block w-full rounded-xl border border-white/10 bg-zinc-950 p-3 sm:max-w-sm"><option value="all">All services</option>{Object.entries(SERVICE_NAMES).map(([id,name])=><option key={id} value={id}>{name}</option>)}<option value="unspecified">Not specified / direct booking</option></select></label>
    {error ? <p role="alert" className="rounded-xl border border-red-500/20 p-5 text-sm text-red-300">{error}</p> : filtered.length === 0 ? <p className="rounded-xl border border-white/10 p-6 text-sm text-zinc-400">{query || status !== 'all' || serviceFilter!=='all' ? 'No bookings match these filters.' : 'No bookings have synced yet. Calendly polling imports meetings from the last 3 hours through the next 60 days; older meetings are not backfilled.'}</p> : <div className="grid gap-4 lg:grid-cols-2">{filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE).map((booking) => <article key={booking.id} className="min-w-0 rounded-2xl border border-white/[0.08] bg-white/[0.025] p-5">
      <div className="flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="font-medium text-zinc-100">{booking.full_name || 'Name not provided'}</h3><a href={`mailto:${booking.email}`} className="mt-1 block break-all text-sm text-zinc-400 underline-offset-4 hover:underline">{booking.email}</a></div><span className={`rounded border px-2 py-1 text-[10px] uppercase tracking-wider ${['canceled','cancelled'].includes(booking.status) ? 'border-red-400/25 text-red-300' : 'border-white/15 text-zinc-300'}`}>{booking.status}</span></div>
      <p className="mt-5 text-lg font-medium tracking-tight">{booking.start_time ? formatDate(booking.start_time) : 'Time not recorded'}</p><p className="mt-1 text-xs text-zinc-400">Displayed in your device timezone · Invitee timezone: {booking.timezone || 'Not recorded'}</p>
      <dl className="mt-5 space-y-2 text-xs text-zinc-400"><div><dt className="inline text-zinc-400">Meeting: </dt><dd className="inline">{booking.event_name || 'Strategy call'}</dd></div><div><dt className="inline text-zinc-400">Source: </dt><dd className="inline">{booking.source === 'lead' ? 'Brand review' : booking.source === 'team' ? 'Team inquiry' : booking.source === 'service' ? `Services${booking.service_id ? ` / ${booking.service_id}` : ''}` : booking.source === 'legacy' ? 'Legacy onsite booking' : 'Direct Calendly'}</dd></div><div><dt className="inline text-zinc-400">Last synced: </dt><dd className="inline">{formatDate(booking.last_synced_at)}</dd></div></dl>
      {booking.review_id && <p className="mt-4 break-all font-mono text-[10px] text-zinc-400">Linked lead: {booking.review_id}</p>}
      <p className="mt-3 text-xs text-zinc-300">Service: {SERVICE_NAMES[booking.service_id] || 'Not specified / direct booking'}</p>
      <p className="mt-2 text-xs text-zinc-400">TMH confirmation: {booking.confirmation_email_sent ? 'Accepted by email provider' : booking.source==='calendly'?'No matching onsite review or intent':'Not recorded as accepted'} · Calendly sends the joining invitation separately.</p>
      {booking.start_time && <p className="mt-2 text-xs text-zinc-400">Lagos: {new Intl.DateTimeFormat('en-NG',{dateStyle:'medium',timeStyle:'short',timeZone:'Africa/Lagos'}).format(new Date(booking.start_time))} WAT{booking.end_time ? ` · Ends ${new Intl.DateTimeFormat('en-NG',{timeStyle:'short',timeZone:'Africa/Lagos'}).format(new Date(booking.end_time))}` : ''}</p>}
      <TeamAssignment kind="booking" targetId={String(booking.id)} onAuthLost={onAuthLost} onRequest={payload=>apiRequest(ASSIGNMENT_URL,accessToken,payload)} />
    </article>)}</div>}
    {pages > 1 && <nav aria-label="Booking pages" className="flex items-center justify-end gap-3 text-xs"><button disabled={current <= 1} onClick={() => setPage(current - 1)} className="rounded border border-white/10 px-3 py-2 disabled:opacity-40">Prev</button><span>{current} / {pages}</span><button disabled={current >= pages} onClick={() => setPage(current + 1)} className="rounded border border-white/10 px-3 py-2 disabled:opacity-40">Next</button></nav>}
  </section>;
}

function StandaloneSessionRow({ session, accessToken, onAuthLost, onVisitorChange, showToast, onSessionChange }) {
  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving] = useState(false);
  const changeFlag = async (event) => {
    const status = event.target.value;
    const reason = window.prompt('Reason for this flag (optional):', session.flag_reason || '');
    if (reason === null) return;
    setSaving(true);
    try {
      const result = await apiRequest(FLAG_URL, accessToken, { visitorId: session.visitor_id, sessionId: session.id, status, reason: reason.trim() });
      if (result.visitor) onVisitorChange(result.visitor,result.review);
      if (result.ok) showToast('success', 'Visitor flag updated.');
      else if (result.code === 'unauthorised') onAuthLost();
      else showToast('error', result.error || 'Could not update the visitor flag.');
    } finally { setSaving(false); }
  };
  return <article className="overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.025]">
    <div className="flex flex-wrap items-start justify-between gap-4 p-4 sm:p-5">
      <button type="button" aria-expanded={expanded} aria-controls={`transcript-${session.id}`} onClick={() => setExpanded((value) => !value)} className="flex min-w-0 flex-1 items-start gap-3 text-left">
        <span className="mt-1 text-zinc-500"><ChevronRightIcon expanded={expanded} /></span>
        <span className="min-w-0 space-y-2">
          <span className="block text-sm font-medium text-zinc-200">{session.service_id === 'team-inquiry' ? 'Team inquiry' : session.service_id ? `${session.service_id} · service conversation` : session.scope === 'service' ? 'Service conversation' : 'Support conversation'}</span>
          <span className="block text-xs text-zinc-400">{session.review_id ? (session.linked_name || session.linked_brand || "Linked brand review") : "Guest conversation"}</span><span className="block break-all font-mono text-[11px] text-zinc-500">{session.id}</span>
          <span className="block text-xs text-zinc-500">{formatDate(session.updated_at || session.created_at)} · {session.message_count ?? '—'} stored messages · {session.total_exchanges || 0} exchanges</span>
        </span>
      </button>
      <div className="space-y-2 text-right"><FlagSelect lead={session} onChange={changeFlag} disabled={saving || Boolean(session.flag_error)} />{session.flag_error && <p className="max-w-xs text-xs text-amber-300">{session.flag_error}</p>}</div>
    </div>
    {session.service_id === 'team-inquiry' && <div className="flex flex-wrap gap-3 border-t border-white/[0.04] px-5 py-3 text-[11px] text-zinc-400"><span className="capitalize">{session.inquiry_status || 'new'}</span><span>{session.inquiry_owner || 'Unassigned'}</span>{session.inquiry_next_followup_on && <span className={inquiryDue(session,lagosDate()) ? 'text-amber-200' : ''}>Follow up {session.inquiry_next_followup_on}{inquiryDue(session,lagosDate()) ? ' · due' : ''}</span>}</div>}
    {expanded && <div id={`transcript-${session.id}`} className="border-t border-white/[0.06] p-4 sm:p-5">{session.service_id === 'team-inquiry' && <InquiryWorkflow session={session} onSessionChange={onSessionChange} onSave={async payload => { const result=await apiRequest(UPDATE_URL,accessToken,payload); if(result.code==='unauthorised')onAuthLost(); if(result.ok)showToast('success','Inquiry follow-up saved.'); return result; }} />}{session.service_id === 'team-inquiry' && <TeamAssignment kind="inquiry" targetId={session.id} onAuthLost={onAuthLost} onRequest={payload=>apiRequest(ASSIGNMENT_URL,accessToken,payload)} onSaved={assignment=>onSessionChange?.({...session,inquiry_owner:assignment.assignee_name,inquiry_revision:(session.inquiry_revision||0)+1})} />}<TranscriptPanel key={`${session.id}:${session.updated_at || ''}`} session={session} accessToken={accessToken} onAuthLost={onAuthLost} /></div>}
  </article>;
}

function QueueCard({title,value,detail,onClick}) {
  return <button type="button" onClick={onClick} className="min-w-0 rounded-2xl border border-white/[0.08] bg-white/[0.025] p-5 text-left transition-colors hover:bg-white/[0.05] focus-visible:outline-2 focus-visible:outline-zinc-400"><span className="block text-xs text-zinc-400">{title}</span><strong className="my-3 block text-3xl font-medium tracking-tight tabular-nums text-zinc-100">{value}</strong><span className="block text-[11px] leading-relaxed text-zinc-500">{detail}</span></button>;
}
function exportInquiryCsv(sessions) {
  const fields=['id','linked_name','linked_brand','review_id','inquiry_status','inquiry_owner','inquiry_next_followup_on','inquiry_notes','flag_status','created_at','updated_at'];
  const content=[fields.join(','),...sessions.map(session=>fields.map(field=>csvCell(session[field])).join(','))].join('\n');
  const url=URL.createObjectURL(new Blob([content],{type:'text/csv;charset=utf-8;'}));
  const link=document.createElement('a');link.href=url;link.download='tmh-team-inquiries-'+lagosDate()+'.csv';link.click();URL.revokeObjectURL(url);
}

function SessionsPanel({ scope, sessions, error, accessToken, onAuthLost, onVisitorChange, showToast, onSessionChange }) {
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [stage,setStage]=useState('all');
  const [dueOnly,setDueOnly]=useState(false);
  const [flag,setFlag]=useState('all');
  const filtered = sessions.filter((session) => (stage==='all'||(session.inquiry_status||'new')===stage) && (!dueOnly||inquiryDue(session,lagosDate())) && (flag==='all'||session.flag_status===flag) && `${session.id || ''} ${session.service_id || ''} ${session.linked_name || ''} ${session.linked_brand || ''} ${session.visitor_id || ''} ${session.flag_status || ''} ${session.inquiry_owner || ''} ${session.inquiry_notes || ''}`.toLowerCase().includes(query.trim().toLowerCase()));
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pages);
  const label = scope === 'team' ? 'Team Inquiries' : scope === 'support' ? 'Support Chats' : 'Service Chats';
  return <section aria-label={label} className="space-y-4">
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-4 sm:p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2"><h2 className="text-base font-semibold">{label}</h2><p className="text-xs text-zinc-500">{filtered.length} shown / {sessions.length} loaded · newest 500 maximum</p></div>
      <p className="mb-4 text-xs leading-relaxed text-zinc-500">{scope==='team' ? 'Conversations started through Talk to Our Team. Assign an owner, set the next action and keep the original transcript together.' : 'Support and service conversations retain their linked lead where available. Talk to Our Team has its own Team Inquiries tab.'}</p>
      <div className="mb-4 flex flex-wrap items-center gap-3">{scope==='team' && <><select aria-label="Filter inquiry status" value={stage} onChange={event=>{setStage(event.target.value);setPage(1);}} className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs"><option value="all">All inquiry statuses</option>{INQUIRY_STATUSES.map(status=><option key={status} value={status}>{status}</option>)}</select><label className="flex items-center gap-2 text-xs text-zinc-400"><input type="checkbox" checked={dueOnly} onChange={event=>{setDueOnly(event.target.checked);setPage(1);}} />Follow-up due</label><button type="button" onClick={()=>exportInquiryCsv(filtered)} className="rounded-lg border border-zinc-700 px-3 py-2 text-xs text-zinc-300">Export inquiries CSV</button></>}<select aria-label="Filter access flag" value={flag} onChange={event=>{setFlag(event.target.value);setPage(1);}} className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs"><option value="all">All access flags</option><option value="white">White</option><option value="yellow">Yellow</option><option value="red">Red</option></select></div>
      <input aria-label={`Search ${scope} chats`} value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Search name, session, owner or notes" className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-2.5 text-sm outline-none focus:border-white/30" />
    </div>
    {error ? <p role="alert" className="rounded-xl border border-red-500/20 bg-red-500/[0.05] p-4 text-sm text-red-300">{error}</p> : filtered.length === 0 ? <p className="rounded-xl border border-white/[0.06] p-6 text-center text-sm text-zinc-500">{query ? 'No conversations match this search.' : `No ${scope==='team'?'team inquiries':scope+' chats'} have been recorded yet.`}</p> : filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE).map((session) => <StandaloneSessionRow key={session.id} session={session} accessToken={accessToken} onAuthLost={onAuthLost} onVisitorChange={onVisitorChange} showToast={showToast} onSessionChange={onSessionChange} />)}
    {pages > 1 && <nav aria-label={`${label} chat pages`} className="flex items-center justify-end gap-3 text-xs"><button type="button" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)} className="rounded border border-white/10 px-3 py-2 disabled:opacity-40">Prev</button><span>{currentPage} / {pages}</span><button type="button" disabled={currentPage >= pages} onClick={() => setPage(currentPage + 1)} className="rounded border border-white/10 px-3 py-2 disabled:opacity-40">Next</button></nav>}
  </section>;
}

export default function AdminDashboard() {
  const [accessToken, setAccessToken] = useState('');
  const [authorised, setAuthorised] = useState(false);
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [filters, setFiltersState] = useState({
    temperature: 'All',
    followup: 'All',
    dateRange: 'all',
    search: '',
  });
  const [sortId, setSortIdState] = useState('newest');
  const [page, setPage] = useState(1);
  const [toast, setToast] = useState(null);
  const [purchases, setPurchases] = useState([]);
  const [purchasesError, setPurchasesError] = useState('');
  const [activeTab, setActiveTab] = useState('leads');
  const [supportSessions, setSupportSessions] = useState([]);
  const [serviceSessions, setServiceSessions] = useState([]);
  const [teamInquiries,setTeamInquiries]=useState([]);
  const [operations,setOperations]=useState(null);
  const [operationsError,setOperationsError]=useState('');
  const [followupStats, setFollowupStats] = useState(null);
  const [followupStatsError, setFollowupStatsError] = useState('');
  const [chatErrors, setChatErrors] = useState({});
  const [lastRefreshed, setLastRefreshed] = useState(null);
  const [linkedSessionsTruncated, setLinkedSessionsTruncated] = useState(false);
  const [retryingFlagEmails, setRetryingFlagEmails] = useState(false);
  const [flagEmailError, setFlagEmailError] = useState('');
  const flagEmailLock = useRef(false);
  const overviewLock = useRef(false);
  const authEpoch = useRef(0);
  const [bookings, setBookings] = useState([]);
  const [bookingsError, setBookingsError] = useState('');
  const [authReady,setAuthReady]=useState(false);

  const showToast = useCallback((kind, text) => {
    setToast({ kind, text, id: Date.now() });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const handleAuthLost = useCallback(() => {
    authEpoch.current += 1;
    overviewLock.current = false;
    sessionStorage.removeItem('tmh_admin_password');
    setAccessToken('');
    setAuthorised(false);
    setLeads([]);
    setPurchases([]);
    setBookings([]); setBookingsError('');
    setPurchasesError('');
    setSupportSessions([]);
    setServiceSessions([]); setTeamInquiries([]); setOperations(null);setOperationsError('');
    setFollowupStats(null); setFollowupStatsError('');
    transcriptCache.clear();
    transcriptRequests.clear();
  }, []);

  const retryFlagEmails = async () => {
    if (flagEmailLock.current) return;
    flagEmailLock.current = true; setRetryingFlagEmails(true); setFlagEmailError('');
    try {
      const result = await apiRequest(FLAG_URL, accessToken, { action: 'retryNotifications' });
      if (result.ok) showToast('success', `Flag email queue checked. ${result.attempted || 0} pending events processed.`);
      else if (result.code === 'unauthorised') handleAuthLost();
      else setFlagEmailError(result.error || 'Flag email retry is still pending.');
    } finally { flagEmailLock.current = false; setRetryingFlagEmails(false); }
  };


  const load = useCallback(async (pw) => {
    if (overviewLock.current) return;
    overviewLock.current = true;
    const epoch = authEpoch.current;
    setLoading(true);
    setError('');
    const result = await apiFetchLeads(pw || accessToken);
    if (epoch !== authEpoch.current) return;
    overviewLock.current = false;
    setLoading(false);
    if (result.ok) {
      transcriptCache.clear();
      setLeads(result.leads);
      setBookings(result.bookings); setBookingsError(result.bookings_error || '');
      setPurchases(result.purchases);
      setPurchasesError(result.purchases_error || '');
      setSupportSessions(result.support_sessions); setTeamInquiries(result.team_inquiries);setOperations(result.operations||null);setOperationsError(result.operations_error||'');
      setFollowupStats(result.followupStats || null); setFollowupStatsError(result.followup_stats_error || '');
      setServiceSessions(result.service_sessions);
      setChatErrors({ team:result.team_inquiries_error || result.support_sessions_error, support: result.support_sessions_error, service: result.service_sessions_error, linked: result.linked_sessions_error });
      setLinkedSessionsTruncated(result.linked_sessions_truncated === true);
      setLastRefreshed(Date.now());
      setAuthorised(true);
    } else if (result.code === 'unauthorised') {
      handleAuthLost();
    } else {
      setError(result.error || 'Could not load leads.');
    }
  }, [accessToken, handleAuthLost]);

  useEffect(() => {
    try { sessionStorage.removeItem('tmh_admin_password');localStorage.removeItem('tmh_admin_password'); } catch { /* Old shared credentials are retired. */ }
    return observeAdminSession(supabase.auth,session=>{
      if(session){setAccessToken(session.access_token);setAuthorised(true);}else handleAuthLost();setAuthReady(true);
    });
  },[handleAuthLost]);
  useEffect(()=>{if(accessToken&&authorised){const task=setTimeout(()=>void load(accessToken),0);return()=>clearTimeout(task);}},[accessToken,authorised,load]);

  useEffect(() => {
    if (!authorised) return;
    const refreshVisible = () => {
      // Let a focused notes/search field keep its draft until the admin leaves it.
      if (document.visibilityState === 'visible' && !document.activeElement?.matches('input,textarea,select,[contenteditable="true"]')) void load();
    };
    const timer = window.setInterval(refreshVisible, 30000);
    window.addEventListener('focus', refreshVisible);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', refreshVisible); };
  }, [authorised, load]);

  const securityUpdate=useCallback(payload=>apiRequest(UPDATE_URL,accessToken,payload),[accessToken]);
  const usageRequest=useCallback(payload=>apiRequest(FETCH_URL,accessToken,payload),[accessToken]);

  const onAuth = (pw) => {
    setAccessToken(pw);
    setAuthorised(true);
    void load(pw);
  };

  const updateLead = (updated) => {
    setLeads((current) => current.map((l) => (l.id === updated.id ? { ...l, ...updated } : l)));
  };
  const deleteLead = (id) => setLeads((current) => current.filter((lead) => lead.id !== id));
  const updatePurchase = (updated) => setPurchases((current) => current.map((purchase) => purchase.reference === updated.reference ? { ...purchase, ...updated } : purchase));
  const updateVisitor = (visitor,review) => {
    if(review)updateLead(review);
    const merge = (sessions) => sessions.map((session) => session.visitor_id === visitor.id || (review && session.review_id===review.id) ? { ...session, flag_status: visitor.flag_status, flag_reason: visitor.flag_reason, moderation_strikes: visitor.moderation_strikes ?? session.moderation_strikes } : session);
    setSupportSessions(merge);
    setServiceSessions(merge); setTeamInquiries(merge);
  };

  const updateInquiry = saved => setTeamInquiries(current=>current.map(session=>session.id===saved.id?{...session,...saved}:session));
  const metrics=workspaceMetrics({leads,purchases,inquiries:teamInquiries,bookings,now:lastRefreshed||0});

  const processed = useMemo(() => {
    const now = lastRefreshed || 0;
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
  }, [leads, filters, sortId, lastRefreshed]);

  const setFilters=next=>{setPage(1);setFiltersState(next);};
  const setSortId=next=>{setPage(1);setSortIdState(next);};

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
    const quote = csvCell;
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

  const clearData = () => {
    localStorage.clear();
    sessionStorage.clear();
    window.location.reload();
  };

  if (!authorised && !authReady) return <main role="status" className="grid min-h-screen place-items-center bg-zinc-950 text-zinc-300">Checking team access…</main>;
  if (!authorised) return <LoginScreen onAuth={onAuth} />;

  return (
    <main className="min-h-screen w-full min-w-0 max-w-full bg-[#09090b] p-3 text-zinc-100 sm:p-6 lg:p-8">
      <div className="mx-auto w-full min-w-0 max-w-[1400px]">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/[0.08] bg-white/[0.025] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] sm:p-6">
          <div>
            <p className="mb-2 text-[10px] uppercase tracking-[0.25em] text-zinc-500">The Marketing Haven · Private workspace</p>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">TMH Admin</h1>
            <p className="text-xs sm:text-sm text-zinc-400">
              Total Reviews: {leads.length} · {processed.length} shown
            </p>
            <p className="mt-2 text-[11px] text-zinc-500">{loading ? 'Refreshing saved records…' : lastRefreshed ? `Last refreshed ${formatDate(lastRefreshed)}` : 'Saved records'} · Counts reflect loaded records · refreshes every 30s while visible</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => void load()}
              disabled={loading}
              className="rounded-lg border border-zinc-700 px-3 py-2 text-xs sm:text-sm hover:bg-zinc-800 disabled:opacity-50"
            >
              {loading ? 'Refreshing…' : 'Refresh'}
            </button>
            {activeTab === 'leads' && <button
              onClick={exportCsv}
              className="rounded-lg border border-zinc-700 px-3 py-2 text-xs sm:text-sm hover:bg-zinc-800"
            >
              Export CSV
            </button>}
            <button
              onClick={clearData}
              title="Clear this browser's local cache and reload"
              className="rounded-lg border border-zinc-700 px-3 py-2 text-xs sm:text-sm hover:bg-zinc-800"
            >
              Clear Data
            </button>
            <button
              onClick={async()=>{try{await supabase.auth.signOut({scope:'local'});}finally{handleAuthLost();}}}
              className="rounded-lg border border-zinc-700 px-3 py-2 text-xs sm:text-sm hover:bg-zinc-800"
            >
              Log out
            </button>
          </div>
        </header>

        <div role="tablist" aria-label="Admin sections" className="mb-6 flex gap-1 overflow-x-auto rounded-xl border border-white/[0.07] bg-white/[0.02] p-1.5">
          {ADMIN_TABS.map((tab, index) => {
            const count = tab.id === 'leads' ? leads.length : tab.id === 'purchases' ? purchases.length : tab.id === 'bookings' ? bookings.length : tab.id === 'team' ? teamInquiries.length : tab.id === 'support' ? supportSessions.length : serviceSessions.length;
            return <button key={tab.id} id={`tab-${tab.id}`} type="button" role="tab" aria-selected={activeTab === tab.id} aria-controls={`panel-${tab.id}`} tabIndex={activeTab === tab.id ? 0 : -1}
              onClick={() => setActiveTab(tab.id)} onKeyDown={(event) => {
                const delta = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
                if (!delta && !['Home', 'End'].includes(event.key)) return;
                event.preventDefault();
                const next = event.key === 'Home' ? 0 : event.key === 'End' ? ADMIN_TABS.length - 1 : (index + delta + ADMIN_TABS.length) % ADMIN_TABS.length;
                setActiveTab(ADMIN_TABS[next].id);
                event.currentTarget.parentElement.querySelectorAll('[role="tab"]')[next]?.focus();
              }} className={`inline-flex shrink-0 items-center gap-2 rounded-lg border px-4 py-2.5 text-xs font-medium transition-colors sm:text-sm ${activeTab === tab.id ? 'border-white/15 bg-white/[0.08] text-white shadow-sm' : 'border-transparent text-zinc-500 hover:bg-white/[0.035] hover:text-zinc-200'}`}>
              {tab.label}<span className="rounded-md bg-black/20 px-1.5 py-0.5 text-[10px] tabular-nums text-zinc-500">{count}</span>
            </button>;
          })}
        </div>
        <section aria-label="Agency work queue" className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <QueueCard title="Open team inquiries" value={chatErrors.team?'Unavailable':metrics.openInquiries} detail={`${metrics.unassignedInquiries} unassigned · ${metrics.dueInquiries} follow-ups due`} onClick={()=>setActiveTab('team')} />
          <QueueCard title="Hot leads awaiting follow-up" value={metrics.hotLeads} detail="Hot reviews still marked pending" onClick={()=>{setFilters(previous=>({...previous,temperature:'Hot',followup:'pending'}));setActiveTab('leads');}} />
          <QueueCard title="Emails awaiting acceptance" value={purchasesError?'Unavailable':metrics.purchaseEmails+metrics.reviewEmails} detail={`${metrics.purchaseEmails} purchases · ${metrics.reviewEmails} reviews · email provider`} onClick={()=>setActiveTab(metrics.reviewEmails > 0 ? 'leads' : 'purchases')} />
          <QueueCard title="Calls in the next 7 days" value={bookingsError?'Unavailable':metrics.upcomingBookings} detail="Active bookings · Africa/Lagos" onClick={()=>setActiveTab('bookings')} />
        </section>
        {operations && <section aria-label="Haven operational health" className="mb-4 rounded-xl border border-white/[0.06] px-4 py-3 text-xs text-zinc-400"><p className="mb-3 text-zinc-500">Past 24 hours</p><div className="grid grid-cols-2 gap-3 sm:grid-cols-4"><span>Gemini replies <strong className="ml-1 font-medium text-zinc-200">{operations.gemini_replies}</strong></span><span>Groq replies <strong className="ml-1 font-medium text-zinc-200">{operations.groq_replies}</strong></span><span>Failed turns <strong className={`ml-1 ${operations.failed_turns?'text-amber-200':'text-zinc-200'}`}>{operations.failed_turns}</strong></span><span>Stalled turns <strong className={`ml-1 ${operations.stale_turns?'text-amber-200':'text-zinc-200'}`}>{operations.stale_turns}</strong></span></div><button type="button" disabled={retryingFlagEmails} onClick={retryFlagEmails} className="mt-4 rounded-lg border border-white/10 px-3 py-2 text-zinc-300 disabled:opacity-40">{retryingFlagEmails?'Retrying flag notices…':`${operations.pending_flag_events} flag events awaiting acceptance · Retry`}</button></section>}
        <VerificationAttemptsPanel onRead={usageRequest} onUpdate={securityUpdate} onAuthLost={handleAuthLost} />
        <APIUsagePanel onRequest={usageRequest} onAuthLost={handleAuthLost} />
        <AISetupPanel accessToken={accessToken} onAuthLost={handleAuthLost} />
        {operationsError && <p role="alert" className="mb-4 text-xs text-amber-200">{operationsError}</p>}
        {activeTab === 'purchases' && <section aria-label="Playbook follow-up queue" className="mb-5 rounded-xl border border-white/10 p-4 text-xs text-zinc-400">
          <h2 className="font-medium text-zinc-200">One-time Playbook check-in</h2>
          <p className="mt-2 leading-relaxed">Only buyers who opt in at checkout enter this queue. Due 24 hours after payment; accepted means the email provider accepted it.</p>
          {followupStats ? <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-5">{[['queued', 'Scheduled'], ['due', 'Due / retrying'], ['accepted', 'Accepted'], ['cancelled', 'Cancelled'], ['needsReview', 'Needs review']].map(([key, label]) => <div key={key}><dt>{label}</dt><dd className="mt-1 text-base text-zinc-200">{followupStats[key]}</dd></div>)}</dl>
            : <p role="status" className="mt-3 text-amber-200">{followupStatsError || 'Queue counts are unavailable. Refresh to retry.'}</p>}
        </section>}
        {flagEmailError && <p role="alert" className="mb-4 text-xs text-amber-200">{flagEmailError}</p>}
        <p className="mb-5 text-[11px] leading-relaxed text-zinc-500">Work queue counts cover loaded records, not lifetime totals. Provider counts are completed replies, not token usage or billing. Flag events cover the saved delivery queue. Inquiry status is maintained by the team; confirmed bookings appear in Bookings.</p>
        {error && <p role="alert" className="mb-4 rounded-xl border border-red-500/20 bg-red-500/[0.05] p-4 text-sm text-red-200">{error}</p>}
        <div role="tabpanel" id={`panel-${activeTab}`} aria-labelledby={`tab-${activeTab}`} tabIndex={0}>
        {activeTab === 'bookings' && <BookingsPanel bookings={bookings} error={bookingsError} now={lastRefreshed || 0} accessToken={accessToken} onAuthLost={handleAuthLost} />}
        {activeTab === 'purchases' && <PurchasesPanel purchases={purchases} error={purchasesError} accessToken={accessToken} onAuthLost={handleAuthLost} onPurchaseChange={updatePurchase} showToast={showToast} />}
        {['team','support','service'].includes(activeTab) && <SessionsPanel key={activeTab} scope={activeTab} sessions={activeTab==='team'?teamInquiries:activeTab === 'support' ? supportSessions : serviceSessions} error={chatErrors[activeTab]} accessToken={accessToken} onAuthLost={handleAuthLost} onVisitorChange={updateVisitor} showToast={showToast} onSessionChange={updateInquiry} />}
        {activeTab === 'leads' && <>

        <p className="mb-3 text-xs text-zinc-500">Reviews show the newest 500 records maximum. Counts, filters and exports apply to loaded reviews.</p>
        <div className="mb-4 flex flex-wrap gap-3 text-xs text-zinc-500"><span>Yellow warnings <strong className="ml-1 font-medium text-amber-300">{leads.filter((lead) => lead.flag_status === 'yellow').length}</strong></span><span>Restricted <strong className="ml-1 font-medium text-red-300">{leads.filter((lead) => lead.flag_status === 'red').length}</strong></span><button type="button" disabled={retryingFlagEmails} onClick={retryFlagEmails} className="ml-auto rounded-lg border border-white/15 px-3 py-2 text-zinc-300 disabled:opacity-50">{retryingFlagEmails ? 'Retrying…' : 'Retry flag emails'}</button></div>
        {flagEmailError && <p role="alert" className="mb-4 text-xs leading-relaxed text-amber-300">{flagEmailError}</p>}
        {chatErrors.linked && <p role="alert" className="mb-4 text-xs text-amber-300">{chatErrors.linked}</p>}
        {linkedSessionsTruncated && <p role="alert" className="mb-4 text-xs text-amber-300">The linked conversation index reached 5,000 entries. Older linked chats require a server export.</p>}
        <section className="mb-4 grid gap-2 sm:gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.025] p-4 grid-cols-2 md:grid-cols-4">
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

        {/* Desktop table */}
        <section aria-label="Leads table" tabIndex={0} className="hidden w-full min-w-0 max-w-full overflow-x-auto overscroll-x-contain rounded-2xl border border-white/[0.08] bg-white/[0.025] 2xl:block">
          <table className="w-full min-w-[1380px] text-left text-sm [&_td]:p-4 [&_td]:align-top [&_td]:[overflow-wrap:anywhere] [&_th]:p-4">
            <thead className="border-b border-white/[0.08] bg-white/[0.015] text-[10px] font-medium uppercase tracking-wider text-zinc-500">
              <tr>
                <th className="w-8 p-2"></th>
                <th className="p-2">Shot</th>
                <th className="p-2">Name / Brand</th>
                <th className="p-2">Platform</th>
                <th className="p-2">Score</th>
                <th className="p-2">Temp</th>
                <th className="p-2">Flag</th>
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
                <tr><td colSpan={13} className="p-6 text-center text-zinc-500">Loading…</td></tr>
              ) : pagedLeads.length === 0 ? (
                <tr><td colSpan={13} className="p-6 text-center text-zinc-500">No leads match these filters.</td></tr>
              ) : (
                pagedLeads.map((lead) => (
                  <LeadRow
                    key={lead.id}
                    lead={lead}
                    accessToken={accessToken}
                    onLeadChange={updateLead}
                    onLeadDelete={deleteLead}
                    onAuthLost={handleAuthLost}
                    showToast={showToast}
                  />
                ))
              )}
            </tbody>
          </table>
        </section>

        {/* Mobile cards */}
        <section className="grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:hidden">
          {loading && leads.length === 0 ? (
            <p className="p-6 text-center text-zinc-500 text-sm">Loading…</p>
          ) : pagedLeads.length === 0 ? (
            <p className="p-6 text-center text-zinc-500 text-sm">No leads match these filters.</p>
          ) : (
            pagedLeads.map((lead) => (
              <LeadCard
                key={lead.id}
                lead={lead}
                accessToken={accessToken}
                onLeadChange={updateLead}
                onLeadDelete={deleteLead}
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
        </>}
        </div>
      </div>

      {toast && (
        <div
          key={toast.id}
          role="status"
          className={`fixed bottom-6 right-6 z-50 max-w-[calc(100vw-3rem)] rounded-lg border px-4 py-2.5 text-sm shadow-lg backdrop-blur-sm ${
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

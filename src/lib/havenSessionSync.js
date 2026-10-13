// src/lib/havenSessionSync.js
// Debounced, fire-and-forget writer for audit chats.
// Delegates both writes to the sync-haven-session edge function,
// which uses the service_role key server-side.

const SYNC_DEBOUNCE_MS = 900;
const VALID_LEADS = ['HOT', 'WARM', 'COLD'];

let syncTimer = null;
let pendingPayload = null;

function serializeMessage(message) {
  if (!message || typeof message !== 'object') return null;
  return {
    id: message.id || null,
    role: message.role || null,
    content: typeof message.content === 'string' ? message.content : '',
    timestamp: message.timestamp || Date.now(),
    hasImage: Boolean(message.image),
    chips: Array.isArray(message.chips) ? message.chips : null,
    navChips: Array.isArray(message.navChips) ? message.navChips : null,
    isChipIntent: Boolean(message.isChipIntent),
    isSeedGreeting: Boolean(message.isSeedGreeting),
  };
}

export function scheduleHavenSessionSync({
  sessionId,
  reviewId,
  messages,
  currentStep,
  lastStepReached,
  totalExchanges,
  leadTemperature,
  clickedBookingLink,
  clickedPlaybookLink,
  websiteScore,
  scoreBreakdown,
  biggestLeak,
  assessmentSummary,
} = {}) {
  if (!sessionId) return;

  pendingPayload = {
    sessionId,
    reviewId: reviewId || null,
    messages: Array.isArray(messages)
      ? messages.map(serializeMessage).filter(Boolean)
      : [],
    currentStep: currentStep || 'GREETING',
    lastStepReached: lastStepReached || currentStep || 'GREETING',
    totalExchanges: Number(totalExchanges) || 0,
    leadTemperature: VALID_LEADS.includes(leadTemperature) ? leadTemperature : null,
    clickedBookingLink: Boolean(clickedBookingLink),
    clickedPlaybookLink: Boolean(clickedPlaybookLink),
    websiteScore: websiteScore != null && Number.isFinite(Number(websiteScore))
      ? Number(websiteScore)
      : null,
    scoreBreakdown: scoreBreakdown || null,
    biggestLeak:
      typeof biggestLeak === 'string' && biggestLeak.trim().length > 0
        ? biggestLeak.trim()
        : null,
    assessmentSummary:
      typeof assessmentSummary === 'string' && assessmentSummary.trim().length > 0
        ? assessmentSummary.trim()
        : null,
  };

  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(flushHavenSessionSync, SYNC_DEBOUNCE_MS);
}

async function flushHavenSessionSync() {
  syncTimer = null;
  const payload = pendingPayload;
  pendingPayload = null;
  if (!payload) return;

  try {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseAnonKey) {
      console.warn('[Haven] Session sync skipped: Supabase not configured');
      return;
    }

    const res = await fetch(`${supabaseUrl}/functions/v1/sync-haven-session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${supabaseAnonKey}`,
        apikey: supabaseAnonKey,
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json().catch(() => ({}));

    console.log('[Haven] Session sync response:', {
      status: res.status,
      ok: res.ok,
      sessionId: payload.sessionId,
      reviewId: payload.reviewId,
      sentMessages: payload.messages.length,
      sentExchanges: payload.totalExchanges,
      leadTemperature: payload.leadTemperature || '(none)',
      websiteScore: payload.websiteScore,
      hasBreakdown: Boolean(payload.scoreBreakdown),
      hasBiggestLeak: Boolean(payload.biggestLeak),
      hasSummary: Boolean(payload.assessmentSummary),
      clickedBookingLink: payload.clickedBookingLink,
      clickedPlaybookLink: payload.clickedPlaybookLink,
      results: data.results || null,
    });

    if (!res.ok) {
      console.warn('[Haven] Session sync failed:', data);
    }
  } catch (err) {
    console.warn('[Haven] Session sync threw:', err);
  }
}
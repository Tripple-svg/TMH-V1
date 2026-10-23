// One in-flight write per audit session keeps older snapshots from overwriting newer ones.
const queues = new Map();
const DEBOUNCE_MS = 900;
const RETRY_LIMIT = 2;
let lastSnapshotAt = 0;

function publish(status) {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('haven-session-sync', { detail: status }));
}

export function scheduleHavenSessionSync({ sessionId, reviewId, accessToken, messages, clickedBookingLink, clickedPlaybookLink, metadataOnly = false } = {}) {
  if (!sessionId || !reviewId || !accessToken) return;
  const queue = queues.get(sessionId) || { timer: null, running: false, pending: null, retries: 0 };
  lastSnapshotAt = Math.max(Date.now(), lastSnapshotAt + 1);
  queue.pending = {
    sessionId, reviewId, accessToken, metadataOnly, snapshotAt: new Date(lastSnapshotAt).toISOString(),
    messages: !metadataOnly && Array.isArray(messages) ? messages.slice(-200).filter(Boolean).map((m) => ({
      id: m.id || null, role: m.role, content: typeof m.content === 'string' ? m.content.slice(0, 8000) : '',
      timestamp: m.timestamp || Date.now(), hasImage: Boolean(m.image),
      isChipIntent: Boolean(m.isChipIntent), isSeedGreeting: Boolean(m.isSeedGreeting),
    })) : [],
    clickedBookingLink: Boolean(clickedBookingLink), clickedPlaybookLink: Boolean(clickedPlaybookLink),
  };
  // Keep the newest complete messages within the edge function's request limit,
  // including JSON escaping and UTF-8 bytes (rather than JS character counts).
  let bytes = 0;
  const bounded = [];
  const encoder = new TextEncoder();
  for (const message of [...queue.pending.messages].reverse()) {
    const size = encoder.encode(JSON.stringify(message)).byteLength + 1;
    if (bytes + size > 250000) break;
    bounded.unshift(message);
    bytes += size;
  }
  queue.pending.messages = bounded;
  queue.retries = 0;
  queues.set(sessionId, queue);
  clearTimeout(queue.timer);
  queue.timer = setTimeout(() => flush(sessionId), DEBOUNCE_MS);
}

async function flush(sessionId) {
  const queue = queues.get(sessionId);
  if (!queue || queue.running || !queue.pending) return;
  const payload = queue.pending;
  queue.pending = null;
  queue.running = true;
  publish({ sessionId, state: 'saving' });
  let retryable = true;
  try {
    const url = import.meta.env.VITE_SUPABASE_URL;
    const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
    if (!url || !key) throw new Error('Review sync is not configured');
    const response = await fetch(`${url}/functions/v1/sync-haven-session`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}`, apikey: key },
      body: JSON.stringify(payload), signal: AbortSignal.timeout(15000),
    });
    retryable = response.status >= 500 || response.status === 429;
    const data = await response.json();
    if (!response.ok || data.ok !== true) throw new Error('Review sync was not acknowledged');
    queue.retries = 0;
    publish({ sessionId, state: 'saved' });
  } catch {
    if (!queue.pending && retryable && queue.retries < RETRY_LIMIT) {
      queue.pending = payload;
      queue.retries += 1;
    }
    publish({ sessionId, state: queue.pending ? 'retrying' : 'failed' });
    console.warn('[Haven] Session could not be saved. Your conversation remains on this device.');
  } finally {
    queue.running = false;
    if (queue.pending) queue.timer = setTimeout(() => flush(sessionId), queue.retries ? 1500 * queue.retries : DEBOUNCE_MS);
    else queues.delete(sessionId);
  }
}

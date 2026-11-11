const KEY = 'tmh_review_lockout_v1';

export const REVIEW_BLOCKED_MESSAGE = 'You have reached the maximum number of attempts. Please contact support.';

export function formatCountdown(seconds) {
  const total = Math.max(0, Math.ceil(seconds));
  return [Math.floor(total / 60), total % 60].map(part => String(part).padStart(2, '0')).join(':');
}

export function readReviewCooldown(now = Date.now()) {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (saved?.blocked === true || (Number.isFinite(saved?.until) && saved.until > now)) return saved;
  } catch { /* The server still applies the limit. */ }
  return null;
}

export function saveReviewCooldown(result, now = Date.now()) {
  const blocked = result.code === 'review_blocked';
  const seconds = Math.max(1, Math.min(3600, Number(result.retryAfter) || 600));
  const state = { blocked, until: blocked ? 0 : now + seconds * 1000 };
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* Keep the timer in memory. */ }
  return state;
}

export function clearReviewCooldown() {
  try { localStorage.removeItem(KEY); } catch { /* Browser storage is optional. */ }
}

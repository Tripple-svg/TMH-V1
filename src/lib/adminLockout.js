const KEY = 'tmh_admin_lockout_v1';
export const ADMIN_LOCKOUT_MS = 15 * 60 * 1000;
let memory = { failures: 0, until: 0 };
const browserStorage=()=>{try{return globalThis.localStorage;}catch{return undefined;}};
export function readAdminLockout(storage = browserStorage(), now = Date.now()) {
  try { const saved = JSON.parse(storage?.getItem(KEY) || 'null'); if (Number.isSafeInteger(saved?.failures) && Number.isFinite(saved?.until)) memory = saved; } catch { /* Memory still protects this page when storage is unavailable. */ }
  if (memory.until && memory.until <= now) memory = { failures: 0, until: 0 };
  return { ...memory, remaining: Math.max(0, Math.ceil((memory.until - now) / 1000)) };
}
export function recordAdminFailure(error, storage = browserStorage(), now = Date.now()) {
  const state = readAdminLockout(storage, now);
  const limited = error?.status === 429 || /rate_limit|over_request_rate/.test(error?.code || '');
  if (!limited && error?.code !== 'invalid_credentials' && error?.status !== 400) return state;
  memory = { failures: state.failures + 1, until: state.until };
  if (limited || memory.failures >= 5) memory.until = Math.max(memory.until, now + ADMIN_LOCKOUT_MS);
  try { storage?.setItem(KEY, JSON.stringify(memory)); } catch { /* Keep in memory. */ }
  return readAdminLockout(storage, now);
}
export function clearAdminLockout(storage = browserStorage()) {
  memory = { failures: 0, until: 0 }; try { storage?.removeItem(KEY); } catch { /* Keep in memory. */ }
}

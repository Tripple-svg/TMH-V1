const KEY = 'tmh_admin_lockout_v1';
export const ADMIN_LOCKOUT_MS = 15 * 60 * 1000;
const emptyState = () => ({ failures: 0, until: 0, cooledDown: false, resetRequired: false });
let memory = emptyState();
let memoryOnly = false;
const browserStorage=()=>{try{return globalThis.localStorage;}catch{return undefined;}};
export function readAdminLockout(storage = browserStorage(), now = Date.now()) {
  try {
    const saved = JSON.parse(storage?.getItem(KEY) || 'null');
    if (storage && !saved && !memoryOnly) memory = emptyState();
    if (Number.isSafeInteger(saved?.failures) && Number.isFinite(saved?.until)) memory = { ...emptyState(), ...saved };
  } catch { /* Memory still protects this page when storage is unavailable. */ }
  if (memory.until && memory.until <= now) memory = { ...memory, failures: memory.cooledDown ? memory.failures : 0, until: 0, cooledDown: true };
  return { ...memory, remaining: Math.max(0, Math.ceil((memory.until - now) / 1000)) };
}
export function recordAdminFailure(error, storage = browserStorage(), now = Date.now()) {
  const state = readAdminLockout(storage, now);
  if (state.remaining || state.resetRequired) return state;
  const limited = error?.status === 429 || /rate_limit|over_request_rate/.test(error?.code || '');
  if (!limited && error?.code !== 'invalid_credentials' && error?.status !== 400) return state;
  memory = { ...state, failures: state.failures + (limited && state.cooledDown ? 0 : 1) };
  if (state.cooledDown && memory.failures >= 3) memory.resetRequired = true;
  else if (limited || (!state.cooledDown && memory.failures >= 5)) {
    memory.until = now + ADMIN_LOCKOUT_MS;
    // Keep post-cooldown failures if Supabase requests another pause.
    if (state.cooledDown) memory.failures = state.failures;
  }
  try { storage?.setItem(KEY, JSON.stringify(memory)); memoryOnly = !storage; } catch { memoryOnly = true; }
  return readAdminLockout(storage, now);
}
export function clearAdminLockout(storage = browserStorage()) {
  memory = emptyState(); memoryOnly = false; try { storage?.removeItem(KEY); } catch { /* Keep in memory. */ }
}

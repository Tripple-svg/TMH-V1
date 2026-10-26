export const CHAT_NOTICE_VERSION = '2026-10-26';
const KEY = 'haven_chat_identity_v1';
let memoryIdentity;
export function getHavenIdentity() {
  if (memoryIdentity) return memoryIdentity;
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(saved?.visitorId || '') && /^[a-f\d]{64}$/i.test(saved?.visitorToken || '')) memoryIdentity = saved;
  } catch { /* The current page can still retain its private identity in memory. */ }
  if (!memoryIdentity) memoryIdentity = {
    visitorId: crypto.randomUUID(),
    visitorToken: Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, '0')).join(''),
  };
  try { localStorage.setItem(KEY, JSON.stringify(memoryIdentity)); } catch { /* Optional storage. */ }
  return memoryIdentity;
}

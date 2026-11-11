const KEY = 'tmh_deletion_requested';
let requested = false;

export const DELETION_BROWSER_MESSAGE = 'A data deletion request has already been processed for this browser. If you need further assistance, please contact Team Haven.';

export function hasRequestedDeletion() {
  try { return requested || localStorage.getItem(KEY) === 'true'; }
  catch { return requested; }
}

export function rememberDeletionRequest() {
  requested = true;
  try { localStorage.setItem(KEY, 'true'); }
  catch { /* A blocked storage setting still allows the current page to remember. */ }
}

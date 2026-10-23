import { supabase } from './supabase';
import { getOrCreateVisitorId } from './trackingUtils';

const CONSENT_KEY = 'tmh_cookie_consent';

export function getCookieConsent() {
  let stored;
  try { stored = localStorage.getItem(CONSENT_KEY); } catch { return null; }
  if (stored === null) return null;
  return stored === 'true';
}

export async function setCookieConsent(consented) {
  let visitorId = null;
  try {
    localStorage.setItem(CONSENT_KEY, String(Boolean(consented)));
    if (!consented) {
      localStorage.removeItem('tmh_visit_count');
      localStorage.removeItem('tmh_first_visit_at');
    }
    visitorId = getOrCreateVisitorId();
  } catch { /* A preference can still be recorded without persistent storage. */ }
  const { error } = await supabase.from('cookie_consents').insert({
    visitor_id: visitorId,
    consented: Boolean(consented),
  });
  if (error) console.error('Unable to record cookie consent:', error);
  return { success: !error, error: error || null };
}

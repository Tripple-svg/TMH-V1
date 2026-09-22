import { supabase } from './supabase';
import { getOrCreateVisitorId } from './trackingUtils';

const CONSENT_KEY = 'tmh_cookie_consent';

export function getCookieConsent() {
  const stored = localStorage.getItem(CONSENT_KEY);
  if (stored === null) return null;
  return stored === 'true';
}

export async function setCookieConsent(consented) {
  localStorage.setItem(CONSENT_KEY, String(Boolean(consented)));
  const { error } = await supabase.from('cookie_consents').insert({
    visitor_id: getOrCreateVisitorId(),
    consented: Boolean(consented),
  });
  if (error) console.error('Unable to record cookie consent:', error);
  return { success: !error, error: error || null };
}

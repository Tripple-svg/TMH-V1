import { supabase } from './supabase';
import { getOrCreateVisitorId } from './trackingUtils';
import {COOKIE_NOTICE_VERSION,readCookiePreference} from './cookiePreference';

const CONSENT_KEY = 'tmh_cookie_consent';

export function getCookieConsent() {
  try{return readCookiePreference(localStorage);}catch{return null;}
}

export async function setCookieConsent(consented) {
  let visitorId = null;
  try {
    localStorage.setItem(CONSENT_KEY, String(Boolean(consented)));
    localStorage.setItem('tmh_cookie_consent_at',new Date().toISOString());
    localStorage.setItem('tmh_cookie_consent_version',COOKIE_NOTICE_VERSION);
    localStorage.setItem('tmh_cookie_consent_recorded','false');
    if (!consented) {
      localStorage.removeItem('tmh_visit_count');
      localStorage.removeItem('tmh_first_visit_at');
    }
    visitorId = consented?getOrCreateVisitorId():null;
  } catch { /* A preference can still be recorded without persistent storage. */ }
  if(typeof window!=='undefined')window.dispatchEvent(new Event('tmh:cookie-consent-changed'));
  let error;
  try{const result=await supabase.functions.invoke('record-cookie-consent',{body:{visitorId,consented:Boolean(consented),version:COOKIE_NOTICE_VERSION}});error=result.error||result.data?.ok!==true;}
  catch{error=true;}
  try{localStorage.setItem('tmh_cookie_consent_recorded',String(!error));}catch{/* Optional analytics stays off without storage. */}
  if(typeof window!=='undefined')window.dispatchEvent(new Event('tmh:cookie-consent-changed'));
  if(error)console.warn('Cookie preference could not be recorded by the server.');
  return { success: !error, error: error || null };
}

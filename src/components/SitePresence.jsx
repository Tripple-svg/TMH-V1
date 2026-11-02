import {useEffect} from 'react';
import {getCookieConsent} from '../lib/cookieService';
import {supabase} from '../lib/supabase';
import {startSitePresence} from '../lib/sitePresence';

export default function SitePresence(){
  useEffect(()=>startSitePresence({
    readConsent:getCookieConsent,
    sendHeartbeat:(body,signal)=>supabase.functions.invoke('site-presence',{body,signal}),
  }),[]);
  return null;
}

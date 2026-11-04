import {useEffect} from 'react';
import {getCookieConsent} from '../lib/cookieService';
import {supabase} from '../lib/supabase';
import {startContentPerformance} from '../lib/contentPerformance';
export default function ContentPerformance(){
  useEffect(()=>startContentPerformance({readConsent:getCookieConsent,sendEvent:async body=>{const result=await supabase.functions.invoke('content-performance',{body});if(result.error||!result.data?.ok)throw Error('measurement');}}),[]);
  return null;
}

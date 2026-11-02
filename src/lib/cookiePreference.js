export const COOKIE_NOTICE_VERSION='2026-11-01';
// A TMH product policy, not a claim that every form of consent expires in law
// after 13 months. Old affirmative choices without a date must be asked again.
export function readCookiePreference(storage,now=Date.now()){
  try{
    const choice=storage.getItem('tmh_cookie_consent');
    if(choice==='false')return false;
    if(choice!=='true'||storage.getItem('tmh_cookie_consent_version')!==COOKIE_NOTICE_VERSION||storage.getItem('tmh_cookie_consent_recorded')!=='true')return null;
    const at=Date.parse(storage.getItem('tmh_cookie_consent_at')||'');if(!Number.isFinite(at)||at>now)return null;
    const expiry=new Date(at),day=expiry.getUTCDate();expiry.setUTCDate(1);expiry.setUTCMonth(expiry.getUTCMonth()+13);
    const month=expiry.getUTCMonth();expiry.setUTCDate(day);if(expiry.getUTCMonth()!==month)expiry.setUTCDate(0);
    return now<expiry.getTime()?true:null;
  }catch{return null;}
}

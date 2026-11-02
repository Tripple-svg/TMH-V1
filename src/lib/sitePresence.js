export const SITE_PRESENCE_KEY='tmh_site_presence_identity_v1';
export const SITE_PRESENCE_CONSENT_EVENT='tmh:cookie-consent-changed';
const HEARTBEAT_MS=120_000;
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

// A small headless controller keeps optional analytics out of product flows.
// No identifier is read, created or sent until the current notice is accepted.
export function startSitePresence({readConsent,sendHeartbeat,browserWindow=window,pageDocument=document,browserNavigator=navigator,browserCrypto=crypto,now=Date.now}){
  let stopped=false,inFlight=null;
  const discard=()=>{try{browserWindow.localStorage.removeItem(SITE_PRESENCE_KEY);}catch{/* Optional storage. */}};
  const cancel=()=>inFlight?.abort();
  const identity=()=>{
    try{
      const storage=browserWindow.localStorage;
      let profile=null;
      const saved=storage.getItem(SITE_PRESENCE_KEY);
      try{profile=JSON.parse(saved||'null');}catch{/* Replace a damaged optional profile only after consent. */}
      if(!uuid.test(profile?.visitorId||'')||!/^[a-f0-9]{64}$/i.test(profile?.visitorToken||'')){
        profile={visitorId:browserCrypto.randomUUID(),visitorToken:Array.from(browserCrypto.getRandomValues(new Uint8Array(32)),byte=>byte.toString(16).padStart(2,'0')).join(''),lastHeartbeatAt:0};
      }
      const last=Number(profile.lastHeartbeatAt);
      if(Number.isFinite(last)&&last>0&&last<=now()&&now()-last<HEARTBEAT_MS)return null;
      profile.lastHeartbeatAt=now();storage.setItem(SITE_PRESENCE_KEY,JSON.stringify(profile));
      return profile;
    }catch{return null;}
  };
  const poll=()=>{
    if(stopped)return;
    let accepted=false;
    try{accepted=readConsent()===true;}catch{/* Fail closed. */}
    if(!accepted){cancel();discard();return;}
    if(pageDocument.visibilityState!=='visible'||browserNavigator.onLine===false){cancel();return;}
    if(inFlight)return;
    const controller=new AbortController();inFlight=controller;
    const timeout=browserWindow.setTimeout(()=>controller.abort(),10_000);
    Promise.resolve().then(()=>{
      if(controller.signal.aborted||stopped||readConsent()!==true||pageDocument.visibilityState!=='visible'||browserNavigator.onLine===false)return;
      const profile=identity();if(!profile)return;
      return sendHeartbeat({visitorId:profile.visitorId,visitorToken:profile.visitorToken,consented:true},controller.signal);
    }).catch(()=>{/* Optional analytics must never interrupt the site. */}).finally(()=>{
      browserWindow.clearTimeout(timeout);if(inFlight===controller)inFlight=null;
    });
  };
  const storageChanged=event=>{if(event.key===null||event.key===SITE_PRESENCE_KEY||event.key?.startsWith('tmh_cookie_consent'))poll();};
  browserWindow.addEventListener('storage',storageChanged);
  browserWindow.addEventListener(SITE_PRESENCE_CONSENT_EVENT,poll);
  browserWindow.addEventListener('online',poll);
  browserWindow.addEventListener('offline',poll);
  pageDocument.addEventListener('visibilitychange',poll);
  const interval=browserWindow.setInterval(poll,10_000);
  poll();
  return()=>{
    stopped=true;cancel();browserWindow.clearInterval(interval);
    browserWindow.removeEventListener('storage',storageChanged);
    browserWindow.removeEventListener(SITE_PRESENCE_CONSENT_EVENT,poll);
    browserWindow.removeEventListener('online',poll);
    browserWindow.removeEventListener('offline',poll);
    pageDocument.removeEventListener('visibilitychange',poll);
  };
}

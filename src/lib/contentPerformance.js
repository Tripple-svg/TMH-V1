import {SITE_PRESENCE_KEY} from './sitePresence.js';
const SECTIONS=['hero','about','services','free-class','shop','testimonials'];
// No URLs, link labels, text, email or browser fingerprint are transmitted.
export function startContentPerformance({readConsent,sendEvent,browserWindow=window,pageDocument=document,Observer=IntersectionObserver}){
  let observer,stopped=false;const sent=new Set(),timers=new Map();
  const send=(content,event)=>{
    if(stopped||readConsent()!==true||pageDocument.visibilityState!=='visible'||!SECTIONS.includes(content)||sent.has(content+event))return;
    try{const identity=JSON.parse(browserWindow.localStorage.getItem(SITE_PRESENCE_KEY)||'null');if(!identity?.visitorId||!identity?.visitorToken)return;
      sent.add(content+event);void Promise.resolve(sendEvent({visitorId:identity.visitorId,visitorToken:identity.visitorToken,consented:true,content,event})).catch(()=>sent.delete(content+event));
    }catch{/* Optional measurement never interrupts navigation. */}
  };
  const clear=()=>{observer?.disconnect();observer=null;for(const timer of timers.values())browserWindow.clearTimeout(timer);timers.clear();};
  const configure=()=>{clear();if(stopped||readConsent()!==true)return;
    observer=new Observer(entries=>{for(const entry of entries){const id=entry.target.id;if(!entry.isIntersecting){browserWindow.clearTimeout(timers.get(id));timers.delete(id);continue;}
      if(!timers.has(id))timers.set(id,browserWindow.setTimeout(()=>{send(id,'view');timers.delete(id);},2000));}},{threshold:0.25});
    for(const id of SECTIONS){const element=pageDocument.getElementById(id);if(element)observer.observe(element);}
  };
  const clicked=event=>{const action=event.target.closest?.('a,button');const section=action?.closest?.('section[id]');if(section)send(section.id,'action');};
  pageDocument.addEventListener('click',clicked);browserWindow.addEventListener('tmh:cookie-consent-changed',configure);configure();
  return()=>{stopped=true;clear();pageDocument.removeEventListener('click',clicked);browserWindow.removeEventListener('tmh:cookie-consent-changed',configure);};
}

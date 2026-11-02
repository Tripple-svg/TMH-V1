import {readAdminMfa} from './adminMfa.js';
// Auth events can race a cold getSession or a slow getUser. The newest event
// wins; a completed check after logout/unmount cannot reopen the workspace.
export function observeAdminSession(auth,onSession){
  let live=true,revision=0;
  const apply=async(session,current)=>{
    if(!session){if(live&&current===revision)onSession(null);return;}
    const {data,error}=await auth.getUser(session.access_token);
    if(error||data?.user?.app_metadata?.role!=='admin'||data.user.deleted_at||(data.user.banned_until&&Date.parse(data.user.banned_until)>Date.now())){if(live&&current===revision)onSession(null);return;}
    const mfa=await readAdminMfa(auth,data.user);
    if(live&&current===revision)onSession(mfa.required?null:session,{mfaRequired:mfa.required});
  };
  const fail=current=>{if(live&&current===revision)onSession(null);};
  const {data:{subscription}}=auth.onAuthStateChange((_event,session)=>{
    const current=++revision;queueMicrotask(()=>void apply(session,current).catch(()=>fail(current)));
  });
  void auth.getSession().then(({data})=>{if(revision===0)return apply(data.session,0);}).catch(()=>fail(0));
  return()=>{live=false;subscription.unsubscribe();};
}

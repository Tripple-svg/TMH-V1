import { webcrypto } from 'node:crypto';
export const securityGlobals={crypto:webcrypto,TextEncoder,TextDecoder,Uint8Array};
// Migrate old business fixtures to Auth headers. These known fixture values are
// never sent in JSON; dedicated JWT tests cover missing/forged/customer tokens.
export function adminFixtureRequest(url,body={},init={}){
  const payload={...body};delete payload.password;const accessToken=body.accessToken;
  if(accessToken==='test-admin-jwt')delete payload.accessToken;
  const headers=new Headers(init.headers);
  if(accessToken==='test-admin-jwt')headers.set('Authorization','Bearer test-admin-jwt');
  return new Request(url,{...init,headers,...(!['GET','HEAD'].includes(init.method||'GET')?{body:JSON.stringify(payload)}:{})});
}
// Existing endpoint fixtures model their business tables. Stub only the new
// security RPCs here; request-security.test and PostgreSQL tests exercise their
// real budgets, races and failure behaviour separately.
export function withSecurityRpc(client) {
  return new Proxy(client,{get(target,key){
    if(key==='auth')return target.auth || {getUser:async token=>token==='test-admin-jwt'?{data:{user:{id:'test-admin',app_metadata:{role:'admin'}}},error:null}:{data:{user:null},error:{message:'Invalid session'}}};
    if(key!=='rpc')return target[key];
    return (name,args)=>{
      if(name==='admin_access_allowed')return Promise.resolve({data:true,error:null});
      if(name==='consume_playbook_limit')return Promise.resolve({data:true,error:null});
      if(name==='begin_admin_auth')return Promise.resolve({data:{allowed:true,started_at:'2026-10-28T00:00:00Z'},error:null});
      if(name==='finish_admin_auth')return Promise.resolve({data:true,error:null});
      if(name==='visitor_strategy_booking')return Promise.resolve({data:{pending:false},error:null});
      if(name==='record_ai_usage')return Promise.resolve({data:null,error:null});
      if(name==='ai_usage_summary')return Promise.resolve({data:[],error:null});
      if(name==='verification_attempt_gate')return Promise.resolve({data:{allowed:true},error:null});
      // Existing business fixtures retain their original RPC/table model.
      // Real run_admin_mutation SQL and its fail-closed Edge integration have
      // dedicated adversarial coverage in admin-security.test.mjs.
      if(name==='run_admin_mutation'){
        const p=args.p_payload,id=args.p_record_id;
        const rpc=(name,args)=>target.rpc?.(name,args);
        switch(args.p_action){
          case 'review_delete':return rpc('admin_delete_lead',{p_review_id:id});
          case 'inquiry_update':return rpc('update_haven_inquiry',{p_session_id:id,p_revision:p.revision,p_status:p.status,p_owner:p.owner,p_notes:p.notes,p_followup:p.followup});
          case 'assignment_save':return rpc('save_team_assignment',{p_kind:p.kind,p_target:id,p_revision:p.revision,p_name:p.name,p_email:p.email,p_note:p.note});
          case 'assignment_email_claim':return rpc('claim_team_assignment_email',{p_id:id,p_revision:p.revision,p_payload:p.payload});
          case 'moderation_update':return rpc('set_haven_moderation_flag',{p_email:p.email,p_visitor_id:p.visitor_id,p_status:p.status,p_reason:p.reason,p_session_id:p.session_id});
          case 'review_update':return target.from('brand_reviews').update({...p,updated_at:new Date().toISOString()}).eq('id',id).select('id, followup_status, followup_notes, updated_at').maybeSingle();
          case 'assignment_revoke':return target.from('team_assignments').update({revoked_at:new Date().toISOString()}).eq('id',id).eq('revision',p.revision).select().maybeSingle();
          case 'assignment_email_result':return target.from('team_assignments').update({...(p.provider_id?{provider_email_id:p.provider_id}:{}),...(p.error?{email_last_error:p.error}:{email_sent_at:new Date().toISOString(),email_last_error:null})}).eq('id',id).eq('revision',p.revision).select().maybeSingle();
          case 'review_email_error':return target.from('brand_reviews').update({welcome_email_last_error:p.code}).eq('id',id).eq('welcome_email_sent',false);
          case 'purchase_email_error':return target.from('playbook_purchases').update({thankyou_last_error:p.code}).eq('id',id).eq('thankyou_sent',false);
          case 'verification_unlock':return Promise.resolve(target.from('verification_attempts').update({attempts:0,cooldown_until:null,locked_at:null,updated_at:new Date().toISOString()}).eq('visitor_id',id).select('visitor_id')).then(result=>({...result,data:{reset:result.data?.length||0}}));
          default:return Promise.resolve({data:{ok:true},error:null});
        }
      }
      return target.rpc?.(name,args);
    };
  }});
}

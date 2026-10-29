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
      if(name==='consume_playbook_limit')return Promise.resolve({data:true,error:null});
      if(name==='begin_admin_auth')return Promise.resolve({data:{allowed:true,started_at:'2026-10-28T00:00:00Z'},error:null});
      if(name==='finish_admin_auth')return Promise.resolve({data:true,error:null});
      if(name==='visitor_strategy_booking')return Promise.resolve({data:{pending:false},error:null});
      if(name==='record_ai_usage')return Promise.resolve({data:null,error:null});
      if(name==='ai_usage_summary')return Promise.resolve({data:[],error:null});
      if(name==='verification_attempt_gate')return Promise.resolve({data:{allowed:true},error:null});
      return target.rpc?.(name,args);
    };
  }});
}

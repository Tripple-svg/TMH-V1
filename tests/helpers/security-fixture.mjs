import { webcrypto } from 'node:crypto';
export const securityGlobals={crypto:webcrypto,TextEncoder,TextDecoder,Uint8Array};
// Existing endpoint fixtures model their business tables. Stub only the new
// security RPCs here; request-security.test and PostgreSQL tests exercise their
// real budgets, races and failure behaviour separately.
export function withSecurityRpc(client) {
  return new Proxy(client,{get(target,key){
    if(key!=='rpc')return target[key];
    return (name,args)=>{
      if(name==='consume_playbook_limit')return Promise.resolve({data:true,error:null});
      if(name==='begin_admin_auth')return Promise.resolve({data:{allowed:true,started_at:'2026-10-28T00:00:00Z'},error:null});
      if(name==='finish_admin_auth')return Promise.resolve({data:true,error:null});
      return target.rpc?.(name,args);
    };
  }});
}

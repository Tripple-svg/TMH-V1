import { requestBucket } from './playbook-recovery.ts';
import { AdminAuthError } from './admin-auth.ts';

// The service-only RPC rechecks the current actor and commits the mutation and
// its audit event together. Never send browser-supplied actor or network values.
export async function runAdminMutation(db:any, request:Request, serviceKey:string, actor:{id:string}, action:string, recordId:string, payload:Record<string,unknown>={}) {
  const networkHash=await requestBucket(request,serviceKey);
  const result=await db.rpc('run_admin_mutation',{
    p_actor:actor.id,p_network_hash:networkHash,p_action:action,p_record_id:recordId,p_payload:payload,
  });
  if(result.error?.code==='42501')throw new AdminAuthError('Admin access required. Sign in again.',403);
  return result;
}

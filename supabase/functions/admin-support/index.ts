import {logEvent} from '../_shared/logger.ts';
import {observe} from '../_shared/observability.ts';
import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.118.0';
import {requireAdmin,readAdminBody,AdminAuthError} from '../_shared/admin-auth.ts';
import {runAdminMutation} from '../_shared/admin-audit.ts';
import {auditNetwork} from '../_shared/admin-operations.ts';
import {verifyOrigin,responseHeaders,HavenRequestError} from '../_shared/haven-request.ts';
const FIELDS='id,created_at,updated_at,first_response_at,status,category,source,name,email,message,visitor_id,revision,notes,notification_accepted_at,notification_email_id,notification_error,notification_first_attempt_at';
Deno.serve(observe('admin-support',async req=>{
  const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...responseHeaders(req),...(status===429?{'Retry-After':'60'}:{})}});
  try{
    verifyOrigin(req);
    if(req.method==='OPTIONS')return new Response('ok',{headers:responseHeaders(req)});
    if(req.method!=='POST')return json({ok:false,error:'Method not allowed.'},405);
    const url=Deno.env.get('SUPABASE_URL'),key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');if(!url||!key)throw Error('config');
    const db=createClient(url,key,{auth:{persistSession:false}}),actor=await requireAdmin(db,req,key),body=await readAdminBody(req);
    if(body.action==='markResponse'){
      if(!/^[a-f\d-]{36}$/i.test(body.id||'')||!Number.isSafeInteger(body.revision))return json({ok:false,error:'Select a saved request.'},400);
      const result=await db.rpc('mark_support_response',{p_actor:actor.id,p_id:body.id,p_revision:body.revision,p_network:await auditNetwork(req,key)});
      if(result.error)throw Error('response');return json({ok:result.data===true,error:result.data===true?undefined:'This request changed. Refresh before retrying.'},result.data===true?200:409);
    }
    if(body.action==='list'){
      const {data,error,count}=await db.from('support_requests').select(FIELDS,{count:'exact'}).order('created_at',{ascending:false}).limit(100);
      if(error)throw Error('read');return json({ok:true,requests:data,total:count});
    }
    if(body.action==='update'){
      if(!/^[a-f\d-]{36}$/i.test(body.id||'')||!Number.isSafeInteger(body.revision)||body.revision<0||typeof body.notes!=='string'||body.notes.length>4000||typeof body.reason!=='string'||body.reason.trim().length<10||body.reason.length>500
        ||!['new','in_progress','waiting_customer','resolved'].includes(body.status)||!['update','reset_review_attempts','reset_verification'].includes(body.resolution))return json({ok:false,error:'Check the status and add a reason of at least 10 characters.'},400);
      const {data,error}=await runAdminMutation(db,req,key,actor,'support_update',body.id,{revision:body.revision,status:body.status,notes:body.notes,action:body.resolution,reason:body.reason});
      if(error)throw Error('update');
      if(data?.conflict)return json({ok:false,error:'Another admin changed this request. Keep your draft, then refresh before saving.'},409);
      if(data?.missing)return json({ok:false,error:'Support request not found.'},404);
      if(data?.cooldown)return json({ok:false,error:'This reset was used within the last hour. Review the request before trying again.'},409);
      if(data?.unavailable)return json({ok:false,error:'This request has no verified device or applicable network reference. Contact the sender to investigate.'},409);
      if(!data?.ok)throw Error('result');return json({ok:true,changed:data.changed});
    }
    if(body.action==='history'&&/^[a-f\d-]{36}$/i.test(body.id||'')){
      const {data,error}=await db.from('support_actions').select('id,created_at,actor_id,action,reason').eq('request_id',body.id).order('created_at',{ascending:false}).limit(20);
      if(error)throw Error('history');return json({ok:true,actions:data});
    }
    return json({ok:false,error:'Invalid support action.'},400);
  }catch(error){
    if(error instanceof AdminAuthError||error instanceof HavenRequestError)return json({ok:false,error:error.message},error.status);
    logEvent('error','admin-support.diagnostic_1');return json({ok:false,error:'Support data is unavailable. Check the support migration and retry.'},503);
  }
}));

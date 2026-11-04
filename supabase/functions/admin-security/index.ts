import {logEvent} from '../_shared/logger.ts';
import {observe} from '../_shared/observability.ts';
import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.118.0';
import {requireAdmin,readAdminBody,AdminAuthError} from '../_shared/admin-auth.ts';
import {runAdminMutation} from '../_shared/admin-audit.ts';
import {verifyOrigin,responseHeaders,HavenRequestError} from '../_shared/haven-request.ts';
const SETTINGS=['chat_enabled','scoring_enabled','visitor_daily_calls','visitor_daily_tokens','review_daily_calls','review_daily_tokens','network_daily_calls','network_daily_tokens','global_daily_calls','global_daily_tokens'];
const AUDIT_FIELDS='id,occurred_at,actor_id,action,record_type,record_id,network_hash,changed_fields,outcome';
Deno.serve(observe('admin-security',async req=>{
  const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...responseHeaders(req),...(status===429?{'Retry-After':'60'}:{})}});
  try{
    verifyOrigin(req);
    if(req.method==='OPTIONS')return new Response(null,{status:204,headers:responseHeaders(req)});
    if(req.method!=='POST')return json({ok:false,error:'Method not allowed.'},405);
    const url=Deno.env.get('SUPABASE_URL'),key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if(!url||!key)throw Error('configuration');
    const db=createClient(url,key,{auth:{persistSession:false}}),actor=await requireAdmin(db,req,key),body=await readAdminBody(req);
    if(body.action==='settings'){
      const {data,error}=await db.from('ai_budget_settings').select(SETTINGS.join(',')+',updated_at').eq('id',true).single();
      if(error||!data)throw Error('settings');return json({ok:true,settings:data});
    }
    if(body.action==='updateSettings'){
      const values=body.settings;
      if(!values||typeof values!=='object'||Array.isArray(values)||Object.keys(values).length===0||Object.keys(values).some(field=>!SETTINGS.includes(field)))return json({ok:false,error:'Select valid AI settings.'},400);
      for(const [field,value] of Object.entries(values)){
        if(field.endsWith('_enabled')?typeof value!=='boolean':!Number.isSafeInteger(value)||Number(value)<1||Number(value)>(field.endsWith('_calls')?1000000:1000000000000))return json({ok:false,error:'Check the enabled switches and positive daily limits.'},400);
      }
      const {data,error}=await runAdminMutation(db,req,key,actor,'ai_settings_update','global',values);
      if(error||!data)throw Error('update');return json({ok:true,settings:data});
    }
    if(body.action==='audit'){
      let query=db.from('admin_audit_events').select(AUDIT_FIELDS).order('occurred_at',{ascending:false}).order('id',{ascending:false}).limit(100);
      if(body.recordId!=null){if(typeof body.recordId!=='string'||body.recordId.length<1||body.recordId.length>200)return json({ok:false,error:'Invalid record reference.'},400);query=query.eq('record_id',body.recordId);}
      const {data,error}=await query;if(error)throw Error('audit');return json({ok:true,events:data,limit:100});
    }
    return json({ok:false,error:'Invalid security action.'},400);
  }catch(error){
    if(error instanceof AdminAuthError||error instanceof HavenRequestError)return json({ok:false,error:error.message},error.status);
    logEvent('error','admin-security.diagnostic_1');return json({ok:false,error:'Security settings are unavailable. Check the security migrations and retry.'},503);
  }
}));

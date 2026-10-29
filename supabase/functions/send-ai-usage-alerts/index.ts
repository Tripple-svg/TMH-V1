import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.118.0';
import {isInternalRequest} from '../_shared/internal-auth.js';
import {deliverEmail,mailConfiguration,MailDeliveryError} from '../_shared/resend-delivery.js';
import {editorialEmail} from '../_shared/email-template.js';
Deno.serve(async req=>{
  const key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),url=Deno.env.get('SUPABASE_URL');
  if(req.method!=='POST')return Response.json({ok:false}, {status:405});
  const pollSecret=Deno.env.get('INTERNAL_POLL_SECRET');
  if(!key||!url||!(isInternalRequest(req,key)||pollSecret&&req.headers.get('x-internal-poll-key')===pollSecret))return Response.json({ok:false},{status:401});
  const db=createClient(url,key,{auth:{persistSession:false}});
  const {data,error}=await db.rpc('claim_ai_alerts');if(error)return Response.json({ok:false},{status:503});
  let failed=0;
  for(const alert of data||[]){
    const paragraphs=alert.kind==='budget_threshold'
      ? [`Recorded ${alert.provider} usage crossed your configured daily token alert threshold on ${alert.day} (UTC). This measures TMH requests, not remaining provider credit. Check API Usage in Admin and the provider billing dashboard.`]
      : [`${alert.provider} reported ${alert.kind==='rate_or_quota'?'a rate or quota limit':'temporary unavailability'} on ${alert.day} (UTC). Check the provider dashboard and Haven diagnostics. A 503 does not mean tokens are exhausted.`];
    try{
      await deliverEmail(mailConfiguration(Deno.env),{to:['francis.teamhaven@gmail.com','paschal.tmh@gmail.com'],subject:`Haven API alert: ${alert.provider} · ${alert.kind}`,text:paragraphs.join('\n\n'),html:editorialEmail({label:'HAVEN API HEALTH',title:'Review your API usage',paragraphs,button:{label:'Open Admin',href:'https://themarketinghaven.xyz/admin'}})},'ai-alert/'+alert.id);
      const {error:saveError}=await db.from('ai_usage_alerts').update({sent_at:new Date().toISOString(),last_error:null}).eq('id',alert.id);if(saveError)throw Error('alert_marker_failed');
    }catch(error){failed++;await db.from('ai_usage_alerts').update({last_error:error instanceof MailDeliveryError?error.code:'alert_delivery_pending'}).eq('id',alert.id);}
  }
  return Response.json({ok:failed===0,attempted:data?.length||0,failed},{status:failed?503:200});
});

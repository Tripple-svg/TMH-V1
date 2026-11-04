import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.118.0';
import {observe} from '../_shared/observability.ts';
import {isInternalRequest} from '../_shared/internal-auth.js';
import {ADMIN_ALERT_RECIPIENTS} from '../_shared/admin-alerts.js';
import {deliverEmail,mailConfiguration} from '../_shared/resend-delivery.js';
import {editorialEmail} from '../_shared/email-template.js';
import {recordWorkerSuccess} from '../_shared/operations-health.ts';
Deno.serve(observe('send-lead-followup-nudges',async request=>{
  const url=Deno.env.get('SUPABASE_URL'),key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),poll=Deno.env.get('INTERNAL_POLL_SECRET');
  if(request.method!=='POST')return Response.json({ok:false},{status:405});
  if(!url||!key||!(isInternalRequest(request,key)||poll&&request.headers.get('x-internal-poll-key')===poll))return Response.json({ok:false},{status:401});
  const db=createClient(url,key,{auth:{persistSession:false}});
  const fresh=await db.rpc('refresh_lead_followup_nudges');if(fresh.error)throw Error('queue');
  const rows=await db.rpc('claim_lead_nudges');if(rows.error)throw Error('claim');
  for(const row of rows.data||[]){
    const paragraphs=[`A saved lead has waited at least three days without being marked contacted. Review reference: ${row.review_id}.`,'A teammate approved this reminder. Open the lead, review the history and decide how to follow up. No customer email was sent by this reminder.'];
    const id=await deliverEmail(mailConfiguration(Deno.env),{to:ADMIN_ALERT_RECIPIENTS,subject:'TMH: a lead needs follow-up',text:paragraphs.join('\n\n'),html:editorialEmail({label:'LEAD FOLLOW-UP',title:'Make the next move.',paragraphs,button:{label:'Review leads',href:'https://themarketinghaven.xyz/admin'}})},'lead-nudge/'+row.review_id);
    const saved=await db.from('admin_followup_nudges').update({accepted_at:new Date().toISOString(),email_id:id}).eq('review_id',row.review_id);if(saved.error)throw Error('marker');
  }
  await recordWorkerSuccess(db,'send-lead-followup-nudges');
  return Response.json({ok:true,attempted:rows.data?.length||0});
}));

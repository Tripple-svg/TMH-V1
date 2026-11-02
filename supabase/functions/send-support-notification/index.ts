import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.118.0';
import {isInternalRequest} from '../_shared/internal-auth.js';
import {deliverEmail,mailConfiguration,MailDeliveryError} from '../_shared/resend-delivery.js';
import {editorialEmail} from '../_shared/email-template.js';
Deno.serve(async req=>{
  if(req.method!=='POST')return Response.json({ok:false},{status:405});
  const url=Deno.env.get('SUPABASE_URL'),key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),poll=Deno.env.get('INTERNAL_POLL_SECRET');
  if(!url||!key||!(isInternalRequest(req,key)||poll&&req.headers.get('x-internal-poll-key')===poll))return Response.json({ok:false},{status:401});
  const db=createClient(url,key,{auth:{persistSession:false}});
  const {data,error}=await db.rpc('claim_support_notifications');if(error)return Response.json({ok:false},{status:503});
  let failed=0;
  for(const row of data||[]){
    let accepted=row.notification_email_id;
    try{
      // Full messages stay in Admin. Email carries a minimum useful summary.
      const paragraphs=[row.source==='zoho'
        ? `An email arrived in the Zoho support inbox from ${row.email}. The sender address is not ownership proof. Open Zoho to read the full message and reply.`
        : `${row.name||'A visitor'} submitted a ${row.category.replaceAll('_',' ')} request. Contact email (not verified by this form): ${row.email}.`,
        `Reference: ${row.id}. Review the request in Admin before clearing an attempt lock. A cooldown is not a moderation offence.`];
      if(!accepted)accepted=await deliverEmail(mailConfiguration(Deno.env),{to:['francis.teamhaven@gmail.com','paschal.tmh@gmail.com'],subject:'TMH support: '+row.category.replaceAll('_',' '),text:paragraphs.join('\n\n')+'\n\nhttps://themarketinghaven.xyz/admin',html:editorialEmail({label:'SUPPORT REQUEST',title:'Someone needs a hand.',paragraphs,button:{label:'Review support request',href:'https://themarketinghaven.xyz/admin'}})},'support/'+row.id);
      const {error:saveError}=await db.from('support_requests').update({notification_accepted_at:new Date().toISOString(),notification_email_id:accepted,notification_error:null}).eq('id',row.id);
      if(saveError)throw Error('marker');
    }catch(error){failed++;await db.from('support_requests').update({notification_error:error instanceof MailDeliveryError?error.code:'support_delivery_pending',...(accepted?{notification_email_id:accepted}:{})}).eq('id',row.id);}
  }
  return Response.json({ok:failed===0,attempted:data?.length||0,failed},{status:failed?503:200});
});

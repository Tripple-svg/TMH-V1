import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.118.0';
import {HavenRequestError,readBoundedJson,responseHeaders,verifyOrigin,textValue} from '../_shared/haven-request.ts';
import {publicRequestLimit} from '../_shared/abuse-limits.ts';
import {requestBucket} from '../_shared/playbook-recovery.ts';
import {hashReviewToken} from '../_shared/review-access.ts';

Deno.serve(async req=>{
  const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...responseHeaders(req),...(status===429?{'Retry-After':'900'}:{})}});
  if(req.method==='OPTIONS')return new Response('ok',{headers:responseHeaders(req)});
  if(req.method!=='POST')return json({ok:false,error:'Method not allowed.'},405);
  try{
    verifyOrigin(req);
    const url=Deno.env.get('SUPABASE_URL'),key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),captchaSecret=Deno.env.get('HCAPTCHA_SECRET');
    if(!url||!key||!captchaSecret)throw new HavenRequestError('Support requests are temporarily unavailable. Email info@themarketinghaven.xyz instead.',503);
    const body=await readBoundedJson(req,16384);
    const email=textValue(body.email,254).toLowerCase(),name=textValue(body.name,100),message=textValue(body.message,4000),category=body.category;
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||message.length<10||!['review_access','rate_limit','purchase','booking','other'].includes(category)||body.agreed!==true)
      throw new HavenRequestError('Add your email, a short description and permission to contact you.');
    const db=createClient(url,key,{auth:{persistSession:false}});
    // Separate support budget: a review lock cannot prevent asking for help.
    await publicRequestLimit(db,req,key,'support-request',3,900);
    if(typeof body.captchaToken!=='string'||body.captchaToken.length>10000)throw new HavenRequestError('Complete the security check.',400);
    let captcha;
    try{captcha=await fetch('https://api.hcaptcha.com/siteverify',{method:'POST',body:new URLSearchParams({secret:captchaSecret,response:body.captchaToken}),signal:AbortSignal.timeout(10000)});}
    catch{throw new HavenRequestError('The security check is unavailable. Please try again.',503);}
    const check=await captcha.json().catch(()=>null);
    if(!captcha.ok||check?.success!==true)throw new HavenRequestError('Complete a fresh security check and try again.',403);
    let visitorId:string|null=null;
    if(typeof body.visitorId==='string'&&/^[a-f\d-]{36}$/i.test(body.visitorId)&&/^[a-f\d]{64}$/i.test(body.visitorToken||'')){
      const {data,error}=await db.from('haven_chat_visitors').select('id').eq('id',body.visitorId).eq('token_hash',await hashReviewToken(body.visitorToken)).maybeSingle();
      if(error)throw new HavenRequestError('Support could not verify this device. Please try again.',503);
      visitorId=data?.id||null;
    }
    const id=crypto.randomUUID();
    const {error}=await db.from('support_requests').insert({id,email,name,message,category,visitor_id:visitorId,network_bucket:await requestBucket(req,key)});
    if(error)throw new HavenRequestError('Your request could not be saved. Email info@themarketinghaven.xyz instead.',503);
    // Durable queue, not a fire-and-forget promise. The cron worker sends both
    // team notifications; no user-provided recipient or email body is executed.
    return json({ok:true,reference:id},201);
  }catch(error){
    if(error instanceof HavenRequestError)return json({ok:false,error:error.message},error.status);
    console.error('support-request: request_failed');return json({ok:false,error:'Support could not save your request. Email info@themarketinghaven.xyz.'},503);
  }
});

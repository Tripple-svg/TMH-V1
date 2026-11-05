import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.118.0';
import {observe} from '../_shared/observability.ts';
import {readBoundedJson,verifyOrigin,responseHeaders,HavenRequestError} from '../_shared/haven-request.ts';
import {publicRequestLimit} from '../_shared/abuse-limits.ts';
Deno.serve(observe('validate-hcaptcha',async request=>{
  const json=(body:unknown,status=200,retryAfter?:number)=>Response.json(body,{status,headers:{...responseHeaders(request),...(retryAfter?{'Retry-After':String(retryAfter)}:{})}});
  try{
    verifyOrigin(request);
    if(request.method==='OPTIONS')return new Response(null,{status:204,headers:responseHeaders(request)});
    if(request.method!=='POST')return json({success:false,error:'Method not allowed'},405);
    const body=await readBoundedJson(request,4096);
    if(typeof body.token!=='string'||!body.token.trim()||body.token.length>3000)return json({success:false,error:'Complete the security check before continuing.'},400);
    const url=Deno.env.get('SUPABASE_URL'),key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),secret=Deno.env.get('HCAPTCHA_SECRET');
    if(!url||!key||!secret)return json({success:false,error:'Security verification is temporarily unavailable.'},503);
    await publicRequestLimit(createClient(url,key,{auth:{persistSession:false}}),request,key,'captcha-validation');
    const response=await fetch('https://api.hcaptcha.com/siteverify',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({secret,response:body.token}),signal:AbortSignal.timeout(10000)});
    if(!response.ok)return json({success:false,error:'Security verification is temporarily unavailable. Retry the challenge.'},503);
    const result=await response.json();
    return result.success===true?json({success:true}):json({success:false,error:'Verification failed. Complete a new security check.'},400);
  }catch(error){return json({success:false,error:error instanceof HavenRequestError?error.message:'Security verification is temporarily unavailable. Retry the challenge.'},error instanceof HavenRequestError?error.status:503,error instanceof HavenRequestError?error.retryAfter:undefined);}
}));

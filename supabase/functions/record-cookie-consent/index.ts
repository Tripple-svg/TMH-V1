import {observe} from '../_shared/observability.ts';
import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.118.0';
import {verifyOrigin,readBoundedJson,responseHeaders,HavenRequestError} from '../_shared/haven-request.ts';
import {publicRequestLimit} from '../_shared/abuse-limits.ts';
Deno.serve(observe('record-cookie-consent',async request=>{
  const json=(body:unknown,status=200)=>Response.json(body,{status,headers:responseHeaders(request)});
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:responseHeaders(request)});
  if(request.method!=='POST')return json({ok:false},405);
  try{
    verifyOrigin(request);const body=await readBoundedJson(request,1024);
    if(typeof body.consented!=='boolean'||body.version!=='2026-11-01'||body.consented&&typeof body.visitorId!=='string'||body.visitorId&&!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(body.visitorId))return json({ok:false,error:'Invalid cookie preference.'},400);
    const url=Deno.env.get('SUPABASE_URL'),key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');if(!url||!key)throw Error('configuration');
    const db=createClient(url,key,{auth:{persistSession:false}});await publicRequestLimit(db,request,key,'cookie-choice',20,600);
    const {error}=await db.from('cookie_consents').insert({consented:body.consented,visitor_id:body.consented?body.visitorId:null,notice_version:body.version});
    if(error)throw Error('write');return json({ok:true});
  }catch(error){return json({ok:false,error:error instanceof HavenRequestError?error.message:'Cookie preference recording is unavailable.'},error instanceof HavenRequestError?error.status:503);}
}));

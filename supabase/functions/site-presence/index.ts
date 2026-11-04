import {observe} from '../_shared/observability.ts';
import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.118.0';
import {HavenRequestError,readBoundedJson,responseHeaders,verifyOrigin} from '../_shared/haven-request.ts';

Deno.serve(observe('site-presence',async request=>{
  const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{...responseHeaders(request),...(status===429?{'Retry-After':'120'}:{})}});
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:responseHeaders(request)});
  if(request.method!=='POST')return json({ok:false},405);
  try{
    verifyOrigin(request);
    const body=await readBoundedJson(request,512);
    if(Object.keys(body).some(key=>!['visitorId','visitorToken','consented'].includes(key))||body.consented!==true||
      typeof body.visitorId!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(body.visitorId)||
      typeof body.visitorToken!=='string'||!/^[a-f0-9]{64}$/i.test(body.visitorToken))throw new HavenRequestError('Invalid analytics profile.');
    const url=Deno.env.get('SUPABASE_URL'),key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if(!url||!key)throw new HavenRequestError('Activity recording is unavailable.',503);
    const db=createClient(url,key,{auth:{persistSession:false}});
    // One fixed global budget; do not derive or persist a bucket from an IP.
    const limit=await db.rpc('consume_playbook_limit',{p_bucket:'site-presence:global',p_max:100,p_seconds:10});
    if(limit.error)throw new HavenRequestError('Activity recording is unavailable.',503);
    if(limit.data!==true)throw new HavenRequestError('Activity recording is busy.',429);
    const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(body.visitorToken));
    const hash=Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');
    const {data,error}=await db.rpc('record_site_presence',{p_visitor_id:body.visitorId,p_token_hash:hash});
    if(error?.code==='42501')throw new HavenRequestError('Profile proof required.',403);
    if(error||data!==true)throw new HavenRequestError('Activity recording is unavailable.',503);
    return json({ok:true,heartbeatSeconds:120});
  }catch(error){
    if(error instanceof HavenRequestError)return json({ok:false,error:error.message},error.status);
    return json({ok:false,error:'Activity recording is unavailable.'},503);
  }
}));

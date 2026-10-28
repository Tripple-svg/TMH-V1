import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.118.0';
import { assignmentBrief, verifyAssignmentToken } from '../_shared/team-assignment.js';

const ORIGINS=['https://themarketinghaven.xyz','https://www.themarketinghaven.xyz','http://localhost:5173','http://localhost:5175','http://127.0.0.1:5173'];
serve(async(req)=>{
  const origin=req.headers.get('origin');
  const headers={'Access-Control-Allow-Origin':origin&&ORIGINS.includes(origin)?origin:ORIGINS[0],
    'Access-Control-Allow-Headers':'authorization,x-client-info,apikey,content-type','Access-Control-Allow-Methods':'POST,OPTIONS',
    'Content-Type':'application/json','Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex, nofollow',Vary:'Origin'};
  const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers});
  const unavailable=()=>json({ok:false,error:'This private link is invalid, expired or withdrawn. Ask the team to send a fresh assignment.'},403);
  if(origin&&!ORIGINS.includes(origin))return unavailable();
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
  if(req.method!=='POST')return json({ok:false,error:'Method not allowed'},405);
  try{
    const url=Deno.env.get('SUPABASE_URL'),key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if(!url||!key)return json({ok:false,error:'Briefs are temporarily unavailable.'},503);
    const raw=await req.text();if(raw.length>1000)return unavailable();
    const body=JSON.parse(raw);
    if(!['read','acknowledge'].includes(body.action))return unavailable();
    const proof=await verifyAssignmentToken(body.token,Deno.env.get('TEAM_ASSIGNMENT_LINK_SECRET')?.trim()||key);
    if(!proof)return unavailable();
    const db=createClient(url,key,{auth:{persistSession:false}});
    const {data:item,error}=await db.from('team_assignments').select('id,booking_id,inquiry_id,assignee_name,preparation_note,revision,expires_at,revoked_at,acknowledged_at')
      .eq('id',proof.id).maybeSingle();
    if(error)throw error;
    if(!item||item.revoked_at||item.revision!==proof.revision||Math.floor(Date.parse(item.expires_at)/1000)!==proof.expires||Date.parse(item.expires_at)<=Date.now())return unavailable();
    if(body.action==='acknowledge'){
      const {data,error}=await db.from('team_assignments').update({acknowledged_at:item.acknowledged_at||new Date().toISOString()})
        .eq('id',item.id).eq('revision',item.revision).is('revoked_at',null).gt('expires_at',new Date().toISOString()).select('acknowledged_at').maybeSingle();
      if(error||!data)return unavailable();item.acknowledged_at=data.acknowledged_at;
    }
    const brief=await assignmentBrief(db,item);
    // Whitelisted fields only: no transcript, raw review, provider payload,
    // screenshots, access credentials or general admin navigation.
    return json({ok:true,assignment:{assigneeName:item.assignee_name,preparationNote:item.preparation_note,expiresAt:item.expires_at,acknowledgedAt:item.acknowledged_at},brief});
  }catch{
    return json({ok:false,error:'The preparation brief could not load. Try again or contact the team.'},503);
  }
});

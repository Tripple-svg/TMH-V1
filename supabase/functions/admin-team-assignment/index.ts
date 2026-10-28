import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.118.0';
import { ASSIGNMENT_FIELDS, TEAM_NAMES, assignmentBrief, assignmentEmail, assignmentToken } from '../_shared/team-assignment.js';
import { deliverEmail, mailConfiguration, MailDeliveryError } from '../_shared/resend-delivery.js';
import { authenticateAdmin, AdminAuthError } from '../_shared/admin-auth.ts';

const ORIGINS=['https://themarketinghaven.xyz','https://www.themarketinghaven.xyz','http://localhost:5173','http://localhost:5175','http://127.0.0.1:5173'];
const uuid=(value:unknown)=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
serve(async(req)=>{
  const origin=req.headers.get('origin');
  const headers={'Access-Control-Allow-Origin':origin&&ORIGINS.includes(origin)?origin:ORIGINS[0],
    'Access-Control-Allow-Headers':'authorization,x-client-info,apikey,content-type','Access-Control-Allow-Methods':'POST,OPTIONS',
    'Content-Type':'application/json','Cache-Control':'no-store',Vary:'Origin'};
  const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...headers,...(status===429?{'Retry-After':'600'}:{})}});
  if(origin&&!ORIGINS.includes(origin))return json({ok:false,error:'Origin not allowed'},403);
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
  if(req.method!=='POST')return json({ok:false,error:'Method not allowed'},405);
  try{
    const url=Deno.env.get('SUPABASE_URL'),key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),password=Deno.env.get('ADMIN_PASSWORD');
    if(!url||!key||!password)return json({ok:false,error:'Assignments are not configured.'},503);
    const raw=await req.text();if(raw.length>12000)return json({ok:false,error:'Request too large.'},413);
    const body=JSON.parse(raw);
    const db=createClient(url,key,{auth:{persistSession:false}});
    if(!await authenticateAdmin(db,req,key,body.password,password))return json({ok:false,error:'Unauthorised'},401);
    const load=async(id:string)=>{
      const result=await db.from('team_assignments').select(ASSIGNMENT_FIELDS).eq('id',id).maybeSingle();
      if(result.error)throw new Error('assignment_read_failed');return result.data;
    };
    if(['load','save'].includes(body.action)){
      if(!['booking','inquiry'].includes(body.kind)||(body.kind==='booking'?!/^[1-9]\d{0,17}$/.test(String(body.targetId)):!uuid(body.targetId)))return json({ok:false,error:'Select a valid booking or team inquiry.'},400);
      if(body.action==='load'){
        const {data,error}=await db.from('team_assignments').select(ASSIGNMENT_FIELDS).eq(body.kind==='booking'?'booking_id':'inquiry_id',body.targetId).maybeSingle();
        if(error)throw new Error('assignment_read_failed');return json({ok:true,assignment:data});
      }
      if(!TEAM_NAMES.includes(body.name)||typeof body.email!=='string'||body.email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim())
        ||typeof body.note!=='string'||body.note.length>2000||!Number.isSafeInteger(body.expectedRevision)||body.expectedRevision<0)return json({ok:false,error:'Check the teammate, email and preparation note.'},400);
      const {data,error}=await db.rpc('save_team_assignment',{p_kind:body.kind,p_target:String(body.targetId),p_revision:body.expectedRevision,p_name:body.name,p_email:body.email.trim().toLowerCase(),p_note:body.note.trim()});
      if(error)return json({ok:false,error:error.code==='P0002'?'Select an active upcoming booking or existing team inquiry.':'Could not save the assignment. Check the migration and retry.'},error.code==='P0002'?404:503);
      if(data?.conflict)return json({ok:false,error:'The assignment changed. Reload its saved details before editing.'},409);
      if(data?.busy)return json({ok:false,error:'An email is being processed. Wait a minute before changing the assignment.'},409);
      if(!data?.id)throw new Error('assignment_save_unconfirmed');
      return json({ok:true,assignment:await load(data.id)});
    }
    if(!['send','revoke'].includes(body.action)||!uuid(body.id)||!Number.isSafeInteger(body.expectedRevision))return json({ok:false,error:'Invalid assignment action.'},400);
    const item=await load(body.id);
    if(!item)return json({ok:false,error:'Assignment not found.'},404);
    if(item.revision!==body.expectedRevision)return json({ok:false,error:'The assignment changed. Reload before continuing.'},409);
    if(body.action==='revoke'){
      const {data,error}=await db.from('team_assignments').update({revoked_at:new Date().toISOString()}).eq('id',item.id).eq('revision',item.revision).select(ASSIGNMENT_FIELDS).maybeSingle();
      if(error||!data)return json({ok:false,error:'Revocation could not be confirmed. Reload and try again.'},409);
      return json({ok:true,assignment:data});
    }
    if(item.revoked_at||Date.parse(item.expires_at)<=Date.now())return json({ok:false,error:'Save a fresh assignment before sending a new link.'},409);
    const brief=await assignmentBrief(db,item);
    if(brief.kind==='booking'&&(!['active','confirmed'].includes(brief.status)||(brief.endTime&&Date.parse(brief.endTime)<Date.now())))return json({ok:false,error:'This meeting was cancelled or has ended. Refresh Bookings.'},409);
    const configuration=mailConfiguration(Deno.env);
    const secret=Deno.env.get('TEAM_ASSIGNMENT_LINK_SECRET')?.trim()||key;
    const link='https://themarketinghaven.xyz/team-brief#token='+await assignmentToken(item,secret);
    const payload={from:configuration.from,...assignmentEmail(item,brief,link)};
    const {data:claim,error:claimError}=await db.rpc('claim_team_assignment_email',{p_id:item.id,p_revision:item.revision,p_payload:payload});
    if(claimError)throw new Error('assignment_claim_failed');
    if(!claim||claim.busy)return json({ok:false,error:'An attempt is in progress or the assignment changed. Wait a minute and reload.'},409);
    if(claim.expired_retry)return json({ok:false,error:'The safe retry window ended. Check Resend, then save a fresh assignment to send a new invitation.'},409);
    if(claim.already_sent)return json({ok:true,assignment:await load(item.id),alreadySent:true});
    let providerId=claim.provider_email_id;
    try{
      if(!providerId)providerId=await deliverEmail({key:configuration.key,from:claim.payload.from},claim.payload,`team-assignment/${item.id}/${item.revision}`);
      const {data,error}=await db.from('team_assignments').update({provider_email_id:providerId,email_sent_at:new Date().toISOString(),email_last_error:null})
        .eq('id',item.id).eq('revision',item.revision).select(ASSIGNMENT_FIELDS).maybeSingle();
      if(error||!data)throw new MailDeliveryError('assignment_email_marker_failed','Resend accepted the message; refresh and retry to repair its saved status.',503);
      return json({ok:true,assignment:data});
    }catch(error){
      const code=error instanceof MailDeliveryError?error.code:'assignment_email_failed';
      await db.from('team_assignments').update({email_last_error:code,...(providerId?{provider_email_id:providerId}:{})}).eq('id',item.id).eq('revision',item.revision);
      throw error;
    }
  }catch(error){
    if(error instanceof AdminAuthError)return json({ok:false,error:error.message},error.status);
    const code=error instanceof MailDeliveryError?error.code:'assignment_unavailable';
    console.error('admin-team-assignment: '+code);
    return json({ok:false,code,error:error instanceof MailDeliveryError?error.message:'Could not complete the assignment. Check the migration and retry.'},error instanceof MailDeliveryError?error.status:503);
  }
});

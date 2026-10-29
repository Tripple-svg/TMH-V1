import {adminFixtureRequest} from './helpers/security-fixture.mjs';
import { withSecurityRpc } from './helpers/security-fixture.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { buildSync } from 'esbuild';
import { webcrypto } from 'node:crypto';
import { HAVEN_PUBLIC_KNOWLEDGE } from '../supabase/functions/_shared/haven-knowledge.js';
import { buildHavenSystemPrompt } from '../supabase/functions/_shared/haven-prompts.js';
import { bookingEmail } from '../supabase/functions/_shared/email-template.js';
import { assignmentToken, verifyAssignmentToken, assignmentEmail, TEAM_NAMES } from '../supabase/functions/_shared/team-assignment.js';
import { TMH_TEAM_NAMES } from '../src/lib/tmhPublicInfo.js';

const id='12345678-1234-4234-8234-123456789abc';
const env={SUPABASE_URL:'https://project.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'service-secret',ADMIN_PASSWORD:'admin-secret',RESEND_API_KEY:'  resend-secret  '};
function endpoint(name,{db,fetch=async()=>new Response(JSON.stringify({id:'accepted-1'})),environment={}}={}){
  let handler;
  const code=buildSync({entryPoints:[`supabase/functions/${name}/index.ts`],bundle:true,write:false,platform:'node',format:'cjs',external:['https://*'],logLevel:'silent'}).outputFiles[0].text;
  vm.runInNewContext(code,{require:specifier=>specifier.includes('server.ts')?{serve:fn=>{handler=fn;}}:{createClient:()=>withSecurityRpc(db)},Deno:{env:{get:name=>({...env,...environment})[name]}},fetch,Request,Response,Headers,AbortSignal,TextEncoder,TextDecoder,Uint8Array,crypto:webcrypto,console:{error(){}}});
  return handler;
}
const request=(body,extra={})=>adminFixtureRequest('https://project.supabase.co/functions/v1/test',body,{method:'POST',headers:{origin:'http://localhost:5173','content-type':'application/json',...extra}});
function database(seed){
  const rows=structuredClone(seed),calls=[];
  const db={rpc:async(name,args)=>{
    calls.push({name,args});
    if(name==='prepare_booking_confirmation'){
      rows.booking_confirmation_emails||=[];
      let row=rows.booking_confirmation_emails.find(row=>row.id===args.p_id);
      if(!row){row={id:args.p_id,payload:args.p_payload};rows.booking_confirmation_emails.push(row);}
      return {data:structuredClone(row)};
    }
    if(name==='claim_team_assignment_email')return {data:{payload:args.p_payload}};
    return {data:null};
  },from(table){
    calls.push({table});let filters=[],update=null,projection=null;
    const run=async(single=false)=>{
      const result=(rows[table]||[]).filter(row=>filters.every(filter=>filter(row)));
      if(update)result.forEach(row=>Object.assign(row,update));
      const projected=result.map(row=>projection&&projection!=='*'?Object.fromEntries(projection.split(',').map(key=>key.trim()).map(key=>[key,row[key]])):row);
      return {data:single?projected[0]||null:projected,error:null};
    };
    return {select(value){projection=value;return this;},eq(key,value){filters.push(row=>row[key]===value);return this;},
      ilike(key,value){filters.push(row=>row[key]?.toLowerCase()===value.toLowerCase());return this;},
      is(key,value){filters.push(row=>value===null?row[key]==null:row[key]===value);return this;},
      gt(key,value){filters.push(row=>row[key]>value);return this;},order(){return this;},limit(){return this;},
      update(value){update=value;return this;},maybeSingle(){return run(true);},then(resolve,reject){return run().then(resolve,reject);}};
  }};return {db,rows,calls};
}
const assignment=(patch={})=>({id,booking_id:1,inquiry_id:null,assignee_name:'Francis Fadeyi',assignee_email:'teammate@example.com',preparation_note:'Confirm the scope before proposing delivery.',revision:1,expires_at:new Date(Date.now()+86400000).toISOString(),revoked_at:null,acknowledged_at:null,...patch});
const booking={id:1,full_name:'Ada',email:'client@example.com',status:'active',start_time:'2099-01-02T17:00:00Z',end_time:'2099-01-02T17:25:00Z',service_id:'web',source:'service',private_token:'DO NOT LEAK'};

test('knowledge: every entry mode receives actual public feature guidance and both prices',()=>{
  for(const entryPoint of ['AUDIT_FLOW','CUSTOMER_SUPPORT','SERVICE_GRID','TEAM_INQUIRY']){
    const prompt=buildHavenSystemPrompt({entryPoint});assert.ok(prompt.includes(HAVEN_PUBLIC_KNOWLEDGE));
    for(const fact of ['The Difference Between Running a Business and Building a Brand.','₦15,000','₦9,639','Chapter 5','Accept All','Decline','Play\nVideo','Calendly confirmation','video is published'])assert.ok(prompt.includes(fact),fact);
    assert.match(prompt,/No end date or future increase is announced/);
    assert.match(prompt,/not all literally\n?cookies/);
  }
  assert.deepEqual(TEAM_NAMES,TMH_TEAM_NAMES);
});
test('booking email: editorial HTML escapes names, gives contact action and points to the actual Calendly email',()=>{
  const payload=bookingEmail({name:'Ada <script>',service:'Brand & Web Engineering'});
  assert.match(payload.html,/Ada &lt;script&gt;/);assert.doesNotMatch(payload.html,/<script>/);
  assert.match(payload.html,/Contact Team Haven/);assert.match(payload.html,/mailto:info@themarketinghaven.xyz/);
  assert.match(payload.text,/Calendly confirmation/);assert.doesNotMatch(payload.html,/Join the Meeting|calendly.com/);
  assert.match(payload.html,/Your friends over at Team Haven/);assert.match(payload.html,/Building with intention/);
  assert.match(bookingEmail().text,/Hi there,/);
});
test('booking sender: derives review name from saved record, trims Resend key, freezes payload and preserves provider acceptance',async()=>{
  const db=database({brand_reviews:[{id:'review',email:'owner@example.com',full_name:'Ada',call_booked_at:'2099-01-01',booking_email_version:'editorial-v3',booking_confirmation_sent:false}],booking_intents:[]});
  let sends=0;
  const handler=endpoint('send-tmh-booking-confirmation',{db:db.db,fetch:async(_,options)=>{
    sends++;assert.equal(options.headers.Authorization,'Bearer resend-secret');
    const payload=JSON.parse(options.body);assert.match(payload.text,/Hi Ada,/);assert.doesNotMatch(payload.text,/Spoofed/);assert.ok(payload.html);
    return new Response(JSON.stringify({id:'mail-1'}));
  }});
  assert.equal((await handler(request({email:'owner@example.com'}))).status,401);
  const input=request({email:'owner@example.com',name:'Spoofed',reviewId:'review'},{'x-haven-internal-key':'service-secret'});
  assert.equal((await handler(input)).status,200);assert.equal(sends,1);
  db.rows.brand_reviews[0].booking_confirmation_sent=false;db.rows.brand_reviews[0].full_name='Changed';
  assert.equal((await handler(request({email:'owner@example.com',reviewId:'review'},{'x-haven-internal-key':'service-secret'}))).status,200);
  assert.equal(sends,1);assert.match(db.rows.booking_confirmation_emails[0].payload.text,/Hi Ada,/);
});
test('booking sender: a malformed provider success cannot mark a confirmation sent',async()=>{
  const db=database({booking_intents:[{id:'intent',email:'owner@example.com',service_id:'web',confirmation_sent:false,booking_email_version:'editorial-v3'}]});
  const handler=endpoint('send-tmh-booking-confirmation',{db:db.db,fetch:async()=>new Response('{}')});
  const response=await handler(request({email:'owner@example.com'},{'x-haven-internal-key':'service-secret'}));
  assert.equal(response.status,502);assert.equal(db.rows.booking_intents[0].confirmation_sent,false);
  assert.equal(db.rows.booking_confirmation_emails[0].last_error,'invalid_resend_acceptance');
});
test('booking sender: a later appointment gets its own confirmation despite an already-sent old intent',async()=>{
  const uri='https://api.calendly.com/scheduled_events/new/invitees/person';
  const db=database({booking_intents:[{id:'old-intent',email:'owner@example.com',service_id:'web',confirmation_sent:true}],
    strategy_call_bookings:[{id:'1',invitee_uri:uri,email:'owner@example.com',full_name:'Ada',service_id:'growth',status:'active',confirmation_email_sent:false,booking_email_version:'editorial-v3'}]});
  let sends=0;
  const handler=endpoint('send-tmh-booking-confirmation',{db:db.db,fetch:async(_,options)=>{
    sends++;const body=JSON.parse(options.body);assert.match(body.text,/Strategic Growth & Consulting/);assert.match(body.text,/Hi Ada,/);
    assert.match(options.headers['Idempotency-Key'],/strategy_call_bookings\/1\/editorial-v3/);return new Response(JSON.stringify({id:'accepted'}));
  }});
  const input=()=>request({email:'owner@example.com',inviteeUri:uri},{'x-haven-internal-key':'service-secret'});
  assert.equal((await handler(input())).status,200);assert.equal(sends,1);assert.equal(db.rows.strategy_call_bookings[0].confirmation_email_sent,true);
  assert.equal((await handler(input())).status,200);assert.equal(sends,1);
});
test('private brief: HMAC binds record, revision, expiry and secret',async()=>{
  const item=assignment(),token=await assignmentToken(item,'private-secret');
  assert.equal((await verifyAssignmentToken(token,'private-secret')).id,id);
  for(const candidate of [token.replace(id,'22345678-1234-4234-8234-123456789abc'),token.replace('.1.','.2.'),token+'x','bad'])assert.equal(await verifyAssignmentToken(candidate,'private-secret'),null);
  assert.equal(await verifyAssignmentToken(token,'wrong-secret'),null);
  assert.equal(await verifyAssignmentToken(token,'private-secret',Date.parse(item.expires_at)+1000),null);
});
test('private brief: missing and tampered tokens never query the database',async()=>{
  const db=database({});const handler=endpoint('read-team-assignment',{db:db.db});
  for(const token of ['',id,'forged'])assert.equal((await handler(request({action:'read',token}))).status,403);
  assert.equal(db.calls.length,0);
});
test('private brief: only explicit safe fields leave the endpoint; opening does not acknowledge',async()=>{
  const item=assignment({email_payload:{secret:'PRIVATE'},provider_email_id:'PRIVATE'});
  const db=database({team_assignments:[item],strategy_call_bookings:[booking]});
  const handler=endpoint('read-team-assignment',{db:db.db});
  const token=await assignmentToken(item,'service-secret');
  const response=await handler(request({action:'read',token}));assert.equal(response.status,200);
  const result=await response.json();assert.equal(result.brief.service,'Brand & Web Engineering');assert.match(result.brief.meetingTime,/WAT/);
  for(const secret of ['PRIVATE','DO NOT LEAK','teammate@example.com','messages','access_token'])assert.ok(!JSON.stringify(result).includes(secret));
  assert.equal(db.rows.team_assignments[0].acknowledged_at,null);assert.equal(response.headers.get('Cache-Control'),'no-store');
  assert.equal((await handler(request({action:'acknowledge',token}))).status,200);
  assert.ok(db.rows.team_assignments[0].acknowledged_at);
});
test('private brief: withdrawn, expired and replaced assignments fail closed',async()=>{
  const original=assignment();const token=await assignmentToken(original,'service-secret');
  for(const patch of [{revoked_at:new Date().toISOString()},{revision:2},{expires_at:'2020-01-01T00:00:00Z'}]){
    const db=database({team_assignments:[{...original,...patch}],strategy_call_bookings:[booking]});
    assert.equal((await endpoint('read-team-assignment',{db:db.db})(request({action:'read',token}))).status,403);
  }
});
test('assignment email: button uses a scoped fragment link and never claims to be the joining URL',()=>{
  const result=assignmentEmail(assignment(),{kind:'booking',clientName:'Ada',service:'Brand & Web Engineering',meetingTime:'Friday, 6pm WAT'},'https://themarketinghaven.xyz/team-brief#token=private');
  assert.match(result.html,/Open preparation brief/);assert.match(result.html,/#token=private/);assert.match(result.text,/Keep this email private/);
  assert.doesNotMatch(result.text,/Join the Meeting|transcript/);assert.deepEqual(result.to,['teammate@example.com']);
});
test('assignment admin: JWT and field validation happen before any write or email',async()=>{
  const db=database({});let sent=false;
  const handler=endpoint('admin-team-assignment',{db:db.db,fetch:async()=>{sent=true;throw new Error('No send expected');}});
  assert.equal((await handler(request({action:'save'}))).status,401);
  assert.equal((await handler(request({accessToken:'test-admin-jwt',action:'save',kind:'booking',targetId:'1',name:'Unknown',email:'person@example.com',note:'',expectedRevision:0}))).status,400);
  assert.equal(db.calls.length,0);assert.equal(sent,false);
});
test('assignment admin: cancelled meetings cannot send a notification',async()=>{
  const item=assignment();const db=database({team_assignments:[item],strategy_call_bookings:[{...booking,status:'canceled'}]});
  const handler=endpoint('admin-team-assignment',{db:db.db,fetch:async()=>{throw new Error('Must not send');}});
  assert.equal((await handler(request({accessToken:'test-admin-jwt',action:'send',id,expectedRevision:1}))).status,409);
  assert.ok(!db.calls.some(call=>call.name==='claim_team_assignment_email'));
});
test('assignment admin: verified success records acceptance; retry does not resend a stored provider acknowledgement',async()=>{
  const item=assignment();const db=database({team_assignments:[item],strategy_call_bookings:[booking]});let sends=0;
  const oldRpc=db.db.rpc;db.db.rpc=async(name,args)=>name==='claim_team_assignment_email'?{data:{payload:args.p_payload,provider_email_id:db.rows.team_assignments[0].provider_email_id}}:oldRpc(name,args);
  const handler=endpoint('admin-team-assignment',{db:db.db,fetch:async()=>{sends++;return new Response(JSON.stringify({id:'accepted-id'}));}});
  const input=()=>request({accessToken:'test-admin-jwt',action:'send',id,expectedRevision:1});
  assert.equal((await handler(input())).status,200);assert.equal(sends,1);assert.ok(db.rows.team_assignments[0].email_sent_at);
  db.rows.team_assignments[0].email_sent_at=null;
  assert.equal((await handler(input())).status,200);assert.equal(sends,1);
});
test('free class: unpublished video has an explicit state and never embeds a placeholder ID',()=>{
  const source=readFileSync('src/components/MasterclassBanner.jsx','utf8');
  assert.ok(!source.includes('REPLACE_WITH_VIDEO_ID'));assert.match(source,/HAS_VIDEO \? <iframe/);assert.match(source,/video is being prepared/);
});

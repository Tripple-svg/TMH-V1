import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash,webcrypto} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {buildSync} from 'esbuild';
import vm from 'node:vm';
import {startSitePresence,SITE_PRESENCE_KEY,SITE_PRESENCE_CONSENT_EVENT} from '../src/lib/sitePresence.js';

const ID='aaaaaaaa-1111-4111-8111-111111111111',TOKEN='ab'.repeat(32),HASH=createHash('sha256').update(TOKEN).digest('hex');

test('site presence SQL protects identities with a private proof, de-duplicates tabs and expires old profiles',async()=>{
  const db=new PGlite();
  const scalar=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
  const record=(id=ID,hash=HASH)=>scalar('select public.record_site_presence($1,$2)',[id,hash]);
  try{
    await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;
      create function auth.role() returns text language sql as $$select current_setting('request.jwt.claim.role',true)$$;
      grant usage on schema public,auth to anon,authenticated,service_role;select set_config('request.jwt.claim.role','service_role',false);`);
    await db.exec(await readFile('supabase/migrations/20261101000001_site_presence.sql','utf8'));
    assert.equal(await record(),true);assert.equal(await record(),true);
    assert.equal(await scalar('select count(*)::int from site_presence_visitors'),1);
    assert.equal(await scalar('select token_hash from site_presence_visitors'),HASH);
    await db.query("update site_presence_visitors set last_seen=now()-interval '30 seconds'");
    const before=await scalar('select last_seen::text from site_presence_visitors');await record();
    assert.equal(await scalar('select last_seen::text from site_presence_visitors'),before);
    await assert.rejects(()=>record(ID,'b'.repeat(64)),error=>error.code==='42501');
    assert.equal(await scalar('select last_seen::text from site_presence_visitors'),before);
    await db.query("update site_presence_visitors set last_seen=now()-interval '2 minutes'");await record();
    assert.ok(await scalar("select last_seen>now()-interval '10 seconds' from site_presence_visitors"));
    await db.query("insert into site_presence_visitors(id,token_hash,created_at,last_seen) values('bbbbbbbb-1111-4111-8111-111111111111',$1,now()-interval '1 day',now()-interval '6 minutes'),('cccccccc-1111-4111-8111-111111111111',$1,now()-interval '14 months',now()-interval '14 months')",[HASH]);
    const snapshot=await scalar('select public.site_presence_activity()');
    assert.equal(snapshot.savedBrowserProfiles,2);assert.equal(snapshot.activeBrowserProfiles,1);assert.equal(snapshot.heartbeatSeconds,120);assert.equal(snapshot.retentionMonths,13);
    assert.equal(await scalar('select count(*)::int from site_presence_visitors'),2);
    assert.deepEqual((await db.query("select column_name from information_schema.columns where table_name='site_presence_visitors' order by ordinal_position")).rows.map(row=>row.column_name),['id','token_hash','created_at','last_seen']);
    for(const role of ['anon','authenticated']){
      await db.exec(`set role ${role};select set_config('request.jwt.claim.role','${role}',false)`);
      await assert.rejects(()=>record(),error=>error.code==='42501');
      await assert.rejects(()=>db.query('select * from site_presence_visitors'),error=>error.code==='42501');
      await assert.rejects(()=>db.query('select site_presence_activity()'),error=>error.code==='42501');
      await db.exec('reset role');
    }
  }finally{await db.close();}
});

const code=buildSync({entryPoints:['supabase/functions/site-presence/index.ts'],bundle:true,write:false,format:'cjs',platform:'node',external:['https://*']}).outputFiles[0].text;
function endpoint({limit=true,limitError=null,recordError=null}={}){
  let handler;const calls=[];
  vm.runInNewContext(code,{module:{exports:{}},exports:{},require:()=>({createClient:()=>({async rpc(name,args){calls.push({name,args});return name==='consume_playbook_limit'?{data:limit,error:limitError}:{data:!recordError,error:recordError};}})}),Deno:{serve:fn=>handler=fn,env:{get:key=>({SUPABASE_URL:'https://project.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'private-service-key'})[key]}},crypto:webcrypto,Response,Request,Headers,TextEncoder,TextDecoder,Uint8Array});
  const request=(body={visitorId:ID,visitorToken:TOKEN,consented:true},origin='http://localhost:5173')=>new Request('https://project.supabase.co/functions/v1/site-presence',{method:'POST',headers:{origin,'Content-Type':'application/json','cf-connecting-ip':'198.51.100.77'},body:JSON.stringify(body)});
  return{handler,request,calls};
}
test('public heartbeat bounds payloads, hashes the proof and uses a global budget without network fingerprints',async()=>{
  const f=endpoint(),response=await f.handler(f.request());assert.equal(response.status,200);assert.deepEqual(await response.json(),{ok:true,heartbeatSeconds:120});
  assert.deepEqual(JSON.parse(JSON.stringify(f.calls)),[{name:'consume_playbook_limit',args:{p_bucket:'site-presence:global',p_max:100,p_seconds:10}},{name:'record_site_presence',args:{p_visitor_id:ID,p_token_hash:HASH}}]);
  assert.ok(!JSON.stringify(f.calls).includes(TOKEN));assert.ok(!JSON.stringify(f.calls).includes('198.51.100.77'));assert.equal(response.headers.get('cache-control'),'no-store');
  for(const body of [{visitorId:ID,visitorToken:TOKEN,consented:false},{visitorId:ID,visitorToken:'bad',consented:true},{visitorId:ID,visitorToken:TOKEN,consented:true,page:'/private'},{visitorId:ID,visitorToken:TOKEN,consented:true,extra:'x'.repeat(512)}]){
    const bad=endpoint();assert.ok([400,413].includes((await bad.handler(bad.request(body))).status));assert.equal(bad.calls.length,0);
  }
  const denied=endpoint();assert.equal((await denied.handler(denied.request(undefined,'https://untrusted.example'))).status,403);assert.equal(denied.calls.length,0);
});
test('heartbeat proof mismatches and exhausted or missing budgets cannot acknowledge a saved visit',async()=>{
  for(const [options,status,count] of [[{limit:false},429,1],[{limitError:{message:'missing'}},503,1],[{recordError:{code:'42501'}},403,2],[{recordError:{message:'unavailable'}},503,2]]){
    const f=endpoint(options),response=await f.handler(f.request());assert.equal(response.status,status);assert.equal((await response.json()).ok,false);assert.equal(f.calls.length,count);
  }
});

function client({consent=null,visible=true,online=true,blockedStorage=false,pending=false,networkFailure=false}={}){
  let clock=1_000_000_000,choice=consent,idCalls=0,sets=0;
  const values=new Map(),calls=[],windowEvents=new Map(),documentEvents=new Map(),intervals=new Map(),timeouts=new Map();let timer=0;
  const on=(events,name,fn)=>{if(!events.has(name))events.set(name,new Set());events.get(name).add(fn);};
  const off=(events,name,fn)=>{events.get(name)?.delete(fn);if(events.get(name)?.size===0)events.delete(name);};
  const emit=(events,name,event)=>{for(const fn of events.get(name)||[])fn(event);};
  const browserWindow={localStorage:{getItem:key=>{if(blockedStorage)throw Error('disabled');return values.get(key)??null;},setItem:(key,value)=>{sets++;values.set(key,value);},removeItem:key=>values.delete(key)},setInterval:fn=>{intervals.set(++timer,fn);return timer;},clearInterval:id=>intervals.delete(id),setTimeout:fn=>{timeouts.set(++timer,fn);return timer;},clearTimeout:id=>timeouts.delete(id),addEventListener:(name,fn)=>on(windowEvents,name,fn),removeEventListener:(name,fn)=>off(windowEvents,name,fn)};
  const pageDocument={visibilityState:visible?'visible':'hidden',addEventListener:(name,fn)=>on(documentEvents,name,fn),removeEventListener:(name,fn)=>off(documentEvents,name,fn)};
  const browserNavigator={onLine:online};
  const config={readConsent:()=>choice,sendHeartbeat:(body,signal)=>{calls.push({body,signal});if(networkFailure)return Promise.reject(Error('offline'));return pending?new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(Error('aborted')))):Promise.resolve({data:{ok:true}});},browserWindow,pageDocument,browserNavigator,browserCrypto:{randomUUID:()=>{idCalls++;return `${String(idCalls).padStart(8,'0')}-1111-4111-8111-111111111111`;},getRandomValues:array=>array.fill(idCalls)},now:()=>clock};
  const stop=startSitePresence(config);
  return{calls,values,config,stop,windowEvents,documentEvents,intervals,get idCalls(){return idCalls;},get sets(){return sets;},choice(value){choice=value;emit(windowEvents,SITE_PRESENCE_CONSENT_EVENT);},advance(ms){clock+=ms;for(const fn of intervals.values())fn();},visibility(value){pageDocument.visibilityState=value?'visible':'hidden';emit(documentEvents,'visibilitychange');},network(value){browserNavigator.onLine=value;emit(windowEvents,value?'online':'offline');}};
}
const flush=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
test('optional site analytics creates no identity before consent and stops immediately on withdrawal',async()=>{
  const f=client();await flush();assert.equal(f.calls.length,0);assert.equal(f.idCalls,0);assert.equal(f.sets,0);
  f.choice(false);f.advance(120_000);await flush();assert.equal(f.calls.length,0);assert.equal(f.idCalls,0);
  f.choice(true);await flush();assert.equal(f.calls.length,1);assert.equal(f.idCalls,1);assert.ok(f.values.has(SITE_PRESENCE_KEY));assert.equal(f.calls[0].body.consented,true);
  f.advance(119_999);await flush();assert.equal(f.calls.length,1);f.advance(1);await flush();assert.equal(f.calls.length,2);
  f.choice(false);assert.equal(f.values.has(SITE_PRESENCE_KEY),false);f.advance(240_000);await flush();assert.equal(f.calls.length,2);
  f.stop();assert.equal(f.intervals.size,0);assert.equal(f.windowEvents.size,0);assert.equal(f.documentEvents.size,0);
});
test('hidden and offline pages do not create or send analytics, and reloads share the browser throttle',async()=>{
  const f=client({consent:true,visible:false});await flush();assert.equal(f.idCalls,0);
  f.network(false);f.visibility(true);await flush();assert.equal(f.calls.length,0);assert.equal(f.idCalls,0);
  f.network(true);await flush();assert.equal(f.calls.length,1);
  const stopReload=startSitePresence(f.config);await flush();assert.equal(f.calls.length,1);stopReload();
  f.visibility(false);f.advance(240_000);await flush();assert.equal(f.calls.length,1);
  f.visibility(true);await flush();assert.equal(f.calls.length,2);f.stop();
});
test('withdrawal or hiding aborts an in-flight heartbeat; disabled storage and network failures remain silent',async()=>{
  for(const action of [f=>f.visibility(false),f=>f.choice(false)]){
    const f=client({consent:true,pending:true});await flush();assert.equal(f.calls.length,1);action(f);assert.equal(f.calls[0].signal.aborted,true);await flush();f.stop();
  }
  const blocked=client({consent:true,blockedStorage:true});await flush();assert.equal(blocked.calls.length,0);assert.equal(blocked.idCalls,0);blocked.stop();
  const failed=client({consent:true,networkFailure:true});await flush();assert.equal(failed.calls.length,1);failed.advance(120_000);await flush();assert.equal(failed.calls.length,2);failed.stop();
  const declinedBeforeDispatch=client({consent:true});declinedBeforeDispatch.choice(false);await flush();assert.equal(declinedBeforeDispatch.calls.length,0);declinedBeforeDispatch.stop();
});
test('an effect setup followed by immediate cleanup cannot suppress the next mounted heartbeat',async()=>{
  const f=client({consent:true});f.stop();const stop=startSitePresence(f.config);await flush();
  assert.equal(f.calls.length,1);assert.equal(f.idCalls,1);stop();
});

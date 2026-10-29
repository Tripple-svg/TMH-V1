import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { buildSync } from 'esbuild';
import { webcrypto } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { resolveHavenRouting, supportHelpReply } from '../supabase/functions/_shared/haven-routing.js';

function moduleExports(file){
  const code=buildSync({entryPoints:[file],bundle:true,write:false,format:'cjs',platform:'node',external:['https://*']}).outputFiles[0].text;
  const module={exports:{}};
  vm.runInNewContext(code,{module,exports:module.exports,crypto:webcrypto,TextEncoder,TextDecoder,Uint8Array,Request,Response,Headers,AbortSignal,console});
  return module.exports;
}
function endpoint(name,db,send=async()=>Response.json({success:false})){
  let handler;
  const code=buildSync({entryPoints:[`supabase/functions/${name}/index.ts`],bundle:true,write:false,format:'cjs',platform:'node',external:['https://*']}).outputFiles[0].text;
  vm.runInNewContext(code,{require:name=>name.includes('server.ts')?{serve:fn=>{handler=fn;}}:{createClient:()=>db},
    Deno:{env:{get:name=>({SUPABASE_URL:'https://project.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'private-key',ADMIN_PASSWORD:'correct-secret',HCAPTCHA_SECRET:'captcha',RESEND_API_KEY:'resend'})[name]}},
    fetch:send,crypto:webcrypto,TextEncoder,TextDecoder,Uint8Array,Request,Response,Headers,AbortSignal,URLSearchParams,console:{error(){}}});
  return body=>handler(new Request('https://project.supabase.co',{method:'POST',headers:{origin:'http://localhost:5173','x-forwarded-for':'192.0.2.5','content-type':'application/json',authorization:'Bearer test-admin-jwt'},body:JSON.stringify(body)}));
}
const {requireAdmin}=moduleExports('supabase/functions/_shared/admin-auth.ts');
const {publicRequestLimit}=moduleExports('supabase/functions/_shared/abuse-limits.ts');
const req=(ip='192.0.2.5')=>new Request('https://project.supabase.co',{headers:{'x-forwarded-for':ip}});

test('request budgets: rotating email/reference does not change a network bucket; denial fails closed',async()=>{
  const calls=[];
  const db={rpc:async(name,args)=>{calls.push({name,args});return{data:calls.length<=5};}};
  for(let i=0;i<5;i++)await publicRequestLimit(db,req(),'private-key','email-lookup');
  await assert.rejects(()=>publicRequestLimit(db,req(),'private-key','email-lookup'),error=>error.status===429&&/10 minutes/.test(error.message));
  assert.equal(new Set(calls.map(call=>call.args.p_bucket)).size,1);
  assert.ok(!JSON.stringify(calls).includes('192.0.2.5'));assert.ok(!JSON.stringify(calls).includes('private-key'));
  await assert.rejects(()=>publicRequestLimit({rpc:async()=>({error:{}})},req(),'secret','lookup'),error=>error.status===503);
});
test('admin Auth validates the JWT with Auth and requires trusted app_metadata, never a password or editable user_metadata',async()=>{
  const request=token=>new Request('https://example.com',{headers:{authorization:'Bearer '+token}});
  const db={rpc:async()=>({data:true}),auth:{getUser:async token=>({data:{user:token==='admin'?{app_metadata:{role:'admin'}}:token==='customer'?{user_metadata:{role:'admin'}}:null},error:null})}};
  assert.equal((await requireAdmin(db,request('admin'),'service')).app_metadata.role,'admin');
  for(const [token,status] of [['customer',403],['forged',401],['service',401]])await assert.rejects(()=>requireAdmin(db,request(token),'service'),e=>e.status===status);
  await assert.rejects(()=>requireAdmin(db,new Request('https://example.com'),'service'),e=>e.status===401);
  await assert.rejects(()=>requireAdmin({...db,rpc:async()=>({data:false})},request('admin'),'service'),e=>e.status===429);
});
test('public endpoints: a sixth attempt is rejected despite changing email, before more mail/CAPTCHA/intent writes',async()=>{
  for(const name of ['check-email-exists','capture-booking-lead','create-brand-review','request-data-deletion']){
    let requests=0,insertions=0,providerCalls=0;
    const db={rpc:async()=>({data:++requests<=5}),from(){
      const query={select(){return this;},eq(){return this;},ilike(){return this;},limit(){return this;},insert(){insertions++;return this;},
        async maybeSingle(){return{data:null};},then(resolve,reject){return Promise.resolve({data:[],error:null}).then(resolve,reject);}};return query;
    }};
    const handler=endpoint(name,db,async()=>{providerCalls++;return Response.json({success:false});});
    for(let i=0;i<6;i++){
      const response=await handler({email:`person${i}@example.com`,serviceId:'web',id:'11111111-1111-4111-8111-111111111111',sessionId:'22222222-2222-4222-8222-222222222222',accessToken:'a'.repeat(64),fullName:'Ada',brandName:'Ada Studio',whatsapp:'+2347084232046',agreedToTerms:true,platformType:'none',hcaptchaToken:'fake'});
      if(i===5){assert.equal(response.status,429,name);assert.equal(response.headers.get('Retry-After'),'600');}
    }
    assert.equal(requests,6,name);assert.ok(insertions<=5);assert.ok(providerCalls<=5);
  }
});
test('admin endpoints: a locked budget returns 429 before any private data query',async()=>{
  for(const name of ['admin-fetch-leads','admin-update-lead','admin-team-assignment','admin-retry-purchase-email','flag-user']){
    const db={rpc:async()=>({data:false}),from(){throw new Error('Private data must not be queried');}};
    const response=await endpoint(name,db)({password:'correct-secret',action:'load'});
    assert.equal(response.status,429,name);assert.equal(response.headers.get('Retry-After'),'60',name);
  }
});
test('strategy routing: call recommendations consistently identify the appointment as free',()=>{
  const context={latestUserText:'I want your team to rebuild my website',userMessages:['I want your team to rebuild my website']};
  const result=resolveHavenRouting('Discuss this on a 25-minute strategy call. [[BOOK_CALL]]',context);
  assert.match(result.text,/free 25-minute strategy call|free strategy call/);
  assert.doesNotMatch(result.text,/free free|strategy free strategy/);
});
test('support: broken link, lost file, another device and missing code receive different appropriate steps',()=>{
  const broken=supportHelpReply('My download link is broken','support');
  const file=supportHelpReply('I lost the PDF file I downloaded','support');
  const laptop=supportHelpReply('How can I download the book on my laptop?','support');
  const otp=supportHelpReply('My OTP code has not arrived in my email','support');
  assert.match(broken,/do not need to pay again/);assert.match(broken,/six-digit/);
  assert.match(file,/Downloads or the Files app/);assert.match(laptop,/that device/);assert.match(otp,/resend timer/);
  assert.equal(new Set([broken,file,laptop,otp]).size,4);
  for(const text of [broken,file,laptop,otp])assert.doesNotMatch(text,/\[\[BOOK_CALL\]\]|buy another/);
});
test('PostgreSQL: admin guess reservations allow five failures, serialize concurrent attempts and recover after cooldown',async()=>{
  const db=new PGlite();
  const call=async(name,args=[])=>Object.values((await db.query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')})`,args)).rows[0])[0];
  try{
    await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;
      create function auth.role() returns text language sql as $$select current_setting('request.jwt.claim.role',true)$$;
      create table playbook_security_limits(bucket text primary key,started_at timestamptz not null default now(),requests integer not null default 1);
      alter table playbook_security_limits enable row level security;revoke all on playbook_security_limits from public,anon,authenticated;grant all on playbook_security_limits to service_role;
      grant usage on schema auth,public to anon,authenticated,service_role;select set_config('request.jwt.claim.role','service_role',false);`);
    const recovery=readFileSync('supabase/migrations/20261026000000_playbook_recovery.sql','utf8');
    const consume=recovery.match(/create function public.consume_playbook_limit[\s\S]*?\$\$;/)[0];
    await db.exec(consume);await db.exec(readFileSync('supabase/migrations/20261028000001_request_security.sql','utf8'));
    for(let i=0;i<5;i++)assert.equal(await call('consume_playbook_limit',['public:lookup:hashed-network',5,600]),true);
    assert.equal(await call('consume_playbook_limit',['public:lookup:hashed-network',5,600]),false);
    const results=await Promise.all(Array.from({length:7},()=>call('begin_admin_auth',['admin-auth:network'])));
    assert.equal(results.filter(result=>result.allowed).length,5);
    assert.equal((await call('begin_admin_auth',['admin-auth:network'])).allowed,false);
    await db.query("update playbook_security_limits set started_at=now()-interval '11 minutes' where bucket='admin-auth:network'");
    const lease=await call('begin_admin_auth',['admin-auth:network']);assert.equal(lease.allowed,true);
    assert.equal(await call('finish_admin_auth',['admin-auth:network',results[0].started_at]),false);
    assert.equal(await call('finish_admin_auth',['admin-auth:network',lease.started_at]),true);
    assert.equal((await db.query("select requests from playbook_security_limits where bucket='admin-auth:network'")).rows[0].requests,0);
    await db.exec("set role anon;select set_config('request.jwt.claim.role','anon',false)");
    await assert.rejects(()=>call('begin_admin_auth',['admin-auth:network']),error=>error.code==='42501');
  }finally{await db.close();}
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {buildSync} from 'esbuild';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {createRequire} from 'node:module';
import {adminFixtureRequest,withSecurityRpc} from './helpers/security-fixture.mjs';

test('visitor activity counts saved identities and recent message attempts without treating admin edits as presence',async()=>{
  const db=new PGlite();
  try{
    await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;
      create function auth.role() returns text language sql as $$select current_setting('request.jwt.claim.role',true)$$;
      grant usage on schema public,auth to anon,authenticated,service_role;
      create table haven_chat_visitors(id text primary key,updated_at timestamptz default now());
      create table haven_sessions(id text primary key,visitor_id text references haven_chat_visitors(id),updated_at timestamptz default now());
      create table haven_chat_turns(id text primary key,session_id text references haven_sessions(id),created_at timestamptz not null);
      insert into haven_chat_visitors(id) values('browser-a'),('browser-b'),('admin-edited'),('no-chat');
      insert into haven_sessions(id,visitor_id) values('a1','browser-a'),('a2','browser-a'),('b','browser-b'),('edited','admin-edited'),('legacy',null);
      insert into haven_chat_turns values('t1','a1',now()-interval '1 minute'),('t2','a2',now()-interval '2 minutes'),('t3','b',now()-interval '4 minutes'),('old','edited',now()-interval '6 minutes'),('legacy','legacy',now()),('future','edited',now()+interval '1 day');
      select set_config('request.jwt.claim.role','service_role',false);`);
    await db.exec(await readFile('supabase/migrations/20261031000006_visitor_activity.sql','utf8'));
    const result=(await db.query('select public.haven_visitor_activity() as activity')).rows[0].activity;
    assert.equal(result.savedBrowserIdentities,4);assert.equal(result.recentChatIdentities,2);assert.equal(result.windowMinutes,5);
    assert.ok(Number.isFinite(Date.parse(result.asOf)));assert.equal(Object.keys(result).length,4);
    for(const role of ['anon','authenticated']){
      await db.exec(`set role ${role};select set_config('request.jwt.claim.role','${role}',false)`);
      await assert.rejects(()=>db.query('select public.haven_visitor_activity()'),error=>error.code==='42501');
      await db.exec('reset role');
    }
    await db.exec("select set_config('request.jwt.claim.role','authenticated',false)");
    await assert.rejects(()=>db.query('select public.haven_visitor_activity()'),error=>error.code==='42501');
  }finally{await db.close();}
});

const code=buildSync({entryPoints:['supabase/functions/admin-fetch-leads/index.ts'],bundle:true,write:false,format:'cjs',platform:'node',external:['https://*']}).outputFiles[0].text;
function endpoint({data={savedBrowserIdentities:8,recentChatIdentities:2,windowMinutes:5,asOf:'2026-10-31T12:00:00Z'},error=null,siteData={savedBrowserProfiles:12,activeBrowserProfiles:3,windowMinutes:5,heartbeatSeconds:120,retentionMonths:13,asOf:'2026-11-01T12:00:00Z'},siteError=null}={}){
  let handler;const calls=[];
  const db=withSecurityRpc({async rpc(name){calls.push(name);if(name==='haven_visitor_activity')return{data,error};assert.equal(name,'site_presence_activity');return{data:siteData,error:siteError};}});
  vm.runInNewContext(code,{module:{exports:{}},exports:{},require:name=>name.includes('server.ts')?{serve:fn=>handler=fn}:{createClient:()=>db},Deno:{env:{get:key=>({SUPABASE_URL:'https://project.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'private-service-key'})[key]}},crypto:webcrypto,Request,Response,Headers,URL,TextEncoder,TextDecoder,Uint8Array,console:{error(){},warn(){}}});
  const request=authenticated=>adminFixtureRequest('https://project.supabase.co/functions/v1/admin-fetch-leads',{action:'visitorActivity',...(authenticated?{accessToken:'test-admin-jwt'}:{})},{method:'POST',headers:{origin:'http://localhost:5173','Content-Type':'application/json'}});
  return{handler,request,calls};
}
test('visitor aggregate requires admin auth and returns aggregate fields only',async()=>{
  const f=endpoint();assert.equal((await f.handler(f.request(false))).status,401);assert.equal(f.calls.length,0);
  const response=await f.handler(f.request(true));assert.equal(response.status,200);
  const body=await response.json();
  assert.deepEqual(body.activity,{savedBrowserIdentities:8,recentChatIdentities:2,windowMinutes:5,asOf:'2026-10-31T12:00:00Z'});
  assert.deepEqual(body.siteActivity,{savedBrowserProfiles:12,activeBrowserProfiles:3,windowMinutes:5,heartbeatSeconds:120,retentionMonths:13,asOf:'2026-11-01T12:00:00Z'});
  assert.equal(body.coverage.countsPeople,false);assert.equal(body.coverage.includesUnconsentedVisitors,false);
  assert.equal(response.headers.get('cache-control'),'no-store');
});
test('missing or malformed visitor data stays unavailable instead of displaying a fabricated zero',async()=>{
  for(const input of [{error:{message:'missing migration'}},{data:null},{data:{savedBrowserIdentities:-1,recentChatIdentities:0,windowMinutes:5,asOf:'invalid'}}]){
    const f=endpoint({...input,siteData:null});const response=await f.handler(f.request(true));assert.equal(response.status,503);
    assert.equal((await response.json()).ok,false);
  }
});
test('website and chat snapshots stay separate and either unavailable migration is reported without inventing counts',async()=>{
  const siteOnly=endpoint({data:null}),siteResponse=await siteOnly.handler(siteOnly.request(true)),site=await siteResponse.json();
  assert.equal(siteResponse.status,200);assert.equal(site.activity,null);assert.equal(site.siteActivity.activeBrowserProfiles,3);assert.match(site.activityError,/Haven/);
  const havenOnly=endpoint({siteData:null}),havenResponse=await havenOnly.handler(havenOnly.request(true)),haven=await havenResponse.json();
  assert.equal(havenResponse.status,200);assert.equal(haven.siteActivity,null);assert.equal(haven.activity.savedBrowserIdentities,8);assert.match(haven.siteActivityError,/Website/);
});

test('Admin activity renders separate consented website and functional Haven measurements with honest coverage labels',async()=>{
  const require=createRequire(import.meta.url),state=[];let cursor=0;
  const react={useState(initial){const index=cursor++;if(!(index in state))state[index]=initial;return[state[index],value=>state[index]=value];},useCallback:fn=>fn,useEffect(){}};
  const module={exports:{}},component=buildSync({entryPoints:['src/components/admin/VisitorActivityPanel.jsx'],bundle:true,write:false,format:'cjs',platform:'node',jsx:'automatic',external:['react','react/jsx-runtime']}).outputFiles[0].text;
  vm.runInNewContext(component,{module,exports:module.exports,require:name=>name==='react'?react:require(name)});
  const f=endpoint(),response=await f.handler(f.request(true)),result=await response.json();
  const flatten=node=>!node||typeof node!=='object'?[]:[node,...[node.props?.children].flat(Infinity).flatMap(flatten)];
  const text=node=>Array.isArray(node)?node.map(text).join(' '):node&&typeof node==='object'?text(node.props.children):typeof node==='string'?node:'';
  const render=()=>{cursor=0;return module.exports.default({onRequest:async()=>result});};
  let tree=render();assert.match(text(tree),/Loading saved activity/);
  await flatten(tree).find(node=>node.type==='button').props.onClick();tree=render();
  const labels=flatten(tree).filter(node=>node.type==='dt').map(text);
  assert.deepEqual(labels,['Total retained website browser profiles','Active website browsers · last 5 minutes','Saved Haven browser identities','Chat browser identities in the last 5 minutes']);
  assert.deepEqual(flatten(tree).filter(node=>node.type==='dd').map(node=>node.props.children),['12','3','8','2']);
  assert.match(text(tree),/Only visitors accepting optional analytics are included/);
  assert.match(text(tree),/not unique people or an exact live online count/);
  assert.match(text(tree),/Do not add these counts/);
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {buildSync,transformSync} from 'esbuild';
import {webcrypto} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {readCookiePreference,COOKIE_NOTICE_VERSION} from '../src/lib/cookiePreference.js';
const storage=at=>({getItem:key=>({'tmh_cookie_consent':'true','tmh_cookie_consent_at':at,'tmh_cookie_consent_version':COOKIE_NOTICE_VERSION,'tmh_cookie_consent_recorded':'true'})[key]||null});
test('cookie preference reconfirms unknown/expired/future choices; rejection remains off',()=>{
  assert.equal(readCookiePreference(storage('2025-01-31T00:00:00Z'),Date.parse('2026-02-27T00:00:00Z')),true);
  assert.equal(readCookiePreference(storage('2025-01-31T00:00:00Z'),Date.parse('2026-02-28T00:00:00Z')),null);
  assert.equal(readCookiePreference(storage('2099-01-01'),Date.now()),null);
  assert.equal(readCookiePreference({getItem:()=>null}),null);
  assert.equal(readCookiePreference({getItem:()=>{throw Error('blocked');}}),null);
  assert.equal(readCookiePreference({getItem:()=> 'false'}),false);
});
test('cookie receipt: decline creates no analytics identity; failed receipt leaves optional analytics off',async()=>{
  const source=readFileSync('src/lib/cookieService.js','utf8').replace(/^import .*;\r?\n/gm,'');
  const code=transformSync(source,{format:'cjs',loader:'js'}).code;
  const values=new Map(),requests=[],events=[];let identities=0,fail=false;
  const localStorage={getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
  const module={exports:{}};
  vm.runInNewContext(code,{module,exports:module.exports,Date,Event,console,readCookiePreference,COOKIE_NOTICE_VERSION,localStorage,window:{dispatchEvent:event=>events.push(event.type)},getOrCreateVisitorId:()=>{identities++;return '11111111-1111-4111-8111-111111111111';},supabase:{functions:{invoke:async(name,payload)=>{requests.push({name,body:payload.body});return fail?{error:Error('offline')}:{data:{ok:true}};}}}});
  await module.exports.setCookieConsent(false);assert.equal(identities,0);assert.equal(requests[0].name,'record-cookie-consent');assert.equal(requests[0].body.visitorId,null);assert.equal(module.exports.getCookieConsent(),false);
  fail=true;await module.exports.setCookieConsent(true);assert.equal(identities,1);assert.equal(module.exports.getCookieConsent(),null);
  fail=false;await module.exports.setCookieConsent(true);assert.equal(module.exports.getCookieConsent(),true);assert.ok(events.every(name=>name==='tmh:cookie-consent-changed'));
});
test('cookie Edge: exact version/consent and origin required, private rate-limited insert uses server timestamp',async()=>{
  const code=buildSync({entryPoints:['supabase/functions/record-cookie-consent/index.ts'],bundle:true,write:false,format:'cjs',platform:'node',external:['https://*']}).outputFiles[0].text;
  const inserts=[];let handler,limited=false;
  const db={rpc:async()=>({data:!limited}),from:()=>({insert:async row=>{inserts.push(row);return {};}})};
  vm.runInNewContext(code,{require:()=>({createClient:()=>db}),Deno:{env:{get:()=> 'configured'},serve:fn=>{handler=fn;}},crypto:webcrypto,TextEncoder,TextDecoder,Request,Response,Headers,Uint8Array,URL,console});
  const send=(body,origin='https://themarketinghaven.xyz')=>handler(new Request('https://api.example',{method:'POST',headers:{origin},body:JSON.stringify(body)}));
  const good={version:COOKIE_NOTICE_VERSION,consented:false,visitorId:null};
  assert.equal((await send(good,'https://attacker.invalid')).status,403);assert.equal((await send({...good,version:'old'})).status,400);
  limited=true;assert.equal((await send(good)).status,429);assert.equal(inserts.length,0);
  limited=false;assert.equal((await send(good)).status,200);assert.equal(inserts[0].visitor_id,null);assert.equal(inserts[0].notice_version,COOKIE_NOTICE_VERSION);assert.ok(!('created_at' in inserts[0]));
});
test('PostgreSQL retention expires inactive messages/memory/route evidence while preserving keys, active chats and purchases',async()=>{
  const db=new PGlite();
  try{
    await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;
      create function auth.role() returns text language sql as $$select current_setting('request.jwt.claim.role',true)$$;
      create table cookie_consents(id serial primary key,created_at timestamptz default now());
      create table haven_chat_turns(id integer primary key,updated_at timestamptz);
      create table haven_sessions(id text primary key,updated_at timestamptz,messages jsonb,conversation_memory jsonb,routing_state jsonb,message_count integer,private_key_hash text);
      create table playbook_purchases(reference text);
      insert into playbook_purchases values('paid-kept');
      insert into haven_sessions values('old',now()-interval '181 days','[{"content":"private"}]','{"facts":{"business":"old"}}','{"evidence":["old private fact"]}',1,'kept-private-hash'),('active',now(),'[{"content":"current"}]','{"facts":{}}','{}',1,'active-hash');
      insert into haven_chat_turns values(1,now()-interval '181 days'),(2,now());
      insert into cookie_consents(created_at) values(now()-interval '3 years'),(now());
      grant usage on schema public,auth to service_role;grant select,insert,update,delete on all tables in schema public to service_role;
      grant insert on cookie_consents to anon;`);
    await db.exec(await readFile('supabase/migrations/20261101000000_privacy_operations.sql','utf8'));
    assert.equal((await db.query("select has_table_privilege('anon','cookie_consents','INSERT') allowed")).rows[0].allowed,false);
    await db.exec("set role anon;select set_config('request.jwt.claim.role','anon',false)");
    await assert.rejects(()=>db.exec('select expire_inactive_haven_content()'),e=>e.code==='42501');
    await db.exec("reset role;set role service_role;select set_config('request.jwt.claim.role','service_role',false)");
    assert.equal((await db.query('select expire_inactive_haven_content() n')).rows[0].n,1);
    const rows=(await db.query('select * from haven_sessions order by id')).rows;assert.equal(rows[0].messages.length,1);assert.equal(rows[1].messages.length,0);assert.deepEqual(rows[1].conversation_memory,{version:1,facts:{}});assert.equal(rows[1].private_key_hash,'kept-private-hash');assert.equal(rows[1].routing_state.permission,'none');
    assert.equal((await db.query('select count(*)::int n from playbook_purchases')).rows[0].n,1);assert.equal((await db.query('select count(*)::int n from cookie_consents')).rows[0].n,1);assert.equal((await db.query('select count(*)::int n from haven_chat_turns')).rows[0].n,1);
  }finally{await db.close();}
});

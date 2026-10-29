import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {resolveHavenRouting,supportHelpReply} from '../supabase/functions/_shared/haven-routing.js';
test('screenshots: delegation switches away from support, including a previously stopped user message',()=>{
  const previous={need:'support',evidence:['already purchased page is not visible'],complexity:'simple'};
  for(const latest of ['build me a more professional website like yours','The Marketing Haven web is professional, I want mine to be like yours, that is why I want to book a call']){
    const result=resolveHavenRouting('What marketing or website work would you like help with? [[BOOK_CALL]]',{scope:'support',latestUserText:latest,routingState:previous,messages:[]});
    assert.match(result.text,/\[\[BOOK_CALL\]\]/);assert.equal(result.routingState.need,'implementation');assert.doesNotMatch(result.text,/What marketing or website work/);
  }
  const stopped='build me a more professional website like yours';
  const result=resolveHavenRouting('What work would you like help with? [[BOOK_CALL]]',{scope:'support',latestUserText:'Yes, book the call please',routingState:previous,messages:[{role:'user',content:stopped}]});
  assert.match(result.text,/\[\[BOOK_CALL\]\]/);assert.equal(result.routingState.need,'implementation');
});
test('support: missing recovery guidance describes the actual panel without invented pages or destructive advice',()=>{
  const answer=supportHelpReply('I just bought, the already purchased page is not visible again','support');
  assert.match(answer,/tab inside/);assert.match(answer,/saved download/);assert.doesNotMatch(answer,/\/shop|refresh|clear (?:your )?(?:storage|cache)/i);
});
test('PostgreSQL: migrate the actual schema, verify TEXT inquiry / BIGINT booking, admin RLS, booking races and security budgets',async t=>{
  const db=new PGlite();
  const scalar=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
  const call=(name,args=[])=>scalar(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')})`,args);
  try{
    await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create schema storage;
      create function auth.role() returns text language sql as $$select current_setting('request.jwt.claim.role',true)$$;
      create function auth.jwt() returns jsonb language sql as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(id uuid primary key,bucket_id text,name text);alter table storage.objects enable row level security;
      create function storage.foldername(text) returns text[] language sql as $$select string_to_array($1,'/')$$;
      grant usage on schema public,auth,storage to anon,authenticated,service_role;
      select set_config('request.jwt.claim.role','service_role',false);`);
    await db.exec(await readFile('supabase/schema.sql','utf8'));
    const migrations=(await readdir('supabase/migrations')).filter(name=>name.endsWith('.sql')&&!/cron/.test(name)).sort();
    for(const name of migrations){let sql=await readFile('supabase/migrations/'+name,'utf8');sql=sql.replace(/^create extension[^;]*;/gim,'');try{await db.exec(sql);}catch(error){throw Error(name+': '+error.message,{cause:error});}}
    await t.test('foreign key types are correct and authenticated customers cannot read private rows',async()=>{
      assert.equal(await scalar("select data_type from information_schema.columns where table_name='team_assignments' and column_name='inquiry_id'"),'text');
      assert.equal(await scalar("select data_type from information_schema.columns where table_name='team_assignments' and column_name='booking_id'"),'bigint');
      await db.exec(`insert into brand_reviews(id,full_name,brand_name,email,whatsapp,platform_type) values('review-a','Ada','Ada Studio','ada@example.com','123','none');
        set role authenticated;select set_config('request.jwt.claim.role','authenticated',false);select set_config('request.jwt.claims','{"user_metadata":{"role":"admin"}}',false);`);
      assert.equal(await scalar('select count(*)::int from brand_reviews'),0);
      await db.exec(`select set_config('request.jwt.claims','{"app_metadata":{"role":"admin"}}',false);`);
      assert.equal(await scalar('select count(*)::int from brand_reviews'),1);
      await assert.rejects(()=>db.query('select email_payload from team_assignments'),e=>e.code==='42501');
      await assert.rejects(()=>db.query('select * from ai_usage_events'),e=>e.code==='42501');
      await db.exec("reset role;select set_config('request.jwt.claim.role','service_role',false)");
    });
    const visitor='11111111-1111-4111-8111-111111111111',hash='a'.repeat(64);
    await t.test('cross-email reservations serialize and a confirmed booking blocks Review and Services',async()=>{
      const args=[visitor,hash,'ada@example.com','review-a','web','service'];
      const results=await Promise.all([call('reserve_strategy_booking',args),call('reserve_strategy_booking',[visitor,hash,'other@example.com','review-a',null,'lead'])]);
      assert.equal(results.filter(r=>r.intentId).length,1);assert.equal(results.filter(r=>r.pending).length,1);
      const id=results.find(r=>r.intentId).intentId;
      await call('record_strategy_call_booking',[{invitee_uri:'https://api.calendly.com/scheduled_events/e/invitees/i',event_uri:'https://api.calendly.com/scheduled_events/e',email:'ada@example.com',start_time:new Date(Date.now()+86400000).toISOString(),end_time:new Date(Date.now()+88000000).toISOString(),status:'active',source:'service',review_id:'review-a',booking_intent_id:id}]);
      assert.equal((await call('reserve_strategy_booking',args)).alreadyBooked,true);
      assert.equal((await call('visitor_strategy_booking',[visitor])).confirmed,true);
      await assert.rejects(()=>call('reserve_strategy_booking',[visitor,'b'.repeat(64),'x@example.com',null,'web','service']),e=>e.code==='42501');
    });
    await t.test('five failed reservations trigger a minute cooldown, two more lock the device; network lock expires',async()=>{
      const bucket='visitor:'+'b'.repeat(64),args=[bucket,visitor,hash,'begin'];
      for(let i=0;i<5;i++)assert.equal((await call('verification_attempt_gate',args)).allowed,true);
      assert.equal((await call('verification_attempt_gate',args)).allowed,false);
      await db.query("update verification_attempts set cooldown_until=now()-interval '1 second' where bucket=$1",[bucket]);
      for(let i=0;i<2;i++)assert.equal((await call('verification_attempt_gate',args)).allowed,true);
      assert.equal((await call('verification_attempt_gate',args)).locked,true);
      const network='network:'+'c'.repeat(64);
      await db.query("insert into verification_attempts(bucket,attempts,locked_at,updated_at) values($1,7,now()-interval '2 hours',now()-interval '2 hours')",[network]);
      assert.equal((await call('verification_attempt_gate',[network,null,null,'begin'])).allowed,true);
    });
    await t.test('usage threshold dedupes alerts and concurrent workers cannot double claim',async()=>{
      for(let i=0;i<2;i++)await call('record_ai_usage',[crypto.randomUUID(),'gemini','test-model',60,40,100,null,100]);
      assert.equal(await scalar("select count(*)::int from ai_usage_alerts where kind='budget_threshold'"),1);
      const claims=await Promise.all([db.query('select * from claim_ai_alerts()'),db.query('select * from claim_ai_alerts()')]);
      assert.equal(claims.reduce((n,c)=>n+c.rows.length,0),1);
      const rows=await call('ai_usage_summary');assert.equal(Number(rows[0].total_tokens),200);
    });
  }finally{await db.close();}
});

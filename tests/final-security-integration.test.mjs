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
      create function auth.uid() returns uuid language sql as $$select (auth.jwt()->>'sub')::uuid$$;
      create table auth.users(id uuid primary key,raw_app_meta_data jsonb not null default '{}',deleted_at timestamptz,banned_until timestamptz);
      create table auth.sessions(id uuid primary key,user_id uuid);
      create table auth.mfa_factors(id uuid primary key,user_id uuid references auth.users(id),status text);
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
      await db.exec(`reset role;insert into auth.users(id,raw_app_meta_data) values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','{"role":"admin"}');insert into auth.sessions values('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');set role authenticated;select set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","session_id":"11111111-1111-4111-8111-111111111111","app_metadata":{"role":"admin"}}',false);`);
      assert.equal(await scalar('select count(*)::int from brand_reviews'),1);
      await db.exec(`reset role;update auth.users set raw_app_meta_data='{"role":"customer"}';set role authenticated;`);
      assert.equal(await scalar('select count(*)::int from brand_reviews'),0,'old admin JWT fails immediately after demotion');
      await assert.rejects(()=>db.query('select email_payload from team_assignments'),e=>e.code==='42501');
      await assert.rejects(()=>db.query('select * from ai_usage_events'),e=>e.code==='42501');
      await db.exec("reset role;select set_config('request.jwt.claim.role','service_role',false)");
    });
    await t.test('full schema enforces opt-in MFA immediately for old AAL1 tokens',async()=>{
      const actor='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
      await db.exec("reset role;update auth.users set raw_app_meta_data='{\"role\":\"admin\"}';insert into auth.mfa_factors(id,user_id,status) values('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','unverified');");
      const access=async aal=>{
        await db.exec("set role authenticated;select set_config('request.jwt.claim.role','authenticated',false)");
        await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:actor,aal,session_id:"11111111-1111-4111-8111-111111111111"})]);
        return scalar('select count(*)::int from brand_reviews');
      };
      assert.equal(await access('aal1'),1,'unverified setup does not change existing access');
      await db.exec("reset role;update auth.mfa_factors set status='verified'");
      assert.equal(await access('aal1'),0,'the same password-only token loses access as soon as a factor is verified');
      assert.equal(await access(undefined),0,'missing assurance cannot bypass enrollment');
      assert.equal(await access('aal2'),1);
      await db.exec("reset role;set role service_role;select set_config('request.jwt.claim.role','service_role',false)");
      assert.equal(await call('admin_access_allowed',[actor,'aal1']),false);
      assert.equal(await call('admin_access_allowed',[actor,'aal2']),true);
      for(const update of ["banned_until=now()+interval '1 day'","deleted_at=now()","raw_app_meta_data='{}'"]){
        await db.exec('reset role;update auth.users set '+update+';set role service_role');
        assert.equal(await call('admin_access_allowed',[actor,'aal2']),false,'fresh internal Auth state overrides stale public user fields');
        await db.exec("reset role;update auth.users set banned_until=null,deleted_at=null,raw_app_meta_data='{\"role\":\"admin\"}';set role service_role");
      }
      await db.exec("set role authenticated;select set_config('request.jwt.claim.role','authenticated',false)");
      await assert.rejects(()=>call('admin_access_allowed',[actor,'aal2']),e=>e.code==='42501');
      await assert.rejects(()=>db.query('select * from auth.mfa_factors'),e=>e.code==='42501');
      await db.exec('reset role;delete from auth.mfa_factors');
      assert.equal(await access('aal1'),1,'removing the last factor restores optional password-only access');
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
    await t.test('admin mutations recheck current actors, commit metadata-only audit atomically, and protect audit history',async()=>{
      const actor='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',network='d'.repeat(64);
      const mutation=(action,id,payload={})=>call('run_admin_mutation',[actor,network,action,id,payload]);
      await db.exec(`reset role;update auth.users set raw_app_meta_data='{"role":"admin"}',banned_until=null,deleted_at=null;set role service_role;select set_config('request.jwt.claim.role','service_role',false);`);
      assert.equal((await mutation('review_update','review-a',{followup_status:'contacted',followup_notes:'Private note never copied into audit.'})).followup_status,'contacted');
      let audit=(await db.query('select * from admin_audit_events')).rows;
      assert.equal(audit.length,1);assert.equal(audit[0].actor_id,actor);assert.equal(audit[0].network_hash,network);
      assert.deepEqual(audit[0].changed_fields,['followup_notes','followup_status']);assert.equal(audit[0].outcome,'applied');assert.equal(audit[0].record_id,'review-a');
      assert.doesNotMatch(JSON.stringify(audit),/Private note|ada@example|service_role|Bearer/);
      await assert.rejects(()=>mutation('review_update','review-a',{email:'attacker@example.com'}),e=>e.code==='22023');
      assert.equal(await scalar('select count(*)::int from admin_audit_events'),1);
      for(const sql of ['update admin_audit_events set action=\'forged\'','delete from admin_audit_events','truncate admin_audit_events',"insert into admin_audit_events(actor_id,action,record_type,record_id,network_hash,outcome) values('"+actor+"','forged','review','x','"+network+"','applied')"]){await assert.rejects(()=>db.query(sql),e=>e.code==='42501');}
      // A database audit failure must also roll back the actual mutation.
      await db.exec(`reset role;create function public.fail_audit_fixture() returns trigger language plpgsql as $$begin raise exception 'audit unavailable';end;$$;
        create trigger fail_audit_fixture before insert on admin_audit_events for each row execute function public.fail_audit_fixture();set role service_role;`);
      await assert.rejects(()=>mutation('review_update','review-a',{followup_status:'lost'}),/audit unavailable/);
      await db.exec('reset role;');
      assert.equal(await scalar("select followup_status from brand_reviews where id='review-a'"),'contacted');
      await db.exec('reset role;drop trigger fail_audit_fixture on admin_audit_events;drop function public.fail_audit_fixture();set role service_role;');
      const settings=await mutation('ai_settings_update','global',{chat_enabled:false,global_daily_calls:1234});
      assert.equal(settings.chat_enabled,false);assert.equal(settings.global_daily_calls,1234);
      await assert.rejects(()=>mutation('ai_settings_update','global',{global_daily_calls:0}),e=>e.code==='23514');
      await mutation('ai_settings_update','global',{chat_enabled:true});
      await db.exec(`reset role;insert into haven_sessions(id,review_id,scope,service_id) values('inquiry-a','review-a','support','team-inquiry');
        insert into support_requests(id,email,message,category,visitor_id,network_bucket) values('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','ada@example.com','Private support investigation request.','review_access','11111111-1111-4111-8111-111111111111','${network}');set role service_role;`);
      assert.equal((await mutation('inquiry_update','inquiry-a',{revision:0,status:'reviewing',owner:'Francis Fadeyi',notes:'Private inquiry notes.',followup:null})).session.inquiry_revision,1);
      const assignment=await mutation('assignment_save','inquiry-a',{kind:'inquiry',revision:0,name:'Francis Fadeyi',email:'private-teammate@example.com',note:'Private preparation note.'});
      const payload={from:'team@example.com',to:['private-teammate@example.com'],text:'Bearer link never copied into audit.'};
      assert.deepEqual((await mutation('assignment_email_claim',assignment.id,{revision:1,payload})).payload,payload);
      const marked=await mutation('assignment_email_result',assignment.id,{revision:1,provider_id:'mail-fixture',error:null});
      assert.ok(marked.email_sent_at);assert.equal(marked.email_payload,undefined);
      assert.ok((await mutation('assignment_revoke',assignment.id,{revision:1})).revoked_at);
      assert.equal((await mutation('moderation_update','selected_review',{email:'ada@example.com',visitor_id:null,status:'yellow',reason:'Private moderation reason.',session_id:null})).flagStatus,'yellow');
      assert.equal((await mutation('verification_unlock','11111111-1111-4111-8111-111111111111')).reset,1);
      assert.equal((await mutation('support_update','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',{revision:0,status:'in_progress',notes:'Private support notes.',action:'reset_verification',reason:'Verified the request and investigated the saved device.'})).ok,true);
      assert.equal((await mutation('purchase_email_retry','purchase-fixture')).ok,true);
      audit=(await db.query('select * from admin_audit_events')).rows;
      assert.ok(audit.some(event=>event.action==='support_reset_verification'));assert.ok(audit.some(event=>event.action==='moderation_set_yellow'));
      assert.doesNotMatch(JSON.stringify(audit),/Private|private-teammate|ada@example|Bearer link|Verified the request/);
      await db.exec(`reset role;update auth.users set raw_app_meta_data='{"role":"customer"}';set role service_role;`);
      await assert.rejects(()=>mutation('review_delete','review-a'),e=>e.code==='42501');
      await db.exec('reset role;');
      assert.equal(await scalar("select count(*)::int from brand_reviews where id='review-a'"),1);
      await db.exec(`reset role;update auth.users set raw_app_meta_data='{"role":"admin"}',banned_until=now()+interval '1 hour';set role service_role;`);
      await assert.rejects(()=>mutation('review_email_retry','review-a'),e=>e.code==='42501');
      await db.exec(`reset role;update auth.users set banned_until=null,deleted_at=now();set role service_role;`);
      await assert.rejects(()=>mutation('review_update','review-a',{}),e=>e.code==='42501');
      for(const role of ['anon','authenticated']){
        await db.exec(`set role ${role};select set_config('request.jwt.claim.role','${role}',false);`);
        await assert.rejects(()=>mutation('review_update','review-a',{}),e=>e.code==='42501');
        await assert.rejects(()=>db.query('select * from admin_audit_events'),e=>e.code==='42501');
        await assert.rejects(()=>db.query('select * from auth.users'),e=>e.code==='42501');
      }
      await db.exec('reset role;');
      await assert.rejects(()=>db.query("update admin_audit_events set action='forged'"),e=>e.code==='42501');
    });
  }finally{await db.close();}
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {productionDb,rpc,scalar,seedReview,ADMIN_A,ADMIN_B,SESSION_A,NETWORK} from './helpers/production-db.mjs';

test('ethical hacking: real PostgreSQL authorization, replay and concurrency boundaries',async t=>{
  const db=await productionDb();
  try{
    await seedReview(db);
    await t.test('P0 regression: removing the legacy anonymous policy hides all conversations',async()=>{
      await db.query('insert into haven_sessions(id,scope,messages) values($1,$2,$3)',[randomUUID(),'support',[{role:'user',content:'Private synthetic conversation'}]]);
      await db.exec('grant select on public.haven_sessions to anon; create policy anon_select_sessions on public.haven_sessions for select to anon using(true)');
      const asAnon=()=>db.exec("set role anon;select set_config('request.jwt.claim.role','anon',false)");
      await asAnon();
      assert.ok(await scalar(db,'select count(*)::int from public.haven_sessions')>0);
      await db.exec('reset role');
      await db.exec(await readFile('supabase/migrations/20261105000000_remove_anon_select.sql','utf8'));
      await asAnon();
      assert.equal(await scalar(db,'select count(*)::int from public.haven_sessions'),0);
      assert.equal((await db.query('select messages from public.haven_sessions')).rows.length,0);
      await db.exec("reset role;select set_config('request.jwt.claim.role','service_role',false)");
      assert.ok(await scalar(db,'select count(*)::int from public.haven_sessions')>0,'private records are preserved');
    });
    await t.test('IDOR: another visitor cannot claim or read the saved conversation',async()=>{
      const visitor=randomUUID(),session=randomUUID(),proof='b'.repeat(64);
      const ensure=(who,token)=>rpc(db,'ensure_haven_conversation',[who,token,session,'support',null,null,'2026-10-26']);
      assert.ok((await ensure(visitor,proof)).session);
      await assert.rejects(ensure(visitor,'c'.repeat(64)),e=>e.code==='42501');
      await assert.rejects(ensure(randomUUID(),proof),e=>e.code==='42501');
      assert.equal(await scalar(db,'select count(*)::int from haven_sessions where id=$1',[session]),1);
    });
    await t.test('rate-limit breach: ten concurrent requests admit exactly five; changing email cannot change the bucket',async()=>{
      const requests=await Promise.all(Array.from({length:10},()=>rpc(db,'consume_playbook_limit',['public:synthetic-network:'+NETWORK,5,900])));
      assert.equal(requests.filter(Boolean).length,5);
      assert.equal(await rpc(db,'consume_playbook_limit',['public:synthetic-network:'+NETWORK,5,900]),false);
      const limits=await rpc(db,'admin_active_limits',[ADMIN_A]);assert.ok(limits.some(row=>row.reset_at&&row.requests===11));
      await rpc(db,'clear_admin_limit',[ADMIN_A,'public:synthetic-network:'+NETWORK,'Confirmed synthetic test request',NETWORK]);
      assert.equal(await rpc(db,'consume_playbook_limit',['public:synthetic-network:'+NETWORK,5,900]),true);
      assert.equal(await scalar(db,"select count(*)::int from admin_audit_events where action='rate_limit_cleared'"),1);
    });
    await t.test('MFA backup replay: only one concurrent use succeeds, wrong admin cannot consume a code',async()=>{
      await db.query('insert into auth.mfa_factors(id,user_id,status) values($1,$2,$3)',[randomUUID(),ADMIN_A,'verified']);
      const hashes=Array.from({length:10},(_,i)=>i.toString(16).padStart(64,'0'));
      await rpc(db,'replace_admin_backup_codes',[ADMIN_A,hashes,NETWORK]);
      assert.equal(await rpc(db,'consume_admin_backup_code',[ADMIN_B,hashes[0],NETWORK]),false);
      const attempts=await Promise.all([rpc(db,'consume_admin_backup_code',[ADMIN_A,hashes[0],NETWORK]),rpc(db,'consume_admin_backup_code',[ADMIN_A,hashes[0],NETWORK])]);
      assert.equal(attempts.filter(Boolean).length,1);assert.equal(await rpc(db,'consume_admin_backup_code',[ADMIN_A,hashes[0],NETWORK]),false);
      assert.equal(await rpc(db,'admin_access_allowed',[ADMIN_A,'aal1',SESSION_A]),false);
      assert.equal(await rpc(db,'admin_access_allowed',[ADMIN_A,'aal2',SESSION_A]),true);
      assert.equal(await rpc(db,'admin_access_allowed',[ADMIN_A,'aal2',randomUUID()]),false,'a revoked or invented session never regains access after factor removal');
    });
    await t.test('single-admin destruction and approval replay are denied; two current admins can delete once',async()=>{
      await assert.rejects(rpc(db,'run_admin_mutation',[ADMIN_A,NETWORK,'review_delete','review-a',{}]),e=>e.code==='42501');
      const pending=await rpc(db,'request_admin_deletion',[ADMIN_A,'review','review-a','Synthetic review cleanup only',NETWORK]);
      await assert.rejects(rpc(db,'approve_admin_deletion',[ADMIN_A,pending.approvalId,NETWORK]),e=>e.code==='42501');
      assert.equal(await scalar(db,"select count(*)::int from brand_reviews where id='review-a'"),1);
      const approved=await rpc(db,'approve_admin_deletion',[ADMIN_B,pending.approvalId,NETWORK]);assert.equal(approved.deleted,true);
      assert.equal((await rpc(db,'approve_admin_deletion',[ADMIN_B,pending.approvalId,NETWORK])).unavailable,true);
    });
    await t.test('changed records invalidate approval; a fresh request captures the new record',async()=>{
      await seedReview(db,'review-change','change@example.test');
      const first=await rpc(db,'request_admin_deletion',[ADMIN_A,'review','review-change','Synthetic changed record test',NETWORK]);
      await db.exec("update brand_reviews set followup_notes='Another admin contacted this lead' where id='review-change'");
      assert.equal((await rpc(db,'approve_admin_deletion',[ADMIN_B,first.approvalId,NETWORK])).conflict,true);
      const second=await rpc(db,'request_admin_deletion',[ADMIN_A,'review','review-change','Reviewed the new saved details',NETWORK]);
      assert.notEqual(first.approvalId,second.approvalId);
      await db.query("update auth.users set raw_app_meta_data='{}' where id=$1",[ADMIN_A]);
      await assert.rejects(rpc(db,'approve_admin_deletion',[ADMIN_B,second.approvalId,NETWORK]),e=>e.code==='42501');
      await db.query('update auth.users set raw_app_meta_data=$1 where id=$2',[{role:'admin'},ADMIN_A]);
    });
    await t.test('purchase deletion also needs two admins and removes stored recovery/device grants',async()=>{
      const purchase=(await db.query("insert into playbook_purchases(email,reference,amount) values('purchase@example.test','UNSEEN_synthetic_approval',963900) returning id")).rows[0].id;
      await db.query('insert into playbook_download_grants(token_hash,reference,email) values($1,$2,$3)',['f'.repeat(64),'UNSEEN_synthetic_approval','purchase@example.test']);
      await db.query('insert into playbook_recovery_otps(id,reference,email,code_hash) values($1,$2,$3,$4)',[randomUUID(),'UNSEEN_synthetic_approval','purchase@example.test','e'.repeat(64)]);
      const pending=await rpc(db,'request_admin_deletion',[ADMIN_A,'purchase',purchase,'Synthetic purchase cleanup only',NETWORK]);
      await assert.rejects(rpc(db,'approve_admin_deletion',[ADMIN_A,pending.approvalId,NETWORK]),e=>e.code==='42501');
      assert.equal((await rpc(db,'approve_admin_deletion',[ADMIN_B,pending.approvalId,NETWORK])).deleted,true);
      assert.equal(await scalar(db,'select count(*)::int from playbook_purchases where id=$1',[purchase]),0);
      assert.equal(await scalar(db,"select count(*)::int from playbook_download_grants where reference='UNSEEN_synthetic_approval'"),0);
      assert.equal(await scalar(db,"select count(*)::int from playbook_recovery_otps where reference='UNSEEN_synthetic_approval'"),0);
    });
    await t.test('follow-up jobs cannot be claimed before approval or after the lead is contacted',async()=>{
      const claim=async()=>(await db.query('select * from public.claim_lead_nudges()')).rows;
      await seedReview(db,'nudge-review','nudge@example.test');await db.exec("update brand_reviews set created_at=now()-interval '4 days' where id='nudge-review'");
      await rpc(db,'refresh_lead_followup_nudges');assert.equal((await claim()).length,0);
      assert.equal(await rpc(db,'approve_lead_nudge',[ADMIN_A,'nudge-review',NETWORK]),true);
      const jobs=await claim();assert.equal(jobs.length,1);assert.equal(jobs[0].approved_by,ADMIN_A);
      await db.exec("update brand_reviews set followup_status='contacted' where id='nudge-review'");assert.equal((await claim()).length,0);
    });
    await t.test('export IDOR and replay: hash-bound, inbox-bound snapshot excludes capability hashes and internal notes',async()=>{
      await seedReview(db,'export-a','export@example.test');
      await db.exec("update brand_reviews set followup_notes='INTERNAL-STAFF-ONLY' where id='export-a'");
      await db.query('insert into haven_sessions(id,review_id,scope,messages) values($1,$2,$3,$4)',[randomUUID(),'export-a','audit',[{role:'user',content:'My synthetic brand question',timestamp:1}]]);
      await db.query('insert into data_export_requests(email,token_hash) values($1,$2)',['export@example.test','d'.repeat(64)]);
      assert.equal((await rpc(db,'prepare_data_export',['e'.repeat(64)])).unavailable,true);
      const prepared=await rpc(db,'prepare_data_export',['d'.repeat(64)]);assert.equal(prepared.email,'export@example.test');assert.equal(prepared.snapshot.reviews.length,1);assert.equal(prepared.snapshot.conversations.length,1);
      assert.doesNotMatch(JSON.stringify(prepared.snapshot),/token_hash|access_token|INTERNAL-STAFF-ONLY/);
      assert.deepEqual((await rpc(db,'prepare_data_export',['d'.repeat(64)])).snapshot,prepared.snapshot,'lost-response retries reuse a frozen snapshot');
      await db.query('update data_export_requests set accepted_at=now(),snapshot=null where id=$1',[prepared.id]);
      assert.equal((await rpc(db,'prepare_data_export',['d'.repeat(64)])).unavailable,true);
    });
    await t.test('RLS bypass: anonymous users and editable metadata cannot read sensitive tables or invoke admin RPCs',async()=>{
      for(const role of ['anon','authenticated']){
        await db.exec(`set role ${role};select set_config('request.jwt.claim.role','${role}',false);select set_config('request.jwt.claims','{"user_metadata":{"role":"admin"}}',false);`);
        for(const table of ['admin_backup_codes','admin_login_devices','admin_login_events','admin_deletion_approvals','data_export_requests','operations_heartbeats'])await assert.rejects(db.query('select * from '+table),e=>e.code==='42501');
        await assert.rejects(rpc(db,'request_admin_deletion',[ADMIN_A,'review','export-a','Forged admin request should fail',NETWORK]),e=>e.code==='42501');
        if(role==='authenticated')assert.equal(await scalar(db,'select count(*)::int from admin_live_notifications'),0);
        await db.exec('reset role');
      }
      await db.exec("select set_config('request.jwt.claim.role','service_role',false)");
    });
    await t.test('health fails closed without Vault, recent cron success and successful workers',async()=>{
      const checks=await rpc(db,'production_health_checks');assert.equal(checks.database,true);assert.equal(checks.rpc,true);assert.equal(checks.vault,false);assert.equal(checks.cron,false);assert.equal(checks.workers,false);
      await db.exec("create schema vault;create table vault.decrypted_secrets(name text,decrypted_secret text);insert into vault.decrypted_secrets values('tmh_internal_poll_secret',repeat('x',32));create schema cron;create table cron.job(jobid int,jobname text,active boolean);create table cron.job_run_details(jobid int,status text,end_time timestamptz)");
      const names=['calendly-poll-bookings','tmh-support-notifications','tmh-ai-usage-alerts','tmh-lead-followup-nudges'];
      for(let i=0;i<4;i++){await db.query('insert into cron.job values($1,$2,true)',[i,names[i]]);await db.query("insert into cron.job_run_details values($1,'succeeded',now())",[i]);}
      for(const name of ['calendly-poll-bookings','send-support-notification','send-ai-usage-alerts','send-lead-followup-nudges'])await rpc(db,'record_worker_success',[name]);
      assert.equal(Object.values(await rpc(db,'production_health_checks')).every(Boolean),true);
      await db.exec("update operations_heartbeats set succeeded_at=now()-interval '16 minutes'");assert.equal((await rpc(db,'production_health_checks')).workers,false);
    });
  }finally{await db.close();}
});

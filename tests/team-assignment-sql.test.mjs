import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('assignment migration: real PostgreSQL enforces privacy, revision fencing, email leases, immutable retries and foreign keys',async t=>{
  const db=new PGlite();
  const scalar=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
  const call=async(name,args=[])=>scalar(`select to_jsonb(public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}))`,args);
  try{
    await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
      create schema auth;create function auth.role() returns text language sql as $$select current_setting('request.jwt.claim.role',true)$$;
      grant usage on schema auth,public to anon,authenticated,service_role;
      create table booking_intents(id uuid primary key default gen_random_uuid());
      create table brand_reviews(id text primary key);
      create table strategy_call_bookings(id bigint primary key,status text,end_time timestamptz,invitee_uri text,confirmation_email_sent boolean default false);
      create table haven_sessions(id text primary key,service_id text,inquiry_owner text,inquiry_revision integer not null default 0,inquiry_updated_at timestamptz);
      insert into booking_intents default values;insert into brand_reviews values('old-review');
      insert into strategy_call_bookings(id,status,end_time) values(1,'active',now()+interval '2 days'),(2,'canceled',now()+interval '2 days'),(3,'active',now()-interval '1 day');
      insert into haven_sessions(id,service_id) values('12345678-1234-4234-8234-123456789abc','team-inquiry'),('22345678-1234-4234-8234-123456789abc',null);
      select set_config('request.jwt.claim.role','service_role',false);`);
    await db.exec(await readFile('supabase/migrations/20261028000000_team_assignments_and_booking_email.sql','utf8'));
    let assignmentId;
    const save=(revision=0,patch={})=>call('save_team_assignment',['booking','1',revision,patch.name||'Francis Fadeyi',patch.email||'FRANCIS@example.com',patch.note||'Prepare the scope.']);
    await t.test('existing pending emails retain legacy version; new records default to the editorial template',async()=>{
      assert.equal(await scalar("select booking_email_version from brand_reviews where id='old-review'"),'legacy-v1');
      await db.exec("insert into brand_reviews(id) values('new-review')");
      assert.equal(await scalar("select booking_email_version from brand_reviews where id='new-review'"),'editorial-v3');
    });
    await t.test('save validates target, creates one owner and normalizes email',async()=>{
      assignmentId=(await save()).id;
      assert.equal(await scalar('select assignee_email from team_assignments where id=$1',[assignmentId]),'francis@example.com');
      assert.equal((await save()).conflict,true);
      for(const target of ['2','3','999'])await assert.rejects(()=>call('save_team_assignment',['booking',target,0,'Francis Fadeyi','person@example.com','']),error=>error.code==='P0002');
      await assert.rejects(()=>save(1,{name:'Unknown'}),error=>error.code==='22023');
    });
    await t.test('inquiry assignment updates the owner and rejects ordinary support',async()=>{
      await call('save_team_assignment',['inquiry','12345678-1234-4234-8234-123456789abc',0,'Yakubu Dalil','tech@example.com','Check scope.']);
      assert.equal(await scalar("select inquiry_owner from haven_sessions where service_id='team-inquiry'"),'Yakubu Dalil');
      assert.equal(await scalar("select inquiry_revision from haven_sessions where service_id='team-inquiry'"),1);
      await assert.rejects(()=>call('save_team_assignment',['inquiry','22345678-1234-4234-8234-123456789abc',0,'Yakubu Dalil','tech@example.com','']),error=>error.code==='P0002');
    });
    await t.test('email claim serializes attempts, freezes payload and blocks reassignment while sending',async()=>{
      const payload={to:['francis@example.com'],text:'Original'};
      assert.deepEqual((await call('claim_team_assignment_email',[assignmentId,1,payload])).payload,payload);
      assert.equal((await call('claim_team_assignment_email',[assignmentId,1,{text:'Changed'}])).busy,true);
      assert.equal((await save(1)).busy,true);
      await db.query("update team_assignments set email_attempted_at=now()-interval '2 minutes' where id=$1",[assignmentId]);
      assert.deepEqual((await call('claim_team_assignment_email',[assignmentId,1,{text:'Changed'}])).payload,payload);
    });
    await t.test('expired dedupe window requires a deliberate fresh invitation; stored provider ID permits repair',async()=>{
      await db.query("update team_assignments set email_attempted_at=now()-interval '2 minutes',email_first_attempt_at=now()-interval '24 hours' where id=$1",[assignmentId]);
      assert.equal((await call('claim_team_assignment_email',[assignmentId,1,{}])).expired_retry,true);
      await db.query("update team_assignments set provider_email_id='accepted' where id=$1",[assignmentId]);
      assert.equal((await call('claim_team_assignment_email',[assignmentId,1,{}])).provider_email_id,'accepted');
      await db.query('update team_assignments set email_sent_at=now() where id=$1',[assignmentId]);
      assert.equal((await call('claim_team_assignment_email',[assignmentId,1,{}])).already_sent,true);
    });
    await t.test('a replacement revokes the old revision and resets notification and acknowledgement state',async()=>{
      assert.equal((await save(1,{email:'replacement@example.com'})).id,assignmentId);
      const row=(await db.query('select * from team_assignments where id=$1',[assignmentId])).rows[0];
      assert.equal(row.revision,2);assert.equal(row.email_payload,null);assert.equal(row.provider_email_id,null);assert.equal(row.email_sent_at,null);
      assert.equal(await call('claim_team_assignment_email',[assignmentId,1,{}]),null);
      assert.equal((await save(1)).conflict,true);
    });
    await t.test('revoked and expired links cannot claim email work',async()=>{
      await db.query('update team_assignments set revoked_at=now() where id=$1',[assignmentId]);
      assert.equal(await call('claim_team_assignment_email',[assignmentId,2,{}]),null);
      await db.query("update team_assignments set revoked_at=null,expires_at=now()-interval '1 second' where id=$1",[assignmentId]);
      assert.equal(await call('claim_team_assignment_email',[assignmentId,2,{}]),null);
    });
    await t.test('booking email payload cannot change between attempts',async()=>{
      const original={to:['client@example.com'],text:'Frozen'};
      assert.deepEqual((await call('prepare_booking_confirmation',['booking/1',original])).payload,original);
      assert.deepEqual((await call('prepare_booking_confirmation',['booking/1',{text:'Changed'}])).payload,original);
    });
    await t.test('booking confirmation state is per invitee, not an earlier lead or intent flag',async()=>{
      await db.exec("update strategy_call_bookings set invitee_uri='https://api.calendly.com/scheduled_events/event/invitees/person',confirmation_email_sent=true where id=1");
      const current=await call('strategy_booking_confirmation',['https://api.calendly.com/scheduled_events/event/invitees/person']);
      assert.equal(current.id,1);assert.equal(current.confirmation_email_sent,true);
      assert.equal(await call('strategy_booking_confirmation',['missing-invitee']),null);
    });
    await t.test('public and authenticated clients cannot read assignments or execute private functions',async()=>{
      for(const role of ['anon','authenticated']){
        await db.exec(`set role ${role};select set_config('request.jwt.claim.role','${role}',false)`);
        for(const sql of ['select * from team_assignments','select * from booking_confirmation_emails'])await assert.rejects(()=>db.query(sql),error=>error.code==='42501');
        await assert.rejects(()=>call('claim_team_assignment_email',[assignmentId,2,{}]),error=>error.code==='42501');
        await assert.rejects(()=>call('prepare_booking_confirmation',['bad',{}]),error=>error.code==='42501');
        await db.exec('reset role');
      }
      await db.exec("select set_config('request.jwt.claim.role','service_role',false)");
    });
    await t.test('deleting a booking withdraws access through cascading assignment deletion',async()=>{
      await db.exec('delete from strategy_call_bookings where id=1');
      assert.equal(await scalar('select count(*)::int from team_assignments where id=$1',[assignmentId]),0);
    });
  }finally{await db.close();}
});

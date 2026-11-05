import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {productionDb,seedReview,scalar,rpc} from './helpers/production-db.mjs';
const catalog=`select jsonb_build_object(
 'columns',(select jsonb_agg(row_to_json(x)) from (select table_name,column_name,data_type,is_nullable,column_default from information_schema.columns where table_schema='public' order by table_name,ordinal_position) x),
 'policies',(select jsonb_agg(row_to_json(x)) from (select tablename,policyname,roles,cmd,qual,with_check from pg_policies where schemaname='public' order by tablename,policyname) x),
 'functions',(select jsonb_agg(row_to_json(x)) from (select p.proname,pg_get_function_identity_arguments(p.oid) args,pg_get_functiondef(p.oid) body from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' order by p.proname,pg_get_function_identity_arguments(p.oid)) x),
 'rls',(select jsonb_agg(row_to_json(x)) from (select c.relname,c.relrowsecurity,c.relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' order by c.relname) x),
 'grants',(select jsonb_agg(row_to_json(x)) from (select table_name,grantee,privilege_type from information_schema.role_table_grants where table_schema='public' order by table_name,grantee,privilege_type) x),
 'constraints',(select jsonb_agg(row_to_json(x)) from (select c.relname,con.conname,pg_get_constraintdef(con.oid) definition from pg_constraint con join pg_class c on c.oid=con.conrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' order by c.relname,con.conname) x),
 'indexes',(select jsonb_agg(row_to_json(x)) from (select tablename,indexname,indexdef from pg_indexes where schemaname='public' order by tablename,indexname) x),
 'triggers',(select jsonb_agg(row_to_json(x)) from (select c.relname,t.tgname,pg_get_triggerdef(t.oid) definition from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and not t.tgisinternal order by c.relname,t.tgname) x))`;
const normalize=value=>typeof value==='string'?value.replaceAll('\r\n','\n'):Array.isArray(value)?value.map(normalize):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([k,v])=>[k,normalize(v)])):value;
test('consolidated baseline bootstraps the same catalog as history and preserves existing records on replay',async()=>{
  const history=await productionDb(),baseline=await productionDb({baselineOnly:true});
  try{
    assert.deepEqual(normalize(await scalar(baseline,catalog)),normalize(await scalar(history,catalog)));
    await seedReview(baseline);
    await baseline.exec(await readFile('supabase/migrations/20261105000001_consolidated_baseline.sql','utf8'));
    assert.equal(await scalar(baseline,"select count(*)::int from brand_reviews where id='review-a'"),1);
    await baseline.exec('create policy anon_select_sessions on haven_sessions for select to anon using(true)');
    await assert.rejects(baseline.exec(await readFile('supabase/migrations/20261105000001_consolidated_baseline.sql','utf8')),/Anonymous conversation-read policy remains/);
  }finally{await history.close();await baseline.close();}
});
test('cancelled bookings clear the lead badge and release the reservation guard',async()=>{
  const db=await productionDb();try{
    await seedReview(db);
    const visitor='11111111-1111-4111-8111-111111111111',proof='b'.repeat(64),args=[visitor,proof,'synthetic@example.test','review-a','web','service'];
    const intent=await rpc(db,'reserve_strategy_booking',args);
    const booking={invitee_uri:'https://api.calendly.com/scheduled_events/test/invitees/one',event_uri:'https://api.calendly.com/scheduled_events/test',email:'synthetic@example.test',review_id:'review-a',booking_intent_id:intent.intentId,start_time:new Date(Date.now()+86400000).toISOString(),end_time:new Date(Date.now()+88000000).toISOString(),status:'active',source:'lead'};
    await rpc(db,'record_strategy_call_booking',[booking]);
    await db.query('update booking_intents set confirmed_at=now() where id=$1',[intent.intentId]);
    assert.ok(await scalar(db,"select call_booked_at from brand_reviews where id='review-a'"));
    assert.equal((await rpc(db,'reserve_strategy_booking',args)).alreadyBooked,true);
    await rpc(db,'record_strategy_call_booking',[{...booking,status:'canceled'}]);
    assert.equal(await scalar(db,"select call_booked_at from brand_reviews where id='review-a'"),null);
    assert.ok((await rpc(db,'reserve_strategy_booking',args)).intentId);
    await rpc(db,'record_strategy_call_booking',[booking]);
    assert.equal(await scalar(db,"select status from strategy_call_bookings where invitee_uri=$1",[booking.invitee_uri]),'canceled','a late active event cannot resurrect a cancellation');
  }finally{await db.close();}
});
test('one active booking blocks cross-entry and email changes through its end, then permits a new reservation after that time',async()=>{
  const db=await productionDb();try{
    await seedReview(db);const visitor='11111111-1111-4111-8111-111111111111',proof='b'.repeat(64),args=[visitor,proof,'synthetic@example.test','review-a','web','service'];
    const intent=await rpc(db,'reserve_strategy_booking',args);
    const booking={invitee_uri:'https://api.calendly.com/scheduled_events/ongoing/invitees/one',event_uri:'https://api.calendly.com/scheduled_events/ongoing',email:args[2],review_id:args[3],booking_intent_id:intent.intentId,start_time:new Date(Date.now()-600000).toISOString(),end_time:new Date(Date.now()+900000).toISOString(),status:'active',source:'lead'};
    await rpc(db,'record_strategy_call_booking',[booking]);await db.query('update booking_intents set confirmed_at=now() where id=$1',[intent.intentId]);
    assert.equal((await rpc(db,'reserve_strategy_booking',[visitor,proof,'different@example.test','review-a','content','team'])).alreadyBooked,true);
    assert.equal((await rpc(db,'reserve_strategy_booking',['22222222-2222-4222-8222-222222222222','c'.repeat(64),args[2],null,'growth','service'])).alreadyBooked,true);
    const status=await rpc(db,'visitor_strategy_booking',[visitor]);assert.equal(status.confirmed,true);assert.ok(status.endTime);assert.equal(Date.parse(status.endTime),Date.parse(booking.end_time));
    await db.query("update strategy_call_bookings set start_time=now()-interval '1 hour',end_time=now()-interval '30 minutes' where booking_intent_id=$1",[intent.intentId]);
    assert.equal((await rpc(db,'visitor_strategy_booking',[visitor])).confirmed,undefined);assert.ok((await rpc(db,'reserve_strategy_booking',args)).intentId);
  }finally{await db.close();}
});

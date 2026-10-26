// Runs real PostgreSQL migrations in an isolated, in-memory PGlite database.
// Usage: node scripts/check-final-migrations.mjs <absolute path to pglite/dist/index.js>
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';

if (!process.argv[2]) throw new Error('Supply the isolated PGlite module path; no production connection is used.');
const { PGlite } = await import(pathToFileURL(process.argv[2]).href);
const db = new PGlite();
const query = async (sql, args = []) => (await db.query(sql, args)).rows;
const scalar = async (sql, args = []) => Object.values((await query(sql, args))[0])[0];
const rpc = async (name, args) => scalar(`select public.${name}(${args.map((_, i) => `$${i + 1}`).join(',')})`, args);
const count = (table, where = 'true', args = []) => scalar(`select count(*)::int from public.${table} where ${where}`, args);
const hash = 'a'.repeat(64);
let passed = 0;
async function check(name, fn) { await fn(); passed++; console.log(`PASS ${name}`); }
async function denied(fn, code) { await assert.rejects(fn, (error) => code ? error.code === code : true); }

try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create schema storage;
    create function auth.role() returns text language sql as $$select current_setting('request.jwt.claim.role',true)$$;
    grant usage on schema public,auth,storage to anon,authenticated,service_role;
    alter default privileges in schema public grant all on tables to anon,authenticated,service_role;
    alter default privileges in schema public grant all on sequences to anon,authenticated,service_role;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
    alter table storage.objects enable row level security;
    select set_config('request.jwt.claim.role','service_role',false);
  `);
  // Minimal Supabase roles/storage plus the actual repository schema. Cron and
  // external integrations are deliberately excluded from this offline fixture.
  for (const file of ['schema.sql', ...[
    '20261015000001_brand_reviews_email_unique.sql',
    '20261015000002_booking_intents.sql',
    '20261019000000_user_flags.sql',
    '20261021000000_playbook_purchases.sql',
    '20261021000001_flag_alert_notifications.sql',
    '20261023000000_review_security.sql',
    '20261023000002_admin_delete_lead.sql',
    '20261023000003_haven_conversations.sql',
    '20261023000004_moderation.sql',
    '20261023000005_purchase_delivery.sql',
    '20261024000000_email_delivery_diagnostics.sql',
    '20261024000001_haven_routing_state.sql',
    '20261025000000_email_templates.sql',
    '20261025000001_strategy_call_bookings.sql',
    '20261026000000_playbook_recovery.sql',
    '20261026000001_haven_reliability.sql',
  ].map((name) => `migrations/${name}`)]) {
    await db.exec(await readFile(new URL(`../supabase/${file}`, import.meta.url), 'utf8'));
    if (file === 'schema.sql') await db.exec("insert into strategy_call_bookings(full_name,email,whatsapp,booked_date,booked_time) values('Legacy Client','legacy@example.com','+2340000000000','2026-10-26','5:00 PM');");
  }
  await check('all selected migrations compile and commit', async () => {
    assert.equal(await count('brand_reviews'), 0);
    assert.equal(await count('haven_chat_turns'), 0);
  });
  await check('bookings migration preserves historical identities, slot fields and Lagos time', async () => {
    const [legacy] = await query("select * from strategy_call_bookings where email='legacy@example.com'");
    assert.equal(legacy.id, 1); assert.equal(legacy.status, 'confirmed'); assert.equal(legacy.booked_time, '5:00 PM');
    assert.equal(legacy.source, 'legacy'); assert.equal(new Date(legacy.start_time).toISOString(), '2026-10-26T16:00:00.000Z');
    await query('delete from strategy_call_bookings where id=1');
  });
  const review = randomUUID(), audit = randomUUID(), visitor = randomUUID(), support = randomUUID(), service = randomUUID();
  const payload = { id: review, email: 'owner@example.com', full_name: 'Test Owner', brand_name: 'Test Brand', whatsapp: '+2340000000000', platform_type: 'none', agreed_to_terms: true };
  const create = (value = payload, session = audit, token = hash) => rpc('create_haven_review', [JSON.stringify(value), session, token]);
  const ensure = (id, scope, linked = null, token = hash, who = visitor) => rpc('ensure_haven_conversation', [who, token, id, scope, linked, scope === 'service' ? 'web' : null, '2026-10-26']);
  await check('review creation is atomic and its retries are idempotent', async () => {
    assert.equal((await create()).reviewId, review);
    await create();
    assert.equal(await count('brand_reviews'), 1); assert.equal(await count('haven_sessions'), 1); assert.equal(await count('review_access_tokens'), 1);
    await denied(() => create(payload, audit, 'b'.repeat(64)), '42501');
    await denied(() => create({ ...payload, id: randomUUID() }, randomUUID()), '23505');
    assert.equal(await count('haven_sessions'), 1);
  });
  await check('guest sessions reject wrong tokens and cannot be claimed by a second visitor', async () => {
    await ensure(support, 'support');
    await denied(() => ensure(support, 'support', null, 'b'.repeat(64)), '42501');
    await denied(() => ensure(support, 'support', null, hash, randomUUID()), '42501');
    assert.equal(await count('haven_chat_visitors'), 1); // failed insert rolled back
  });
  await check('verified linking groups prior support and future service chats under the lead', async () => {
    await ensure(audit, 'audit', review); await ensure(service, 'service');
    assert.equal(await count('haven_sessions', 'review_id=$1', [review]), 3);
    assert.equal(await scalar('select review_id from haven_chat_visitors where id=$1', [visitor]), review);
    const other = { ...payload, id: randomUUID(), email: 'other@example.com' };
    await create(other, randomUUID());
    await denied(() => ensure(support, 'support', other.id), '42501');
  });
  const turn = randomUUID();
  const begin = (id = turn, text = 'My website checkout is losing sales', requestHash = hash) => rpc('begin_haven_turn', [support, id, text, false, true, true, requestHash]);
  const complete = (id = turn, step = 'CUSTOMER_SUPPORT_OPEN') => rpc('complete_haven_turn', [support, id, JSON.stringify({ ok: true, text: 'Which step fails?', leadTemperature: null }), true, step]);
  await check('turns save answers once, serialize active requests and replay completed replies', async () => {
    const first = await begin(); assert.equal(first.session.diagnostic_answers, 1); assert.equal(first.session.message_count, 2);
    assert.equal((await begin()).busy, true); assert.equal((await begin(randomUUID())).busy, true);
    await denied(() => begin(turn, 'changed input', 'b'.repeat(64)), '22023');
    await complete();
    const replay = await begin(); assert.equal(replay.cached.text, 'Which step fails?');
    assert.equal(replay.session.message_count, 3); assert.equal(replay.session.diagnostic_questions_asked, 2);
    const next = randomUUID(); await begin(next); await complete(next);
    assert.equal(await scalar('select diagnostic_answers from haven_sessions where id=$1', [support]), 2);
  });
  await check('failed completion rolls back cached response and transcript together', async () => {
    const next = randomUUID(); await begin(next);
    const before = await scalar('select message_count from haven_sessions where id=$1', [support]);
    await db.exec("create function reject_test_reply() returns trigger language plpgsql as $$begin if new.current_step='TEST_FAIL' then raise exception 'induced failure'; end if; return new; end$$; create trigger reject_test_reply before update on haven_sessions for each row execute function reject_test_reply();");
    await denied(() => complete(next, 'TEST_FAIL'));
    assert.equal(await scalar('select status from haven_chat_turns where id=$1', [next]), 'processing');
    assert.equal(await scalar('select message_count from haven_sessions where id=$1', [support]), before);
    await complete(next); await db.exec('drop trigger reject_test_reply on haven_sessions; drop function reject_test_reply();');
  });
  await check('diagnosis and permission commit atomically and survive the next turn', async () => {
    const stateTurn = randomUUID(); await begin(stateTurn);
    const routingState = { problemType: 'foundational', permission: 'asked' };
    await rpc('complete_haven_turn', [support, stateTurn, JSON.stringify({ ok: true, text: 'Would you like to see what it covers?', routingState }), false, 'AWAITING_PERMISSION']);
    assert.deepEqual(await scalar('select routing_state from haven_sessions where id=$1', [support]), routingState);
    const next = randomUUID();
    const resumed = await rpc('begin_haven_turn', [support, next, 'Please do', false, false, false, hash]);
    assert.deepEqual(resumed.session.routing_state, routingState);
    await rpc('complete_haven_turn', [support, next, JSON.stringify({ ok: true, text: 'The Unseen Playbook', routingState: { ...routingState, permission: 'granted' } }), false, 'ROUTING_TO_PLAYBOOK']);
    assert.equal((await scalar('select routing_state from haven_sessions where id=$1', [support])).permission, 'granted');
    const invalid = randomUUID(); await begin(invalid);
    await rpc('complete_haven_turn', [support, invalid, JSON.stringify({ ok: true, text: 'Still here', routingState: { problemType: 'forged', permission: 'granted' } }), false, 'CUSTOMER_SUPPORT_OPEN']);
    assert.equal((await scalar('select routing_state from haven_sessions where id=$1', [support])).problemType, 'foundational');
  });
  await check('conversation memory commits with its reply, remains scoped, and is not exposed in replay metadata', async () => {
    const id=randomUUID(); await begin(id);
    const memory={version:1,facts:{business:{quote:'I sell bread to office workers',turnId:id}}};
    await rpc('complete_haven_turn',[support,id,JSON.stringify({ok:true,text:'Which orders are you hoping to grow?',conversationMemory:memory}),true,'CUSTOMER_SUPPORT_OPEN']);
    assert.deepEqual(await scalar('select conversation_memory from haven_sessions where id=$1',[support]),memory);
    assert.deepEqual(await scalar('select conversation_memory from haven_sessions where id=$1',[audit]),{version:1,facts:{}});
    assert.equal((await begin(id)).cached.conversationMemory,undefined);
  });
  await check('team inquiry follow-up edits are private, versioned and cannot overwrite chat or flags',async()=>{
    const team=randomUUID();await rpc('ensure_haven_conversation',[visitor,hash,team,'support',review,'team-inquiry','2026-10-26']);
    const messages=await scalar('select messages from haven_sessions where id=$1',[team]);
    const first=await rpc('update_haven_inquiry',[team,0,'reviewing','Francis','Review the checkout request','2026-11-03']);
    assert.equal(first.session.inquiry_revision,1);assert.equal(first.session.inquiry_owner,'Francis');
    const conflict=await rpc('update_haven_inquiry',[team,0,'closed','Paschal','Do not overwrite',null]);
    assert.equal(conflict.conflict,true);assert.equal(conflict.session.inquiry_status,'reviewing');
    assert.deepEqual(await scalar('select messages from haven_sessions where id=$1',[team]),messages);
    await denied(()=>rpc('update_haven_inquiry',[support,0,'closed','','',null]),'P0002');
    await db.exec("set role anon; select set_config('request.jwt.claim.role','anon',false);");
    await denied(()=>rpc('update_haven_inquiry',[team,1,'closed','','',null]),'42501');
    await db.exec("reset role; select set_config('request.jwt.claim.role','service_role',false);");
  });
  await check('legacy browser snapshots cannot overwrite server-owned transcripts', async () => {
    const before = await scalar('select messages from haven_sessions where id=$1', [audit]);
    await rpc('sync_haven_review', [audit, review, JSON.stringify([{ role: 'agent', content: 'forged' }]), new Date().toISOString(), true, false]);
    assert.deepEqual(await scalar('select messages from haven_sessions where id=$1', [audit]), before);
    assert.equal(await scalar('select clicked_booking_link from brand_reviews where id=$1', [review]), true);
  });
  await check('three strikes: first recorded, second yellow, third red, retries do not count', async () => {
    const flag = (key) => rpc('apply_haven_ai_flag', [review, null, key, 'Abusive language', service]);
    assert.equal((await flag('test:first')).flagStatus, 'white'); assert.equal((await flag('test:first')).changed, false);
    assert.equal((await flag('test:second')).flagStatus, 'yellow');
    assert.equal(await count('flag_alert_notifications', 'review_id=$1', [review]), 1);
    const [notification] = await query('select * from flag_alert_notifications where review_id=$1', [review]);
    assert.equal(notification.full_name, 'Test Owner'); assert.equal(notification.source, 'service'); assert.equal(notification.session_id, service); assert.equal(notification.customer_required, true);
    assert.equal(await scalar('select flag_status from haven_chat_visitors where id=$1', [visitor]), 'yellow');
    assert.equal((await flag('test:third')).flagStatus, 'red');
    assert.equal(await count('flag_alert_notifications', 'review_id=$1', [review]), 2);
  });
  await check('admin restriction propagates across linked chats, and explicit clearing works', async () => {
    await rpc('set_haven_moderation_flag', ['owner@example.com', null, 'red', 'Manual review', null]);
    assert.equal(await scalar('select flag_status from haven_chat_visitors where id=$1', [visitor]), 'red');
    assert.equal((await rpc('apply_haven_ai_flag', [review, null, 'test:restricted', 'Again', audit])).flagStatus, 'red');
    await rpc('set_haven_moderation_flag', [null, visitor, 'white', null, null]);
    assert.equal(await scalar('select flag_status from brand_reviews where id=$1', [review]), 'white');
    assert.equal(await scalar('select flag_status from haven_chat_visitors where id=$1', [visitor]), 'white');
  });
  await check('unrestricted audit chat persists new turns and keeps its original transcript', async () => {
    const before = await scalar('select messages from haven_sessions where id=$1', [audit]);
    await rpc('set_haven_moderation_flag', ['owner@example.com', null, 'red', 'Review', audit]);
    await rpc('set_haven_moderation_flag', ['owner@example.com', null, 'white', 'Access restored', audit]);
    await ensure(audit, 'audit', review);
    const id = randomUUID();
    await rpc('begin_haven_turn', [audit, id, 'I am back after access was restored', false, true, false, hash]);
    await rpc('complete_haven_turn', [audit, id, JSON.stringify({ ok: true, text: 'Let us continue with your brand.' }), false, 'CUSTOMER_SUPPORT_OPEN']);
    const after = await scalar('select messages from haven_sessions where id=$1', [audit]);
    assert.deepEqual(after.slice(0,before.length), before);
    assert.equal(after.at(-2).content, 'I am back after access was restored');
    assert.equal(after.at(-1).content, 'Let us continue with your brand.');
    assert.equal(await count('haven_sessions', "review_id=$1 and scope='audit'", [review]), 1);
  });
  await check('Calendly retries deduplicate bookings, cancellations win and reschedules remain separate', async () => {
    const data = { invitee_uri: 'https://api.calendly.com/scheduled_events/event/invitees/person', event_uri: 'https://api.calendly.com/scheduled_events/event',
      email: 'owner@example.com', full_name: 'Test Owner', event_name: 'Strategy call', start_time: '2026-10-30T12:00:00Z', status: 'active', source: 'lead', review_id: review };
    const save = (patch = {}) => rpc('record_strategy_call_booking', [JSON.stringify({ ...data, ...patch })]);
    await save(); await save(); assert.equal(await count('strategy_call_bookings'), 1);
    await save({ status: 'canceled' }); await save();
    assert.equal(await scalar('select status from strategy_call_bookings where invitee_uri=$1', [data.invitee_uri]), 'canceled');
    await save({ invitee_uri: data.invitee_uri + '-rescheduled', start_time: '2026-11-01T12:00:00Z' });
    assert.equal(await count('strategy_call_bookings'), 2);
    await denied(() => save({ invitee_uri: data.invitee_uri + '-invalid', start_time: null }));
    await db.exec("set role anon; select set_config('request.jwt.claim.role','anon',false);");
    await denied(() => query('select * from strategy_call_bookings'), '42501');
    await denied(() => save(), '42501');
    await db.exec("reset role; select set_config('request.jwt.claim.role','service_role',false);");
  });
  await check('guest alerts identify the support session without inventing a name/email', async () => {
    const guest = randomUUID(), session = randomUUID(); await ensure(session, 'support', null, hash, guest);
    await rpc('apply_haven_ai_flag', [null, guest, 'test:guest-first', 'Guest misuse', session]);
    await rpc('apply_haven_ai_flag', [null, guest, 'test:guest-second', 'Guest misuse', session]);
    const [notification] = await query('select * from flag_alert_notifications where visitor_id=$1', [guest]);
    assert.equal(notification.source, 'support'); assert.equal(notification.session_id, session); assert.equal(notification.email, null); assert.equal(notification.customer_required, false);
    await rpc('set_haven_moderation_flag', [null, guest, 'red', 'Manual guest restriction', session]);
    await ensure(randomUUID(), 'support', null, hash, guest);
    assert.equal(await scalar('select flag_status from haven_chat_visitors where id=$1', [guest]), 'red');
    // Linking may not launder a restriction into an unrestricted saved review.
    const newReview = { ...payload, id: randomUUID(), email: 'guest@example.com' }; const newAudit = randomUUID();
    await create(newReview, newAudit); await ensure(newAudit, 'audit', newReview.id, hash, guest);
    assert.equal(await scalar('select flag_status from brand_reviews where id=$1', [newReview.id]), 'red');
  });
  await check('public roles cannot mutate leads, read private proofs, or invoke privileged RPCs', async () => {
    await db.exec("set role anon; select set_config('request.jwt.claim.role','anon',false);");
    await denied(() => query("update brand_reviews set flag_status='white'"), '42501');
    await denied(() => query('select * from review_access_tokens'), '42501');
    await denied(() => rpc('set_haven_moderation_flag', ['owner@example.com', null, 'red', null, null]), '42501');
    await denied(() => query('select * from admin_lead_overview'), '42501');
    await denied(()=>rpc('haven_operational_stats',[]),'42501');
    await db.exec("reset role; select set_config('request.jwt.claim.role','service_role',false);");
  });
  await check('operational snapshot reports aggregate counts without exposing conversations or identities',async()=>{
    const stats=await rpc('haven_operational_stats',[]);
    for(const key of ['gemini_replies','groq_replies','failed_turns','stale_turns','pending_flag_events'])assert.equal(typeof stats[key],'number');
    assert.ok(!JSON.stringify(stats).includes('owner@example.com'));assert.ok(stats.observed_at);
  });
  await check('lead deletion removes linked sessions, turns and proofs while retaining purchases', async () => {
    await query('insert into playbook_purchases(email,reference,amount) values($1,$2,100)', ['owner@example.com', 'UNSEEN_offline']);
    assert.equal((await rpc('admin_delete_lead', [review])).deleted, true);
    assert.equal(await count('haven_sessions', 'review_id=$1', [review]), 0);
    assert.equal(await count('haven_chat_turns', 'session_id=$1', [support]), 0);
    assert.equal(await count('review_access_tokens', 'review_id=$1', [review]), 0);
    assert.equal(await count('playbook_purchases'), 1);
    assert.equal((await rpc('admin_delete_lead', [review])).deleted, false);
  });
  await check('OTP is single-use, attempts are capped and inbox proof creates a scoped grant', async () => {
    const id=randomUUID(), good='a'.repeat(64), grant='b'.repeat(64);
    const reserve=await rpc('reserve_playbook_recovery',[id,'UNSEEN_security','buyer@example.com',good]);
    assert.equal(reserve.created,true);
    const cooldown=await rpc('reserve_playbook_recovery',[randomUUID(),'UNSEEN_security','buyer@example.com','c'.repeat(64)]);
    assert.equal(cooldown.created,false); assert.equal(cooldown.id,id);
    assert.equal((await rpc('redeem_playbook_recovery',[id,good,grant])).verified,false);
    await query('update playbook_recovery_otps set sent_at=now() where id=$1',[id]);
    assert.equal((await rpc('redeem_playbook_recovery',[id,'d'.repeat(64),grant])).verified,false);
    assert.equal((await rpc('redeem_playbook_recovery',[id,good,grant])).verified,true);
    assert.equal((await rpc('redeem_playbook_recovery',[id,good,'e'.repeat(64)])).verified,false);
    assert.equal(await count('playbook_download_grants'),1);
    const row=(await query('select * from playbook_download_grants'))[0];
    assert.equal(row.email,'buyer@example.com'); assert.equal(row.reference,'UNSEEN_security');
    assert.equal(row.token_hash,grant);
    const locked=randomUUID();
    await rpc('reserve_playbook_recovery',[locked,'UNSEEN_locked','buyer@example.com',good]);
    await query('update playbook_recovery_otps set sent_at=now() where id=$1',[locked]);
    for(let n=0;n<5;n++) assert.equal((await rpc('redeem_playbook_recovery',[locked,'d'.repeat(64),grant])).verified,false);
    assert.equal((await rpc('redeem_playbook_recovery',[locked,good,'f'.repeat(64)])).verified,false);
    const expired=randomUUID(); await rpc('reserve_playbook_recovery',[expired,'UNSEEN_expired','buyer@example.com',good]);
    await query("update playbook_recovery_otps set sent_at=now(),expires_at=now()-interval '1 second' where id=$1",[expired]);
    assert.equal((await rpc('redeem_playbook_recovery',[expired,good,'f'.repeat(64)])).verified,false);
  });
  await check('security limits fail closed and public roles cannot read OTPs or redeem grants', async () => {
    for(let n=0;n<3;n++)assert.equal(await rpc('consume_playbook_limit',['test-rate',3,3600]),true);
    assert.equal(await rpc('consume_playbook_limit',['test-rate',3,3600]),false);
    await db.exec("set role anon; select set_config('request.jwt.claim.role','anon',false);");
    for(const table of ['playbook_recovery_otps','playbook_download_grants','playbook_checkout_policy','playbook_security_limits'])
      await denied(()=>query('select * from '+table),'42501');
    await denied(()=>rpc('reserve_playbook_recovery',[randomUUID(),'UNSEEN_forged','buyer@example.com','a'.repeat(64)]),'42501');
    await db.exec("reset role; select set_config('request.jwt.claim.role','service_role',false);");
  });
  console.log(`PostgreSQL checks: ${passed} passed, 0 failed`);
} finally { await db.close(); }

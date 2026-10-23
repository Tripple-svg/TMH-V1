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
    '20261019000000_user_flags.sql',
    '20261021000000_playbook_purchases.sql',
    '20261021000001_flag_alert_notifications.sql',
    '20261023000000_review_security.sql',
    '20261023000002_admin_delete_lead.sql',
    '20261023000003_haven_conversations.sql',
    '20261023000004_moderation.sql',
    '20261023000005_purchase_delivery.sql',
  ].map((name) => `migrations/${name}`)]) {
    await db.exec(await readFile(new URL(`../supabase/${file}`, import.meta.url), 'utf8'));
  }
  await check('all selected migrations compile and commit', async () => {
    assert.equal(await count('brand_reviews'), 0);
    assert.equal(await count('haven_chat_turns'), 0);
  });
  const review = randomUUID(), audit = randomUUID(), visitor = randomUUID(), support = randomUUID(), service = randomUUID();
  const payload = { id: review, email: 'owner@example.com', full_name: 'Test Owner', brand_name: 'Test Brand', whatsapp: '+2340000000000', platform_type: 'none', agreed_to_terms: true };
  const create = (value = payload, session = audit, token = hash) => rpc('create_haven_review', [JSON.stringify(value), session, token]);
  const ensure = (id, scope, linked = null, token = hash, who = visitor) => rpc('ensure_haven_conversation', [who, token, id, scope, linked, scope === 'service' ? 'web' : null, '2026-10-23']);
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
  await check('legacy browser snapshots cannot overwrite server-owned transcripts', async () => {
    const before = await scalar('select messages from haven_sessions where id=$1', [audit]);
    await rpc('sync_haven_review', [audit, review, JSON.stringify([{ role: 'agent', content: 'forged' }]), new Date().toISOString(), true, false]);
    assert.deepEqual(await scalar('select messages from haven_sessions where id=$1', [audit]), before);
    assert.equal(await scalar('select clicked_booking_link from brand_reviews where id=$1', [review]), true);
  });
  await check('AI warning is yellow only, once per transition, with saved name, scope and session', async () => {
    const flag = (key) => rpc('apply_haven_ai_flag', [review, null, key, 'Abusive language', service]);
    assert.equal((await flag('test:first')).changed, true); assert.equal((await flag('test:first')).changed, false);
    assert.equal((await flag('test:second')).flagStatus, 'yellow');
    assert.equal(await count('flag_alert_notifications', 'review_id=$1', [review]), 1);
    const [notification] = await query('select * from flag_alert_notifications where review_id=$1', [review]);
    assert.equal(notification.full_name, 'Test Owner'); assert.equal(notification.source, 'service'); assert.equal(notification.session_id, service); assert.equal(notification.customer_required, true);
    assert.equal(await scalar('select flag_status from haven_chat_visitors where id=$1', [visitor]), 'yellow');
  });
  await check('admin restriction propagates across linked chats, and explicit clearing works', async () => {
    await rpc('set_haven_moderation_flag', ['owner@example.com', null, 'red', 'Manual review', null]);
    assert.equal(await scalar('select flag_status from haven_chat_visitors where id=$1', [visitor]), 'red');
    assert.equal((await rpc('apply_haven_ai_flag', [review, null, 'test:restricted', 'Again', audit])).flagStatus, 'red');
    await rpc('set_haven_moderation_flag', [null, visitor, 'white', null, null]);
    assert.equal(await scalar('select flag_status from brand_reviews where id=$1', [review]), 'white');
    assert.equal(await scalar('select flag_status from haven_chat_visitors where id=$1', [visitor]), 'white');
  });
  await check('guest alerts identify the support session without inventing a name/email', async () => {
    const guest = randomUUID(), session = randomUUID(); await ensure(session, 'support', null, hash, guest);
    await rpc('apply_haven_ai_flag', [null, guest, 'test:guest', 'Guest misuse', session]);
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
    await db.exec("reset role; select set_config('request.jwt.claim.role','service_role',false);");
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
  console.log(`PostgreSQL checks: ${passed} passed, 0 failed`);
} finally { await db.close(); }

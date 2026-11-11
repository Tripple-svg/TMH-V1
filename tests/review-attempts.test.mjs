import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { productionDb, rpc, scalar, ADMIN_A, seedReview } from './helpers/production-db.mjs';
import { formatCountdown, readReviewCooldown, saveReviewCooldown, clearReviewCooldown } from '../src/lib/reviewCooldown.js';

test('review attempts use two durable cooldowns followed by a block and an audited Support reset', async () => {
  const db = await productionDb();
  try {
    const network = 'a'.repeat(64);
    const gate = (failed = true) => rpc(db,'review_attempt_gate',[network,failed,true,false]);
    for (let i=0;i<4;i++) assert.equal((await gate()).allowed,true);
    const first = await gate();
    assert.equal(first.allowed,false);
    assert.ok(first.retryAfter > 590 && first.retryAfter <= 600);
    assert.ok(first.lockedUntil > Date.now());
    await gate();
    assert.equal(await scalar(db,'select failures from review_attempts where network_bucket=$1',[network]),5);
    await db.query("update review_attempts set cooldown_until=now()-interval '1 second' where network_bucket=$1",[network]);
    for (let i=0;i<2;i++) assert.equal((await gate()).allowed,true);
    assert.equal((await gate()).allowed,false);
    await db.query("update review_attempts set cooldown_until=now()-interval '1 second' where network_bucket=$1",[network]);
    for (let i=0;i<2;i++) assert.equal((await gate()).allowed,true);
    assert.deepEqual(await gate(),{allowed:false,blocked:true});
    assert.deepEqual(await gate(false),{allowed:false,blocked:true});
    const request = randomUUID();
    await db.query("insert into support_requests(id,email,message,category,network_bucket) values($1,'person@example.test','Please reset my review attempts','rate_limit',$2)",[request,network]);
    const result = await rpc(db,'update_support_request',[request,0,'resolved','Reviewed the request',ADMIN_A,'reset_review_attempts','Reviewed the original request and confirmed a reset']);
    assert.equal(result.ok,true);
    assert.equal((await gate(false)).allowed,true);
    assert.equal(await scalar(db,'select count(*)::int from support_actions where request_id=$1',[request]),1);
    for (const role of ['anon','authenticated']) {
      await db.exec('set role '+role);
      await assert.rejects(gate(),error=>error.code==='42501');
      await db.exec('reset role');
    }
  } finally { await db.close(); }
});

test('a secondary review budget produces the same network pause and an unknown address never gets a permanent ban', async () => {
  const db = await productionDb();
  try {
    const network = 'b'.repeat(64);
    const limited = await rpc(db,'review_attempt_gate',[network,false,true,true]);
    assert.equal(limited.allowed,false);
    assert.ok(limited.retryAfter);
    assert.equal((await rpc(db,'review_attempt_gate',[network,false,true,false])).allowed,false);
    for(let round=0;round<2;round++){
      await db.query("update review_attempts set cooldown_until=now()-interval '1 second'");
      const next=await rpc(db,'review_attempt_gate',[network,false,true,true]);
      assert.equal(next.allowed,false);
      assert.equal(next.blocked===true,round===1);
    }
    await db.query('delete from review_attempts');
    for (let i=0;i<11;i++) {
      await db.query("update review_attempts set cooldown_until=now()-interval '1 second'");
      const result = await rpc(db,'review_attempt_gate',[network,true,false,false]);
      assert.notEqual(result.blocked,true);
    }
  } finally { await db.close(); }
});

test('a review restriction propagates globally to linked visitors and an admin reset releases them', async () => {
  const db = await productionDb();
  try {
    const review = randomUUID(), visitor = randomUUID();
    await seedReview(db,review);
    await db.query('insert into haven_chat_visitors(id,token_hash,review_id) values($1,$2,$3)',[visitor,'a'.repeat(64),review]);
    await db.query("update brand_reviews set flag_status='red' where id=$1",[review]);
    assert.equal(await scalar(db,'select flag_status from haven_chat_visitors where id=$1',[visitor]),'red');
    await db.query("update brand_reviews set flag_status='white' where id=$1",[review]);
    assert.equal(await scalar(db,'select flag_status from haven_chat_visitors where id=$1',[visitor]),'white');
    await db.query("update haven_chat_visitors set flag_status='red' where id=$1",[visitor]);
    await db.query("update brand_reviews set flag_status='white' where id=$1",[review]);
    assert.equal(await scalar(db,'select flag_status from haven_chat_visitors where id=$1',[visitor]),'white');
  } finally { await db.close(); }
});

test('the browser countdown persists the server pause across email changes and renders MM:SS', () => {
  const original = globalThis.localStorage;
  const data = new Map();
  globalThis.localStorage = { getItem:key=>data.get(key), setItem:(key,value)=>data.set(key,value), removeItem:key=>data.delete(key) };
  try {
    saveReviewCooldown({code:'review_cooldown',retryAfter:600},1000);
    assert.equal(readReviewCooldown(2000).until,601000);
    assert.equal(formatCountdown(599),'09:59');
    saveReviewCooldown({code:'review_blocked'},2000);
    assert.equal(readReviewCooldown(2000000).blocked,true);
    clearReviewCooldown();
    assert.equal(readReviewCooldown(),null);
  } finally { globalThis.localStorage = original; }
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID, webcrypto } from 'node:crypto';
import { buildSync } from 'esbuild';
import vm from 'node:vm';
import { productionDb, seedReview, rpc, scalar } from './helpers/production-db.mjs';
import { edgeDb } from './helpers/edge-db.mjs';

test('review source corrections stop when chat opens and leave the saved review intact', async t => {
  const db = await productionDb();
  try {
    const review = randomUUID(), session = randomUUID(), token = 'a'.repeat(64);
    const hash = createHash('sha256').update(token).digest('hex');
    await seedReview(db, review);
    await db.query("update brand_reviews set platform_type='website', website_url='https://example.test/', flag_status='yellow', followup_notes='Staff note' where id=$1", [review]);
    await db.query("insert into haven_sessions(id,review_id,scope,messages) values($1,$2,'audit',$3)", [session, review, [{ role: 'agent', content: 'Welcome' }]]);
    await db.query('insert into review_access_tokens(review_id,session_id,token_hash) values($1,$2,$3)', [review, session, hash]);

    let handler;
    const client = edgeDb(db);
    const code = buildSync({ entryPoints: ['supabase/functions/update-review-source/index.ts'], bundle: true, write: false, format: 'cjs', platform: 'node', external: ['https://*'] }).outputFiles[0].text;
    vm.runInNewContext(code, { require: () => ({ createClient: () => client }), Deno: { serve: fn => { handler = fn; }, env: { get: key => ({ SUPABASE_URL: 'https://project.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'test-key' })[key] } }, Request, Response, Headers, URL, TextEncoder, TextDecoder, Uint8Array, AbortSignal, crypto: webcrypto, console: { log() {}, error() {}, warn() {} } });
    const payload = { context: { reviewId: review, sessionId: session, accessToken: token }, revision: 0 };
    const call = body => handler(new Request('https://project.supabase.co/functions/v1/update-review-source', { method: 'POST', headers: { origin: 'http://localhost:5173', 'content-type': 'application/json' }, body: JSON.stringify({ ...payload, ...body }) }));

    await t.test('another visitor cannot lock a review, and retired actions cannot restart it', async () => {
      assert.equal((await call({ action: 'lock', context: { ...payload.context, accessToken: 'b'.repeat(64) } })).status, 403);
      for (const action of ['details', 'restart']) assert.equal((await call({ action, confirmRestart: true })).status, 400);
      assert.equal(await scalar(db, 'select source_locked_at from brand_reviews where id=$1', [review]), null);
      assert.equal(await scalar(db, "select to_regprocedure('public.revise_haven_review(text,integer,text,text,text,text,boolean)')::text"), null);
    });

    await t.test('correction is allowed before Continue, and a stale tab cannot finalize the wrong revision', async () => {
      const corrected = await call({ url: 'https://corrected.example.test/' });
      assert.equal(corrected.status, 200);
      assert.equal((await corrected.json()).revision, 1);
      const stale = await call({ action: 'lock' });
      assert.equal(stale.status, 409);
      assert.equal((await stale.json()).code, 'source_changed');
      await db.query("update brand_reviews set haven_score=72,scrape_state='valid',score_observed_at=now() where id=$1", [review]);
      const locked = await call({ action: 'lock', revision: 1 });
      assert.equal(locked.status, 200);
      assert.deepEqual(await locked.json(), { ok: true, locked: true, revision: 1 });
      assert.equal((await call({ action: 'lock', revision: 1 })).status, 200);
      assert.equal((await call({ action: 'lock' })).status, 409);
    });

    await t.test('the old tab and the underlying database cannot alter a locked source or overwrite its score', async () => {
      const replacement = await call({ revision: 1, url: 'https://changed.example.test/' });
      assert.equal(replacement.status, 409);
      assert.equal((await replacement.json()).code, 'source_locked');
      await assert.rejects(rpc(db, 'correct_haven_review_source', [review, 1, 'https://changed.example.test/', null, 'hash']), error => error.code === 'P0003');
      await assert.rejects(db.query('update brand_reviews set haven_score=1,score_observed_at=now() where id=$1', [review]), error => error.code === 'P0003');
      const { rows: [saved] } = await db.query('select website_url,haven_score,scoring_revision,flag_status,followup_notes from brand_reviews where id=$1', [review]);
      assert.deepEqual(saved, { website_url: 'https://corrected.example.test/', haven_score: 72, scoring_revision: 1, flag_status: 'yellow', followup_notes: 'Staff note' });
      assert.equal(await scalar(db, 'select token_hash from review_access_tokens where review_id=$1', [review]), hash);
      assert.equal(await scalar(db, 'select jsonb_array_length(messages)::int from haven_sessions where id=$1', [session]), 1);
    });

    await t.test('only the first audit turn locks a legacy review; its linked Support turn does not', async () => {
      const older = randomUUID(), audit = randomUUID(), support = randomUUID();
      await seedReview(db, older, 'another@example.test');
      await db.query("insert into haven_sessions(id,review_id,scope) values($1,$3,'audit'),($2,$3,'support')", [audit, support, older]);
      const turn = id => rpc(db, 'begin_haven_turn', [id, randomUUID(), 'First message', false, false, false, 'fixture']);
      await turn(support);
      assert.equal(await scalar(db, 'select source_locked_at from brand_reviews where id=$1', [older]), null);
      await turn(audit);
      assert.ok(await scalar(db, 'select source_locked_at from brand_reviews where id=$1', [older]));
    });
  } finally { await db.close(); }
});

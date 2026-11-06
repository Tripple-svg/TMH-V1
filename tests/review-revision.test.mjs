import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomUUID,webcrypto} from 'node:crypto';
import {buildSync} from 'esbuild';
import vm from 'node:vm';
import {productionDb,seedReview,rpc,scalar} from './helpers/production-db.mjs';
import {edgeDb} from './helpers/edge-db.mjs';

test('owned review corrections and restart use real PostgreSQL without resetting access or safety state',async t=>{
 const db=await productionDb();try{
  const review=randomUUID(),session=randomUUID(),support=randomUUID(),token='a'.repeat(64),hash=createHash('sha256').update(token).digest('hex');
  await seedReview(db,review);await seedReview(db,'unrelated-review','another@example.test');
  await db.query("insert into haven_sessions(id,review_id,scope,messages,conversation_memory,routing_state) values($1,$3,'audit',$4,$5,$6),($2,$3,'support',$4,$5,$6)",[session,support,review,[{role:'user',content:'Old goal'}],{version:1,facts:{goal:'Old goal'}},{version:2,need:'foundational',permission:'playbook'}]);
  await db.query('insert into review_access_tokens(review_id,session_id,token_hash) values($1,$2,$3)',[review,session,hash]);
  await db.query("update brand_reviews set followup_notes='Staff note',flag_status='yellow' where id=$1",[review]);
  let handler;const client=edgeDb(db);
  const code=buildSync({entryPoints:['supabase/functions/update-review-source/index.ts'],bundle:true,write:false,format:'cjs',platform:'node',external:['https://*']}).outputFiles[0].text;
  vm.runInNewContext(code,{require:()=>({createClient:()=>client}),Deno:{serve:fn=>{handler=fn;},env:{get:key=>({SUPABASE_URL:'https://project.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'test-key'})[key]}},Request,Response,Headers,URL,TextEncoder,TextDecoder,Uint8Array,AbortSignal,crypto:webcrypto,console:{log(){},error(){},warn(){}}});
  const payload={action:'details',context:{reviewId:review,sessionId:session,accessToken:token},revision:0,name:'Updated Owner',brandName:'Updated Brand',whatsapp:'+2340000000000',mainGoal:'Sell the new offer'};
  const call=body=>handler(new Request('https://project.supabase.co/functions/v1/update-review-source',{method:'POST',headers:{origin:'http://localhost:5173','content-type':'application/json'},body:JSON.stringify(body)}));
  await t.test('guessed review ID or wrong capability never changes a record',async()=>{
   assert.equal((await call({...payload,context:{...payload.context,accessToken:'b'.repeat(64)}})).status,403);
   assert.equal((await call({...payload,context:{...payload.context,reviewId:randomUUID()}})).status,403);
   assert.equal(await scalar(db,'select scoring_revision from brand_reviews where id=$1',[review]),0);
  });
  await t.test('restart requires explicit confirmation and rejects invalid or oversized fields',async()=>{
   assert.equal((await call({...payload,action:'restart'})).status,400);
   assert.equal((await call({...payload,name:'x'.repeat(121)})).status,400);
   assert.equal((await call({...payload,action:'unknown'})).status,400);
  });
  await t.test('valid edits update authoritative profile and memory while preserving email, access, flags and staff notes',async()=>{
   const response=await call({...payload,email:'attacker@example.test',flag_status:'white'});assert.equal(response.status,200);const data=await response.json();assert.equal(data.revision,1);assert.equal(data.review.brand_name,'Updated Brand');assert.ok(!JSON.stringify(data).includes(hash));
   const row=(await db.query('select email,flag_status,followup_notes,scoring_revision from brand_reviews where id=$1',[review])).rows[0];assert.equal(row.email,'synthetic@example.test');assert.equal(row.flag_status,'yellow');assert.equal(row.followup_notes,'Staff note');
   assert.equal(await scalar(db,'select token_hash from review_access_tokens where review_id=$1',[review]),hash);
   assert.deepEqual(await scalar(db,'select conversation_memory from haven_sessions where id=$1',[support]),{version:1,facts:{}});
   assert.equal(await scalar(db,'select jsonb_array_length(messages)::int from haven_sessions where id=$1',[session]),1);
  });
  await t.test('stale revisions and active replies reject edits atomically',async()=>{
   assert.equal((await call(payload)).status,409);
   const turn=randomUUID();await db.query("insert into haven_chat_turns(id,session_id,status,input_hash) values($1,$2,'processing','test-hash')",[turn,support]);
   assert.equal((await call({...payload,revision:1,brandName:'Should not save'})).status,409);
   assert.equal(await scalar(db,'select brand_name from brand_reviews where id=$1',[review]),'Updated Brand');
   await db.query("update haven_chat_turns set status='failed' where id=$1",[turn]);
  });
  await t.test('confirmed restart clears only audit history and derived findings, not moderation or shared budgets',async()=>{
   await rpc(db,'consume_playbook_limit',['test-review-limit',1,900]);
   const result=await call({...payload,revision:1,action:'restart',confirmRestart:true});assert.equal(result.status,200);
   await rpc(db,'sync_haven_review',[session,review,[{role:'user',content:'Stale browser snapshot'}],new Date().toISOString(),false,false]);
   assert.equal(await scalar(db,'select jsonb_array_length(messages)::int from haven_sessions where id=$1',[session]),0);
   assert.equal(await scalar(db,'select jsonb_array_length(messages)::int from haven_sessions where id=$1',[support]),1);
   assert.equal(await scalar(db,'select flag_status from brand_reviews where id=$1',[review]),'yellow');
   assert.equal(await rpc(db,'consume_playbook_limit',['test-review-limit',1,900]),false);
   assert.equal(await scalar(db,'select full_name from brand_reviews where id=$1',['unrelated-review']),'Synthetic Owner');
   await db.query("update brand_reviews set flag_status='red' where id=$1",[review]);assert.equal((await call({...payload,revision:2})).status,403);
  });
  await t.test('the mutation RPC is unavailable to public and authenticated roles',async()=>{
   for(const role of ['anon','authenticated']){
    await db.exec('set role '+role);await assert.rejects(rpc(db,'revise_haven_review',[review,2,'Name','Brand','+2340000','Goal',true]),error=>error.code==='42501');await db.exec('reset role');
   }
  });
 }finally{await db.close();}
});

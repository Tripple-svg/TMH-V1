import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {buildSync} from 'esbuild';
import {PGlite} from '@electric-sql/pglite';

const migration=readFileSync('supabase/migrations/20261031000004_ai_budgets.sql','utf8');
const hash=n=>String(n).repeat(64);

test('PostgreSQL AI budgets: concurrent admission, all-or-nothing counters, settlement, rollover and private kill switches',async t=>{
  const db=new PGlite();
  const scalar=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
  const call=(name,args=[])=>scalar(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')})`,args);
  const reserve=(patch={})=>{
    const args={id:webcrypto.randomUUID(),kind:'chat',visitor:hash(1),review:hash(2),network:hash(3),tokens:100,calls:3,...patch};
    return call('reserve_ai_budget',[args.id,args.kind,args.visitor,args.review,args.network,args.tokens,args.calls]);
  };
  try{
    await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;
      create function auth.role() returns text language sql as $$select current_setting('request.jwt.claim.role',true)$$;
      grant usage on schema auth,public to anon,authenticated,service_role;
      select set_config('request.jwt.claim.role','service_role',false);`);
    await db.exec(migration);
    await t.test('default ceilings admit a full 5 MiB image and a useful multi-turn conversation with actual usage refunds',async()=>{
      const api=budgetModule(async()=>Response.json({}));
      const image='data:image/png;base64,'+Buffer.alloc(5*1024*1024).toString('base64');
      const plan=api.aiBudgetPlan('gemini',{prompt:'x'.repeat(100000),image},4096,2,true);
      const max=plan.tokens*2+120000;
      assert.ok(max<100000000);assert.ok(max>20000000);
      const initial=await reserve({tokens:max});assert.equal(initial.allowed,true);
      await call('settle_ai_budget',[initial.id,10000,1]);
      for(let i=0;i<40;i++){
        const turn=await reserve({tokens:400000});assert.equal(turn.allowed,true);
        await call('settle_ai_budget',[turn.id,10000,1]);
      }
      assert.equal(Number(await scalar("select calls from ai_budget_counters where bucket='global'")),41);
      assert.equal(Number(await scalar("select tokens from ai_budget_counters where bucket='global'")),410000);
      await db.exec('delete from ai_budget_reservations;delete from ai_budget_counters');
    });
    await t.test('global calls and tokens admit exactly one concurrent full retry/fallback reservation',async()=>{
      await db.exec('update ai_budget_settings set global_daily_calls=3,global_daily_tokens=100');
      const results=await Promise.all(Array.from({length:12},(_,i)=>reserve({visitor:hash(4),review:null,network:hash(5)})));
      assert.equal(results.filter(r=>r.allowed).length,1);
      const rows=(await db.query('select * from ai_budget_counters')).rows;
      assert.equal(rows.length,3);assert.ok(rows.every(row=>Number(row.calls)===3&&Number(row.tokens)===100));
      assert.equal(await scalar('select count(*)::int from ai_budget_reservations'),1);
    });
    await t.test('settlement releases only unused calls, is idempotent and bills overruns in full',async()=>{
      const id=await scalar('select id from ai_budget_reservations limit 1');
      assert.equal(await call('settle_ai_budget',[id,40,1]),true);
      assert.equal(await call('settle_ai_budget',[id,0,0]),false);
      assert.equal(Number(await scalar("select tokens from ai_budget_counters where bucket='global'")),40);
      await db.exec('update ai_budget_settings set global_daily_calls=100,global_daily_tokens=1000');
      const extra=webcrypto.randomUUID();assert.equal((await reserve({id:extra,tokens:100,calls:1})).allowed,true);
      await call('settle_ai_budget',[extra,2000,1]);
      assert.equal(Number(await scalar("select tokens from ai_budget_counters where bucket='global'")),2040);
      assert.equal((await reserve({tokens:1,calls:1})).allowed,false);
    });
    await t.test('network / visitor / review rejection never partially charges another bucket',async()=>{
      await db.exec('delete from ai_budget_reservations;delete from ai_budget_counters;update ai_budget_settings set global_daily_tokens=100000,global_daily_calls=1000,network_daily_tokens=100,visitor_daily_tokens=100,review_daily_tokens=100');
      assert.equal((await reserve({tokens:100,calls:1})).allowed,true);
      const before=(await db.query('select * from ai_budget_counters order by bucket')).rows;
      for(const patch of [{visitor:hash(8),review:hash(9)},{network:hash(8),review:hash(9)},{visitor:hash(8),network:hash(9)}]){
        const denied=await reserve({tokens:1,calls:1,...patch});assert.equal(denied.allowed,false);assert.ok(denied.retryAfter>=1&&denied.retryAfter<=86400);
        assert.deepEqual((await db.query('select * from ai_budget_counters order by bucket')).rows,before);
      }
    });
    await t.test('transaction rollback and malformed reservations do not spend',async()=>{
      const before=await scalar('select count(*)::int from ai_budget_reservations');
      await db.exec('begin');await reserve({visitor:hash(7),review:null,network:hash(6),tokens:1,calls:1});await db.exec('rollback');
      assert.equal(await scalar('select count(*)::int from ai_budget_reservations'),before);
      for(const patch of [{calls:4},{tokens:-1},{network:'unhashed-network'},{visitor:null,review:null}])await assert.rejects(()=>reserve(patch),e=>e.code==='22023');
      assert.equal(await scalar('select count(*)::int from ai_budget_reservations'),before);
    });
    await t.test('old day reservations retain their charge and cannot consume today twice',async()=>{
      await db.exec(`delete from ai_budget_reservations;delete from ai_budget_counters;
        insert into ai_budget_counters(day,bucket,calls,tokens) values((now() at time zone 'UTC')::date-1,'global',999999,9999999999);`);
      const today=await reserve({tokens:100,calls:1});assert.equal(today.allowed,true);
      assert.equal(Number(await scalar("select calls from ai_budget_counters where bucket='global' and day=(now() at time zone 'UTC')::date")),1);
      await assert.rejects(()=>reserve({id:today.id,tokens:100,calls:1}),e=>e.code==='23505');
    });
    await t.test('switches pause only their own AI route and pause does not charge',async()=>{
      await db.exec('delete from ai_budget_reservations;delete from ai_budget_counters;update ai_budget_settings set chat_enabled=false,scoring_enabled=true');
      assert.equal((await reserve()).paused,true);assert.equal(await scalar('select count(*)::int from ai_budget_counters'),0);
      assert.equal((await reserve({kind:'scoring',calls:1})).allowed,true);
      await db.exec('update ai_budget_settings set chat_enabled=true,scoring_enabled=false');
      assert.equal((await reserve({kind:'scoring'})).paused,true);
    });
    await t.test('public/customer roles cannot read, write or call budget controls',async()=>{
      for(const role of ['anon','authenticated']){
        await db.exec(`set role ${role};select set_config('request.jwt.claim.role','${role}',false)`);
        for(const table of ['ai_budget_settings','ai_budget_counters','ai_budget_reservations'])await assert.rejects(()=>db.query(`select * from ${table}`),e=>e.code==='42501');
        await assert.rejects(()=>reserve(),e=>e.code==='42501');
        await assert.rejects(()=>call('settle_ai_budget',[webcrypto.randomUUID(),0,0]),e=>e.code==='42501');
        await db.exec('reset role');
      }
    });
  }finally{await db.close();}
});

function budgetModule(send){
  const code=buildSync({entryPoints:['supabase/functions/_shared/ai-budget.ts'],bundle:true,write:false,format:'cjs',platform:'node'}).outputFiles[0].text;
  const module={exports:{}};
  vm.runInNewContext(code,{module,exports:module.exports,crypto:webcrypto,TextEncoder,TextDecoder,Uint8Array,Request,Response,Headers,AbortSignal,console:{error(){}},fetch:send,setTimeout:fn=>{fn();},Deno:{env:{get(){}}}});
  return module.exports;
}
const req=()=>new Request('https://project.supabase.co',{headers:{'x-forwarded-for':'192.0.2.5'}});

test('AI reservation retains the failed retry charge and unknown fallback charge after a known-usage partial response',async()=>{
  let sends=0;const writes=[];
  const api=budgetModule(async()=>{
    sends++;if(sends===1)return new Response('',{status:503});
    if(sends===2)return Response.json({usageMetadata:{promptTokenCount:10,candidatesTokenCount:20,thoughtsTokenCount:30,totalTokenCount:60}});
    throw new Error('ambiguous network failure');
  });
  const plans=[api.aiBudgetPlan('gemini',{text:'hello'},4096,2),api.aiBudgetPlan('groq',{text:'hello'},2000,1)];
  const db={rpc:async(name,args)=>{writes.push({name,args});return{data:name==='reserve_ai_budget'?{allowed:true}:true};}};
  const budget=await api.reserveAIBudget(db,req(),'secret','chat',{visitorId:'private-visitor',reviewId:'private-review'},plans);
  const response=await budget.request('gemini','https://provider.invalid',{body:'{}'},18000,1);
  budget.recordUsage('gemini',await response.json());
  await assert.rejects(()=>budget.request('groq','https://provider.invalid',{body:'{}'},12000,0));
  await budget.settle();await budget.settle();
  assert.equal(writes[0].args.p_calls,3);assert.equal(writes[0].args.p_tokens,plans[0].tokens*2+plans[1].tokens);
  assert.equal(writes[1].args.p_calls,3);assert.equal(writes[1].args.p_tokens,plans[0].tokens+60+plans[1].tokens);
  assert.equal(writes.length,2);assert.equal(sends,3);
  assert.doesNotMatch(JSON.stringify(writes),/192\.0\.2\.5|private-visitor|private-review|secret|hello/);
});

test('AI success refunds only unattempted slots; malformed usage and settlement outages retain conservative charges',async()=>{
  const api=budgetModule(async()=>Response.json({}));
  assert.equal(api.billedTokens('gemini',{usageMetadata:{totalTokenCount:5,promptTokenCount:10,candidatesTokenCount:20,thoughtsTokenCount:30}}),60);
  for(const total of [null,-1,'50',NaN])assert.equal(api.billedTokens('groq',{usage:{total_tokens:total}}),null);
  const plans=[api.aiBudgetPlan('gemini','hello',4096,2),api.aiBudgetPlan('groq','hello',2000,1)];
  for(const known of [true,false]){
    const writes=[];const db={rpc:async(name,args)=>{writes.push({name,args});return name==='reserve_ai_budget'?{data:{allowed:true}}:{error:{}};}};
    const budget=await api.reserveAIBudget(db,req(),'secret','chat',{visitorId:'v'},plans);
    await budget.request('gemini','https://provider.invalid',{body:'{}'});
    if(known)budget.recordUsage('gemini',{usageMetadata:{totalTokenCount:100}});
    await budget.settle();assert.equal(writes[1].args.p_calls,1);assert.equal(writes[1].args.p_tokens,known?100:plans[0].tokens);
  }
});

test('AI missing migration, malformed RPC replies, paused/exhausted budgets and unreserved retries fail before spending',async()=>{
  let sends=0;const api=budgetModule(async()=>{sends++;return Response.json({});});
  const plans=[api.aiBudgetPlan('gemini','hello',4096,2)];
  for(const result of [{error:{}},{data:null},{data:true},{data:{allowed:false,retryAfter:300}},{data:{allowed:false,paused:true,retryAfter:60}}]){
    await assert.rejects(()=>api.reserveAIBudget({rpc:async()=>result},req(),'secret','chat',{visitorId:'v'},plans),e=>e.status===(result.data?.allowed===false&&!result.data.paused?429:503));
  }
  const budget=await api.reserveAIBudget({rpc:async()=>({data:{allowed:true}})},req(),'secret','chat',{visitorId:'v'},plans);
  await assert.rejects(()=>budget.request('groq','https://provider.invalid',{body:'{}'},100,0),e=>e.status===503);
  await assert.rejects(()=>budget.request('gemini','https://provider.invalid',{body:'{}'},100,2),e=>e.status===503);
  await assert.rejects(()=>budget.request('gemini','https://provider.invalid',{body:'x'.repeat(plans[0].inputBytes+1)},100,0),e=>e.status===503);
  await budget.settle();
  await assert.rejects(()=>budget.request('gemini','https://provider.invalid',{body:'{}'},100,0),e=>e.status===503);
  assert.equal(sends,0);
});

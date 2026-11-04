import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {productionDb,rpc,ADMIN_A} from './helpers/production-db.mjs';
import {startContentPerformance} from '../src/lib/contentPerformance.js';
test('content metrics require live profile proof and deduplicate each section/event per profile/day',async()=>{
  const db=await productionDb();try{const visitor=randomUUID(),hash='b'.repeat(64);await rpc(db,'record_site_presence',[visitor,hash]);
    await assert.rejects(rpc(db,'record_content_performance',[visitor,'c'.repeat(64),'shop','view']),e=>e.code==='42501');
    await rpc(db,'record_content_performance',[visitor,hash,'shop','view']);await rpc(db,'record_content_performance',[visitor,hash,'shop','view']);await rpc(db,'record_content_performance',[visitor,hash,'shop','action']);
    const metrics=await rpc(db,'admin_content_performance',[ADMIN_A,7]);assert.deepEqual(metrics,[{content_id:'shop',views:1,actions:1}]);assert.doesNotMatch(JSON.stringify(metrics),new RegExp(visitor));
  }finally{await db.close();}
});
test('declining optional analytics reads no identifier and creates no observer or outgoing request',()=>{
  let reads=0,observations=0,sends=0;const listeners={};
  const stop=startContentPerformance({readConsent:()=>false,sendEvent:()=>sends++,browserWindow:{localStorage:{getItem(){reads++;}},addEventListener:(name,fn)=>listeners[name]=fn,removeEventListener(){},clearTimeout(){}},pageDocument:{addEventListener(){},removeEventListener(){}},Observer:class{constructor(){observations++;}}});
  assert.equal(reads,0);assert.equal(observations,0);assert.equal(sends,0);stop();
});

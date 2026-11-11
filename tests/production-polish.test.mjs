import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildSync} from 'esbuild';
import vm from 'node:vm';
import {supportPrefill} from '../src/lib/supportPrefill.js';
import {recordAdminFailure,readAdminLockout,clearAdminLockout,ADMIN_LOCKOUT_MS} from '../src/lib/adminLockout.js';
import {redactContact,supportOverdue,lagosDay,calendarMonth} from '../src/lib/adminProduction.js';
import {chunkKnowledge,retrieveKnowledge} from '../supabase/functions/_shared/knowledge-retrieval.js';
import {HAVEN_PUBLIC_KNOWLEDGE} from '../supabase/functions/_shared/haven-knowledge.js';
import {buildHavenSystemPrompt,buildPlaybookKnowledge} from '../supabase/functions/_shared/haven-prompts.js';
import {subscribeAdminNotifications} from '../src/lib/adminRealtime.js';
test('frontend locks after five Supabase invalid_credentials errors, persists reload and expires after fifteen minutes',()=>{
  const values=new Map(),storage={getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
  clearAdminLockout(storage);for(let i=0;i<4;i++)assert.equal(recordAdminFailure({code:'invalid_credentials'},storage,1000).remaining,0);
  assert.equal(recordAdminFailure({code:'invalid_credentials'},storage,1000).remaining,900);
  assert.equal(readAdminLockout(storage,1000+ADMIN_LOCKOUT_MS-1000).remaining,1);
  assert.equal(readAdminLockout(storage,1000+ADMIN_LOCKOUT_MS).remaining,0);
  assert.equal(recordAdminFailure({status:429},storage,1000+ADMIN_LOCKOUT_MS).remaining,900);clearAdminLockout(storage);
  assert.equal(recordAdminFailure({name:'TypeError'},storage).failures,0,'network loss is not a password failure');
});
test('support prefill accepts the Haven rate-limit category and safe text without executing markup',()=>{
  assert.equal(supportPrefill('?issue=rate_limit').category,'rate_limit');assert.match(supportPrefill('?issue=rate_limit').message,/limit in Haven/);
  assert.equal(supportPrefill('?issue=review_access&message=My%20saved%20review').message,'My saved review');
  assert.equal(supportPrefill('?issue=%3Cscript%3E').category,'other');assert.equal(supportPrefill('?issue=%3Cscript%3E').message,'<script>');
});

test('after an admin cooldown three credential failures require password recovery without a permanent ban',()=>{
  const values=new Map(),storage={getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
  clearAdminLockout(storage);
  for(let i=0;i<5;i++)recordAdminFailure({code:'invalid_credentials'},storage,1000);
  for(let i=0;i<2;i++)assert.equal(recordAdminFailure({code:'invalid_credentials'},storage,1001+ADMIN_LOCKOUT_MS).resetRequired,false);
  assert.equal(recordAdminFailure({code:'invalid_credentials'},storage,1001+ADMIN_LOCKOUT_MS).resetRequired,true);
  assert.equal(readAdminLockout(storage,1001+ADMIN_LOCKOUT_MS).remaining,0);
  clearAdminLockout(storage);
  assert.equal(readAdminLockout(storage).resetRequired,false);
});
test('CSV redaction removes contact values from notes; SLA and calendar use actual timestamps and Lagos day',()=>{
  assert.equal(redactContact('Call +234 708 423 2046 or owner@example.com'),'Call [redacted phone] or [redacted email]');
  const now=Date.parse('2026-11-03T12:00:00Z'),row={created_at:'2026-11-02T11:00:00Z',status:'new'};
  assert.equal(supportOverdue(row,now),true);assert.equal(supportOverdue({...row,first_response_at:'2026-11-02T13:00:00Z'},now),false);
  assert.equal(lagosDay('2026-11-03T23:30:00Z'),'2026-11-04');assert.equal(calendarMonth(2026,10).filter(Boolean).length,30);
});
test('retrieval bounds public/private context and never unlocks private chapters through a search query',()=>{
  assert.ok(chunkKnowledge(HAVEN_PUBLIC_KNOWLEDGE).every(chunk=>chunk.text.length<=1600));
  const relevant=retrieveKnowledge(HAVEN_PUBLIC_KNOWLEDGE,'How do I recover my purchased download with an OTP?');assert.match(relevant,/PURCHASE ACCESS|Already purchased/);assert.ok(relevant.length<6500);
  const question='How do I reduce friction and build trust in chapter 4?';
  assert.doesNotMatch(buildPlaybookKnowledge(false,question),/Chapter 4 -/);
  const retrieved=buildPlaybookKnowledge(true,question);assert.match(retrieved,/Chapter 4/);assert.ok(retrieved.length<buildPlaybookKnowledge(true).length);
  const full=buildHavenSystemPrompt({playbookVerified:true}),bounded=buildHavenSystemPrompt({playbookVerified:true,latestMessage:question});assert.ok(bounded.length<full.length);
});
test('Realtime authenticates before subscribing, emits only safe kinds and tears down on sign-out',async()=>{
  const events=[],statuses=[];let listener,removed=0,authenticated=false;
  const channel={on(_type,filter,fn){assert.equal(authenticated,true);assert.equal(filter.table,'admin_live_notifications');listener=fn;return this;},subscribe(fn){fn('SUBSCRIBED');return this;}};
  const client={realtime:{async setAuth(){authenticated=true;}},channel:()=>channel,removeChannel:async()=>{removed++;}};
  const stop=subscribeAdminNotifications(client,'test',{onArrival:value=>events.push(value),onStatus:value=>statuses.push(value)});await new Promise(resolve=>setImmediate(resolve));
  listener({new:{kind:'support'}});listener({new:{kind:'booking'}});listener({new:{kind:'private'}});assert.deepEqual(events,['support','booking']);assert.match(statuses[0],/connected/);stop();assert.equal(removed,1);listener({new:{kind:'support'}});assert.equal(events.length,2);
});
test('structured logger has an allowlisted schema and cannot serialize raw data objects',()=>{
  const source=buildSync({entryPoints:['supabase/functions/_shared/logger.ts'],bundle:true,write:false,format:'cjs',platform:'node'}).outputFiles[0].text;
  const rows=[],module={exports:{}};vm.runInNewContext(source,{module,exports:module.exports,console:{error:value=>rows.push(JSON.parse(value))}});
  module.exports.logEvent('error','Bearer private@example.com password=secret','token=private');
  assert.deepEqual(Object.keys(rows[0]).sort(),['event','level','request_id','timestamp']);assert.doesNotMatch(JSON.stringify(rows),/private|secret|Bearer/);
});

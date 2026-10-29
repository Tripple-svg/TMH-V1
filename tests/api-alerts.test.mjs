import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {buildSync} from 'esbuild';
const code=buildSync({entryPoints:['supabase/functions/send-ai-usage-alerts/index.ts'],bundle:true,write:false,platform:'node',format:'cjs',external:['https://*']}).outputFiles[0].text;
function fixture({fail=false}={}){
  let handler;const mail=[],patches=[];let queries=0;
  const row={id:'11111111-1111-4111-8111-111111111111',day:'2026-10-29',provider:'gemini',kind:'budget_threshold'};
  const db={rpc:async()=>{queries++;return {data:[row]};},from(){return {update(patch){patches.push(patch);return this;},eq:async()=>({error:null})};}};
  const env={SUPABASE_URL:'https://project.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'private-service',INTERNAL_POLL_SECRET:'cron-secret',RESEND_API_KEY:'resend-key'};
  vm.runInNewContext(code,{module:{exports:{}},exports:{},require:()=>({createClient:()=>db}),Deno:{serve:fn=>handler=fn,env:{get:key=>env[key]}},fetch:async(_url,init)=>{mail.push({body:JSON.parse(init.body),headers:init.headers});return Response.json(fail?{message:'Unavailable'}:{id:'provider-receipt'},{status:fail?503:200});},Request,Response,Headers,AbortSignal,setTimeout,clearTimeout,console:{error(){}}});
  return {mail,patches,call:headers=>handler(new Request('https://project.supabase.co/functions/v1/send-ai-usage-alerts',{method:'POST',headers})),get queries(){return queries;}};
}
test('API alerts reject public/forged callers before querying the private queue',async()=>{
  const f=fixture();for(const headers of [{},{authorization:'Bearer public-key'},{'x-internal-poll-key':'wrong'}])assert.equal((await f.call(headers)).status,401);assert.equal(f.queries,0);assert.equal(f.mail.length,0);
});
test('API alerts send to BOTH team inboxes, describe an own-budget threshold and use a stable idempotency key',async()=>{
  const f=fixture();assert.equal((await f.call({'x-internal-poll-key':'cron-secret'})).status,200);
  assert.deepEqual(f.mail[0].body.to,['francis.teamhaven@gmail.com','paschal.tmh@gmail.com']);assert.match(f.mail[0].body.text,/not remaining provider credit/);
  assert.equal(f.mail[0].headers['Idempotency-Key'],'ai-alert/11111111-1111-4111-8111-111111111111');assert.ok(f.patches[0].sent_at);assert.doesNotMatch(JSON.stringify(f.mail[0].body),/private-service|resend-key|cron-secret/);
});
test('API alert provider failure stays queued with a safe error, without a false acceptance marker',async()=>{
  const f=fixture({fail:true});assert.equal((await f.call({'x-haven-internal-key':'private-service'})).status,503);assert.equal(f.patches[0].sent_at,undefined);assert.equal(f.patches[0].last_error,'resend_http_503');
});

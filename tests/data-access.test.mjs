import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildSync} from 'esbuild';
import vm from 'node:vm';
import {webcrypto,createHash} from 'node:crypto';
import * as fflate from 'fflate';
import {productionDb,seedReview} from './helpers/production-db.mjs';
import {edgeDb} from './helpers/edge-db.mjs';
test('confirmed data access emails a real readable ZIP only to the verified inbox and rejects replay',async()=>{
  const db=await productionDb();try{
    await seedReview(db,'export-review','owner@example.test');
    await db.query('insert into haven_sessions(id,review_id,scope,messages) values($1,$2,$3,$4)',['export-chat','export-review','audit',[{role:'user',content:'My private synthetic question',timestamp:1}]]);
    const token='a'.repeat(64),hash=createHash('sha256').update(token).digest('hex');await db.query('insert into data_export_requests(email,token_hash) values($1,$2)',['owner@example.test',hash]);
    const client=edgeDb(db),mail=[];let handler;
    const code=buildSync({entryPoints:['supabase/functions/confirm-data-export/index.ts'],bundle:true,write:false,format:'cjs',platform:'node',external:['https://*']}).outputFiles[0].text;
    vm.runInNewContext(code,{require:specifier=>specifier.includes('fflate')?fflate:{createClient:()=>client},Deno:{serve:fn=>handler=fn,env:{get:key=>({SUPABASE_URL:'https://isolated.example',SUPABASE_SERVICE_ROLE_KEY:'test-service',RESEND_API_KEY:'test-resend'})[key]}},crypto:webcrypto,TextEncoder,TextDecoder,Uint8Array,Response,Request,Headers,AbortSignal,btoa,console:{info(){},error(){},warn(){}},fetch:async(_url,init)=>{mail.push(JSON.parse(init.body));return Response.json({id:'export-accepted'});}});
    const call=(body,method='POST')=>handler(new Request('https://isolated.example',{method,headers:{origin:'http://localhost:5173'},...(method==='POST'?{body:JSON.stringify(body)}:{})}));
    assert.equal((await call({},'GET')).status,405);assert.equal(mail.length,0);
    assert.equal((await call({token:'b'.repeat(64),email:'attacker@example.test'})).status,410);
    const response=await call({token,email:'attacker@example.test'});assert.equal(response.status,200);assert.deepEqual(mail[0].to,['owner@example.test']);
    assert.doesNotMatch(JSON.stringify(await response.json()),/owner@example|private synthetic|My private/);
    const files=fflate.unzipSync(Buffer.from(mail[0].attachments[0].content,'base64'));assert.deepEqual(Object.keys(files).sort(),['README.txt','reviews-and-chats.json']);
    const data=JSON.parse(fflate.strFromU8(files['reviews-and-chats.json']));assert.equal(data.reviews[0].email,'owner@example.test');assert.equal(data.conversations[0].messages[0].content,'My private synthetic question');assert.doesNotMatch(JSON.stringify(data),/token_hash|test-service|test-resend/);
    assert.equal((await call({token})).status,410);assert.equal(mail.length,1);
  }finally{await db.close();}
});

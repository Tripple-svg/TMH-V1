import autocannon from 'autocannon';
import {createServer} from 'node:http';
import {randomUUID,webcrypto} from 'node:crypto';
import {buildSync} from 'esbuild';
import vm from 'node:vm';
import {productionDb} from '../tests/helpers/production-db.mjs';
import {edgeDb} from '../tests/helpers/edge-db.mjs';
// Local by default. Real SQL and the real Edge handler, a deterministic provider
// stub, ten independent visitors. No customer traffic or paid model calls.
const db=await productionDb();let server;
try{
  const client=edgeDb(db);let handler,providerCalls=0,active=0,peak=0;
  const code=buildSync({entryPoints:['supabase/functions/haven-chat/index.ts'],bundle:true,write:false,format:'cjs',platform:'node',external:['https://*']}).outputFiles[0].text;
  vm.runInNewContext(code,{require:()=>({createClient:()=>client}),Deno:{serve:fn=>handler=fn,env:{get:key=>({SUPABASE_URL:'https://isolated.example',SUPABASE_SERVICE_ROLE_KEY:'isolated-test-service',GEMINI_API_KEY:'stub-only',GEMINI_BILLING_CONFIRMED:'true'})[key]}},
    fetch:async()=>{providerCalls++;active++;peak=Math.max(peak,active);await new Promise(resolve=>setTimeout(resolve,40));active--;return Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:'Which customer problem does your offer solve? [[STEP:AWAITING_DIAGNOSTIC_Q2]]'}]}}],usageMetadata:{promptTokenCount:300,candidatesTokenCount:30,totalTokenCount:330}});},
    crypto:webcrypto,Request,Response,Headers,URL,Blob,AbortSignal,AbortController,TextEncoder,TextDecoder,Uint8Array,atob,btoa,setTimeout,clearTimeout,console:{info(){},log(){},warn(){},error(){}}});
  const identities=Array.from({length:10},()=>({visitorId:randomUUID(),visitorToken:randomUUID().replaceAll('-','').repeat(2),sessionId:randomUUID()}));
  const bodies=identities.map(context=>JSON.stringify({scope:'support',noticeVersion:'2026-10-26',requestId:randomUUID(),context,messages:[{role:'user',content:'I sell handmade furniture and want to understand what my brand communicates.'}]}));
  server=createServer(async(req,res)=>{try{let raw='';for await(const chunk of req)raw+=chunk;const response=await handler(new Request('https://isolated.example/functions/v1/haven-chat',{method:'POST',headers:{origin:'http://localhost:5173','Content-Type':'application/json','cf-connecting-ip':'203.0.113.9'},body:raw}));res.writeHead(response.status,{'Content-Type':'application/json'});res.end(await response.text());}catch{res.writeHead(500);res.end('{}');}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  let current=0;const failures=[],connectionErrors=[];
  const result=await new Promise((resolve,reject)=>{
    const run=autocannon({url:'http://127.0.0.1:'+server.address().port,connections:10,amount:10,pipelining:1,method:'POST',body:bodies[0],headers:{'Content-Type':'application/json'},setupClient(client){client.setBody(bodies[current++%10]);},onResponse(status,_bytes,_time,body){if(status!==200)failures.push({status,body:body?.toString().slice(0,160)});}},(error,value)=>error?reject(error):resolve(value));
    run.on('reqError',error=>connectionErrors.push(error.code||error.message));
  });
  const ok=result.errors===0&&result.timeouts===0&&result.non2xx===0&&providerCalls===10&&peak>=2;
  console.log(JSON.stringify({ok,mode:'isolated real Edge handler and PostgreSQL; model stubbed',connections:10,requests:result.requests.total,errors:result.errors,timeouts:result.timeouts,non2xx:result.non2xx,providerCalls,peakConcurrentProviderRequests:peak,latencyMs:{average:result.latency.average,p99:result.latency.p99},failures,connectionErrors,liveProviderCapacityVerified:false},null,2));
  if(!ok)process.exitCode=1;
}finally{if(server)await new Promise(resolve=>server.close(resolve));await db.close();}

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildSync} from 'esbuild';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';

const globals={crypto:webcrypto,TextEncoder,TextDecoder,Uint8Array,Request,Response,Headers,AbortSignal,URL,URLSearchParams,console:{info(){},warn(){},error(){}}};
function bundle(file){return buildSync({entryPoints:[file],bundle:true,write:false,format:'cjs',platform:'node',external:['https://*']}).outputFiles[0].text;}
function exportsOf(file){const module={exports:{}};vm.runInNewContext(bundle(file),{...globals,module,exports:module.exports});return module.exports;}
function endpoint(name,{env={},rpc=async()=>({data:true}),fetch=async()=>Response.json({success:true})}={}){
  let handler;vm.runInNewContext(bundle(`supabase/functions/${name}/index.ts`),{...globals,fetch,require:()=>({createClient:()=>({rpc})}),Deno:{serve:fn=>handler=fn,env:{get:key=>({SUPABASE_URL:'https://isolated.example',SUPABASE_SERVICE_ROLE_KEY:'test-service',...env})[key]}}});return handler;
}
test('forwarded-header rotation cannot create new network budgets and malformed ingress addresses share a conservative bucket',async()=>{
  const {requestBucket}=exportsOf('supabase/functions/_shared/playbook-recovery.ts');
  const {edgeClientAddress}=exportsOf('supabase/functions/_shared/edge-client-address.ts');
  const request=headers=>new Request('https://isolated.example',{headers});
  const unknown=await requestBucket(request({}),'test-key');
  for(let n=1;n<12;n++)assert.equal(await requestBucket(request({'x-forwarded-for':`192.0.2.${n}`,'x-real-ip':`198.51.100.${n}`}), 'test-key'),unknown);
  for(const value of ['garbage','999.1.2.3','1.2.3.4, 5.6.7.8','abcd','a:::b'])assert.equal(edgeClientAddress(request({'cf-connecting-ip':value})),'unknown');
  const trusted=await requestBucket(request({'cf-connecting-ip':'192.0.2.1'}),'test-key');
  assert.notEqual(trusted,unknown);
  assert.equal(await requestBucket(request({'cf-connecting-ip':'192.0.2.1','x-forwarded-for':'8.8.8.8'}),'test-key'),trusted);
  assert.equal(edgeClientAddress(request({'cf-connecting-ip':'2001:0db8:0:0:0:0:0:1'})),edgeClientAddress(request({'cf-connecting-ip':'2001:db8::1'})));
});
test('health reports absent required configuration as 503 without revealing secret values; optional setup is visible',async()=>{
  const checks={database:true,rpc:true,vault:true,cron:true,workers:true};
  const configured={RESEND_API_KEY:'private-mail-value',PAYSTACK_SECRET_KEY:'private-payment-value',HCAPTCHA_SECRET:'private-captcha-value',GROQ_API_KEY:'private-ai-value',CALENDLY_API_TOKEN:'private-calendar-value'};
  const call=env=>endpoint('health',{env,rpc:async()=>({data:checks})})(new Request('https://isolated.example'));
  const missing=await call({...configured,HCAPTCHA_SECRET:''});assert.equal(missing.status,503);assert.equal((await missing.json()).configuration.required.captcha,false);
  const healthy=await call(configured);assert.equal(healthy.status,200);const body=await healthy.text();assert.doesNotMatch(body,/private-.*-value/);assert.equal(JSON.parse(body).configuration.optional.errorTracking,false);
  const head=await endpoint('health',{env:configured,rpc:async()=>({data:checks})})(new Request('https://isolated.example',{method:'HEAD'}));assert.equal(head.status,200);assert.equal(await head.text(),'');
});
test('CAPTCHA validation rejects bad origins and oversized input, then stops provider requests at the network budget',async()=>{
  let requests=0,provider=0;
  const handler=endpoint('validate-hcaptcha',{env:{HCAPTCHA_SECRET:'private-captcha-value'},rpc:async()=>({data:++requests<=5}),fetch:async()=>{provider++;return Response.json({success:true});}});
  const call=(token,origin='http://localhost:5173')=>handler(new Request('https://isolated.example',{method:'POST',headers:{origin,'cf-connecting-ip':'192.0.2.1'},body:JSON.stringify({token})}));
  assert.equal((await call('token','https://evil.example')).status,403);assert.equal((await call('a'.repeat(5000))).status,413);assert.equal(requests,0);
  for(let i=0;i<5;i++)assert.equal((await call('synthetic-token')).status,200);
  const limited=await call('synthetic-token');assert.equal(limited.status,429);assert.equal(limited.headers.get('Retry-After'),'600');assert.equal(provider,5);
});

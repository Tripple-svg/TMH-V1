import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildSync} from 'esbuild';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {BrowserClient} from '@sentry/browser';

test('Edge failure reporting correlates the response and safe JSON logs without leaking the thrown error',async()=>{
  const logs=[],module={exports:{}};
  const code=buildSync({entryPoints:['supabase/functions/_shared/observability.ts'],bundle:true,write:false,format:'cjs',platform:'node',external:['https://*']}).outputFiles[0].text;
  vm.runInNewContext(code,{module,exports:module.exports,crypto:webcrypto,Request,Response,Deno:{env:{get:()=>undefined}},console:{info:value=>logs.push(JSON.parse(value)),warn:value=>logs.push(JSON.parse(value)),error:value=>logs.push(JSON.parse(value))}});
  const handler=module.exports.observe('synthetic-check',async(_request,id)=>{module.exports.requestId=id;throw Error('private-token and customer message');});
  const response=await handler(new Request('https://isolated.example',{headers:{origin:'https://themarketinghaven.xyz'}}));const body=await response.json();
  assert.equal(response.status,503);assert.equal(body.requestId,module.exports.requestId);assert.equal(logs[0].request_id,body.requestId);assert.doesNotMatch(JSON.stringify({body,logs}),/private-token|customer message/);assert.equal(response.headers.get('Access-Control-Allow-Origin'),'https://themarketinghaven.xyz');
  const event=module.exports.privateEdgeEvent({tags:{function:'haven-chat',http_status:'503',request_id:body.requestId,email:'private@example.test'},user:{ip_address:'192.0.2.5'},request:{headers:{authorization:'SECRET'}},message:'private'});
  assert.match(event.message,/haven-chat \(HTTP 503\)/);assert.doesNotMatch(JSON.stringify(event),/private@|192\.0\.2\.5|SECRET|authorization/);
});
test('browser Sentry events discard identities, messages, breadcrumbs and URL query credentials',()=>{
  const module={exports:{}},listeners={};let options;
  const code=buildSync({entryPoints:['src/lib/errorTracking.js'],bundle:true,write:false,format:'cjs',platform:'node',external:['@sentry/react'],define:{'import.meta.env.VITE_SENTRY_DSN':'"https://public-example.invalid/1"'}}).outputFiles[0].text;
  vm.runInNewContext(code,{module,exports:module.exports,require:()=>({init:value=>options=value,captureException(){}}),window:{addEventListener:(name,fn)=>listeners[name]=fn}});
  const event=options.beforeSend({user:{email:'private@example.test'},message:'private text',request:{url:'https://site.invalid/?token=SECRET'},breadcrumbs:[{message:'private'}],exception:{values:[{type:'SecretError',value:'private message',stacktrace:{frames:[{filename:'https://site.invalid/app.js?token=SECRET',lineno:3}]}}]}});
  assert.equal(options.defaultIntegrations,false);assert.doesNotMatch(JSON.stringify(event),/private@|private text|private message|SECRET|breadcrumbs|SecretError/);assert.ok(listeners.error);assert.ok(listeners.unhandledrejection);
  // Exercise the installed SDK, rather than assuming a deprecated flag works.
  const client=new BrowserClient({dsn:'https://public@example.invalid/1',integrations:[],dataCollection:options.dataCollection,transport:()=>({send:async()=>({}),flush:async()=>true})});
  const actual=client.getDataCollectionOptions();assert.equal(actual.userInfo,false);assert.equal(actual.cookies,false);assert.equal(actual.genAI.inputs,false);assert.equal(actual.genAI.outputs,false);assert.equal(actual.httpBodies.length,0);assert.equal(actual.httpHeaders.request,false);assert.equal(actual.httpHeaders.response,false);assert.equal(client.getOptions()._metadata.sdk.settings.infer_ip,'never');
});

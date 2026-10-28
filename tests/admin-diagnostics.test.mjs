import {test} from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {buildSync} from 'esbuild';
const cache=new Map();
function fixture(name,{sent=false,confirm=true,status=503}={}){
 let handler;const calls=[],fetches=[],row={id:'saved-review',welcome_email_sent:sent,welcome_email_last_error:null};
 const db={functions:{async invoke(name,options){calls.push({name,options});if(confirm)row.welcome_email_sent=true;return {data:{ok:true}}}},from(table){assert.equal(table,'brand_reviews');let patch;return {select(){return this},eq(){return this},update(value){patch=value;return this},async maybeSingle(){return {data:{...row},error:null}},then(resolve){Object.assign(row,patch);return Promise.resolve({error:null}).then(resolve)}}}};
 const env={SUPABASE_URL:'https://project.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'private-service-secret',ADMIN_PASSWORD:'qa-admin-password',GEMINI_API_KEY:'private-gemini-secret',GEMINI_MODEL:' models/configured-model '};
 if(!cache.has(name))cache.set(name,buildSync({entryPoints:[`supabase/functions/${name}/index.ts`],bundle:true,write:false,format:'cjs',platform:'node',external:['https://*']}).outputFiles[0].text);
 vm.runInNewContext(cache.get(name),{require:specifier=>specifier.includes('server.ts')?{serve:fn=>handler=fn}:{createClient:()=>db},Deno:{env:{get:key=>env[key]}},fetch:async(url,init)=>{fetches.push({url,init});return Response.json({}, {status})},Response,Request,Headers,URL,AbortSignal,console:{error(){},warn(){}}});
 const request=body=>new Request('https://project.supabase.co/functions/v1/qa',{method:'POST',headers:{origin:'http://localhost:5173','Content-Type':'application/json'},body:JSON.stringify(body)});
 return{handler,request,calls,fetches,env,row};
}
test('admin AI diagnostics require admin auth before contacting a provider',async()=>{
 const f=fixture('admin-fetch-leads');assert.equal((await f.handler(f.request({password:'wrong',action:'aiHealth'}))).status,401);assert.equal(f.fetches.length,0);
 const response=await f.handler(f.request({password:f.env.ADMIN_PASSWORD,action:'aiHealth'}));const body=await response.json();assert.equal(response.status,200);assert.equal(body.gemini.code,'gemini_http_503');assert.match(f.fetches[0].url,/models\/configured-model$/);assert.equal(f.fetches[0].init.method,'GET');assert.equal(f.fetches[0].init.body,undefined);assert.ok(!JSON.stringify(body).includes('private-'));assert.ok(!f.fetches[0].url.includes('secret'));
});
test('admin welcome retry uses only a saved review ID and rejects caller-selected mail details',async()=>{
 const f=fixture('admin-update-lead');const base={password:f.env.ADMIN_PASSWORD,action:'retryWelcome',reviewId:'saved-review'};
 assert.equal((await f.handler(f.request({...base,email:'attacker@example.test'}))).status,400);assert.equal(f.calls.length,0);
 const response=await f.handler(f.request(base));assert.equal(response.status,200);assert.equal((await response.json()).review.welcome_email_sent,true);
 assert.equal(f.calls.length,1);assert.deepEqual(JSON.parse(JSON.stringify(f.calls[0].options.body)),{record:{id:'saved-review'}});assert.equal(f.calls[0].options.headers['x-haven-internal-key'],f.env.SUPABASE_SERVICE_ROLE_KEY);
});
test('admin welcome retry skips already accepted mail and cannot report success without a saved acknowledgement',async()=>{
 const accepted=fixture('admin-update-lead',{sent:true});assert.equal((await accepted.handler(accepted.request({password:accepted.env.ADMIN_PASSWORD,action:'retryWelcome',reviewId:'saved-review'}))).status,200);assert.equal(accepted.calls.length,0);
 const missing=fixture('admin-update-lead',{confirm:false});const response=await missing.handler(missing.request({password:missing.env.ADMIN_PASSWORD,action:'retryWelcome',reviewId:'saved-review'}));assert.equal(response.status,502);assert.equal((await response.json()).ok,false);
});

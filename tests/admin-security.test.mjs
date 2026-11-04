import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildSync} from 'esbuild';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
const actor='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const sources=Object.fromEntries(['admin-security','admin-update-lead','admin-team-assignment','admin-retry-purchase-email','flag-user','admin-support'].map(name=>[name,buildSync({entryPoints:[`supabase/functions/${name}/index.ts`],bundle:true,write:false,format:'cjs',platform:'node',external:['https://*']}).outputFiles[0].text]));
function fixture(name,{role='admin',auditError=null,auditData={ok:true},banned=false,deleted=false,access=true,accessError=null}={}){
  let handler;const mutations=[],reads=[],mail=[],logs=[];
  const user={id:actor,app_metadata:{role},...(banned?{banned_until:'2099-01-01T00:00:00Z'}:{}),...(deleted?{deleted_at:'2026-10-31T00:00:00Z'}:{})};
  const db={auth:{getUser:async token=>token==='valid-token'?{data:{user},error:null}:{error:{message:'invalid'}}},
    rpc:async(name,args)=>{if(name==='consume_playbook_limit')return {data:true};if(name==='admin_access_allowed')return {data:access,error:accessError};mutations.push({name,args});return {data:auditData,error:auditError};},
    from(table){reads.push(table);const builder={select(){return this;},eq(){return this;},order(){return this;},limit(){return this;},
      single:async()=>({data:{chat_enabled:true}}),maybeSingle:async()=>({data:{id:'purchase-1',email:'private@example.com',reference:'UNSEEN_test',thankyou_sent:false}}),
      then(resolve,reject){return Promise.resolve({data:[]}).then(resolve,reject);}};return builder;},
    functions:{invoke:async(...args)=>{mail.push(args);return {data:{ok:true}};}}};
  const env={SUPABASE_URL:'https://project.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'service-secret'};
  vm.runInNewContext(sources[name],{require:name=>name.includes('server.ts')?{serve:fn=>{handler=fn;}}:{createClient:()=>db},Deno:{serve:fn=>{handler=fn;},env:{get:key=>env[key]}},
    crypto:webcrypto,TextEncoder,TextDecoder,Uint8Array,Request,Response,Headers,console:{error(...args){logs.push(args);}}});
  return {mutations,reads,mail,user,logs,call:(body={},token='valid-token',origin='https://themarketinghaven.xyz',method='POST')=>handler(new Request('https://project.supabase.co',{method,headers:{...(token?{authorization:'Bearer '+token}:{}),...(origin?{origin}:{}),'cf-connecting-ip':'203.0.113.25','content-type':'application/json'},...(method==='POST'?{body:JSON.stringify(body)}:{})}))};
}
test('all admin handlers reject forged, service-key, customer, banned and demoted credentials before mutation',async()=>{
  for(const name of Object.keys(sources)){
    const body={action:name==='admin-security'?'updateSettings':'delete',settings:{chat_enabled:false},reviewId:'review-1',confirmation:'review-1'};
    for(const [options,token,status] of [[{},'',401],[{},'forged',401],[{},'service-secret',401],[{role:'customer'},'valid-token',403],[{banned:true},'valid-token',403],[{deleted:true},'valid-token',403]]){
      const f=fixture(name,options);assert.equal((await f.call(body,token)).status,status,name);assert.equal(f.mutations.length,0,name);assert.equal(f.reads.length,0,name);
    }
    const f=fixture(name);f.user.app_metadata.role='customer';assert.equal((await f.call(body)).status,403,name);
  }
});
test('all admin handlers deny unexpected origins and preflights; no-Origin still requires authorization',async()=>{
  for(const name of Object.keys(sources))for(const method of ['POST','OPTIONS']){
    const f=fixture(name);const response=await f.call({},'valid-token','https://evil.example',method);
    assert.equal(response.status,403,name);assert.equal(response.headers.get('access-control-allow-origin'),null,name);assert.equal(f.mutations.length,0);
  }
  const f=fixture('admin-security');assert.equal((await f.call({action:'audit'},'',null)).status,401);
});
test('admin settings whitelist values, take actor from Auth and hash network before audited write',async()=>{
  const f=fixture('admin-security',{auditData:{chat_enabled:false}});
  assert.equal((await f.call({action:'updateSettings',settings:{service_role:'admin'}})).status,400);
  for(const settings of [{chat_enabled:'false'},{global_daily_calls:0},{visitor_daily_tokens:1.1},{review_daily_calls:1000001}])assert.equal((await f.call({action:'updateSettings',settings})).status,400);
  assert.equal(f.mutations.length,0);
  assert.equal((await f.call({action:'updateSettings',settings:{chat_enabled:false},actor:'attacker',network_hash:'forged'})).status,200);
  const args=f.mutations[0].args;assert.equal(args.p_actor,actor);assert.equal(args.p_action,'ai_settings_update');assert.match(args.p_network_hash,/^[a-f0-9]{64}$/);
  assert.doesNotMatch(JSON.stringify(args),/203\.0\.113\.25|service-secret|valid-token|attacker/);
});
test('revocation during a request and audit database failures fail closed before deletion or external email',async()=>{
  for(const name of ['admin-retry-purchase-email'])for(const [error,status] of [[{code:'42501'},403],[{code:'XX000',message:'Private database note and email private@example.com',details:'Bearer private-provider-token'},name==='admin-update-lead'?500:503]]){
    const f=fixture(name,{auditError:error});const body=name==='admin-update-lead'?{action:'delete',reviewId:'review-1',confirmation:'review-1'}:{reference:'UNSEEN_test'};
    const response=await f.call(body);assert.equal(response.status,status,name);assert.equal(f.mail.length,0,name);
    assert.doesNotMatch(JSON.stringify([await response.json(),f.logs]),/private@example|private-provider-token|Private database note/);
  }
});


test('every admin handler rejects stale public Auth metadata when the live database gate denies or fails',async()=>{
  for(const name of Object.keys(sources))for(const [options,status] of [[{access:false},403],[{accessError:{message:'private database outage'}},503]]){
    const f=fixture(name,options),response=await f.call({action:'audit'});assert.equal(response.status,status,name);
    assert.equal(f.user.app_metadata.role,'admin');assert.equal(f.user.banned_until,undefined);assert.equal(f.user.factors,undefined);
    assert.equal(f.reads.length,0,name);assert.equal(f.mutations.length,0,name);assert.equal(f.mail.length,0,name);
    assert.doesNotMatch(JSON.stringify([await response.json(),f.logs]),/private database outage/);
  }
});

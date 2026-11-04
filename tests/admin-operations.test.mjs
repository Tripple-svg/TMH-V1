import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildSync} from 'esbuild';
import vm from 'node:vm';
import {webcrypto,randomUUID} from 'node:crypto';
import {productionDb,ADMIN_A,SESSION_A,seedReview,scalar} from './helpers/production-db.mjs';
import {edgeDb} from './helpers/edge-db.mjs';
const code=buildSync({entryPoints:['supabase/functions/admin-operations/index.ts'],bundle:true,write:false,format:'cjs',platform:'node',external:['https://*']}).outputFiles[0].text;
test('admin operations: real SQL, verified claims, single-use recovery and private aggregate responses',async()=>{
  const db=await productionDb();try{
    const client=edgeDb(db);let handler;const mail=[];
    const claims={sub:ADMIN_A,session_id:SESSION_A,aal:'aal2',amr:[{method:'password',timestamp:Math.floor(Date.now()/1000)}]};
    const token='header.'+Buffer.from(JSON.stringify(claims)).toString('base64url')+'.verified';
    client.auth={getUser:async bearer=>bearer===token?{data:{user:{id:ADMIN_A,app_metadata:{role:'admin'}}}}:{error:{message:'private invalid token'}},admin:{mfa:{listFactors:async()=>({data:{factors:(await db.query('select id from auth.mfa_factors where user_id=$1',[ADMIN_A])).rows}}),deleteFactor:async({id})=>{await db.query('delete from auth.mfa_factors where id=$1',[id]);return {}; }},signOut:async()=>{await db.query('delete from auth.sessions where user_id=$1',[ADMIN_A]);return {};}}};
    vm.runInNewContext(code,{require:()=>({createClient:()=>client}),Deno:{serve:fn=>handler=fn,env:{get:key=>({SUPABASE_URL:'https://isolated.example',SUPABASE_SERVICE_ROLE_KEY:'test-service',RESEND_API_KEY:'test-resend'})[key]}},crypto:webcrypto,Request,Response,Headers,URL,TextEncoder,TextDecoder,Uint8Array,atob,btoa,AbortSignal,console:{error(){},info(){},warn(){}},fetch:async(_url,init)=>{mail.push(JSON.parse(init.body));return Response.json({id:'test-delivery'});}});
    const call=(action,extra={},bearer=token)=>handler(new Request('https://isolated.example',{method:'POST',headers:{origin:'http://localhost:5173',authorization:'Bearer '+bearer,'cf-connecting-ip':'203.0.113.5'},body:JSON.stringify({action,...extra})}));
    assert.equal((await call('insights',{},'forged')).status,401);
    assert.equal((await call('generateBackupCodes')).status,403,'a verified MFA factor must exist in SQL');
    await db.query('insert into auth.mfa_factors(id,user_id,status) values($1,$2,$3)',[randomUUID(),ADMIN_A,'verified']);
    const generated=await call('generateBackupCodes');assert.equal(generated.status,200);const data=await generated.json();assert.equal(data.codes.length,10);assert.equal(new Set(data.codes).size,10);
    const saved=(await db.query('select code_hash from admin_backup_codes')).rows;assert.equal(saved.length,10);assert.ok(saved.every(row=>/^[a-f0-9]{64}$/.test(row.code_hash)));assert.doesNotMatch(JSON.stringify(saved),new RegExp(data.codes[0]));
    await seedReview(db);const insights=await call('insights',{days:7});assert.equal(insights.status,200);assert.doesNotMatch(JSON.stringify(await insights.json()),/synthetic@example|Synthetic Owner/);
    assert.equal((await call('recoverMfa',{code:data.codes[0]})).status,200);
    assert.equal(await scalar(db,'select count(*)::int from auth.mfa_factors'),0);assert.equal(await scalar(db,'select count(*)::int from auth.sessions where user_id=$1',[ADMIN_A]),0);
    assert.equal((await call('insights')).status,403,'old JWT cannot regain workspace access when factors are removed');
    assert.equal((await call('recoverMfa',{code:data.codes[0]})).status,403,'revoked password session cannot replay recovery');
  }finally{await db.close();}
});

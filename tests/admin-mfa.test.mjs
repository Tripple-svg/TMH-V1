import * as lockout from '../src/lib/adminLockout.js';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {buildSync,transformSync} from 'esbuild';
import {PGlite} from '@electric-sql/pglite';
import * as mfa from '../src/lib/adminMfa.js';
import {observeAdminSession} from '../src/lib/adminSession.js';
import {saveAdminPassword} from '../src/lib/adminPassword.js';

const factor={id:'11111111-1111-4111-8111-111111111111',factor_type:'totp',status:'verified',friendly_name:'My authenticator'};
const actor='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function fixture({enrolled=true,current='aal1',codeValid=true}={}){
  const calls=[];let level=current,event;
  const user={id:actor,email:'admin@example.com',app_metadata:{role:'admin'},factors:enrolled?[{...factor}]:[]};
  const auth={
    getUser:async()=>({data:{user}}),getSession:async()=>({data:{session:{access_token:'token-'+level}}}),
    onAuthStateChange(fn){event=fn;return{data:{subscription:{unsubscribe(){}}}};},
    updateUser:async payload=>{calls.push(['password',payload]);return{error:null};},
    signInWithPassword:async()=>{calls.push(['password-sign-in']);level='aal1';return{data:{user,session:{access_token:'token-aal1'}}};},
    refreshSession:async()=>{calls.push(['refresh']);return{error:null};},
    mfa:{
      getAuthenticatorAssuranceLevel:async()=>({data:{currentLevel:level,nextLevel:user.factors.some(item=>item.status==='verified')?'aal2':'aal1'}}),
      listFactors:async()=>({data:{all:user.factors}}),
      challenge:async input=>{calls.push(['challenge',input]);return{data:{id:'challenge-id'}};},
      verify:async input=>{calls.push(['verify',input]);if(!codeValid)return{error:{message:'private provider failure'}};level='aal2';return{data:{}};},
      enroll:async input=>{calls.push(['enroll',input]);return{data:{id:'new-factor',totp:{qr_code:'<svg xmlns="http://www.w3.org/2000/svg"></svg>',secret:'private-enrollment-key'}}};},
      unenroll:async input=>{calls.push(['unenroll',input]);user.factors=user.factors.filter(item=>item.id!==input.factorId);return{error:null};},
    },
  };
  return{auth,user,calls,event:(type,session)=>event(type,session),setLevel:value=>{level=value;}};
}
test('MFA is required for an enrolled AAL1 account; non-enrolled staff keep their existing access',async()=>{
  const enrolled=fixture();assert.equal((await mfa.readAdminMfa(enrolled.auth,enrolled.user)).required,true);
  const plain=fixture({enrolled:false});assert.equal((await mfa.readAdminMfa(plain.auth,plain.user)).required,false);
  enrolled.setLevel('aal2');assert.equal((await mfa.readAdminMfa(enrolled.auth,enrolled.user)).required,false);
});
test('fresh factor metadata prevents stale AAL1 next-level information bypassing a verified factor',async()=>{
  const f=fixture();f.auth.mfa.getAuthenticatorAssuranceLevel=async()=>({data:{currentLevel:'aal1',nextLevel:'aal1'}});
  assert.equal((await mfa.readAdminMfa(f.auth,f.user)).required,true);
});
test('MFA verification performs challenge/verify then returns only a refreshed AAL2 session',async()=>{
  const f=fixture();const session=await mfa.verifyAdminTotp(f.auth,factor.id,'123456');assert.equal(session.access_token,'token-aal2');
  assert.deepEqual(f.calls.slice(0,2),[['challenge',{factorId:factor.id}],['verify',{factorId:factor.id,challengeId:'challenge-id',code:'123456'}]]);
  const wrong=fixture({codeValid:false});await assert.rejects(mfa.verifyAdminTotp(wrong.auth,factor.id,'123456'),error=>error.name==='AdminMfaError'&&!error.message.includes('private provider'));
  assert.equal((await wrong.auth.getSession()).data.session.access_token,'token-aal1');
});
test('factor removal requires a fresh code, never a remembered AAL2 status alone',async()=>{
  const wrong=fixture({current:'aal2',codeValid:false});await assert.rejects(mfa.removeAdminTotp(wrong.auth,factor.id,factor.id,'123456'));assert.equal(wrong.calls.some(([action])=>action==='unenroll'),false);
  const f=fixture({current:'aal2'});await mfa.removeAdminTotp(f.auth,factor.id,factor.id,'123456');assert.deepEqual(f.calls.map(([action])=>action),['challenge','verify','unenroll','refresh']);
});
test('non-admin accounts cannot enroll or remove factors using the admin controls',async()=>{
  const f=fixture();f.user.app_metadata.role='customer';await assert.rejects(mfa.enrollAdminTotp(f.auth));await assert.rejects(mfa.removeAdminTotp(f.auth,factor.id,factor.id,'123456'));assert.equal(f.calls.length,0);
});
test('enrollment QR is an image data URI and rejects remote/script sources; secrets remain ephemeral return values',async()=>{
  assert.match(mfa.authenticatorQrImage('<svg xmlns="http://www.w3.org/2000/svg"></svg>'),/^data:image\/svg\+xml;charset=utf-8,%3Csvg/);
  for(const value of ['javascript:alert(1)','https://evil.example/qr.svg','data:text/html,<script>'])assert.throws(()=>mfa.authenticatorQrImage(value));
  const f=fixture({enrolled:false});const value=await mfa.enrollAdminTotp(f.auth);assert.match(value.qr,/^data:image\/svg/);assert.equal(value.secret,'private-enrollment-key');
  assert.equal(f.calls[0][0],'enroll');assert.equal(f.calls[0][1].factorType,'totp');
});
test('resumed AAL1 session cannot open the workspace; verification event supplies the AAL2 session',async()=>{
  const f=fixture(),sessions=[],stop=observeAdminSession(f.auth,(value,details)=>sessions.push({value,details}));await tick();assert.equal(sessions.at(-1).value,null);assert.equal(sessions.at(-1).details.mfaRequired,true);
  f.setLevel('aal2');f.event('MFA_CHALLENGE_VERIFIED',{access_token:'verified-aal2'});await tick();assert.equal(sessions.at(-1).value.access_token,'verified-aal2');stop();
});
test('a slow MFA status check cannot resurrect an admin session after logout',async()=>{
  const f=fixture(),sessions=[];let finish;
  f.auth.mfa.getAuthenticatorAssuranceLevel=()=>new Promise(resolve=>{finish=resolve;});
  const stop=observeAdminSession(f.auth,value=>sessions.push(value));await tick();f.event('SIGNED_OUT',null);await tick();finish({data:{currentLevel:'aal2',nextLevel:'aal2'}});await tick();assert.deepEqual(sessions,[null]);stop();
});
test('password recovery does not bypass MFA, and an authenticated MFA change preserves AAL2',async()=>{
  const f=fixture(),pass={password:'my unique new password',confirmation:'my unique new password'};
  await assert.rejects(saveAdminPassword(f.auth,pass),error=>error.code==='mfa_required');assert.equal(f.calls.length,0);
  f.setLevel('aal2');await saveAdminPassword(f.auth,{...pass,currentPassword:'current password',requireCurrentPassword:true});
  assert.deepEqual(f.calls,[['password',{password:pass.password,current_password:'current password'}]]);
});
test('sign-in cannot call onAuth for an enrolled password-only session',async()=>{
  const f=fixture(),states=[];let cursor=0,opened=0;
  const react={useState(initial){const index=cursor++;if(!(index in states))states[index]=initial;return[states[index],value=>{states[index]=typeof value==='function'?value(states[index]):value;}];},useRef:value=>({current:value}),useEffect(){}};
  const challenge=function Challenge(){};
  const context={module:{exports:{}},require:name=>name==='react'?react:name.includes('adminLockout')?lockout:name.includes('adminMfa')?mfa:name.includes('AdminMfaChallenge')?{__esModule:true,default:challenge}:{adminSupabase:{auth:f.auth}},React:{createElement:(type,props,...children)=>({type,props:{...props,children}})}};
  vm.runInNewContext(transformSync(readFileSync('src/components/admin/AdminSignIn.jsx','utf8'),{loader:'jsx',format:'cjs'}).code,context);
  const render=()=>{cursor=0;const nodes=[];const walk=node=>{if(Array.isArray(node))return node.forEach(walk);if(!node||typeof node!=='object')return;nodes.push(node);walk(node.props.children);};walk(context.module.exports.default({onAuth:()=>{opened++;}}));return nodes;};
  render().find(node=>node.type==='input'&&node.props.type==='email').props.onChange({target:{value:'admin@example.com'}});
  render().find(node=>node.type==='input'&&node.props.type==='password').props.onChange({target:{value:'password'}});
  await render().find(node=>node.type==='form').props.onSubmit({preventDefault(){}});assert.equal(opened,0);const node=render().find(node=>node.type===challenge);assert.ok(node);assert.equal(node.props.factors[0].id,factor.id);
  node.props.onVerified({access_token:'verified-aal2'});assert.equal(opened,1);
});

test('Edge admin authorization checks AAL only after Auth verifies the bearer and requires it only for verified factors',async()=>{
  const code=buildSync({entryPoints:['supabase/functions/_shared/admin-auth.ts'],bundle:true,write:false,format:'cjs',platform:'node'}).outputFiles[0].text;
  const order=[];const context={module:{exports:{}},exports:{},atob:value=>{order.push('aal');return atob(value);},TextEncoder,TextDecoder,Uint8Array,crypto:globalThis.crypto};vm.runInNewContext(code,context);const requireAdmin=context.module.exports.requireAdmin;
  const token=aal=>'header.'+Buffer.from(JSON.stringify({aal})).toString('base64url')+'.valid-signature';const valid=[token('aal1'),token('aal2'),token(undefined)];
  let factors=[factor],checks=0;
  const db={rpc:async(name,args)=>({data:name==='admin_access_allowed'?args.p_aal==='aal2'||!factors.some(item=>item.status==='verified'):true}),auth:{getUser:async value=>{checks++;order.push('auth');return valid.includes(value)?{data:{user:{id:actor,app_metadata:{role:'admin'}}}}:{error:{message:'invalid'}};}}};
  const req=value=>new Request('https://project.supabase.co',{headers:{authorization:'Bearer '+value,'cf-connecting-ip':'203.0.113.9'}});
  await assert.rejects(requireAdmin(db,req(token('aal1')),'service-secret'),error=>error.status===403);assert.deepEqual(order,['auth','aal']);await assert.rejects(requireAdmin(db,req(token(undefined)),'service-secret'),error=>error.status===403);
  assert.equal((await requireAdmin(db,req(token('aal2')),'service-secret')).id,actor);
  const before=order.length;await assert.rejects(requireAdmin(db,req(token('aal2')+'forged'),'service-secret'),error=>error.status===401);assert.deepEqual(order.slice(before),['auth'],'unverified JWT claims are never decoded');
  factors=[];assert.equal((await requireAdmin(db,req(token('aal1')),'service-secret')).id,actor);
  factors=[{...factor,status:'unverified'}];assert.equal((await requireAdmin(db,req(token('aal1')),'service-secret')).id,actor);assert.equal(checks,6);
});
test('PostgreSQL MFA policy blocks an old AAL1 token immediately after enrollment and keeps fresh role/ban checks',async()=>{
  const db=new PGlite();try{
    await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;
      create function auth.role() returns text language sql as $$select current_setting('request.jwt.claim.role',true)$$;
      create function auth.jwt() returns jsonb language sql as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
      create function auth.uid() returns uuid language sql as $$select (auth.jwt()->>'sub')::uuid$$;
      create table auth.users(id uuid primary key,raw_app_meta_data jsonb,deleted_at timestamptz,banned_until timestamptz);
      create table auth.mfa_factors(id uuid primary key,user_id uuid references auth.users(id),status text);
      grant usage on schema public,auth to authenticated,service_role;`);
    await db.exec(readFileSync('supabase/migrations/20261101000002_admin_mfa.sql','utf8'));
    await db.exec(`create table public.private_admin_records(id int);insert into public.private_admin_records values(1);alter table public.private_admin_records enable row level security;grant select on public.private_admin_records to authenticated;
      create policy admin_access on public.private_admin_records for select to authenticated using(public.is_tmh_admin());
      insert into auth.users(id,raw_app_meta_data) values('${actor}','{"role":"admin"}');`);
    const count=async aal=>{await db.exec(`set role authenticated;select set_config('request.jwt.claims','${JSON.stringify({sub:actor,aal})}',false)`);return(await db.query('select count(*)::int from private_admin_records')).rows[0].count;};
    assert.equal(await count('aal1'),1);await db.exec('reset role');await db.query('insert into auth.mfa_factors(id,user_id,status) values($1,$2,$3)',[factor.id,actor,'unverified']);assert.equal(await count('aal1'),1);
    await db.exec("reset role;update auth.mfa_factors set status='verified'");assert.equal(await count('aal1'),0);assert.equal(await count(undefined),0);assert.equal(await count('aal2'),1);
    await db.exec("reset role;update auth.users set raw_app_meta_data='{}'");assert.equal(await count('aal2'),0);
    await db.exec("reset role;update auth.users set raw_app_meta_data='{\"role\":\"admin\"}',banned_until=now()+interval '1 day'");assert.equal(await count('aal2'),0);
    await db.exec("reset role;update auth.users set banned_until=null,deleted_at=now()");assert.equal(await count('aal2'),0);
    await assert.rejects(db.query('select * from auth.mfa_factors'),error=>error.code==='42501');
  }finally{await db.close();}
});


test('AAL2 retains fresh verified factors for sensitive-change challenges',async()=>{
  const f=fixture({current:'aal2'});const stale={...f.user,factors:[]};
  const state=await mfa.readAdminMfa(f.auth,stale);
  assert.equal(state.required,false);assert.equal(state.enrolled,true);assert.equal(state.factors[0].id,factor.id);
});

test('fresh factor lookup catches an enrollment absent from both cached user and next-level state',async()=>{
  const f=fixture();f.auth.mfa.getAuthenticatorAssuranceLevel=async()=>({data:{currentLevel:'aal1',nextLevel:'aal1'}});
  const state=await mfa.readAdminMfa(f.auth,{...f.user,factors:[]});assert.equal(state.required,true);assert.equal(state.factors[0].id,factor.id);
  await assert.rejects(saveAdminPassword({...f.auth,getUser:async()=>({data:{user:{...f.user,factors:[]}}})},{password:'another unique password',confirmation:'another unique password'}),error=>error.code==='mfa_required');
  assert.equal(f.calls.some(([action])=>action==='password'),false);
});

test('factor or assurance lookup failure cannot open a resumed admin session',async()=>{
  for(const broken of ['listFactors','getAuthenticatorAssuranceLevel']){
    const f=fixture({enrolled:false}),sessions=[];
    f.auth.mfa[broken]=async()=>({error:{message:'private Auth provider detail'}});
    const stop=observeAdminSession(f.auth,value=>sessions.push(value));await tick();assert.deepEqual(sessions,[null]);stop();
  }
});

test('unsupported verified factors block AAL1 without inventing a usable TOTP factor',async()=>{
  const f=fixture();f.user.factors=[{...factor,factor_type:'phone'}];
  const state=await mfa.readAdminMfa(f.auth,f.user);assert.equal(state.required,true);assert.deepEqual(state.factors,[]);
});

test('unverified setup stays optional and malformed codes never reach Auth',async()=>{
  const f=fixture();f.user.factors=[{...factor,status:'unverified'}];
  assert.equal((await mfa.readAdminMfa(f.auth,f.user)).required,false);
  for(const code of ['12345','1234567','abcdef',' 123456'])await assert.rejects(mfa.verifyAdminTotp(f.auth,factor.id,code),error=>error.name==='AdminMfaError');
  assert.deepEqual(f.calls,[]);await mfa.removeAdminTotp(f.auth,factor.id);assert.deepEqual(f.calls.map(([action])=>action),['unenroll','refresh']);
});

test('banned and deleted accounts cannot resume Admin or change their password',async()=>{
  for(const state of [{deleted_at:new Date().toISOString()},{banned_until:new Date(Date.now()+86400000).toISOString()}]){
    const f=fixture({enrolled:false}),sessions=[];Object.assign(f.user,state);
    const stop=observeAdminSession(f.auth,value=>sessions.push(value));await tick();assert.deepEqual(sessions,[null]);stop();
    await assert.rejects(mfa.enrollAdminTotp(f.auth));
    await assert.rejects(saveAdminPassword(f.auth,{password:'a long unique password',confirmation:'a long unique password'}),error=>error.code==='not_admin');
    assert.equal(f.calls.length,0);
  }
});


function authenticatorUi(file,auth,props={}){
  const states=[],effects=[];let cursor=0;
  const react={useState(initial){const index=cursor++;if(!(index in states))states[index]=initial;return[states[index],value=>{states[index]=typeof value==='function'?value(states[index]):value;}];},useEffect(effect){if(!effects.length)effects.push(effect);}};
  const storage=new Proxy({},{get(){throw Error('Authenticator secrets must stay in memory');}});
  const context={module:{exports:{}},require:name=>name==='react'?react:name.includes('adminMfa')?mfa:{adminSupabase:{auth}},localStorage:storage,sessionStorage:storage,React:{createElement:(type,props,...children)=>({type,props:{...props,children}})}};
  vm.runInNewContext(transformSync(readFileSync(file,'utf8'),{loader:'jsx',format:'cjs'}).code,context);
  const render=()=>{cursor=0;const nodes=[];const walk=node=>{if(Array.isArray(node))return node.forEach(walk);if(!node||typeof node!=='object')return;nodes.push(node);walk(node.props.children);};walk(context.module.exports.default(props));return nodes;};
  return{render,async mount(){render();effects[0]?.();await tick();}};
}

test('authenticator setup is explicit, uses an encoded image and accepts only the manually entered code',async()=>{
  const f=fixture({enrolled:false}),ui=authenticatorUi('src/components/admin/AdminMfaPanel.jsx',f.auth);await ui.mount();assert.equal(f.calls.length,0);
  ui.render().find(node=>node.type==='button'&&node.props.children[0]==='Add authenticator').props.onClick();await tick();
  let nodes=ui.render();assert.match(nodes.find(node=>node.type==='img').props.src,/^data:image\/svg\+xml/);assert.equal(nodes.some(node=>node.props.dangerouslySetInnerHTML),false);
  nodes.find(node=>node.type==='input').props.onChange({target:{value:'12a3456'}});
  nodes=ui.render();assert.equal(nodes.find(node=>node.type==='input').props.value,'123456');
  nodes.find(node=>node.type==='form').props.onSubmit({preventDefault(){}});await tick();
  assert.equal(f.calls.find(([action])=>action==='verify')[1].code,'123456');assert.equal(ui.render().some(node=>node.type==='img'),false);
  assert.equal(ui.render().some(node=>node.props.role==='status'),true);
});

test('authenticator challenge clears rejected codes and never exposes provider details',async()=>{
  const f=fixture({codeValid:false});let opened=0;
  const ui=authenticatorUi('src/components/admin/AdminMfaChallenge.jsx',f.auth,{factors:[factor],onVerified(){opened++;}});
  ui.render().find(node=>node.type==='input').props.onChange({target:{value:'123456'}});
  await ui.render().find(node=>node.type==='form').props.onSubmit({preventDefault(){}});
  const nodes=ui.render();assert.equal(opened,0);assert.equal(nodes.find(node=>node.type==='input').props.value,'');
  assert.doesNotMatch(nodes.find(node=>node.props.role==='alert').props.children.join(''),/private provider/);
});


test('a removed last factor restores optional access despite stale cached assurance',async()=>{
  const f=fixture({enrolled:false,current:'aal2'});
  f.auth.mfa.getAuthenticatorAssuranceLevel=async()=>({data:{currentLevel:'aal2',nextLevel:'aal2'}});
  const state=await mfa.readAdminMfa(f.auth,{...f.user,factors:[factor]});assert.equal(state.enrolled,false);assert.equal(state.required,false);assert.deepEqual(state.factors,[]);
});

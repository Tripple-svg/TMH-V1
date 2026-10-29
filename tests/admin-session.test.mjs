import {test} from 'node:test';
import assert from 'node:assert/strict';
import {observeAdminSession} from '../src/lib/adminSession.js';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(session=null){let event,stopped=false;const checks=[],changes=[];
  const auth={onAuthStateChange(fn){event=fn;return {data:{subscription:{unsubscribe(){stopped=true;}}}};},getSession:async()=>({data:{session}}),getUser:async token=>{checks.push(token);return {data:{user:token==='customer'?{user_metadata:{role:'admin'}}:{app_metadata:{role:'admin'}}}};}};
  const cleanup=observeAdminSession(auth,value=>changes.push(value));return {auth,changes,checks,cleanup,event:(type,session)=>event(type,session),get stopped(){return stopped;}};
}
test('admin session resumes a verified account, refreshes tokens, signs out and unsubscribes',async()=>{
  const f=fixture({access_token:'first'});await tick();assert.equal(f.changes.at(-1).access_token,'first');
  f.event('TOKEN_REFRESHED',{access_token:'second'});await tick();assert.equal(f.changes.at(-1).access_token,'second');
  f.event('SIGNED_OUT',null);await tick();assert.equal(f.changes.at(-1),null);f.cleanup();assert.equal(f.stopped,true);
});
test('a normal customer cannot become an administrator through editable user_metadata',async()=>{
  const f=fixture({access_token:'customer'});await tick();assert.deepEqual(f.changes,[null]);f.cleanup();
});
test('a slow verification cannot resurrect a signed-out session',async()=>{
  const f=fixture();await tick();let resolve;f.auth.getUser=()=>new Promise(done=>{resolve=done;});
  f.event('SIGNED_IN',{access_token:'pending'});await tick();f.event('SIGNED_OUT',null);await tick();
  resolve({data:{user:{app_metadata:{role:'admin'}}}});await tick();assert.equal(f.changes.at(-1),null);f.cleanup();
});

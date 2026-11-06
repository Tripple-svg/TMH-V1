import {test} from 'node:test';
import assert from 'node:assert/strict';
import {adminMfaFailure,enrollAdminTotp} from '../src/lib/adminMfa.js';
import {getAdminDeviceId} from '../src/lib/adminDevice.js';
import {dataExportHtml} from '../supabase/functions/_shared/data-export-html.js';
import {mountDialogFocus} from '../src/lib/useDialogFocus.js';
import {readInitialTheme,saveTheme} from '../src/lib/themePreference.js';

test('MFA keeps actionable codes and stages without exposing provider text or secrets',async()=>{
  for(const code of ['mfa_factor_name_conflict','session_expired','mfa_disabled','mfa_totp_enroll_not_enabled']){
    const auth={getUser:async()=>({data:{user:{id:'admin-a',app_metadata:{role:'admin'}}}}),refreshSession:async()=>({data:{session:{access_token:'test'}}}),mfa:{listFactors:async()=>({data:{all:[]}}),getAuthenticatorAssuranceLevel:async()=>({data:{currentLevel:'aal1',nextLevel:'aal1'}}),enroll:async()=>({error:{code,message:'SECRET-SEED-AND-TOKEN'}})}};
    await assert.rejects(enrollAdminTotp(auth),error=>error.code===code&&error.operation==='enroll'&&!error.message.includes('SECRET'));
  }
  assert.match(adminMfaFailure({name:'TimeoutError'}).message,/connection/);
  assert.doesNotMatch(adminMfaFailure({code:'private-token',message:'SECRET'}).message,/SECRET|private-token/);
});
test('admin browser ID persists and replaces malformed storage without depending on IP or user-agent',()=>{
  const values=new Map(),storage={getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value)};
  const first=getAdminDeviceId(storage);assert.match(first,/^[a-f0-9-]{36}$/i);assert.equal(getAdminDeviceId(storage),first);
  values.set('tmh_admin_device_v1','<script>');assert.match(getAdminDeviceId(storage),/^[a-f0-9-]{36}$/i);
  assert.doesNotThrow(()=>getAdminDeviceId({getItem(){throw Error('blocked');}}));
});
test('blocked browser storage does not prevent the theme or application from starting',()=>{
  const browser={get localStorage(){throw Error('Storage denied');},matchMedia:()=>({matches:true})};
  assert.equal(readInitialTheme(browser),'dark');assert.doesNotThrow(()=>saveTheme('light',browser));
  assert.equal(readInitialTheme({localStorage:{getItem:()=> 'light'},matchMedia:()=>({matches:true})}),'light');
});
test('readable data archive escapes injection, excludes staff fields, handles empty records and contains no active resources',()=>{
  const html=dataExportHtml({reviews:[{brand:'<script>alert(1)</script>',name:'A & B',assessment:'First line\nNext line',followup_notes:'STAFF-SECRET'}],conversations:[{messages:[{role:'user',content:'<img src=x onerror=alert(1)>',timestamp:1700000000000}]}]});
  assert.match(html,/&lt;script&gt;/);assert.match(html,/A &amp; B/);assert.match(html,/&lt;img/);assert.match(html,/Lagos, Nigeria/);
  assert.doesNotMatch(html,/<script|<img|STAFF-SECRET|<iframe|https:\/\//i);
  assert.match(dataExportHtml({}),/No matching saved reviews/);
});
test('dialog keyboard containment wraps both directions, handles empty dialogs and restores only the top layer',()=>{
  const handlers=new Map(),doc={activeElement:null,addEventListener(type,fn){const set=handlers.get(type)||new Set();set.add(fn);handlers.set(type,set);},removeEventListener(type,fn){handlers.get(type)?.delete(fn);}};
  const element=()=>({isConnected:true,focus(){doc.activeElement=this;},closest(){return null;},getClientRects(){return[{}];}});
  const trigger=element(),first=element(),last=element(),disabled={...element(),matches:()=>true},panel={...element(),querySelectorAll:()=>[first,last,disabled],contains:item=>[panel,first,last,disabled].includes(item)};
  const key=(key,shiftKey=false)=>{let prevented=false;for(const fn of [...handlers.get('keydown')||[]])fn({key,shiftKey,preventDefault(){prevented=true;},stopPropagation(){}});return prevented;};
  trigger.focus();let closed=0;const close=mountDialogFocus(panel,()=>closed++,doc);assert.equal(doc.activeElement,first);
  last.focus();assert.equal(key('Tab'),true);assert.equal(doc.activeElement,first);key('Tab',true);assert.equal(doc.activeElement,last);
  const child={...element(),querySelectorAll:()=>[],contains:item=>item===child};const closeChild=mountDialogFocus(child,()=>closed++,doc);assert.equal(key('Tab'),true);assert.equal(doc.activeElement,child);key('Escape');assert.equal(closed,1);
  closeChild();assert.equal(doc.activeElement,last);close();assert.equal(doc.activeElement,trigger);
  assert.equal(handlers.get('keydown').size,0);assert.equal(handlers.get('focusin').size,0);
});

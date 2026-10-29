import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { transformSync } from 'esbuild';
import * as workspace from '../src/lib/adminWorkspace.js';

const source = readFileSync(new URL('../src/pages/AdminDashboard.jsx', import.meta.url), 'utf8')
  .replace(/^import .* from 'react';\r?\n/m, '')
  .replaceAll('import.meta.env.VITE_SUPABASE_URL', "'https://project.supabase.co'")
  .replaceAll('import.meta.env.VITE_SUPABASE_ANON_KEY', "'public-key'")
  .replace('export default function AdminDashboard()', 'function AdminDashboard()');
const code = transformSync(`${source}\nmodule.exports={WelcomeEmailStatus,ScoreBreakdown,useLeadActions,AISetupPanel};`, { loader:'jsx', format:'cjs' }).code;
const nodes = root => {
  const result=[];
  const visit=node=>{if(Array.isArray(node))return node.forEach(visit);if(!node||typeof node!=='object')return;result.push(node);visit(node.props.children);};
  visit(root);return result;
};
const text = root => {
  if(Array.isArray(root))return root.map(text).join('');
  if(root && typeof root==='object')return text(root.props.children);
  return root==null || typeof root==='boolean' ? '' : String(root);
};
function harness(send=async()=>({ok:true,review:{id:'review-1',welcome_email_sent:true}})){
  let cursor=0,lost=0;
  const slots=[],requests=[],changes=[],toasts=[];
  const context={module:{exports:{}},require:name=>name.includes('adminWorkspace')?workspace:{__esModule:true,default(){ }},
    React:{createElement:(type,props,...children)=>({type,props:{...props,children}})},
    useState(initial){const index=cursor++;if(!(index in slots))slots[index]=typeof initial==='function'?initial():initial;return[slots[index],value=>{slots[index]=typeof value==='function'?value(slots[index]):value;}];},
    useRef(initial){const index=cursor++;return slots[index]||={current:initial};},
    useCallback:fn=>fn,useEffect(){},useMemo:fn=>fn(),
    fetch:async(url,options)=>{const request={url,...options,body:JSON.parse(options.body)};requests.push(request);const response=await send(request);const{status=200,...body}=response;return{status,ok:status<400,json:async()=>body};},
  };
  vm.runInNewContext(code,context);
  const props={lead:{id:'review-1',email:'buyer@example.com',full_name:'Buyer'},accessToken:'test-admin-jwt',onLeadChange:value=>changes.push(value),showToast:(...args)=>toasts.push(args),onAuthLost:()=>lost++};
  return{render(name,extra={}){cursor=0;return context.module.exports[name]({...props,...extra});},requests,changes,toasts,get lost(){return lost;}};
}

test('lead rows expose review-mail acceptance without claiming inbox delivery and offer a pending retry',()=>{
  const ui=harness();const accepted=ui.render('WelcomeEmailStatus',{lead:{email:'buyer@example.com',welcome_email_sent:true},onRetry(){}});
  assert.match(text(accepted),/Provider accepted/);assert.equal(nodes(accepted).filter(node=>node.type==='button').length,0);
  assert.ok(nodes(accepted).some(node=>node.props.title?.includes('Inbox delivery is not confirmed')));
  const pending=ui.render('WelcomeEmailStatus',{lead:{email:'buyer@example.com',welcome_email_sent:false,welcome_email_last_error:'resend_http_503'},onRetry(){}});
  assert.match(text(pending),/Needs retry/);assert.equal(nodes(pending).find(node=>node.type==='button').props['aria-label'],'Retry review email for buyer@example.com');
  const receipt=ui.render('WelcomeEmailStatus',{lead:{email:'buyer@example.com',welcome_email_sent:false,welcome_email_id:'provider-receipt'},onRetry(){}});
  assert.match(text(receipt),/Acceptance saved · status pending/);assert.match(text(receipt),/Repair status/);
});

test('review retry posts only the review identity and prevents overlapping duplicate sends',async()=>{
  let complete;const ui=harness(()=>new Promise(resolve=>{complete=resolve;}));
  const action=ui.render('useLeadActions');const first=action.onRetryWelcome();await action.onRetryWelcome();
  assert.equal(ui.requests.length,1);assert.equal(ui.requests[0].url,'https://project.supabase.co/functions/v1/admin-update-lead');
  assert.deepEqual(ui.requests[0].body,{action:'retryWelcome',reviewId:'review-1'});
  assert.equal(ui.requests[0].headers.Authorization,'Bearer test-admin-jwt');
  complete({ok:true,review:{id:'review-1',welcome_email_sent:true}});await first;
  assert.equal(ui.changes[0].welcome_email_sent,true);assert.match(ui.toasts[0][1],/accepted by the provider/);
  assert.equal(ui.render('useLeadActions').retryingWelcome,false);
});

test('review retry retains server diagnostic/status patches on failure and resets after expired admin auth',async()=>{
  const ui=harness(async()=>({status:502,ok:false,error:'Resend is temporarily unavailable',review:{id:'review-1',welcome_email_last_error:'resend_http_503'}}));
  await ui.render('useLeadActions').onRetryWelcome();assert.equal(ui.changes[0].welcome_email_last_error,'resend_http_503');assert.deepEqual(ui.toasts[0],['error','Resend is temporarily unavailable']);assert.equal(ui.render('useLeadActions').retryingWelcome,false);
  const expired=harness(async()=>({status:401,ok:false}));await expired.render('useLeadActions').onRetryWelcome();assert.equal(expired.lost,1);assert.equal(expired.changes.length,0);
});

test('new rubric labels and weights remain separate from previously saved review scores',()=>{
  const ui=harness();
  const current=ui.render('ScoreBreakdown',{lead:{platform_type:'website',rubric_version:'2026-10-27',score_breakdown:{clarity:20,trust:17,positioning:16,conversion:15}}});
  assert.match(text(current),/Positioning/);assert.match(text(current),/Conversion path/);assert.ok(!text(current).includes('Technical'));assert.match(text(current),/\/ 25/);
  const legacy=ui.render('ScoreBreakdown',{lead:{platform_type:'website',score_breakdown:{clarity:12,trust:15,conversion:11,technical:13,content:14}}});
  assert.match(text(legacy),/Previous review method/);assert.match(text(legacy),/Technical/);assert.match(text(legacy),/\/ 20/);assert.ok(!text(legacy).includes('Positioning'));
  const social=ui.render('ScoreBreakdown',{lead:{platform_type:'social',rubric_version:'2026-10-27',score_breakdown:{profile:12,direction:15,value:11,readiness:13}}});
  assert.match(text(social),/Visible content direction/);assert.ok(!text(social).includes('Engagement'));
});

test('AI setup checks use the admin endpoint, lock concurrent checks and show safe provider diagnostics',async()=>{
  let complete;const ui=harness(()=>new Promise(resolve=>{complete=resolve;}));
  let tree=ui.render('AISetupPanel');const check=nodes(tree).find(node=>node.type==='button');const first=check.props.onClick();await check.props.onClick();
  assert.equal(ui.requests.length,1);assert.deepEqual(ui.requests[0].body,{action:'aiHealth'});
  complete({ok:true,gemini:{configured:true,enabled:true,model:'configured-gemini-model',status:'unavailable',code:'gemini_http_503'},groq:{configured:true,model:'fallback-model'}});await first;
  tree=ui.render('AISetupPanel');assert.match(text(tree),/configured-gemini-model/);assert.match(text(tree),/gemini_http_503/);assert.match(text(tree),/temporary provider unavailability/);assert.match(text(tree),/does not prove your token budget is exhausted/);
});

test('AI setup check errors remain retryable and expired auth ends the admin session',async()=>{
  const ui=harness(async()=>({status:503,ok:false,error:'Could not check the model right now'}));
  await nodes(ui.render('AISetupPanel')).find(node=>node.type==='button').props.onClick();const tree=ui.render('AISetupPanel');assert.ok(nodes(tree).some(node=>node.props.role==='alert'));assert.equal(nodes(tree).find(node=>node.type==='button').props.disabled,false);
  const expired=harness(async()=>({status:401,ok:false}));await nodes(expired.render('AISetupPanel')).find(node=>node.type==='button').props.onClick();assert.equal(expired.lost,1);
});

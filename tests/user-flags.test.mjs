import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { buildSync } from 'esbuild';
const REVIEW = '10000000-0000-4000-8000-000000000001';
const VISITOR = '20000000-0000-4000-8000-000000000001';
const EVENT = '30000000-0000-4000-8000-000000000001';
const source = buildSync({ entryPoints: [new URL('../supabase/functions/flag-user/index.ts', import.meta.url).pathname.replace(/^\/(\w:)/,'$1')],
  bundle: true, write: false, platform: 'node', format: 'cjs', external: ['https://*'], logLevel: 'silent' }).outputFiles[0].text;
function load({ flag = 'white', rpcError = null, deliveryFailure = null, pendingFailure = false, auth = null, env = {}, guest = false } = {}) {
  let handler; const calls = [], sends = [], notifications = [], events = new Set();
  let currentFlag = flag;
  const client = {
    auth: { async getUser() { return auth || { data: { user: null }, error: { message: 'Invalid' } }; } },
    async rpc(name, args) {
      calls.push({ name, args }); if (rpcError) return { data: null, error: rpcError };
      const targetReview = args.p_review_id || (!guest && !args.p_visitor_id ? REVIEW : null);
      const visitor = args.p_visitor_id || null;
      let changed = false;
      if (name === 'apply_haven_ai_flag') {
        changed = !events.has(args.p_event_key) && currentFlag === 'white'; events.add(args.p_event_key);
        if (changed) currentFlag = 'yellow';
      } else { changed = currentFlag !== args.p_status; currentFlag = args.p_status; }
      if (changed && ['yellow','red'].includes(currentFlag)) notifications.push({ id: EVENT, review_id: targetReview, visitor_id: visitor,
        status: currentFlag, sent_at: null, customer_required: Boolean(targetReview), customer_sent_at: null });
      return { data: { flagStatus: currentFlag, changed, reviewId: targetReview, visitorId: visitor,
        review: targetReview ? { id: targetReview, flag_status: currentFlag, flag_reason: args.p_reason } : null,
        visitor: visitor ? { id: visitor, flag_status: currentFlag, flag_reason: args.p_reason } : null }, error: null };
    },
    functions: { async invoke(name, { body }) {
      sends.push({ name, body }); if (deliveryFailure === name) return { data: { ok: false }, error: null };
      const row = notifications.find((item) => item.id === body.notificationId);
      row[name === 'send-flag-alert' ? 'sent_at' : 'customer_sent_at'] = new Date().toISOString();
      return { data: { ok: true }, error: null };
    } },
    from(table) { assert.equal(table, 'flag_alert_notifications'); const filters = [];
      return { select() { return this; }, or() { return this; }, order() { return this; }, limit() { return this; },
        eq(column, value) { filters.push((row) => row[column] === value); return this; },
        then(resolve, reject) { return Promise.resolve(pendingFailure ? { data: null, error: { message: 'Offline' } }
          : { data: notifications.filter((row) => filters.every((filter) => filter(row)) && (!row.sent_at || (row.customer_required && !row.customer_sent_at))), error: null }).then(resolve,reject); } };
    },
  };
  vm.runInNewContext(source, {
    require(name) { return name.includes('server.ts') ? { serve(fn) { handler = fn; } } : { createClient: () => client }; },
    Deno: { env: { get(name) { return ({ SUPABASE_URL: 'https://project.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'service-test', ADMIN_PASSWORD: 'admin-test', ...env })[name]; } } },
    Request, Response, Headers, console: { error() {} },
  });
  const request = (body, authorization = 'Bearer service-test', origin = 'http://localhost:5173') => new Request('https://project.supabase.co/functions/v1/flag-user', {
    method: 'POST', headers: { 'Content-Type':'application/json', authorization, origin }, body: JSON.stringify(body),
  });
  return { handler, request, calls, sends, notifications, get flag() { return currentFlag; } };
}
const admin = (status = 'yellow', extra = {}) => ({ email: 'Owner@Example.com', status, reason: 'Terms violation', ...extra });
const automatic = (extra = {}) => ({ source: 'ai', reviewId: REVIEW, eventKey: 'chat:session:turn', reason: 'Haven detected harassment.', ...extra });

test('moderation admin: service bearer and existing password authorize the atomic RPC', async () => {
  for (const [body, token] of [[admin(), 'Bearer service-test'], [admin('red',{password:'admin-test'}), 'Bearer anon']]) {
    const app=load(); const response=await app.handler(app.request(body,token)); assert.equal(response.status,200);
    assert.equal(app.calls[0].name,'set_haven_moderation_flag'); assert.equal(app.calls[0].args.p_email,'owner@example.com');
  }
});
test('moderation admin: only server-verified app_metadata administrator claims authorize', async () => {
  for (const allowed of [true,false]) {
    const app=load({auth:{data:{user:allowed ? {app_metadata:{role:'admin'}} : {user_metadata:{role:'admin'}}},error:null}});
    assert.equal((await app.handler(app.request(admin(),'Bearer user-session'))).status,allowed?200:401);
  }
});
test('moderation admin: missing, forged, wrong-password and absent-password credentials cannot write', async () => {
  for (const [body,token,env] of [[admin(),'',{}],[admin('red',{password:'wrong'}),'Bearer forged',{}],[admin('red',{password:''}),'',{ADMIN_PASSWORD:undefined}]]) {
    const app=load({env}); assert.equal((await app.handler(app.request(body,token))).status,401); assert.equal(app.calls.length,0);
  }
});
test('moderation admin: visitor restrictions target the verified stored identity rather than an invented email', async () => {
  const app=load({guest:true}); const response=await app.handler(app.request({visitorId:VISITOR,status:'red',reason:'Admin review'}));
  assert.equal(response.status,200); const data=await response.json(); assert.equal(data.visitor.flag_status,'red');
  assert.equal(app.calls[0].args.p_visitor_id,VISITOR); assert.equal(app.calls[0].args.p_email,null);
  assert.deepEqual(app.sends.map((item)=>item.name),['send-flag-alert']);
});
test('moderation admin: yellow and red queue both team and customer delivery; white queues neither', async () => {
  for(const status of ['yellow','red','white']) {
    const app=load(); await app.handler(app.request(admin(status)));
    assert.equal(app.sends.length,status==='white'?0:2);
    if(status!=='white') assert.deepEqual(app.sends.map((item)=>item.name),['send-flag-alert','send-flag-customer']);
  }
});
test('moderation admin: saved red restriction survives email failure and both recipients are attempted independently', async () => {
  for(const failed of ['send-flag-alert','send-flag-customer']) {
    const app=load({deliveryFailure:failed}); const response=await app.handler(app.request(admin('red')));
    assert.equal(response.status,502); assert.equal(app.flag,'red'); assert.equal(app.sends.length,2);
    assert.equal((await response.json()).review.flag_status,'red');
  }
});
test('moderation admin: same-status retry drains pending delivery without sending already-delivered channels', async () => {
  const app=load({deliveryFailure:'send-flag-customer'});
  await app.handler(app.request(admin('yellow'))); await app.handler(app.request(admin('yellow')));
  assert.equal(app.notifications.length,1); assert.equal(app.sends.filter((item)=>item.name==='send-flag-alert').length,1);
  assert.equal(app.sends.filter((item)=>item.name==='send-flag-customer').length,2);
});
test('moderation admin: invalid targets, status, reason and origins are rejected without writes', async () => {
  for(const body of [admin('blue'),admin('yellow',{reason:'x'.repeat(2001)}),admin('yellow',{email:'bad'}),admin('red',{visitorId:VISITOR}),{visitorId:'bad',status:'red'}]) {
    const app=load(); assert.equal((await app.handler(app.request(body))).status,400); assert.equal(app.calls.length,0);
  }
  const app=load(); assert.equal((await app.handler(app.request(admin(),'Bearer service-test','https://attacker.example'))).status,403);
});
test('moderation admin: missing migrations and missing users report actionable errors without delivery', async () => {
  for(const [code,status] of [['42883',503],['P0002',404]]) {
    const app=load({rpcError:{code}}); assert.equal((await app.handler(app.request(admin()))).status,status); assert.equal(app.sends.length,0);
  }
});
test('automatic moderation: only internal service credentials may create AI events', async () => {
  const app=load(); assert.equal((await app.handler(app.request({...automatic(),password:'admin-test'},'Bearer anon'))).status,401);
  assert.equal(app.calls.length,0);
});
test('automatic moderation: first event becomes yellow; repeated events cannot become red or spam notifications', async () => {
  const app=load(); for(let i=0;i<3;i++) assert.equal((await app.handler(app.request(automatic()))).status,200);
  assert.equal(app.flag,'yellow'); assert.equal(app.notifications.length,1); assert.equal(app.sends.length,2);
  assert.equal(app.calls[0].name,'apply_haven_ai_flag'); assert.equal('p_status' in app.calls[0].args,false);
});
test('automatic moderation: a new AI event cannot clear or escalate an existing administrator restriction', async () => {
  const app=load({flag:'red'}); const response=await app.handler(app.request(automatic()));
  assert.equal((await response.json()).flagStatus,'red'); assert.equal(app.sends.length,0);
  assert.equal((await app.handler(app.request(automatic({status:'red'})))).status,400);
});
test('automatic moderation: guests receive a durable yellow flag and team alert without pretending to know an email', async () => {
  const app=load({guest:true}); const response=await app.handler(app.request(automatic({reviewId:undefined,visitorId:VISITOR})));
  assert.equal((await response.json()).flagStatus,'yellow'); assert.equal(app.notifications[0].visitor_id,VISITOR);
  assert.equal(app.notifications[0].customer_required,false); assert.deepEqual(app.sends.map((item)=>item.name),['send-flag-alert']);
});
test('automatic moderation: email transport failure is pending durable work rather than a lost flag or failed chat', async () => {
  const app=load({deliveryFailure:'send-flag-alert'}); const response=await app.handler(app.request(automatic()));
  const data=await response.json(); assert.equal(response.status,200); assert.equal(data.flagStatus,'yellow'); assert.equal(data.deliveryPending,true);
});
test('automatic moderation: pending read failure preserves saved status for later drain', async () => {
  const app=load({pendingFailure:true}); const response=await app.handler(app.request(automatic()));
  assert.equal((await response.json()).deliveryPending,true); assert.equal(app.flag,'yellow');
});
test('automatic moderation: malformed event keys, IDs and reasons cannot reach the RPC', async () => {
  for(const body of [automatic({eventKey:'person@example.com'}),automatic({reviewId:'bad'}),automatic({reason:''})]) {
    const app=load(); assert.equal((await app.handler(app.request(body))).status,400); assert.equal(app.calls.length,0);
  }
});


test('notification retry: admin can drain pending mail without changing flags, reasons or creating new events', async () => {
  const app = load({ flag: 'red' });
  app.notifications.push({ id: EVENT, sent_at: null, customer_required: true, customer_sent_at: null });
  const response = await app.handler(app.request({ action: 'retryNotifications', password: 'admin-test' }, 'Bearer anon'));
  assert.equal(response.status, 200); assert.equal((await response.json()).attempted, 1);
  assert.equal(app.flag, 'red'); assert.equal(app.calls.length, 0); assert.equal(app.notifications.length, 1);
  assert.deepEqual(app.sends.map(({ name }) => name), ['send-flag-alert', 'send-flag-customer']);
  assert.equal((await app.handler(app.request({ action: 'retryNotifications', password: 'wrong' }, 'Bearer anon'))).status, 401);
});

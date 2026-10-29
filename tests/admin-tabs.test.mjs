import * as workspace from '../src/lib/adminWorkspace.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { transformSync } from 'esbuild';

const source = readFileSync(new URL('../src/pages/AdminDashboard.jsx', import.meta.url), 'utf8')
  .replace(/^import .* from 'react';\r?\n/m, '')
  .replaceAll('import.meta.env.VITE_SUPABASE_URL', "'https://project.supabase.co'")
  .replaceAll('import.meta.env.VITE_SUPABASE_ANON_KEY', "'public-anon-key'")
  .replace('export default function AdminDashboard()', 'function AdminDashboard()');
const code = transformSync(`${source}\nmodule.exports={AdminDashboard,LeadConversations,StandaloneSessionRow,TranscriptPanel,PurchasesPanel,SessionsPanel,BookingsPanel};`, { loader: 'jsx', format: 'cjs' }).code;
const fixture = (scope = 'support') => ({ id: `session-${scope}`, scope, review_id: null, visitor_id: 'visitor-1', updated_at: '2026-10-24T12:00:00Z', transcript_loaded: false, message_count: 8, total_exchanges: 4, flag_status: 'white' });
const sessionResponse = (scope = 'support') => ({ ok: true, session: { ...fixture(scope), transcript_loaded: true, messages: [{ id: 'message-1', role: 'user', content: 'Actual saved conversation' }], messages_returned: 1 } });

function nodes(root) {
  const all = [];
  const visit = (node) => { if (Array.isArray(node)) return node.forEach(visit); if (!node || typeof node !== 'object') return; all.push(node); visit(node.props.children); };
  visit(root); return all;
}

function harness({ dashboard = false, send = async () => ({ status: 200, ...sessionResponse() }) } = {}) {
  const states = [], refs = [], effects = [], pendingEffects = [], requests = [], changes = [], purchaseChanges = [], toasts = [];
  let cursor = 0, refCursor = 0, effectCursor = 0, lost = 0;
  const context = {
    module: { exports: {} },
    require(name) { return name.includes('adminWorkspace') ? workspace : name.includes('team-assignment-public') ? {SERVICE_NAMES:{web:'Brand & Web Engineering',growth:'Strategic Growth & Consulting',content:'Content & Social Architecture'}} : { __esModule:true, default:function InquiryWorkflow(){} }; },
    React: { createElement: (type, props, ...children) => ({ type, props: { ...props, children } }) },
    useState(initial) {
      const slot = cursor++;
      if (!(slot in states)) states[slot] = dashboard && slot === 1 ? true
        : dashboard && slot === 2 ? [{ id: 'lead-1', email: 'owner@example.com', flag_status: 'yellow' }]
          : dashboard && slot === 9 ? [{ id: 'purchase-1', email: 'buyer@example.com', reference: 'UNSEEN_1', amount: 10000 }]
            : dashboard && slot === 12 ? [fixture('support')]
              : dashboard && slot === 13 ? [fixture('service')]
                : typeof initial === 'function' ? initial() : initial;
      return [states[slot], (next) => { states[slot] = typeof next === 'function' ? next(states[slot]) : next; }];
    },
    useRef(initial) { const slot = refCursor++; return refs[slot] ||= { current: initial }; },
    useEffect(effect, deps) {
      const slot = effectCursor++;
      const previous = effects[slot];
      if (!previous || deps.some((value, index) => value !== previous.deps[index])) {
        pendingEffects.push(() => { previous?.cleanup?.(); effects[slot] = { deps, cleanup: effect() }; });
      }
    },
    useCallback: (fn) => fn, useMemo: (fn) => fn(),
    sessionStorage: { getItem: () => 'admin-test' },
    window: { prompt: () => 'Repeated misuse' },
    setTimeout: () => 1, clearTimeout() {},
    fetch: async (url, options) => {
      const request = { url, ...options, body: JSON.parse(options.body) };
      requests.push(request);
      const result = await send(request, requests.length - 1);
      const { status = 200, ...body } = result;
      return { status, ok: status < 400, json: async () => body };
    },
  };
  vm.runInNewContext(code, context);
  const render = (name, props = {}) => {
    cursor = refCursor = effectCursor = 0;
    return nodes(context.module.exports[name](props));
  };
  return { render, requests, changes, purchaseChanges, toasts, states,
    onAuthLost() { lost++; }, onVisitorChange: (visitor) => changes.push(visitor), showToast: (...args) => toasts.push(args),
    onPurchaseChange: (purchase) => purchaseChanges.push(purchase),
    async effects() { pendingEffects.splice(0).forEach((effect) => effect()); for (let i = 0; i < 10; i++) await Promise.resolve(); },
    get lost() { return lost; },
  };
}

test('admin tabs: six counted sections switch panels without leaving other section content visible', () => {
  const ui = harness({ dashboard: true });
  let tree = ui.render('AdminDashboard');
  const tabs = tree.filter((node) => node.props.role === 'tab');
  assert.deepEqual(tabs.map((node) => node.props.children[0]), ['Leads', 'Playbook Purchases', 'Bookings', 'Team Inquiries', 'Support Chats', 'Service Chats']);
  assert.ok(tabs.every((node) => node.props.children[1].props.children[0] === (['tab-bookings','tab-team'].includes(node.props.id) ? 0 : 1)));
  assert.ok(tree.some((node) => node.type === 'table'));
  tabs[4].props.onClick();
  tree = ui.render('AdminDashboard');
  assert.ok(!tree.some((node) => node.type === 'table'));
  const support = tree.find((node) => node.type?.name === 'SessionsPanel');
  assert.equal(support.props.scope, 'support');
  assert.equal(support.props.sessions[0].id, 'session-support');
  tree.find((node) => node.props.id === 'tab-purchases').props.onClick();
  tree = ui.render('AdminDashboard');
  assert.ok(tree.some((node) => node.type?.name === 'PurchasesPanel'));
  assert.ok(!tree.some((node) => node.type?.name === 'SessionsPanel'));
});

test('lead conversations: scope switcher keeps all linked scopes under one lead', () => {
  const ui = harness();
  const lead = { id: 'lead-1', sessions: ['audit', 'support', 'service'].map((scope) => ({ ...fixture(scope), review_id: 'lead-1' })) };
  const props = { lead, accessToken: 'test-admin-jwt', onAuthLost: ui.onAuthLost };
  let tree = ui.render('LeadConversations', props);
  assert.equal(tree.find((node) => node.type?.name === 'TranscriptPanel').props.session.scope, 'audit');
  tree.find((node) => node.type === 'button' && node.props.children[0] === 'support').props.onClick();
  tree = ui.render('LeadConversations', props);
  assert.equal(tree.find((node) => node.type?.name === 'TranscriptPanel').props.session.scope, 'support');
  assert.equal(ui.requests.length, 0, 'Selecting metadata does not fetch until TranscriptPanel mounts');
});

test('guest chat: transcript mounts only after expansion and visitor moderation keeps saved502 status', async () => {
  const visitor = { id: 'visitor-1', flag_status: 'yellow', flag_reason: 'Repeated misuse' };
  const ui = harness({ send: async () => ({ status: 502, ok: false, error: 'Flag saved; team email pending', visitor }) });
  const props = { session: fixture(), accessToken: 'test-admin-jwt', onAuthLost: ui.onAuthLost, onVisitorChange: ui.onVisitorChange, showToast: ui.showToast };
  let tree = ui.render('StandaloneSessionRow', props);
  assert.ok(!tree.some((node) => node.type?.name === 'TranscriptPanel'));
  tree.find((node) => node.type === 'button' && node.props['aria-expanded'] === false).props.onClick();
  tree = ui.render('StandaloneSessionRow', props);
  assert.ok(tree.some((node) => node.type?.name === 'TranscriptPanel'));
  await tree.find((node) => node.type?.name === 'FlagSelect').props.onChange({ target: { value: 'yellow' } });
  assert.deepEqual(ui.requests[0].body, { visitorId: 'visitor-1', sessionId: 'session-support', status: 'yellow', reason: 'Repeated misuse' });
  assert.equal(ui.changes[0].flag_status, 'yellow');
  assert.match(ui.toasts[0][1], /email pending/);
});

test('transcript: authenticated lazy request is cached and never fetches while the closed row is rendered', async () => {
  const ui = harness();
  const props = { session: fixture(), accessToken: 'test-admin-jwt', onAuthLost: ui.onAuthLost };
  let tree = ui.render('TranscriptPanel', props);
  assert.ok(tree.some((node) => node.props.role === 'status'));
  await ui.effects();
  assert.equal(ui.requests.length, 1);
  assert.deepEqual(ui.requests[0].body, { action: 'transcript', sessionId: 'session-support' });
  tree = ui.render('TranscriptPanel', props);
  assert.equal(tree.find((node) => node.type?.name === 'TranscriptViewer').props.session.messages[0].content, 'Actual saved conversation');
  await ui.effects();
  assert.equal(ui.requests.length, 1);
});

test('transcript: failed lazy request provides an explicit retry and then renders saved content', async () => {
  const ui = harness({ send: async (_, attempt) => attempt === 0 ? { status: 500, ok: false, error: 'Conversation unavailable' } : { status: 200, ...sessionResponse() } });
  const props = { session: fixture(), accessToken: 'test-admin-jwt', onAuthLost: ui.onAuthLost };
  ui.render('TranscriptPanel', props); await ui.effects();
  let tree = ui.render('TranscriptPanel', props);
  assert.ok(tree.some((node) => node.props.role === 'alert'));
  tree.find((node) => node.type === 'button').props.onClick();
  ui.render('TranscriptPanel', props); await ui.effects();
  tree = ui.render('TranscriptPanel', props);
  assert.equal(ui.requests.length, 2);
  assert.ok(tree.some((node) => node.type?.name === 'TranscriptViewer'));
});

test('transcript: refresh replaces an earlier empty snapshot with newly saved messages', async () => {
  const ui = harness({ send: async (_, attempt) => ({ ok: true, session: { ...sessionResponse().session, messages: attempt ? [{ role: 'user', content: 'Back after access was restored' }] : [] } }) });
  const props = { session: fixture(), accessToken: 'test-admin-jwt' };
  ui.render('TranscriptPanel', props); await ui.effects();
  let tree = ui.render('TranscriptPanel', props);
  assert.equal(tree.find((node) => node.type?.name === 'TranscriptViewer').props.session.messages.length, 0);
  tree.find((node) => node.type === 'button' && node.props.children.includes('Refresh transcript')).props.onClick();
  ui.render('TranscriptPanel', props); await ui.effects();
  tree = ui.render('TranscriptPanel', props);
  assert.equal(ui.requests.length, 2);
  assert.equal(tree.find((node) => node.type?.name === 'TranscriptViewer').props.session.messages[0].content, 'Back after access was restored');
});

test('bookings: upcoming and cancellation filters separate provider and legacy statuses', () => {
  const ui = harness();
  const bookings = [
    { id: 1, full_name: 'Upcoming Buyer', email: 'buyer@example.com', status: 'active', source: 'service', start_time: '2026-10-30T12:00:00Z' },
    { id: 2, full_name: 'Canceled Buyer', email: 'cancel@example.com', status: 'canceled', start_time: '2026-10-31T12:00:00Z' },
    { id: 3, full_name: 'Legacy Buyer', email: 'legacy@example.com', status: 'cancelled', source: 'legacy', start_time: '2026-10-31T12:00:00Z' },
  ];
  const props = { bookings, now: Date.parse('2026-10-25T12:00:00Z') };
  let tree = ui.render('BookingsPanel', props);
  assert.equal(tree.filter((node) => node.type === 'article').length, 3);
  tree.find((node) => node.type === 'select').props.onChange({ target: { value: 'upcoming' } });
  tree = ui.render('BookingsPanel', props);
  assert.equal(tree.filter((node) => node.type === 'article').length, 1);
  tree.find((node) => node.type === 'select').props.onChange({ target: { value: 'canceled' } });
  tree = ui.render('BookingsPanel', props);
  assert.equal(tree.filter((node) => node.type === 'article').length, 2);
});

test('standalone sessions and purchases: search has an explicit empty state', () => {
  const chats = harness();
  const props = { scope: 'service', sessions: [fixture('service')], accessToken: 'test-admin-jwt' };
  let tree = chats.render('SessionsPanel', props);
  tree.find((node) => node.type === 'input').props.onChange({ target: { value: 'not-present' } });
  tree = chats.render('SessionsPanel', props);
  assert.ok(tree.some((node) => node.type === 'p' && node.props.children.includes('No conversations match this search.')));
  const purchases = harness();
  const purchaseProps = { purchases: [{ id: 'p1', email: 'buyer@example.com', reference: 'UNSEEN_1', amount: 10000 }] };
  tree = purchases.render('PurchasesPanel', purchaseProps);
  tree.find((node) => node.type === 'input').props.onChange({ target: { value: 'not-present' } });
  tree = purchases.render('PurchasesPanel', purchaseProps);
  assert.ok(tree.some((node) => node.type === 'p' && node.props.children.includes('No purchases match this search.')));
});

test('purchase email: pending retry sends only the saved reference and patches the returned delivery status', async () => {
  let finish;
  const purchase = { id: 'p1', email: 'buyer@example.com', reference: 'UNSEEN_1', amount: 10000, thankyou_sent: false };
  const ui = harness({ send: async () => new Promise((resolve) => { finish = resolve; }) });
  const props = { purchases: [purchase], accessToken: 'test-admin-jwt', onAuthLost: ui.onAuthLost, onPurchaseChange: ui.onPurchaseChange, showToast: ui.showToast };
  const tree = ui.render('PurchasesPanel', props);
  const button = tree.find((node) => node.type === 'button' && node.props.children.includes('Retry email'));
  const pending = button.props.onClick();
  await button.props.onClick();
  assert.equal(ui.requests.length, 1, 'A rapid second click cannot send another request');
  assert.equal(ui.requests[0].url, 'https://project.supabase.co/functions/v1/admin-retry-purchase-email');
  assert.deepEqual(ui.requests[0].body, { reference: 'UNSEEN_1' });
  assert.ok(ui.render('PurchasesPanel', props).some((node) => node.type === 'button' && node.props.disabled && node.props.children.includes('Retrying…')));
  finish({ status: 200, ok: true, purchase: { ...purchase, thankyou_sent: true } });
  await pending;
  assert.equal(ui.purchaseChanges[0].thankyou_sent, true);
  const sent = ui.render('PurchasesPanel', { ...props, purchases: ui.purchaseChanges });
  assert.ok(!sent.some((node) => node.type === 'button' && node.props.children.includes('Retry email')));
});

test('purchase email: failed retry retains saved diagnostics and exposes a retryable error', async () => {
  const purchase = { id: 'p1', email: 'buyer@example.com', reference: 'UNSEEN_1', amount: 10000, thankyou_sent: false };
  const ui = harness({ send: async () => ({ status: 502, ok: false, error: 'Email provider unavailable', purchase: { ...purchase, thankyou_last_error: 'Provider rejected delivery' } }) });
  const props = { purchases: [purchase], accessToken: 'test-admin-jwt', onAuthLost: ui.onAuthLost, onPurchaseChange: ui.onPurchaseChange, showToast: ui.showToast };
  let tree = ui.render('PurchasesPanel', props);
  await tree.find((node) => node.type === 'button' && node.props.children.includes('Retry email')).props.onClick();
  assert.equal(ui.purchaseChanges[0].thankyou_last_error, 'Provider rejected delivery');
  tree = ui.render('PurchasesPanel', props);
  assert.ok(tree.some((node) => node.props.role === 'alert' && node.props.children.includes('Email provider unavailable')));
  assert.ok(tree.some((node) => node.type === 'button' && !node.props.disabled && node.props.children.includes('Retry email')));
});

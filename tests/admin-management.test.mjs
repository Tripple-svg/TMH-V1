import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { transformSync } from 'esbuild';

const ENV = { SUPABASE_URL: 'https://project.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'service-test', ADMIN_PASSWORD: 'admin-test' };
const request = (body) => new Request('https://project.supabase.co/functions/v1/admin', {
  method: 'POST', headers: { 'Content-Type': 'application/json', origin: 'http://localhost:5173' }, body: JSON.stringify(body),
});

function handler(name, client) {
  let handle;
  const code = transformSync(readFileSync(new URL(`../supabase/functions/${name}/index.ts`, import.meta.url), 'utf8'), { loader: 'ts', format: 'cjs' }).code;
  vm.runInNewContext(code, {
    require: (name) => name.includes('server.ts') ? { serve: (fn) => { handle = fn; } } : { createClient: () => client },
    Deno: { env: { get: (key) => ENV[key] } }, Request, Response,
    console: { error() {}, warn() {} },
  });
  return handle;
}

function readDatabase({ purchasesError = false, seed = {} } = {}) {
  const calls = [];
  const rows = {
    brand_reviews: [{ id: 'review-1', email: 'buyer@example.com', flag_status: 'red', access_token: 'never-return-token', token_hash: 'never-return-hash' }],
    haven_sessions: [],
    playbook_purchases: [{ id: 'purchase-1', email: 'buyer@example.com', reference: 'UNSEEN_123', amount: 10000, thankyou_sent: true, created_at: '2026-10-23T12:00:00Z', private_field: 'never-return-private' }],
    ...seed,
  };
  return { calls, client: { from(table) {
    const call = { table }; calls.push(call);
    const filters = [];
    let offset = 0, cap = Infinity;
    const run = async (single = false) => {
      const matches = (rows[table] || []).filter((row) => filters.every((filter) => filter(row))).slice(offset, offset + cap);
      return {
        data: purchasesError && table === 'playbook_purchases' ? null : single ? matches[0] || null : matches,
        error: purchasesError && table === 'playbook_purchases' ? { message: 'relation missing' } : null,
      };
    };
    return {
      select(fields) { call.fields = fields; return this; },
      order() { return this; },
      in(key, values) { filters.push((row) => values.includes(row[key])); return this; },
      eq(key, value) { filters.push((row) => row[key] === value); return this; },
      is(key, value) { filters.push((row) => value === null ? row[key] == null : row[key] === value); return this; },
      range(start, end) { offset = start; cap = end - start + 1; return this; },
      limit(limit) { call.limit = limit; cap = limit; return this; },
      maybeSingle() { return run(true); },
      then(resolve, reject) { return run().then(resolve, reject); },
    };
  } } };
}

test('admin data: password gate prevents reads and authorized payload includes purchases without private tokens', async () => {
  const db = readDatabase();
  const read = handler('admin-fetch-leads', db.client);
  assert.equal((await read(request({ password: 'wrong' }))).status, 401);
  assert.equal(db.calls.length, 0);
  const response = await read(request({ password: 'admin-test' }));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  const data = await response.json();
  assert.equal(data.leads[0].flag_status, 'red');
  assert.equal(data.purchases[0].email, 'buyer@example.com');
  assert.equal(data.purchases[0].amount, 10000);
  assert.equal(data.records_limit, 500);
  assert.equal(data.purchases_error, null);
  assert.ok(!JSON.stringify(data).includes('never-return'));
  assert.ok(db.calls.every((call) => call.fields !== '*'));
  assert.equal(db.calls.find((call) => call.table === 'playbook_purchases').limit, 500);
});

test('admin data: linked audit/support/service stay under the lead while guest scopes stay in their own tabs', async () => {
  const db = readDatabase({ seed: {
    haven_sessions: [
      ...['audit', 'support', 'service'].map((scope) => ({ id: `linked-${scope}`, review_id: 'review-1', scope, total_exchanges: 2, message_count: 4, messages: [{ role: 'user', content: 'Never include full transcripts in overview' }] })),
      { id: 'guest-support', review_id: null, visitor_id: 'visitor-1', scope: 'support', message_count: 3 },
      { id: 'guest-service', review_id: null, visitor_id: 'visitor-1', scope: 'service', service_id: 'web', message_count: 5 },
    ],
    haven_chat_visitors: [{ id: 'visitor-1', flag_status: 'red', flag_reason: 'Repeated misuse', token_hash: 'never-return-visitor-hash' }],
  } });
  const data = await (await handler('admin-fetch-leads', db.client)(request({ password: 'admin-test' }))).json();
  assert.deepEqual(data.leads[0].sessions.map((session) => session.scope), ['audit', 'support', 'service']);
  assert.equal(data.leads[0].session.id, 'linked-audit');
  assert.deepEqual(data.support_sessions.map((session) => session.id), ['guest-support']);
  assert.deepEqual(data.service_sessions.map((session) => session.id), ['guest-service']);
  assert.equal(data.support_sessions[0].flag_status, 'red');
  assert.equal(data.service_sessions[0].flag_status, 'red');
  assert.equal(data.leads[0].sessions[0].transcript_loaded, false);
  assert.equal(data.leads[0].sessions[0].message_count, 4);
  assert.ok(!JSON.stringify(data).includes('Never include full transcripts'));
  assert.ok(!JSON.stringify(data).includes('never-return'));
  assert.deepEqual(data.playbook_purchases, data.purchases);
  assert.ok(db.calls.filter((call) => call.table === 'haven_sessions').every((call) => !call.fields.split(',').includes('messages')));
});

test('admin data: transcript is authenticated on demand, bounded to200, and strips image/private fields', async () => {
  const db = readDatabase({ seed: { haven_sessions: [{
    id: 'session-detail', scope: 'support', review_id: null, access_token: 'never-return-session-token',
    messages: Array.from({ length: 205 }, (_, index) => ({ id: String(index), role: 'user', content: `message-${index}`, image: 'never-return-image', accessToken: 'never-return-message-token' })),
  }] } });
  const read = handler('admin-fetch-leads', db.client);
  assert.equal((await read(request({ password: 'wrong', action: 'transcript', sessionId: 'session-detail' }))).status, 401);
  assert.equal(db.calls.length, 0);
  const result = await read(request({ password: 'admin-test', action: 'transcript', sessionId: 'session-detail' }));
  const data = await result.json();
  assert.equal(result.status, 200);
  assert.equal(data.session.messages.length, 200);
  assert.equal(data.session.message_count, 205);
  assert.equal(data.session.messages[0].content, 'message-5');
  assert.equal(data.session.transcript_loaded, true);
  assert.ok(!JSON.stringify(data).includes('never-return'));
  assert.equal(db.calls.length, 1);
  assert.equal((await read(request({ password: 'admin-test', action: 'transcript', sessionId: 'missing' }))).status, 404);
});

test('admin data: missing purchase migration is visible without hiding usable lead records', async () => {
  const db = readDatabase({ purchasesError: true });
  const response = await handler('admin-fetch-leads', db.client)(request({ password: 'admin-test' }));
  const data = await response.json();
  assert.equal(data.ok, true);
  assert.equal(data.leads.length, 1);
  assert.deepEqual(data.purchases, []);
  assert.match(data.purchases_error, /migration/);
});

function deleteDatabase({ missing = false, rpcError = false, storageError = false, screenshotPath = 'review-1/screenshot.png' } = {}) {
  const calls = [], removed = [];
  return { calls, removed, client: {
    async rpc(name, args) {
      calls.push({ name, args });
      return { data: missing ? { deleted: false } : { deleted: true, screenshot_path: screenshotPath }, error: rpcError ? { message: 'transaction failed' } : null };
    },
    from() { throw new Error('Deletion must use the transactional RPC'); },
    storage: { from(bucket) { assert.equal(bucket, 'tmh-screenshots'); return { async remove(paths) {
      removed.push(...paths); return { error: storageError ? { message: 'storage offline' } : null };
    } }; } },
  } };
}
const deletion = { password: 'admin-test', action: 'delete', reviewId: 'review-1', confirmation: 'review-1' };

test('admin delete: wrong credentials and missing confirmation cannot reach database or storage', async () => {
  const db = deleteDatabase();
  const remove = handler('admin-update-lead', db.client);
  assert.equal((await remove(request({ ...deletion, password: 'wrong' }))).status, 401);
  assert.equal((await remove(request({ ...deletion, confirmation: null }))).status, 400);
  assert.equal((await remove(request({ ...deletion, action: 'truncate' }))).status, 400);
  assert.equal(db.calls.length, 0);
  assert.equal(db.removed.length, 0);
});

test('admin delete: confirmed request runs one transaction and removes only its saved screenshot', async () => {
  const db = deleteDatabase();
  const result = await handler('admin-update-lead', db.client)(request({ ...deletion, screenshot_path: 'other-review/private.png' }));
  assert.equal(result.status, 200);
  assert.deepEqual(await result.json(), { ok: true, deletedId: 'review-1', warning: null });
  assert.equal(db.calls.length, 1);
  assert.equal(db.calls[0].name, 'admin_delete_lead');
  assert.equal(db.calls[0].args.p_review_id, 'review-1');
  assert.deepEqual(db.removed, ['review-1/screenshot.png']);
});

test('admin delete: failed transaction returns500 without deleting screenshot; missing lead returns404', async () => {
  for (const [options, expected] of [[{ rpcError: true }, 500], [{ missing: true }, 404]]) {
    const db = deleteDatabase(options);
    const result = await handler('admin-update-lead', db.client)(request(deletion));
    assert.equal(result.status, expected);
    assert.equal((await result.json()).ok, false);
    assert.equal(db.removed.length, 0);
  }
});

test('admin delete: committed deletion reports screenshot cleanup warning without pretending the row remains', async () => {
  const db = deleteDatabase({ storageError: true });
  const result = await handler('admin-update-lead', db.client)(request(deletion));
  const data = await result.json();
  assert.equal(data.ok, true);
  assert.equal(data.deletedId, 'review-1');
  assert.match(data.warning, /screenshot/);
});

test('admin delete: a malformed saved path cannot delete another lead screenshot', async () => {
  for (const screenshotPath of ['other-review/private.png', 'review-1/../other-review/private.png']) {
    const db = deleteDatabase({ screenshotPath });
    const result = await handler('admin-update-lead', db.client)(request(deletion));
    const data = await result.json();
    assert.equal(data.ok, true);
    assert.match(data.warning, /manual review/);
    assert.equal(db.removed.length, 0);
  }
});

const uiSource = readFileSync(new URL('../src/pages/AdminDashboard.jsx', import.meta.url), 'utf8')
  .replace(/^import .* from 'react';\r?\n/m, '')
  .replaceAll('import.meta.env.VITE_SUPABASE_URL', "'https://project.supabase.co'")
  .replaceAll('import.meta.env.VITE_SUPABASE_ANON_KEY', "'public-anon-key'")
  .replace('export default function AdminDashboard()', 'function AdminDashboard()');
const uiCode = transformSync(`${uiSource}\nmodule.exports={useLeadActions,apiFetchLeads,PurchasesPanel,AdminDashboard};`, { loader: 'jsx', format: 'cjs' }).code;

function ui({ confirm = true, networkError = false, httpStatus = 200, response = { ok: true, deletedId: 'review-1' } } = {}) {
  const states = [], refs = [], requests = [], removed = [], changed = [], toasts = [], confirmations = [];
  let cursor = 0, refCursor = 0, lost = 0;
  const context = {
    module: { exports: {} },
    React: { createElement: (type, props, ...children) => ({ type, props: { ...props, children } }) },
    useState(initial) { const slot = cursor++; if (!(slot in states)) states[slot] = typeof initial === 'function' ? initial() : initial; return [states[slot], (v) => { states[slot] = typeof v === 'function' ? v(states[slot]) : v; }]; },
    useRef(initial) { const slot = refCursor++; return refs[slot] ||= { current: initial }; },
    useEffect() {}, useCallback: (fn) => fn, useMemo: (fn) => fn(),
    window: { confirm(message) { confirmations.push(message); return confirm; } },
    sessionStorage: { getItem: () => '' },
    fetch: async (url, options) => { requests.push({ url, ...options }); if (networkError) throw new Error('offline'); return { status: httpStatus, ok: httpStatus < 400, json: async () => response }; },
  };
  vm.runInNewContext(uiCode, context);
  const actions = () => {
    cursor = refCursor = 0;
    return context.module.exports.useLeadActions({ lead: { id: 'review-1', email: 'buyer@example.com', brand_name: 'Buyer Brand' }, password: 'admin-test',
      onLeadDelete: (id) => removed.push(id), onLeadChange: (row) => changed.push(row), onAuthLost: () => { lost++; }, showToast: (...args) => toasts.push(args) });
  };
  return { actions, exports: context.module.exports, states, requests, removed, changed, toasts, confirmations, get lost() { return lost; } };
}

function nodes(root) {
  const all = [];
  const visit = (node) => { if (Array.isArray(node)) return node.forEach(visit); if (!node || typeof node !== 'object') return; all.push(node); visit(node.props.children); };
  visit(root); return all;
}

test('admin UI: cancelling concrete lead confirmation sends no delete; confirmed delete removes only acknowledged row', async () => {
  const cancelled = ui({ confirm: false });
  await cancelled.actions().onDeleteLead();
  assert.match(cancelled.confirmations[0], /Buyer Brand.*buyer@example.com/);
  assert.match(cancelled.confirmations[0], /cannot be undone/);
  assert.equal(cancelled.requests.length, 0);
  const approved = ui();
  await approved.actions().onDeleteLead();
  assert.deepEqual(JSON.parse(approved.requests[0].body), deletion);
  assert.deepEqual(approved.removed, ['review-1']);
  assert.equal(approved.states[0], false);
});

test('admin UI: failed/unauthorized deletion leaves lead visible and releases controls', async () => {
  for (const options of [{ networkError: true }, { httpStatus: 401 }, { httpStatus: 500, response: { ok: false, error: 'Transaction failed' } }]) {
    const view = ui(options);
    await view.actions().onDeleteLead();
    assert.deepEqual(view.removed, []);
    assert.equal(view.states[0], false);
    assert.ok(view.toasts.length || view.lost === 1);
  }
});

test('admin UI: failed notes remain retryable and network failures normalize into visible errors', async () => {
  const view = ui({ networkError: true });
  view.actions().setNotes('A note to retry');
  await view.actions().onNotesBlur();
  await view.actions().onNotesBlur();
  assert.equal(view.requests.length, 2);
  assert.equal(view.states[0], false);
  assert.equal(view.changed.length, 0);
  assert.match(view.toasts[0][1], /reach the server/);
});

test('admin UI: purchase response reaches dashboard helper and kobo displays as NGN naira', async () => {
  const purchases = [{ id: 'p1', email: 'buyer@example.com', reference: 'UNSEEN_1', amount: 10000, thankyou_sent: true }];
  const view = ui({ response: { ok: true, leads: [], purchases } });
  assert.equal((await view.exports.apiFetchLeads('admin-test')).purchases[0].email, 'buyer@example.com');
  const tree = nodes(view.exports.PurchasesPanel({ purchases, error: '' }));
  assert.ok(tree.some((node) => node.type === 'td' && node.props.children.includes('₦100')));
  assert.ok(tree.some((node) => node.type === 'td' && node.props.children.includes('buyer@example.com')));
  assert.ok(!tree.some((node) => node.type === 'td' && node.props.children.includes('₦10,000')));
});

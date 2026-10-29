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
const code = transformSync(`${source}\nmodule.exports = { useLeadActions, AdminDashboard, FlagSelect };`, {
  loader: 'jsx', format: 'cjs',
}).code;

function harness({ response = { ok: true, review: { id: 'review-1', flag_status: 'red', flag_reason: 'Abuse' } },
  httpStatus = 200, prompt = ' Abuse ', networkError = false, dashboard = false } = {}) {
  let cursor = 0;
  const states = [], requests = [], changes = [], toasts = [], cleared = [];
  let authLost = 0, reloads = 0;
  const lead = { id: 'review-1', email: 'user@example.com', brand_name: 'Example', flag_status: 'white' };
  const context = {
    module: { exports: {} },
    require(name) { return name.includes('adminWorkspace') ? workspace : { __esModule:true, default:function InquiryWorkflow(){} }; },
    React: { createElement: (type, props, ...children) => ({ type, props: { ...props, children } }) },
    useState(initial) {
      const slot = cursor++;
      if (!(slot in states)) states[slot] = dashboard && slot === 1 ? true
        : dashboard && slot === 2 ? [lead, { ...lead, id: 'review-2' }]
          : typeof initial === 'function' ? initial() : initial;
      return [states[slot], (value) => { states[slot] = typeof value === 'function' ? value(states[slot]) : value; }];
    },
    useRef: (initial) => ({ current: initial }),
    useCallback: (fn) => fn,
    useMemo: (fn) => fn(),
    useEffect() {},
    fetch: async (url, options) => {
      requests.push({ url, ...options });
      if (networkError) throw new Error('offline');
      return { status: httpStatus, ok: httpStatus < 400, json: async () => response };
    },
    window: { prompt: () => prompt, location: { reload: () => { reloads++; } } },
    localStorage: { clear: () => cleared.push('local') },
    sessionStorage: { getItem: () => 'admin-password', clear: () => cleared.push('session') },
  };
  vm.runInNewContext(code, context);
  const actions = () => {
    cursor = 0;
    return context.module.exports.useLeadActions({
      lead, accessToken: 'test-admin-jwt', onLeadChange: (value) => changes.push(value),
      onAuthLost: () => { authLost++; }, showToast: (...args) => toasts.push(args),
    });
  };
  const renderDashboard = () => {
    cursor = 0;
    const nodes = [];
    const walk = (node) => {
      if (Array.isArray(node)) return node.forEach(walk);
      if (!node || typeof node !== 'object') return;
      nodes.push(node); walk(node.props.children);
    };
    walk(context.module.exports.AdminDashboard());
    return nodes;
  };
  return { actions, renderDashboard, FlagSelect:context.module.exports.FlagSelect, requests, changes, toasts, cleared, states,
    get authLost() { return authLost; }, get reloads() { return reloads; } };
}

test('admin flags: persists the returned flag and posts password, email, status, and trimmed reason', async () => {
  const ui = harness();
  await ui.actions().onFlagChange({ target: { value: 'red' } });
  assert.equal(ui.requests[0].url, 'https://project.supabase.co/functions/v1/flag-user');
  assert.equal(ui.requests[0].headers.Authorization, 'Bearer test-admin-jwt');
  assert.deepEqual(JSON.parse(ui.requests[0].body), { email: 'user@example.com', status: 'red', reason: 'Abuse',
  });
  assert.equal(ui.changes[0].flag_status, 'red');
  assert.equal(ui.changes[0].flag_reason, 'Abuse');
  assert.equal(ui.changes[0].brand_name, undefined, 'Return a patch so the dashboard keeps its latest brand and transcript metadata');
  assert.deepEqual(ui.toasts[0], ['success', 'User flag updated.']);
  assert.equal(ui.states[0], false);
});

test('admin flags: warning email failure keeps the saved yellow flag and shows the server error', async () => {
  const ui = harness({ httpStatus: 502, response: { ok: false, error: 'Warning email failed: Resend unavailable',
    review: { id: 'review-1', flag_status: 'yellow', flag_reason: 'Repeated misuse' } } });
  await ui.actions().onFlagChange({ target: { value: 'yellow' } });
  assert.equal(ui.changes[0].flag_status, 'yellow');
  assert.equal(ui.changes[0].flag_reason, 'Repeated misuse');
  assert.deepEqual(ui.toasts[0], ['error', 'Warning email failed: Resend unavailable']);
  assert.equal(ui.states[0], false);
});

test('admin flags: cancelling the reason prompt sends no request or update', async () => {
  const ui = harness({ prompt: null });
  await ui.actions().onFlagChange({ target: { value: 'yellow' } });
  assert.equal(ui.requests.length, 0);
  assert.equal(ui.changes.length, 0);
  assert.equal(ui.toasts.length, 0);
});

test('admin flags: invalid admin password ends the admin session without changing the lead', async () => {
  const ui = harness({ httpStatus: 401 });
  await ui.actions().onFlagChange({ target: { value: 'red' } });
  assert.equal(ui.authLost, 1);
  assert.equal(ui.changes.length, 0);
  assert.equal(ui.states[0], false);
});

test('admin flags: network failure restores the controls and reports an error', async () => {
  const ui = harness({ networkError: true });
  await ui.actions().onFlagChange({ target: { value: 'red' } });
  assert.equal(ui.changes.length, 0);
  assert.deepEqual(ui.toasts[0], ['error', 'Could not reach the server.']);
  assert.equal(ui.states[0], false);
});

test('admin dashboard: total uses loaded leads and Clear Data clears both browser stores before reload', () => {
  const ui = harness({ dashboard: true });
  const nodes = ui.renderDashboard();
  assert.ok(nodes.some((node) => node.type === 'p' && node.props.children[0] === 'Total Reviews: '
    && node.props.children[1] === 2));
  const button = nodes.find((node) => node.type === 'button' && node.props.children.includes('Clear Data'));
  assert.ok(button);
  button.props.onClick();
  assert.deepEqual(ui.cleared, ['local', 'session']);
  assert.equal(ui.reloads, 1);
  assert.equal(ui.requests.length, 0);
});


test('admin can clear a recorded first strike without issuing a yellow warning',()=>{
  const ui=harness();const changes=[];const tree=ui.FlagSelect({lead:{email:'owner@example.com',flag_status:'white',moderation_strikes:1},onChange:event=>changes.push(event.target.value)});
  const button=tree.props.children.find(node=>node?.type==='button');assert.ok(button);button.props.onClick();assert.deepEqual(changes,['white']);
});

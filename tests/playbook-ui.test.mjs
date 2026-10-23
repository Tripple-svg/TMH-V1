import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { transformSync } from 'esbuild';

function shop(saved, invoke) {
  const state = [], effects = [], events = new Map(), storage = new Map(saved ? [['tmh_playbook_purchase', saved]] : []), downloads = [];
  let cursor = 0;
  const react = {
    createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    useState(initial) { const i = cursor++; if (!(i in state)) state[i] = initial; return [state[i], (value) => { state[i] = typeof value === 'function' ? value(state[i]) : value; }]; },
    useRef(initial) { const i = cursor++; return state[i] ||= { current: initial }; },
    useEffect(fn, deps) { const i = cursor++; if (!(i in state) || deps.some((dep, n) => dep !== state[i][n])) effects.push(fn); state[i] = deps; },
  };
  const context = {
    module: { exports: {} },
    require(name) {
      if (name === 'react') return react;
      if (name === 'framer-motion') return { motion: new Proxy({}, { get: (_, key) => key }), AnimatePresence: 'presence', useReducedMotion: () => false };
      if (name === 'lucide-react') return new Proxy({}, { get: (_, key) => key });
      if (name.includes('supabase')) return { supabase: { functions: { invoke } } };
      return { default: 'ConfirmModal', __esModule: true };
    },
    localStorage: { getItem: (key) => storage.get(key), setItem: (key, value) => storage.set(key, value) },
    window: { addEventListener: (name, fn) => events.set(name, fn), removeEventListener() {} },
    document: { body: { style: {}, appendChild() {}, removeChild() {} }, createElement: () => ({ click() { downloads.push(this.href); } }) },
    setTimeout, clearTimeout,
  };
  const source = readFileSync(new URL('../src/components/ShopSection.jsx', import.meta.url), 'utf8');
  vm.runInNewContext(transformSync(source, { loader: 'jsx', format: 'cjs' }).code, context);
  function render() {
    cursor = 0;
    const root = context.module.exports.default();
    const nodes = [];
    function walk(node) { if (Array.isArray(node)) return node.forEach(walk); if (!node || typeof node !== 'object') return; nodes.push(node); walk(node.props.children); }
    walk(root);
    return nodes;
  }
  const mount = () => { render(); effects.splice(0).forEach((effect) => effect()); events.get('open-playbook-modal')(); return render(); };
  return { render, mount, storage, downloads };
}
const flush = () => new Promise((resolve) => setImmediate(resolve));

test('Playbook card shows the launch price before opening, and checkout discloses the real test charge', () => {
  const ui = shop(null, async () => ({ data: {} }));
  const text = (node) => Array.isArray(node) ? node.map(text).join('') : node && typeof node === 'object' ? text(node.props.children) : typeof node === 'string' ? node : '';
  const card = ui.render();
  assert.ok(!card.some((node) => node.props['aria-label'] === 'Playbook checkout'));
  assert.ok(card.some((node) => node.type === 'p' && text(node).includes('₦9,639')));
  assert.ok(ui.mount().some((node) => node.type === 'p' && text(node).includes('Current live checkout charge: ₦100 (testing).')));
});

test('Task 5 UI: remount verifies stored reference and withholds download until a fresh URL arrives', async () => {
  const saved = JSON.stringify({ reference: 'UNSEEN_paid', email: 'buyer@example.com', downloadedAt: null });
  let resolve, calls = 0;
  const invoke = async (name, { body }) => {
    calls++; assert.equal(name, 'verify-paystack'); assert.equal(body.reference, 'UNSEEN_paid');
    return new Promise((done) => { resolve = done; });
  };
  const first = shop(saved, invoke);
  assert.equal(first.mount().filter((node) => node.type === 'a').length, 0);
  resolve({ data: { ok: true, url: 'https://private.example/fresh-1' } }); await flush();
  const download = first.render().find((node) => node.type === 'a');
  assert.equal(download.props.href, 'https://private.example/fresh-1');
  download.props.onClick({ preventDefault() {} });
  assert.deepEqual(first.downloads, ['https://private.example/fresh-1']);
  const persisted = first.storage.get('tmh_playbook_purchase');
  assert.ok(JSON.parse(persisted).downloadedAt); assert.ok(!persisted.includes('https://'));
  const reopened = shop(persisted, invoke);
  assert.equal(reopened.mount().filter((node) => node.type === 'a').length, 0);
  resolve({ data: { ok: true, url: 'https://private.example/fresh-2' } }); await flush();
  assert.equal(reopened.render().find((node) => node.type === 'a').props.href, 'https://private.example/fresh-2');
  assert.equal(calls, 2);
});

test('Task 5 UI: re-download verifies again and uses the newly issued URL', async () => {
  let calls = 0;
  const ui = shop(JSON.stringify({ reference: 'UNSEEN_paid', downloadedAt: '2026-10-01' }), async () => ({ data: { ok: true, url: `https://private.example/fresh-${++calls}` } }));
  ui.mount(); await flush();
  const link = ui.render().find((node) => node.type === 'a');
  assert.ok(link.props.children.flat().includes('Re-download Playbook'));
  await link.props.onClick({ preventDefault() {} });
  assert.deepEqual(ui.downloads, ['https://private.example/fresh-2']); assert.equal(calls, 2);
  assert.ok(!ui.storage.get('tmh_playbook_purchase').includes('https://'));
});

test('Task 5 UI: failed return verification hides downloads and gives the stored reference for recovery', async () => {
  const ui = shop(JSON.stringify({ reference: 'UNSEEN_recover', downloadedAt: '2026-10-01' }), async () => ({ error: new Error('offline') }));
  ui.mount(); await flush();
  const view = ui.render(); assert.equal(view.filter((node) => node.type === 'a').length, 0);
  const alert = view.find((node) => node.props.role === 'alert');
  assert.ok(alert.props.children.join('').includes('info@themarketinghaven.xyz with your reference: UNSEEN_recover'));
});

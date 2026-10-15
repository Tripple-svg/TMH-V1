import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { transformSync } from 'esbuild';

// Execute the actual modal with lightweight hooks, without a browser or network.
function modal({ source = null, serviceId = null, invoke = async () => ({ data: { ok: true } }), popupBlocked = false } = {}) {
  const sourceFile = readFileSync(new URL('../src/components/haven/components/HavenDrawer.jsx', import.meta.url), 'utf8');
  const code = transformSync(sourceFile.slice(sourceFile.indexOf('function BookingModal('), sourceFile.indexOf('export default function HavenDrawer')) + '\nmodule.exports = BookingModal;', { loader: 'jsx', format: 'cjs' }).code;
  let cursor = 0, states = [], closed = 0, opens = 0;
  const stored = new Map();
  const popup = { location: { href: 'about:blank' }, close() { this.closed = true; } };
  const context = {
    module: { exports: {} },
    React: { createElement: (type, props, ...children) => ({ type, props: { ...props, children } }) },
    motion: { div: 'div' }, AnimatePresence: 'presence', Link: 'link', AlertCircle: 'icon', ExternalLink: 'icon',
    LOGO_SRC: '/logo', CALENDLY_URL: 'https://calendly.com/themarketinghaven01/30min', CALENDLY_CLICKED_KEY: 'tmh_calendly_clicked_at',
    useHaven: () => ({ bookingContext: { source, serviceId } }),
    useState: (initial) => { const slot = cursor++; if (!(slot in states)) states[slot] = initial; return [states[slot], (value) => { states[slot] = value; }]; },
    useEffect() {},
    localStorage: { setItem: (key, value) => stored.set(key, value), getItem: (key) => stored.get(key) },
    supabase: { functions: { invoke } },
    window: { open: () => { opens++; return popupBlocked ? null : popup; }, location: { assign: (url) => { popup.location.href = url; } } },
  };
  vm.runInNewContext(code, context);
  function render() {
    cursor = 0;
    const root = context.module.exports({ isOpen: true, onClose: () => { closed++; } });
    const nodes = [];
    function walk(node) {
      if (Array.isArray(node)) return node.forEach(walk);
      if (!node || typeof node !== 'object') return;
      nodes.push(node); walk(node.props.children);
    }
    walk(root);
    return { nodes, input: nodes.find((node) => node.type === 'input'), choose: nodes.find((node) => node.type === 'a') };
  }
  return { render, popup, stored, get opens() { return opens; }, get closed() { return closed; } };
}

test('Task 7 UI: review path has no email input/capture/prefill and preserves click timestamp', async () => {
  const ui = modal({ invoke() { throw new Error('Review path must not capture'); } });
  const view = ui.render();
  assert.equal(view.input, undefined);
  assert.equal(view.choose.props.href, 'https://calendly.com/themarketinghaven01/30min');
  await view.choose.props.onClick({ preventDefault() { throw new Error('Existing anchor behavior must be preserved'); } });
  assert.ok(ui.stored.has('tmh_calendly_clicked_at')); assert.equal(ui.closed, 1); assert.equal(ui.opens, 0);
});

test('Task 7 UI: invalid services email blocks Calendly and shows inline error', async () => {
  const ui = modal({ source: 'services', serviceId: 'web', invoke() { throw new Error('Invalid email must not capture'); } });
  const view = ui.render();
  assert.equal(view.input.props.placeholder, 'your@email.com');
  view.input.props.onChange({ target: { value: 'invalid' } });
  let prevented = false;
  await ui.render().choose.props.onClick({ preventDefault() { prevented = true; } });
  assert.equal(prevented, true); assert.equal(ui.opens, 0); assert.equal(ui.stored.size, 0);
  assert.ok(ui.render().nodes.some((node) => node.props.role === 'alert'));
});

test('Task 7 UI: service capture completes before navigation; encoded email and service survive', async () => {
  let resolveCapture, captured;
  const ui = modal({ source: 'services', serviceId: 'growth', invoke: async (name, options) => {
    assert.equal(name, 'capture-booking-lead'); captured = options.body;
    return new Promise((resolve) => { resolveCapture = resolve; });
  } });
  ui.render().input.props.onChange({ target: { value: ' buyer+growth@example.com ' } });
  const pending = ui.render().choose.props.onClick({ preventDefault() {} });
  assert.equal(ui.popup.location.href, 'about:blank'); assert.equal(ui.closed, 0);
  assert.equal(captured.serviceId, 'growth'); assert.equal(captured.email, 'buyer+growth@example.com');
  resolveCapture({ data: { ok: true } }); await pending;
  assert.equal(ui.popup.location.href, 'https://calendly.com/themarketinghaven01/30min?email=buyer%2Bgrowth%40example.com');
  assert.equal(ui.popup.opener, null); assert.equal(ui.closed, 1); assert.ok(ui.stored.has('tmh_calendly_clicked_at'));
});

test('Task 7 UI: failed capture keeps modal open and closes the blank popup', async () => {
  const ui = modal({ source: 'services', serviceId: 'content', invoke: async () => ({ error: new Error('offline') }) });
  ui.render().input.props.onChange({ target: { value: 'buyer@example.com' } });
  await ui.render().choose.props.onClick({ preventDefault() {} });
  assert.equal(ui.closed, 0); assert.equal(ui.popup.closed, true); assert.equal(ui.stored.size, 0);
  assert.ok(ui.render().nodes.some((node) => node.props.role === 'alert'));
});

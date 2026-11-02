import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { transformSync } from 'esbuild';

// Render the real drawer while retaining its session across scorecard/chat changes.
function drawer() {
  const failedTurn = { content: 'Please explain the next step', image: null, error: 'Retry your saved message.', retryAt: 0 };
  const calls = [];
  const state = {
    isOpen: true, activeScope: 'audit', viewState: 'chatting', messages: [{ id: '1', role: 'user', content: failedTurn.content }],
    currentSession: { id: 'session', failedTurn }, activeSessionId: 'session', isThinking: false,
    userProfile: { businessDomain: 'website', reviewId: 'review', sessionId: 'session', accessToken: 'private' },
    auditPreflight: { status: 'ready', dismissed: false },
    sendMessage: (...args) => calls.push(args),
    proceedFromPreflight() { state.auditPreflight = { ...state.auditPreflight, dismissed: true }; },
  };
  let cursor = 0;
  const slots = [];
  const react = {
    createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    useState(initial) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial;
      return [slots[i], value => { slots[i] = typeof value === 'function' ? value(slots[i]) : value; }];
    },
    useRef(initial) { const i = cursor++; return slots[i] ||= { current: initial }; },
    useCallback: fn => fn, useEffect() {},
    memo: component => component,
  };
  const context = {
    module: { exports: {} }, document: { body: {} },
    require(name) {
      if (name === 'react') return react;
      if (name === 'react-dom') return { createPortal: node => node };
      if (name === 'framer-motion') return { motion: new Proxy({}, { get: (_, key) => key }), AnimatePresence: 'presence', useReducedMotion: () => false };
      if (name === 'react-router-dom') return { Link: 'Link' };
      if (name === 'lucide-react') return new Proxy({}, { get: (_, key) => key });
      if (name.includes('/useHaven')) return { useHaven: () => state };
      if (name.includes('useDrawerViewport')) return { __esModule: true, default: () => ({ current: null }) };
      if (name.includes('quick-prompts')) return { quickPrompts: () => [] };
      return { __esModule: true, default: name.split('/').at(-1) };
    },
  };
  const source = readFileSync(new URL('../src/components/haven/components/HavenDrawer.jsx', import.meta.url), 'utf8');
  vm.runInNewContext(transformSync(source, { loader: 'jsx', format: 'cjs' }).code, context);
  function render() {
    cursor = 0;
    const nodes = [];
    function walk(node) {
      if (Array.isArray(node)) return node.forEach(walk);
      if (!node || typeof node !== 'object') return;
      nodes.push(node); walk(node.props.children);
    }
    walk(context.module.exports.default());
    return nodes;
  }
  return { state, failedTurn, calls, render };
}
const text = node => Array.isArray(node) ? node.map(text).join('') : node && typeof node === 'object' ? text(node.props.children) : typeof node === 'string' ? node : '';
const retry = tree => tree.find(node => node.type === 'button' && text(node) === 'Retry saved message');
const thinking = tree => tree.some(node => node.type?.name === 'ThinkingIndicator');

test('review source hides chat retry without losing the saved turn, then returning to chat can retry it', () => {
  const ui = drawer();
  const source = ui.render();
  assert.ok(source.some(node => node.type === 'HavenScoreCard'));
  assert.equal(retry(source), undefined);
  assert.equal(ui.state.currentSession.failedTurn, ui.failedTurn);
  source.find(node => node.type === 'HavenScoreCard').props.onProceed();
  const chat = ui.render();
  assert.ok(retry(chat));
  retry(chat).props.onClick();
  assert.deepEqual(ui.calls, [[ui.failedTurn.content, ui.failedTurn.image]]);
});

test('reading/thinking status belongs to chat and never appears in the scorecard or landing view', () => {
  const ui = drawer();
  ui.state.isThinking = true;
  assert.equal(thinking(ui.render()), false);
  ui.state.auditPreflight.dismissed = true;
  assert.equal(thinking(ui.render()), true);
  ui.state.viewState = 'landing';
  assert.equal(thinking(ui.render()), false);
  ui.state.isThinking = false;
  assert.equal(retry(ui.render()), undefined);
});

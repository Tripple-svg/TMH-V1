import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { transformSync } from 'esbuild';

function loadHook(file, extra = {}) {
  const states = [], refs = [], effects = [];
  let stateCursor = 0, refCursor = 0;
  const react = {
    useRef(value) { const index = refCursor++; refs[index] ??= { current: value }; return refs[index]; },
    useState(value) { const index = stateCursor++; if (!(index in states)) states[index] = typeof value === 'function' ? value() : value; return [states[index], (next) => { states[index] = next; }]; },
    useEffect(effect) { effects.push(effect); },
  };
  const module = { exports: {} };
  vm.runInNewContext(transformSync(readFileSync(new URL(`../src/components/haven/hooks/${file}.js`, import.meta.url), 'utf8'), { format: 'cjs' }).code,
    { module, exports: module.exports, require: () => react, ...extra });
  return { refs, effects, api: module.exports, render(...args) { stateCursor = 0; refCursor = 0; return module.exports.default(...args); } };
}

test('typing: starts with a pause, reveals progressively, completes in bounded time, and cleans up its timer', () => {
  let now = 0, tick, cleared = 0;
  const storage = new Map();
  const hook = loadHook('useTypingReveal', { performance: { now: () => now }, setInterval(fn) { tick = fn; return 1; }, clearInterval() { cleared++; }, localStorage: { getItem: (key) => storage.get(key), setItem: (key, value) => storage.set(key, value) } });
  const full = 'Here is a response that flows into the conversation.';
  assert.equal(hook.render('new-reply', full, true, false).text, '');
  const cleanup = hook.effects.shift()();
  now = 500; tick(); const part = hook.render('new-reply', full, true, false);
  assert.ok(part.text.length > 0 && part.text.length < full.length); assert.equal(part.complete, false);
  now = 5000; tick(); assert.equal(hook.render('new-reply', full, true, false).text, full);
  cleanup(); assert.ok(cleared >= 2);
  assert.ok([...storage.values()][0].includes('new-reply'));
});

test('typing: previously revealed greetings, old history and reduced motion render without replay', () => {
  const ledger = JSON.stringify(['greeting-1']);
  for (const [id, eligible, reduced] of [['greeting-1', true, false], ['history', false, false], ['new', true, true]]) {
    const hook = loadHook('useTypingReveal', { localStorage: { getItem: () => ledger }, setInterval() { throw new Error('Unexpected animation'); } });
    assert.equal(hook.render(id, 'Hello there', eligible, reduced).text, 'Hello there');
    hook.effects.shift()();
  }
});

test('mobile viewport: coalesces keyboard movement, sizes only the shell, restores scroll and removes listeners', () => {
  const listeners = new Map(), frames = new Map(), calls = [];
  let counter = 0;
  const viewport = { height: 700, offsetTop: 0, addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: (name) => listeners.delete(name) };
  const body = { style: { position: '', top: '', width: '', overflow: 'clip' } }, root = { style: { overscrollBehavior: '' } };
  const win = { scrollY: 420, innerHeight: 800, visualViewport: viewport, addEventListener() {}, removeEventListener() {}, scrollTo: (value) => calls.push(value) };
  const hook = loadHook('useDrawerViewport', { window: win, document: { body, documentElement: root }, requestAnimationFrame(fn) { const id = ++counter; frames.set(id, fn); return id; }, cancelAnimationFrame: (id) => frames.delete(id) });
  const follow = { current: () => calls.push('follow') };
  hook.render(true, follow); const shell = { style: {} }; hook.refs[0].current = shell;
  const cleanup = hook.effects.shift()();
  assert.equal(body.style.position, 'fixed'); assert.equal(body.style.top, '-420px');
  viewport.height = 360; viewport.offsetTop = 48;
  listeners.get('resize')(); listeners.get('scroll')(); assert.equal(frames.size, 1);
  [...frames.values()][0](); assert.equal(shell.style.height, '360px'); assert.equal(shell.style.top, '48px');
  assert.ok(calls.includes('follow'));
  cleanup(); assert.equal(listeners.size, 0); assert.equal(body.style.overflow, 'clip'); assert.equal(body.style.position, '');
  assert.equal(calls.at(-1).top, 420); assert.equal(calls.at(-1).behavior, 'instant');
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { transformSync } from 'esbuild';

function header({ reducedMotion = false } = {}) {
  let cursor = 0, reviewRequests = 0;
  const slots = [], effects = new Map(), cleanups = new Map(), listeners = new Map(), scrolls = [];
  const document = { body: { style: { overflow: 'clip' } }, activeElement: null,
    addEventListener: (name, handler) => listeners.set(name, handler),
    removeEventListener: (name) => listeners.delete(name),
    querySelector: () => ({ scrollIntoView: (options) => scrolls.push(options) }),
  };
  const focusable = () => ({ focus() { document.activeElement = this; } });
  const trigger = focusable(), close = focusable(), link = focusable(), last = focusable();
  const panel = { querySelector: () => close, querySelectorAll: () => [close, link, last],
    contains: (element) => [panel, close, link, last].includes(element), ...focusable() };
  const react = {
    createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = initial;
      return [slots[index], (value) => { slots[index] = typeof value === 'function' ? value(slots[index]) : value; }];
    },
    useRef(initial) { const index = cursor++; return slots[index] ||= { current: initial }; },
    useEffect(effect, deps) {
      const index = cursor++;
      if (!(index in slots) || deps.some((value, i) => value !== slots[index][i])) effects.set(index, effect);
      slots[index] = deps;
    },
  };
  const context = {
    module: { exports: {} }, React: react, document,
    window: { scrollTo: (options) => scrolls.push(options) },
    require(name) {
      if (name === 'react') return react;
      if (name === 'framer-motion') return { motion: new Proxy({}, { get: (_, name) => name }), AnimatePresence: 'presence', useReducedMotion: () => reducedMotion };
      if (name === 'lucide-react') return new Proxy({}, { get: (_, name) => name });
      return { useTheme: () => ({ theme: 'dark', toggleTheme() {} }) };
    },
  };
  const source = readFileSync(new URL('../src/components/layout/Header.jsx', import.meta.url), 'utf8');
  vm.runInNewContext(transformSync(source, { loader: 'jsx', format: 'cjs' }).code, context);
  function render() {
    cursor = 0;
    const nodes = [];
    function walk(node) {
      if (Array.isArray(node)) return node.forEach(walk);
      if (!node || typeof node !== 'object') return;
      nodes.push(node);
      if (node.props['aria-label'] === 'Open menu') node.props.ref.current = trigger;
      if (node.props.id === 'tmh-mobile-menu') node.props.ref.current = panel;
      walk(node.props.children);
    }
    walk(context.module.exports.default({ onOpenReview() { reviewRequests++; } }));
    return nodes;
  }
  function commit() {
    const nodes = render();
    for (const [index, effect] of effects) {
      cleanups.get(index)?.();
      cleanups.set(index, effect());
    }
    effects.clear();
    return nodes;
  }
  function open() {
    trigger.focus();
    render().find((node) => node.props['aria-label'] === 'Open menu').props.onClick();
    return commit();
  }
  commit();
  return { render, commit, open, document, trigger, close, last, listeners, scrolls, get reviewRequests() { return reviewRequests; } };
}

test('mobile navigation traps Tab, closes on Escape and restores focus and the prior scroll lock', () => {
  const ui = header();
  assert.equal(ui.document.body.style.overflow, 'clip');
  const opened = ui.open();
  assert.equal(opened.find((node) => node.props['aria-label'] === 'Open menu').props['aria-expanded'], true);
  assert.equal(opened.find((node) => node.props.id === 'tmh-mobile-menu').props['aria-modal'], 'true');
  assert.equal(ui.document.activeElement, ui.close);
  assert.equal(ui.document.body.style.overflow, 'hidden');
  let prevented = 0;
  ui.last.focus();
  ui.listeners.get('keydown')({ key: 'Tab', shiftKey: false, preventDefault() { prevented++; } });
  assert.equal(ui.document.activeElement, ui.close);
  ui.listeners.get('keydown')({ key: 'Tab', shiftKey: true, preventDefault() { prevented++; } });
  assert.equal(ui.document.activeElement, ui.last); assert.equal(prevented, 2);
  ui.listeners.get('keydown')({ key: 'Escape' });
  const closed = ui.commit();
  assert.equal(closed.find((node) => node.props['aria-label'] === 'Open menu').props['aria-expanded'], false);
  assert.equal(ui.document.body.style.overflow, 'clip');
  assert.equal(ui.document.activeElement, ui.trigger); assert.equal(ui.listeners.size, 0);
});

test('reduced motion removes the drawer travel and anchor smooth scrolling', () => {
  const ui = header({ reducedMotion: true });
  const opened = ui.open();
  const panel = opened.find((node) => node.props.id === 'tmh-mobile-menu');
  assert.equal(panel.props.initial.x, 0); assert.equal(panel.props.transition.duration, 0);
  opened.find((node) => node.type === 'a' && node.props.href === '#about').props.onClick({ preventDefault() {} });
  ui.commit();
  assert.equal(ui.scrolls[0].behavior, 'auto');
  assert.equal(ui.render().some((node) => node.props.id === 'tmh-mobile-menu'), false);
});

test('mobile review action closes navigation and calls the existing review flow once', () => {
  const ui = header();
  const opened = ui.open();
  const action = opened.find((node) => node.type === 'button' && node.props.children.some((child) => child?.props?.children?.includes('Request a Free Brand Review')));
  action.props.onClick();
  ui.commit();
  assert.equal(ui.reviewRequests, 1);
  assert.equal(ui.render().some((node) => node.props.id === 'tmh-mobile-menu'), false);
});

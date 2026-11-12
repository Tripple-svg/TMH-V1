import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { transformSync } from 'esbuild';
import { webcrypto } from 'node:crypto';
import { PLATFORM_ACTIONS } from '../supabase/functions/_shared/platform-navigation.js';
import { quickPrompts } from '../src/components/haven/config/quick-prompts.js';
import { STEPS } from '../src/components/haven/config/prompts.js';

// Render the real drawer while retaining its session across scorecard/chat changes.
function drawer() {
  const failedTurn = { content: 'Please explain the next step', image: null, error: 'Retry your saved message.', retryAt: 0 };
  const calls = [];
  const state = {
    isOpen: true, activeScope: 'audit', viewState: 'chatting', messages: [],
    currentSession: { id: 'session', failedTurn }, activeSessionId: 'session', isThinking: false,
    userProfile: { businessDomain: 'website', reviewId: 'review', sessionId: 'session', accessToken: 'private' },
    auditPreflight: { status: 'ready', dismissed: false },
    sendMessage: (...args) => calls.push(args),
    createNewSession: () => calls.push('new chat'),
    recheckHavenAccess: async () => state.userProfile.flag_status || 'white',
    closeDrawer: () => calls.push('close'),
    consumePlaybookHandoff() { state.playbookHandoff = null; },
    proceedFromPreflight() { state.auditPreflight = { ...state.auditPreflight, dismissed: true }; },
  };
  let cursor = 0;
  const slots = [], effects = [];
  const react = {
    createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    useState(initial) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial;
      return [slots[i], value => { slots[i] = typeof value === 'function' ? value(slots[i]) : value; }];
    },
    useRef(initial) { const i = cursor++; return slots[i] ||= { current: initial }; },
    useCallback: fn => fn, useEffect: effect => effects.push(effect),
    memo: component => component,
  };
  const context = {
    module: { exports: {} }, document: { body: {}, getElementById: () => null }, URLSearchParams,
    requestAnimationFrame: fn => fn(),
    require(name) {
      if (name === 'react') return react;
      if (name === 'react-dom') return { createPortal: node => node };
      if (name === 'framer-motion') return { motion: new Proxy({}, { get: (_, key) => key }), AnimatePresence: 'presence', useReducedMotion: () => false };
      if (name === 'react-router-dom') return { Link: 'Link', useNavigate: () => path => calls.push(path) };
      if (name === 'lucide-react') return new Proxy({}, { get: (_, key) => key });
      if (name.includes('useDialogFocus')) return { useDialogFocus() {} };
      if (name.includes('/useHaven')) return { useHaven: () => state };
      if (name.includes('useDrawerViewport')) return { __esModule: true, default: () => ({ current: null }) };
      if (name.includes('quick-prompts')) return { quickPrompts };
      if (name.includes('platform-navigation')) return { PLATFORM_ACTIONS };
      return { __esModule: true, default: name.split('/').at(-1) };
    },
  };
  const source = readFileSync(new URL('../src/components/haven/components/HavenDrawer.jsx', import.meta.url), 'utf8');
  vm.runInNewContext(transformSync(source, { loader: 'jsx', format: 'cjs' }).code, context);
  function walkTree(tree) {
    const nodes = [];
    function walk(node) {
      if (Array.isArray(node)) return node.forEach(walk);
      if (!node || typeof node !== 'object') return;
      nodes.push(node); walk(node.props.children);
    }
    walk(tree);
    return nodes;
  }
  function render() {
    cursor = 0;
    const nodes = walkTree(context.module.exports.default());
    while (effects.length) effects.shift()();
    return nodes;
  }
  return { state, failedTurn, calls, render, walkTree, document: context.document };
}
const finishDrawerExit = ui => ui.render().find(node => node.type === 'presence' && node.props.onExitComplete).props.onExitComplete();
const text = node => Array.isArray(node) ? node.map(text).join('') : node && typeof node === 'object' ? text(node.props.children) : typeof node === 'string' || typeof node === 'number' ? String(node) : '';
const retry = tree => tree.find(node => node.type === 'button' && text(node) === 'Retry saved message');
const thinking = tree => tree.some(node => node.type?.name === 'ThinkingIndicator');

test('only Need Help has a new-chat control and restores the four starter actions', () => {
  const ui = drawer();
  const newChat = tree => tree.find(node => node.props['aria-label'] === 'Start a new support chat');
  for (const [scope, serviceId] of [['audit', 'brand-audit'], ['service', 'web'], ['support', 'site-support'], ['support', 'team-inquiry'], ['support', null]]) {
    ui.state.activeScope = scope;
    ui.state.currentSession = { serviceId };
    assert.equal(newChat(ui.render()), undefined);
  }
  ui.state.canStartNewChat = true;
  ui.state.animateIntro = true;
  ui.state.messages = [{ role: 'agent', content: 'Old intro', isSeedGreeting: true }];
  const initial = ui.render();
  assert.match(text(initial), /Customer Support/);
  assert.equal(initial.find(node => node.props.needHelp === true), undefined);
  assert.equal(initial.find(node => node.type === 'ChatMessage').props.animateEntry, true);
  newChat(initial).props.onClick();

  ui.state.currentSession = { startedWithPlus: true };
  ui.state.messages = [];
  ui.state.viewState = 'landing';
  const tree = ui.render();
  const starter = tree.find(node => node.props.needHelp === true);
  const nodes = ui.walkTree(starter.type(starter.props));
  assert.ok(nodes.some(node => node.type === 'img' && node.props.alt === 'Haven'));
  assert.equal(nodes.filter(node => node.type === 'button').length, 4);
  nodes.find(node => node.type === 'button' && text(node).includes('Website help')).props.onClick();
  assert.deepEqual(ui.calls, ['new chat', ['Show website help']]);
  const composer = tree.find(node => node.type === 'ChatInput');
  composer.props.onTypingChange(true);
  const typing = ui.render();
  assert.equal(typing.find(node => node.props.needHelp === true), undefined);
  assert.ok(typing.some(node => node.type === 'ChatInput'));
  composer.props.onTypingChange(false);
  assert.ok(ui.render().some(node => node.props.needHelp === true));
});

test('only a new Haven reply animates when a conversation already has messages', () => {
  const ui = drawer();
  ui.state.activeScope = 'support';
  ui.state.animateIntro = false;
  ui.state.messages = [{ id: 'old', role: 'agent' }, { id: 'question', role: 'user' }, { id: 'reply', role: 'agent' }];
  const animations = () => ui.render().filter(node => node.type === 'ChatMessage').map(node => node.props.animateEntry);
  assert.deepEqual(animations(), [false, false, false]);
  ui.state.latestReplyId = 'reply';
  assert.deepEqual(animations(), [false, false, true]);
});

test('a restricted chat only offers an email appeal with the Haven reference', () => {
  const ui = drawer();
  ui.state.userProfile = { flag_status: 'red', restrictionReason: 'Harassment or threats in chat.', appealReference: 'visitor-reference' };
  ui.state.playbookHandoff = { scope: 'audit', sessionId: 'session' };
  const tree = ui.render();
  assert.ok(tree.some(node => text(node).includes('Harassment or threats in chat.')));
  assert.ok(tree.some(node => node.type === 'a' && text(node) === 'Contact Team Haven' && decodeURIComponent(node.props.href).includes('visitor-reference')));
  assert.ok(!tree.some(node => node.type === 'ChatInput' || node.type === 'HavenScoreCard' || text(node) === 'Check access again'));
  assert.deepEqual(ui.calls, []);
});

test('a yellow warning is visible while the visitor can still use chat', () => {
  const ui = drawer();
  ui.state.activeScope = 'support';
  ui.state.userProfile = { flag_status: 'yellow' };
  const tree = ui.render();
  assert.ok(tree.some(node => node.props.role === 'status' && text(node).startsWith('Haven chat warning.')));
  assert.ok(tree.some(node => node.type === 'ChatInput'));
});

test('Haven animates new sessions once and can start another chat only from Need Help', () => {
  function provider(siteSupport = false, legacyEmptySupport = false) {
    let cursor = 0;
    const slots = [], storage = new Map();
    const react = {
      createContext: () => ({ Provider: 'provider' }),
      createElement: (type, props) => ({ type, props }),
      useState(initial) {
        const index = cursor++;
        if (!(index in slots)) {
          slots[index] = typeof initial === 'function' ? initial() : initial;
          if (legacyEmptySupport && Array.isArray(initial) && initial[0]?.id === 'session-default') {
            slots[index] = [{ ...initial[0], hasGreeted: true }];
          }
        }
        return [slots[index], value => { slots[index] = typeof value === 'function' ? value(slots[index]) : value; }];
      },
      useRef(initial) { return slots[cursor++] ||= { current: initial }; },
      useEffect() {}, useCallback: fn => fn, useMemo: fn => fn(),
    };
    const context = {
      module: { exports: {} }, React: react, crypto: webcrypto, setTimeout() {},
      localStorage: { getItem: key => storage.get(key) },
      require: name => name === 'react' ? react : name.endsWith('/config/prompts') ? { STEPS } : {},
    };
    const source = readFileSync(new URL('../src/components/haven/context/HavenContext.jsx', import.meta.url), 'utf8');
    vm.runInNewContext(transformSync(source, { loader: 'jsx', format: 'cjs' }).code, context);
    const render = () => { cursor = 0; return context.module.exports.HavenProvider({ siteSupport }).props.value; };
    return { render, storage };
  }

  const home = provider();
  const render = home.render;
  const team = () => render().openDrawer('support', { profileData: { entryContext: 'team_inquiry' } });
  team();
  const teamId = render().activeSessionId;
  assert.equal(render().animateIntro, true);
  assert.equal(render().createNewSession(), undefined);
  home.storage.set('tmh_haven_last_support_session', teamId);
  render().closeDrawer(); team();
  assert.equal(render().activeSessionId, teamId);
  assert.equal(render().animateIntro, false);

  render().openDrawer('need_help');
  assert.notEqual(render().activeSessionId, teamId);
  assert.equal(render().animateIntro, true);
  assert.equal(render().messages.length, 1);
  assert.equal(render().currentSession.startedWithPlus, undefined);
  const reply = render().addMessage('agent', 'New response');
  assert.equal(render().latestReplyId, reply.id);
  render().closeDrawer(); render().openDrawer('need_help');
  assert.equal(render().latestReplyId, null);
  assert.equal(render().animateIntro, false);
  const fresh = render().createNewSession();
  assert.equal(render().activeSessionId, fresh);
  assert.equal(render().animateIntro, true);
  assert.equal(render().messages.length, 0);
  assert.equal(render().currentSession.startedWithPlus, true);
  home.storage.set('tmh_haven_last_support_session', fresh);
  render().closeDrawer(); render().openDrawer('need_help');
  assert.equal(render().activeSessionId, fresh);
  assert.equal(render().animateIntro, false);
  render().addMessage('user', 'Where do I find my purchase?');
  assert.equal(render().currentSession.startedWithPlus, false);
  render().clearChat(); render().closeDrawer(); render().openDrawer('need_help');
  assert.equal(render().activeSessionId, fresh);
  assert.equal(render().animateIntro, false);

  const service = () => render().openDrawer('service_inquiry', { serviceData: { id: 'web', title: 'Web' } });
  const profileData = { reviewId: 'review', sessionId: 'audit', accessToken: 'token', businessDomain: 'none' };
  const audit = (isReturningUser = false) => render().openDrawer('audit', { profileData: { ...profileData, isReturningUser } });
  for (const [open, reopen] of [[service, service], [audit, () => audit(true)]]) {
    open(); assert.equal(render().animateIntro, true); assert.equal(render().createNewSession(), undefined);
    const id = render().activeSessionId;
    render().closeDrawer(); reopen();
    assert.equal(render().activeSessionId, id); assert.equal(render().animateIntro, false);
  }

  const site = provider(true).render;
  site().openDrawer('support');
  assert.equal(site().currentSession.serviceId, 'site-support');
  assert.equal(site().animateIntro, true);
  assert.equal(site().createNewSession(), undefined);
  site().closeDrawer(); site().openDrawer('support');
  assert.equal(site().animateIntro, false);
  assert.equal(site().sessions.length, 1);

  const legacy = provider(false, true).render;
  legacy().openDrawer('need_help');
  assert.equal(legacy().messages.length, 1);
  assert.equal(legacy().animateIntro, true);
  legacy().closeDrawer(); legacy().openDrawer('need_help');
  assert.equal(legacy().animateIntro, false);
});

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

test('the Playbook chip on Support navigates to the shop checkout handoff', () => {
  const ui = drawer();
  ui.state.activeScope = 'support';
  ui.state.messages = [{ role: 'agent', content: 'Open the checkout when ready.' }];
  ui.render().find(node => node.type === 'ChatMessage').props.onChipSelect('__PLAYBOOK__');
  assert.deepEqual(ui.calls, ['close', '/?playbook=open#shop']);
});

test('confirmed Playbook handoff goes straight to the public section once, only from the active chat', () => {
  const ui = drawer();
  ui.state.activeScope = 'support';
  ui.state.playbookHandoff = { scope: 'support', sessionId: 'different-session' };
  ui.render();
  assert.deepEqual(ui.calls, []);
  ui.state.playbookHandoff = { scope: 'support', sessionId: 'session' };
  ui.render();
  assert.deepEqual(ui.calls, ['close']);
  finishDrawerExit(ui);
  finishDrawerExit(ui);
  assert.deepEqual(ui.calls, ['close', '/#shop']);
});

test('confirmed testimonial handoff navigates to Testimonials from Support without opening checkout', () => {
  const ui=drawer();
  ui.state.activeScope='support';
  ui.state.playbookHandoff={scope:'support',sessionId:'session',chip:'__TESTIMONIALS__'};
  ui.render();
  assert.deepEqual(ui.calls, ['close']);
  finishDrawerExit(ui);
  assert.deepEqual(ui.calls,['close','/#testimonials']);
});

test('the testimonial chip scrolls and focuses the home section only after the drawer exits', () => {
  const ui = drawer();
  ui.state.activeScope = 'support';
  ui.state.messages = [{ role: 'agent', content: 'Want to see our testimonials?' }];
  ui.document.getElementById = id => id === 'testimonials' ? {
    scrollIntoView: options => ui.calls.push(options.behavior),
    focus: options => ui.calls.push(options.preventScroll),
  } : null;
  ui.render().find(node => node.type === 'ChatMessage').props.onChipSelect('__TESTIMONIALS__');
  assert.deepEqual(ui.calls, ['close']);
  finishDrawerExit(ui);
  assert.deepEqual(ui.calls, ['close', 'smooth', true]);
});

test('a started review stays in chat and shows its score even with a stale scorecard state', () => {
  const ui = drawer();
  ui.state.messages = [{ role: 'user', content: 'My first question' }];
  ui.state.userProfile.auditScore = 72;
  const chat = ui.render();
  assert.equal(chat.some(node => node.type === 'HavenScoreCard'), false);
  assert.match(text(chat), /Score: 72/);
  assert.doesNotMatch(text(chat), /Review source|Edit review details|Restart review/);
});

test('the retry support link preserves the known issue category and handles older failures', () => {
  const ui = drawer();
  ui.state.auditPreflight.dismissed = true;
  const issue = () => new URL(ui.render().find(node => node.type === 'a' && text(node) === 'Contact support').props.href, 'https://example.com').searchParams.get('issue');
  assert.equal(issue(), 'other');
  ui.failedTurn.supportIssue = 'rate_limit';
  assert.equal(issue(), 'rate_limit');
});

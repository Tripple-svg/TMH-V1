import {supportPrefill} from '../src/lib/supportPrefill.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { transformSync } from 'esbuild';

function supportPage({ issue = '', invoke = async () => ({ data: { ok: true, reference: 'support-reference' } }) } = {}) {
  const slots = [], calls = [],effects=[],scrolls=[],opened=[];
  let cursor = 0, resets = 0,headingFocus=0;
  const react = {
    createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    useState(initial) { const index = cursor++; if (!(index in slots)) slots[index] = initial; return [slots[index], value => { slots[index] = value; }]; },
    useRef(initial) { const index = cursor++; return slots[index] ||= { current: initial }; },
    useLayoutEffect(effect){const index=cursor++;if(!(index in slots)){slots[index]=true;effects.push(effect);}},
  };
  const context = {
    module: { exports: {} }, React: react, window: { scrollTo:options=>scrolls.push(options),location: { search: issue ? `?issue=${encodeURIComponent(issue)}` : '' } }, URLSearchParams, Response,
    require(name) {
      if (name === 'react') return react;
      if (name === 'react-router-dom') return { Link: 'Link',useLocation:()=>({search:issue?'?issue='+encodeURIComponent(issue):''}) };
      if (name === 'framer-motion') return { motion:{main:'main'}, useReducedMotion:()=>false };
      if(name.includes('HavenContext'))return {useHaven:()=>({openDrawer:scope=>opened.push(scope)})};
      if(name.includes('supportPrefill'))return {supportPrefill};
      if (name === 'lucide-react') return new Proxy({}, { get: (_, key) => key });
      if (name.includes('TurnstileWidget')) return { __esModule: true, default: 'TurnstileWidget' };
      if (name.includes('havenIdentity')) return { getHavenIdentity: () => ({ visitorId: 'visitor', visitorToken: 'private-proof' }) };
      if (name.includes('tmhPublicInfo')) return { TMH_CONTACT: { email: 'info@themarketinghaven.xyz' } };
      if (name.includes('supabase')) return { supabase: { functions: { invoke(name, options) { calls.push({ name, body: options.body }); return invoke(name, options); } } } };
      throw new Error(`Unexpected import: ${name}`);
    },
  };
  const source = readFileSync('src/pages/SupportPage.jsx', 'utf8');
  vm.runInNewContext(transformSync(source, { loader: 'jsx', format: 'cjs' }).code, context);
  function render() {
    cursor = 0;
    const nodes = [];
    function walk(node) {
      if (Array.isArray(node)) return node.forEach(walk);
      if (!node || typeof node !== 'object') return;
      if (node.type === 'TurnstileWidget') node.props.ref.current = { reset() { resets++; } };
      if(node.type==='h1'&&node.props.ref)node.props.ref.current={focus(){headingFocus++;}};
      nodes.push(node); walk(node.props.children);
    }
    walk(context.module.exports.default());while(effects.length)effects.shift()();return nodes;
  }
  return { render, calls,scrolls,opened,get headingFocus(){return headingFocus;}, get resets() { return resets; } };
}
test('support entry resets retained footer scroll and focuses the heading once without disturbing form edits',()=>{
  const ui=supportPage();ui.render();assert.equal(ui.scrolls[0].top,0);assert.equal(ui.headingFocus,1);
  ui.render();assert.equal(ui.scrolls.length,1);assert.equal(ui.headingFocus,1);
});
const text = node => Array.isArray(node) ? node.map(text).join('') : node && typeof node === 'object' ? text(node.props.children) : typeof node === 'string' ? node : '';
const radios = tree => tree.filter(node => node.type === 'input' && node.props.type === 'radio');
const submitButton = tree => tree.find(node => node.type === 'button' && node.props.type === 'submit');
function fill(ui) {
  const tree = ui.render();
  tree.find(node => node.type === 'input' && node.props.autoComplete === 'name').props.onChange({ target: { value: '  Ada  ' } });
  tree.find(node => node.type === 'input' && node.props.type === 'email').props.onChange({ target: { value: '  owner@example.com  ' } });
  tree.find(node => node.type === 'textarea').props.onChange({ target: { value: '  My saved review cannot be opened.  ' } });
}

test('support issue cards retain native radio semantics, descriptive labels and valid deep-link selection', () => {
  for (const [issue, expected] of [['purchase', 'purchase'], ['unsupported', 'other'], ['', 'other']]) {
    const tree = supportPage({ issue }).render();
    assert.equal(tree.filter(node => node.type === 'select').length, 0);
    assert.ok(tree.find(node => node.type === 'fieldset'));
    assert.equal(radios(tree).length, 5);
    assert.deepEqual(radios(tree).filter(node => node.props.checked).map(node => node.props.value), [expected]);
    for (const radio of radios(tree)) {
      assert.equal(radio.props.name, 'support-category');
      assert.ok(tree.find(node => node.props.id === radio.props['aria-labelledby']));
      assert.ok(tree.find(node => node.props.id === radio.props['aria-describedby']));
    }
  }
});

test('support gives a plain three-step path with the reference and reply expectations before sending', () => {
  const tree = supportPage().render();
  const copy = tree.map(text).join(' ');
  for (const step of ['1. Choose your issue', '2. Tell us what happened', '3. Send and save your reference']) assert.ok(copy.includes(step));
  assert.match(copy, /Tick the consent box and complete the security check/);
  assert.match(copy, /Your reference appears here once the request is saved/);
  assert.match(copy, /My playbook purchase/);
});

test('support sending remains disabled until consent and CAPTCHA, then submits the selected card and browser proof', async () => {
  const ui = supportPage();
  fill(ui);
  let tree = ui.render();
  radios(tree).find(node => node.props.value === 'review_access').props.onChange();
  assert.equal(submitButton(tree).props.disabled, true);
  await tree.find(node => node.type === 'form').props.onSubmit({ preventDefault() {} });
  assert.equal(ui.calls.length, 0);
  tree = ui.render();
  tree.find(node => node.type === 'TurnstileWidget').props.onVerify('captcha-token');
  assert.equal(submitButton(ui.render()).props.disabled, true);
  tree.find(node => node.type === 'input' && node.props.type === 'checkbox').props.onChange({ target: { checked: true } });
  assert.equal(submitButton(ui.render()).props.disabled, false);
  await ui.render().find(node => node.type === 'form').props.onSubmit({ preventDefault() {} });
  assert.deepEqual(JSON.parse(JSON.stringify(ui.calls)), [{ name: 'support-request', body: {
    category: 'review_access', name: 'Ada', email: 'owner@example.com', message: 'My saved review cannot be opened.', agreed: true,
    captchaToken: 'captcha-token', visitorId: 'visitor', visitorToken: 'private-proof',
  } }]);
  assert.match(text(ui.render()), /Your request is saved/);
});

test('a pending support submission prevents double sends and disables issue cards, then shows its saved reference', async () => {
  let resolve;
  const ui = supportPage({ invoke: () => new Promise(done => { resolve = done; }) });
  fill(ui);
  let tree = ui.render();
  tree.find(node => node.type === 'TurnstileWidget').props.onVerify('captcha-token');
  tree.find(node => node.type === 'input' && node.props.type === 'checkbox').props.onChange({ target: { checked: true } });
  const onSubmit = ui.render().find(node => node.type === 'form').props.onSubmit;
  const pending = onSubmit({ preventDefault() {} });
  await onSubmit({ preventDefault() {} });
  assert.equal(ui.calls.length, 1);
  assert.ok(radios(ui.render()).every(node => node.props.disabled));
  resolve({ data: { ok: true, reference: 'saved-private-request' } }); await pending;
  tree = ui.render();
  assert.equal(tree.some(node => node.type === 'form'), false);
  assert.match(text(tree.find(node => node.props.role === 'status')), /saved-private-request/);
  assert.ok(tree.find(node => node.type === 'a' && node.props.href.includes('saved-private-request')));
  assert.equal(ui.resets, 1);
});

test('failed support submission preserves the message and email fallback, requires a fresh CAPTCHA and never claims success', async () => {
  const ui = supportPage({ invoke: async () => ({ data: { ok: false, error: 'Please wait before sending another request.' } }) });
  fill(ui);
  let tree = ui.render();
  tree.find(node => node.type === 'TurnstileWidget').props.onVerify('captcha-token');
  tree.find(node => node.type === 'input' && node.props.type === 'checkbox').props.onChange({ target: { checked: true } });
  await ui.render().find(node => node.type === 'form').props.onSubmit({ preventDefault() {} });
  tree = ui.render();
  assert.match(text(tree.find(node => node.props.role === 'alert')), /Please wait/);
  assert.equal(tree.find(node => node.type === 'textarea').props.value, '  My saved review cannot be opened.  ');
  assert.equal(submitButton(tree).props.disabled, true); assert.equal(ui.resets, 1);
  assert.equal(tree.some(node => node.props.role === 'status'), false);
  assert.ok(tree.some(node => node.type === 'a' && node.props.href === 'mailto:info@themarketinghaven.xyz'));
});

test('Haven help opens without sending the form or blocking direct team contact',()=>{
  const ui=supportPage();fill(ui);let nodes=ui.render();nodes.find(node=>node.type==='button'&&text(node)==='Ask Haven').props.onClick();
  assert.deepEqual(ui.opened,['support']);assert.equal(ui.calls.length,0);
  nodes=ui.render();assert.ok(nodes.find(node=>node.type==='form'));assert.equal(nodes.find(node=>node.type==='textarea').props.value,'  My saved review cannot be opened.  ');
  nodes.find(node=>node.type==='button'&&text(node)==='Ask Haven').props.onClick();
  assert.deepEqual(ui.opened,['support','support']);
  assert.doesNotMatch(text(nodes.find(node=>node.props['aria-label']==='Help from Haven')),/marketing questions/);
});

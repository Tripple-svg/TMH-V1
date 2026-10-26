import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { transformSync } from 'esbuild';

function shop(saved, invoke) {
  const state = [], effects = [], events = new Map(), storage = new Map(saved ? [['tmh_playbook_purchase', saved]] : []), downloads = [];
  let cursor = 0;
  const react = {
    useCallback: (fn) => fn,
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
    setTimeout, clearTimeout, AbortSignal, Response, crypto: webcrypto,
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
  return { render, mount, storage, downloads, window: context.window };
}
const flush = () => new Promise((resolve) => setImmediate(resolve));


const text = node => Array.isArray(node) ? node.map(text).join('') : node && typeof node === 'object' ? text(node.props.children) : typeof node === 'string' ? node : '';
const token='a'.repeat(64);
const saved=()=>JSON.stringify({reference:'UNSEEN_paid',email:'buyer@example.com',downloadToken:token});
const recoveryForm=tree=>tree.find(node=>node.type==='form'&&!node.props.id);
const input= (tree,type) => tree.find(node=>node.type==='input'&&node.props.type===type);
test('Playbook card and checkout show the actual NGN 9,639 price without a test-mode label',()=>{
  const ui=shop(null,async()=>({data:{}})); const tree=ui.mount();
  assert.ok(ui.render().some(node=>node.type==='p'&&text(node).includes('₦9,639')));
  assert.doesNotMatch(text(tree),/₦100|testing|test mode/);
  assert.ok(!tree.some(node=>node.type==='button'&&text(node)==='Already purchased? Recover your copy'));
  const source=readFileSync(new URL('../src/components/ShopSection.jsx',import.meta.url),'utf8');
  assert.match(source,/PAYSTACK_AMOUNT_KOBO = 963900/);
});
test('saved device grant: no download is rendered before fresh server verification',async()=>{
  let resolve,body,attempt=0;
  const ui=shop(saved(),async(name,args)=>{body=args.body;return ++attempt===1?new Promise(done=>{resolve=done;}):{data:{ok:true,url:'https://private.example/fresh',playbookAccessToken:'reader'}};});
  assert.equal(ui.mount().filter(node=>node.type==='a').length,0);
  assert.equal(body.downloadToken,token);
  resolve({data:{ok:true,url:'https://private.example/fresh',playbookAccessToken:'reader'}});await flush();
  const link=ui.render().find(node=>node.type==='a');assert.equal(link.props.href,'https://private.example/fresh');
  await link.props.onClick({preventDefault(){}});
  const stored=JSON.parse(ui.storage.get('tmh_playbook_purchase'));
  assert.equal(stored.downloadToken,token);assert.equal(stored.accessToken,'reader');assert.ok(stored.downloadedAt);
  assert.deepEqual(ui.downloads,['https://private.example/fresh']);assert.ok(!JSON.stringify(stored).includes('https://'));
});
test('a legacy email/reference snapshot does not authorize a download or trigger an unsolicited OTP',async()=>{
  let calls=0;
  const ui=shop(JSON.stringify({reference:'UNSEEN_old',email:'buyer@example.com',accessToken:'legacy'}),async()=>{calls++;return {data:{ok:true,url:'https://must-not-open'}};});
  ui.mount();await flush();assert.equal(calls,0);assert.equal(ui.render().filter(node=>node.type==='a').length,0);
});
test('purchase recovery requires email code before exposing a URL or reader token',async()=>{
  const calls=[];
  const ui=shop(null,async(name,{body})=>{
    calls.push({name,body});
    return name==='request-playbook-recovery'
      ? {data:{ok:true,challengeId:'challenge',message:'Check the checkout inbox.'}}
      : {data:{ok:true,reference:'UNSEEN_paid',email:'buyer@example.com',url:'https://private.example/recovered',downloadToken:token,playbookAccessToken:'reader'}};
  });
  let tree=ui.mount();
  tree.find(node=>node.type==='button'&&text(node)==='Already purchased').props.onClick();
  tree=ui.render();
  const fields=tree.filter(node=>node.type==='input');
  fields[0].props.onChange({target:{value:'buyer@example.com'}});fields[1].props.onChange({target:{value:'UNSEEN_paid'}});
  await recoveryForm(ui.render()).props.onSubmit({preventDefault(){}});
  tree=ui.render();assert.equal(tree.filter(node=>node.type==='a').length,0);
  assert.equal(JSON.parse(ui.storage.get('tmh_playbook_purchase')||'null'),null);
  const otp=tree.find(node=>node.type==='input'&&node.props.autoComplete==='one-time-code');
  otp.props.onChange({target:{value:'123456'}});
  await recoveryForm(ui.render()).props.onSubmit({preventDefault(){}});
  assert.deepEqual(JSON.parse(JSON.stringify(calls)),[
    {name:'request-playbook-recovery',body:{reference:'UNSEEN_paid',email:'buyer@example.com'}},
    {name:'verify-playbook-recovery',body:{challengeId:'challenge',code:'123456'}},
  ]);
  assert.equal(ui.render().find(node=>node.type==='a').props.href,'https://private.example/recovered');
  assert.equal(JSON.parse(ui.storage.get('tmh_playbook_purchase')).downloadToken,token);
});
test('downloads refresh expiring URLs and allow one action per visit with future access',async()=>{
  let calls=0;const invoke=async(name,{body})=>{assert.equal(body.downloadToken,token);return {data:{ok:true,url:'https://private.example/fresh-'+(++calls)}};};
  const ui=shop(saved(),invoke);ui.mount();await flush();
  const first=ui.render().find(node=>node.type==='a');await Promise.all([first.props.onClick({preventDefault(){}}),first.props.onClick({preventDefault(){}})]);
  assert.deepEqual(ui.downloads,['https://private.example/fresh-2']);assert.equal(ui.render().filter(node=>node.type==='a').length,0);
  const nextVisit=shop(ui.storage.get('tmh_playbook_purchase'),invoke);nextVisit.mount();await flush();
  await nextVisit.render().find(node=>node.type==='a').props.onClick({preventDefault(){}});
  assert.deepEqual(nextVisit.downloads,['https://private.example/fresh-4']);assert.equal(calls,4);
});

test('failed verification hides downloads and offers recovery without another charge',async()=>{
  const ui=shop(saved(),async()=>({data:{ok:false,code:'recovery_required'}}));
  ui.mount();await flush();
  const tree=ui.render();assert.equal(tree.filter(node=>node.type==='a').length,0);
  assert.match(text(tree),/one-time code|do not need to pay again/);
  assert.ok(recoveryForm(tree));assert.ok(!tree.some(node=>node.type==='form'&&node.props.id==='paystack-form'));
});


test('checkout separates buying and recovery into labelled tabs with a single modal close control',()=>{
  const ui=shop(null,async()=>({data:{}}));let tree=ui.mount();
  const tabs=tree.filter(node=>node.props.role==='tab');assert.deepEqual(tabs.map(text),['Buy a copy','Already purchased']);
  assert.equal(tree.filter(node=>node.props['aria-label']==='Close Playbook checkout').length,1);
  tabs[1].props.onClick();tree=ui.render();
  assert.equal(tree.find(node=>node.props.role==='tabpanel').props.id,'playbook-recover-panel');
  assert.doesNotMatch(text(tree),/Back to checkout|What\'s Inside The Playbook/);
});

test('fresh checkout verifies its private proof and exposes the download without an OTP',async()=>{
  const calls=[];let payment;
  const ui=shop(null,async(name,{body})=>{
    calls.push({name,body});
    return {data:body.action==='prepare-checkout'
      ?{ok:true,reference:'UNSEEN_new',email:'buyer@example.com',downloadToken:token,amount:963900}
      :{ok:true,url:'https://private.example/new',playbookAccessToken:'reader'}};
  });
  ui.window.PaystackPop={setup(options){payment=options;return {openIframe(){}};}};
  let tree=ui.mount();input(tree,'email').props.onChange({target:{value:'buyer@example.com'}});
  await ui.render().find(node=>node.props.id==='paystack-form').props.onSubmit({preventDefault(){}});
  assert.equal(payment.amount,963900);assert.equal(payment.ref,'UNSEEN_new');
  payment.callback({reference:'UNSEEN_new'});await flush();
  tree=ui.render();assert.equal(tree.find(node=>node.type==='a').props.href,'https://private.example/new');
  assert.deepEqual(calls.map(call=>call.name),['verify-paystack','verify-paystack']);
  assert.equal(calls[1].body.downloadToken,token);assert.equal(JSON.parse(ui.storage.get('tmh_playbook_purchase')).downloadToken,token);
  assert.ok(!tree.some(node=>node.props.autoComplete==='one-time-code'));
});

test('a payment verification outage retains checkout proof and offers a retry without asking for OTP or payment',async()=>{
  let payment,attempt=0;
  const ui=shop(null,async(name,{body})=>({data:body.action==='prepare-checkout'
    ?{ok:true,reference:'UNSEEN_new',email:'buyer@example.com',downloadToken:token,amount:963900}
    :++attempt===1?{ok:false,error:'Payment verification is temporarily unavailable.'}:{ok:true,url:'https://private.example/retried'}}));
  ui.window.PaystackPop={setup(options){payment=options;return {openIframe(){}};}};
  let tree=ui.mount();input(tree,'email').props.onChange({target:{value:'buyer@example.com'}});
  await ui.render().find(node=>node.props.id==='paystack-form').props.onSubmit({preventDefault(){}});
  payment.callback({reference:'UNSEEN_new'});await flush();
  tree=ui.render();assert.match(text(tree),/Confirming your payment/);assert.equal(tree.filter(node=>node.type==='a').length,0);
  assert.ok(!recoveryForm(tree));assert.ok(!tree.some(node=>node.props.id==='paystack-form'));
  await tree.find(node=>node.type==='button'&&text(node)==='Retry opening my copy').props.onClick({preventDefault(){}});
  assert.deepEqual(ui.downloads,['https://private.example/retried']);
});

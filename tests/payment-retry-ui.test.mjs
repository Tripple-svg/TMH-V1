import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {transformSync} from 'esbuild';

function shop({saved=null,invoke=async()=>({data:{ok:true,url:'https://isolated.example/download'}})}={}){
  const source=readFileSync('src/components/ShopSection.jsx','utf8').replace(/^import[\s\S]*?;\s*/gm,'').replace('export default function ShopSection','function ShopSection');
  const code=transformSync(source+'\nmodule.exports=ShopSection;',{loader:'jsx',format:'cjs'}).code;
  let cursor=0,refCursor=0,effects=[],states=[],refs=[],scripts=0,checkout=0;
  const stored=new Map(saved?[['tmh_playbook_purchase',JSON.stringify(saved)]]:[]);
  const context={module:{exports:{}},React:{createElement:(type,props,...children)=>({type,props:{...props,children}})},motion:new Proxy({},{get:(_,key)=>key}),AnimatePresence:'presence',ConfirmModal:'confirm-modal',BookOpen:'icon',CheckCircle2:'icon',ArrowRight:'icon',X:'icon',ShieldCheck:'icon',Download:'icon',
    useState:initial=>{const slot=cursor++;if(!(slot in states))states[slot]=initial;return[states[slot],value=>states[slot]=typeof value==='function'?value(states[slot]):value];},useRef:initial=>refs[refCursor++]|| (refs[refCursor-1]={current:initial}),useCallback:fn=>fn,useEffect:fn=>effects.push(fn),useReducedMotion:()=>true,
    supabase:{functions:{invoke:async(...args)=>{if(args[0]!=='verify-paystack')checkout++;return invoke(...args);}}},getHavenIdentity:()=>({visitorId:'synthetic-visitor',visitorToken:'synthetic-proof'}),AbortSignal,Response,console,
    localStorage:{getItem:key=>stored.get(key),setItem:(key,value)=>stored.set(key,value)},window:{addEventListener(){},removeEventListener(){}},document:{createElement:()=>({}),body:{style:{},appendChild(script){scripts++;script.onerror();}}},setTimeout,clearTimeout};
  vm.runInNewContext(code,context);
  function render(){cursor=refCursor=0;effects=[];const nodes=[];const root=context.module.exports();function walk(node){if(Array.isArray(node))return node.forEach(walk);if(!node||typeof node!=='object')return;nodes.push(node);walk(node.props.children);}walk(root);return nodes;}
  return {render,mount:()=>{render();for(const effect of effects)effect();},flush:()=>new Promise(resolve=>setImmediate(resolve)),get scripts(){return scripts;},get checkout(){return checkout;}};
}
test('failed paid-receipt verification retries the same proof, never starts another checkout, and ignores overlapping retries',async()=>{
  const calls=[];let resolveRetry;
  const ui=shop({saved:{reference:'UNSEEN_SYNTHETIC',email:'buyer@example.test',downloadToken:'a'.repeat(64)},invoke:async(name,{body})=>{calls.push({name,body});if(calls.length===1)return{error:new Error('offline')};return new Promise(resolve=>resolveRetry=resolve);}});
  ui.mount();await ui.flush();
  const alert=ui.render().find(node=>node.type==='confirm-modal'&&node.props.isOpen);assert.equal(alert.props.confirmText,'Retry verification');assert.match(alert.props.message,/receipt/);
  alert.props.onConfirm();alert.props.onConfirm();await ui.flush();assert.equal(calls.length,2);assert.equal(calls[1].name,'verify-paystack');assert.deepEqual(calls[1].body,calls[0].body);assert.equal(ui.scripts,0);assert.equal(ui.checkout,0);
  resolveRetry({data:{ok:true,url:'https://isolated.example/download',playbookAccessToken:'synthetic-access'}});await ui.flush();assert.equal(ui.render().some(node=>node.type==='confirm-modal'&&node.props.isOpen),false);
});
test('checkout script failure exposes a real retry that tries loading checkout again',async()=>{
  const ui=shop();let nodes=ui.render();nodes.find(node=>node.type==='button'&&node.props.onClick&&JSON.stringify(node.props.children).includes('Playbook')).props.onClick();
  nodes=ui.render();nodes.find(node=>node.type==='input'&&node.props.type==='email').props.onChange({target:{value:'buyer@example.test'}});
  const pay=ui.render().find(node=>node.type==='button'&&node.props.onClick&&JSON.stringify(node.props.children).includes('Confirm & Pay'));
  await pay.props.onClick({preventDefault(){}});assert.equal(ui.scripts,1);
  const alert=ui.render().find(node=>node.type==='confirm-modal'&&node.props.isOpen);assert.ok(alert.props.onConfirm);alert.props.onConfirm();await ui.flush();assert.equal(ui.scripts,2);assert.equal(ui.checkout,0);
});

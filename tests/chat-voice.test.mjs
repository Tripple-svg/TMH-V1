import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';
import vm from 'node:vm';
import * as screenshots from '../src/lib/reviewScreenshot.js';

function voice({supported=true,startError=false}={}) {
  const slots=[],effects=new Map(),pending=new Map(),cleanups=new Map(),instances=[],sent=[];
  let cursor=0,props={};
  class Recognition {
    constructor(){instances.push(this);this.aborted=0;}
    start(){if(startError)throw Error('Not available');}
    abort(){this.aborted++;}
  }
  const react={
    createElement:(type,props,...children)=>({type,props:{...props,children}}),
    forwardRef:fn=>fn,
    useState(initial){const index=cursor++;if(!(index in slots))slots[index]=typeof initial==='function'?initial():initial;return[slots[index],value=>{slots[index]=typeof value==='function'?value(slots[index]):value;}];},
    useRef(initial){const index=cursor++;return slots[index]||={current:initial};},
    useCallback(fn,deps){const index=cursor++;if(!slots[index]||deps.some((value,n)=>value!==slots[index].deps[n]))slots[index]={fn,deps};return slots[index].fn;},
    useEffect(fn,deps){const index=cursor++;if(!effects.has(index)||deps.some((value,n)=>value!==effects.get(index)[n]))pending.set(index,fn);effects.set(index,deps);},
    useImperativeHandle(){},
  };
  const context={module:{exports:{}},React:react,window:{SpeechRecognition:supported?Recognition:null},console,
    requestAnimationFrame:fn=>fn(),
    require(name){if(name==='react')return react;if(name==='framer-motion')return{motion:new Proxy({},{get:(_,name)=>name}),useReducedMotion:()=>false};if(name==='lucide-react')return new Proxy({},{get:(_,name)=>name});return screenshots;},
  };
  vm.runInNewContext(transformSync(readFileSync(new URL('../src/components/haven/components/chat/ChatInput.jsx',import.meta.url),'utf8'),{loader:'jsx',format:'cjs'}).code,context);
  const walk=root=>{const nodes=[];const visit=node=>{if(Array.isArray(node))return node.forEach(visit);if(!node||typeof node!=='object')return;nodes.push(node);visit(node.props.children);};visit(root);return nodes;};
  const render=()=>{cursor=0;return walk(context.module.exports.default({onSend:(...args)=>sent.push(args),...props},null));};
  const commit=()=>{const tree=render();for(const[index,fn]of pending){cleanups.get(index)?.();cleanups.set(index,fn());}pending.clear();return tree;};
  const input=()=>render().find(node=>node.type==='textarea');
  const mic=()=>render().find(node=>node.props['aria-label']?.includes('voice input'));
  return{instances,sent,render,commit,input,mic,type:text=>{input().props.onChange({target:{value:text}});commit();},setProps:value=>{props=value;return commit();},unmount(){for(const cleanup of cleanups.values())cleanup?.();}};
}
const result=(text,final=false)=>Object.assign([{transcript:text}],{isFinal:final});
const event=(...results)=>({resultIndex:0,results});

test('voice replaces interim hypotheses and repeated final events never duplicate a typed prefix or words',()=>{
  const ui=voice();ui.commit();ui.type('My bakery:');ui.mic().props.onClick();ui.commit();const session=ui.instances[0];
  session.onresult(event(result('I sell bre')));assert.equal(ui.input().props.value,'My bakery: I sell bre');
  session.onresult(event(result('I sell bread',true),result('near Ike')));assert.equal(ui.input().props.value,'My bakery: I sell bread near Ike');
  session.onresult(event(result('I sell bread',true),result('near Ikeja',true)));assert.equal(ui.input().props.value,'My bakery: I sell bread near Ikeja');
  session.onresult(event(result('I sell bread',true),result('near Ikeja',true)));assert.equal(ui.input().props.value,'My bakery: I sell bread near Ikeja');
  assert.equal(ui.sent.length,0);ui.unmount();
});

test('stopping freezes the draft and old recognition callbacks cannot overwrite a restarted recording',()=>{
  const ui=voice();ui.commit();ui.type('Hello');ui.mic().props.onClick();ui.commit();const old=ui.instances[0],late=old.onresult;
  old.onresult(event(result('from Lagos',true)));ui.commit();ui.mic().props.onClick();ui.commit();assert.equal(old.aborted,1);
  ui.mic().props.onClick();ui.commit();const active=ui.instances[1];
  late(event(result('stale overwrite',true)));assert.equal(ui.input().props.value,'Hello from Lagos');
  active.onresult(event(result('I sell bread',true)));assert.equal(ui.input().props.value,'Hello from Lagos I sell bread');
  ui.unmount();assert.equal(active.aborted,1);
});

test('recognition errors keep confirmed text, discard interim guesses and expose an accessible blocked-permission message',()=>{
  const ui=voice();ui.commit();ui.type('My offer:');ui.mic().props.onClick();ui.commit();const session=ui.instances[0],late=session.onresult;
  session.onresult(event(result('fresh bread',true),result('wrong guess')));session.onerror({error:'not-allowed'});ui.commit();
  assert.equal(ui.input().props.value,'My offer: fresh bread');assert.ok(ui.render().some(node=>node.props.role==='alert'&&String(node.props.children).includes('Microphone access was blocked')));
  late(event(result('must be ignored',true)));assert.equal(ui.input().props.value,'My offer: fresh bread');assert.equal(ui.sent.length,0);
});

test('manual edits, disabled access and unmount all release the microphone and ignore late callbacks',()=>{
  for(const reason of ['edit','disable','unmount']){
    const ui=voice();ui.commit();ui.mic().props.onClick();ui.commit();const session=ui.instances[0],late=session.onresult;
    session.onresult(event(result('voice draft',true)));ui.commit();
    if(reason==='edit')ui.type('My edited draft');else if(reason==='disable')ui.setProps({disabled:true});else ui.unmount();
    const before=ui.input().props.value;late(event(result('late words',true)));assert.equal(ui.input().props.value,before);assert.equal(session.aborted,1);
    if(reason!=='unmount')ui.unmount();
  }
});

test('voice preserves the message limit and never sends or restarts automatically',()=>{
  const ui=voice();ui.commit();ui.type('x'.repeat(3990));ui.mic().props.onClick();ui.commit();const session=ui.instances[0];
  session.onresult(event(result('a long spoken ending',true)));ui.commit();assert.equal(ui.input().props.value.length,4000);assert.equal(session.aborted,1);assert.equal(ui.sent.length,0);
  assert.equal(ui.render().find(node=>node.props['aria-label']==='Start voice input').props['aria-pressed'],false);
});

test('unsupported browsers hide the mic, and a start failure leaves typing usable',()=>{
  const unsupported=voice({supported:false});unsupported.commit();assert.equal(unsupported.mic(),undefined);
  const ui=voice({startError:true});ui.commit();ui.type('Keep this');ui.mic().props.onClick();ui.commit();assert.equal(ui.input().props.value,'Keep this');assert.ok(ui.render().some(node=>node.props.role==='alert'));assert.equal(ui.input().props.disabled,false);
});

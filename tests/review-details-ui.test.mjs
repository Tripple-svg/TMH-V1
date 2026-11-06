import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {transformSync} from 'esbuild';
import vm from 'node:vm';
function editor(save){const slots=[];let cursor=0,closed=0;const react={createElement:(type,props,...children)=>({type,props:{...props,children}}),useState:initial=>{const i=cursor++;if(!(i in slots))slots[i]=initial;return [slots[i],v=>{slots[i]=typeof v==='function'?v(slots[i]):v;}];}};const module={exports:{}};
 vm.runInNewContext(transformSync(readFileSync('src/components/haven/components/ReviewDetailsEditor.jsx','utf8'),{loader:'jsx',format:'cjs'}).code,{module,exports:module.exports,require:()=>react,React:react});
 return {get closed(){return closed;},render(){cursor=0;const nodes=[];const walk=n=>{if(Array.isArray(n))return n.forEach(walk);if(!n||typeof n!=='object')return;nodes.push(n);walk(n.props.children);};walk(module.exports.default({profile:{name:'Owner',brandName:'Brand',whatsapp:'+2340000000',mainGoal:'Goal'},onSave:save,onClose:()=>closed++}));return nodes;}};
}
const content=n=>typeof n==='string'?n:Array.isArray(n)?n.map(content).join(''):n?.props?content(n.props.children):'';
test('review restart is opt-in, needs a separate confirmation and is never a chat command',async()=>{
 const calls=[],ui=editor(async(...args)=>calls.push(args));let nodes=ui.render();assert.equal(calls.length,0);
 nodes.find(n=>n.type==='input'&&n.props.type==='checkbox').props.onChange({target:{checked:true}});
 nodes=ui.render();assert.equal(nodes.filter(n=>n.type==='input'&&n.props.type==='checkbox').length,2);assert.equal(nodes.find(n=>n.type==='button'&&n.props.type==='submit').props.disabled,true);
 await nodes.find(n=>n.type==='form').props.onSubmit({preventDefault(){}});assert.equal(calls.length,0);
 nodes.filter(n=>n.type==='input'&&n.props.type==='checkbox')[1].props.onChange({target:{checked:true}});nodes=ui.render();await nodes.find(n=>n.type==='form').props.onSubmit({preventDefault(){}});
 assert.equal(calls.length,1);assert.equal(calls[0][1].restart,true);assert.equal(ui.closed,1);
});
test('a failed review correction preserves entered values and offers Support without claiming success',async()=>{
 const ui=editor(async()=>{throw Error('Wait for the current reply to finish.');});let nodes=ui.render();nodes.find(n=>n.type==='input'&&n.props.type==='text').props.onChange({target:{value:'Corrected owner'}});
 await ui.render().find(n=>n.type==='form').props.onSubmit({preventDefault(){}});nodes=ui.render();assert.match(content(nodes.find(n=>n.props.role==='alert')),/Wait for the current reply/);assert.equal(ui.closed,0);assert.equal(nodes.find(n=>n.type==='input'&&n.props.type==='text').props.value,'Corrected owner');assert.equal(nodes.find(n=>n.type==='a').props.href,'/support?issue=review_access');
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {transformSync} from 'esbuild';
function fixture(reduced){
  const effects=[],timers=[],cleared=[];let finished=0;
  const react={createElement:(type,props,...children)=>({type,props:{...props,children}}),useRef:value=>({current:value}),useState:value=>[value,()=>{}],useEffect:fn=>effects.push(fn)};
  const module={exports:{}};const code=transformSync(readFileSync('src/components/Preloader.jsx','utf8'),{loader:'jsx',format:'cjs'}).code;
  vm.runInNewContext(code,{module,exports:module.exports,React:react,require:name=>name==='react'?react:name==='framer-motion'?{motion:{div:'div'},useReducedMotion:()=>reduced}:{default:'/synthetic-video.mp4'},setTimeout:(fn,ms)=>{timers.push({fn,ms});return 1;},clearTimeout:id=>cleared.push(id),console:{warn(){}}});
  const tree=module.exports.default({onComplete:()=>finished++});return {tree,timers,cleared,mount:()=>effects.map(fn=>fn()).filter(Boolean),get finished(){return finished;}};
}
test('a video that never loads cannot block the site beyond the short intro timeout',()=>{
  const ui=fixture(false),cleanup=ui.mount();assert.equal(ui.finished,0);assert.equal(ui.timers[0].ms,1800);ui.timers[0].fn();assert.equal(ui.finished,1);cleanup.forEach(fn=>fn());assert.deepEqual(ui.cleared,[1]);
});
test('reduced motion skips the decorative video and its waiting period',()=>{
  const ui=fixture(true);ui.mount();assert.equal(ui.finished,1);assert.equal(ui.timers.length,0);assert.doesNotMatch(JSON.stringify(ui.tree),/synthetic-video/);
});

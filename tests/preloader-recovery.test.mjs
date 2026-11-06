import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {transformSync} from 'esbuild';
function fixture({rejectPlayback=false}={}){
  const effects=[],timers=[];let finished=0;
  const video={playbackRate:1,play:()=>rejectPlayback?Promise.reject(Error('blocked')):Promise.resolve()};
  const react={createElement:(type,props,...children)=>({type,props:{...props,children}}),useRef:()=>({current:video}),useState:value=>[value,()=>{}],useEffect:fn=>effects.push(fn)};
  const module={exports:{}};
  vm.runInNewContext(transformSync(readFileSync('src/components/Preloader.jsx','utf8'),{loader:'jsx',format:'cjs'}).code,{module,exports:module.exports,React:react,require:name=>name==='react'?react:name==='framer-motion'?{motion:{div:'div'}}:{default:'/synthetic-video.mp4'},navigator:{connection:{saveData:true}},setTimeout:(fn,ms)=>timers.push({fn,ms}),console:{warn(){}}});
  const tree=module.exports.default({onComplete:()=>finished++});const media=tree.props.children.find(node=>node?.type==='video');
  return {tree,media,video,timers,mount:()=>effects.forEach(fn=>fn()),get finished(){return finished;}};
}
test('cinematic intro waits for full video completion, including on Data Saver, without a timeout',async()=>{
  const ui=fixture();ui.mount();await Promise.resolve();assert.equal(ui.finished,0);assert.equal(ui.timers.length,0);
  assert.equal(ui.video.playbackRate,2.25);assert.equal(ui.media.props.muted,true);assert.equal(ui.media.props.playsInline,true);
  ui.media.props.onEnded();assert.equal(ui.finished,1);assert.equal(ui.tree.props.exit.opacity,0);assert.equal(ui.tree.props.transition.duration,0.8);
});
test('actual media failure or rejected autoplay releases the intro rather than trapping the visitor',async()=>{
  const ui=fixture();ui.mount();ui.media.props.onError();assert.equal(ui.finished,1);
  const blocked=fixture({rejectPlayback:true});blocked.mount();await Promise.resolve();assert.equal(blocked.finished,1);
});

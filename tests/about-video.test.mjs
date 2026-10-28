import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { buildSync } from 'esbuild';
import vm from 'node:vm';
const require = createRequire(import.meta.url);
const code = buildSync({entryPoints:['src/components/about/AboutStoryVideo.jsx'],bundle:true,write:false,format:'cjs',platform:'node',jsx:'automatic',external:['react','react/jsx-runtime','lucide-react','framer-motion']}).outputFiles[0].text;
function fixture(reduced=false) {
  const state=[],refs=[],effects=[],listeners=new Map();let s=0,r=0;
  const react={useState(initial){const i=s++;if(!(i in state))state[i]=typeof initial==='function'?initial():initial;return[state[i],value=>state[i]=typeof value==='function'?value(state[i]):value]},useRef(value){return refs[r++]||= {current:value}},useEffect(fn){effects.push(fn)},useCallback(fn){return fn}};
  const module={exports:{}};
  const document={visibilityState:'visible',addEventListener:(key,fn)=>listeners.set(key,fn),removeEventListener:key=>listeners.delete(key)};
  vm.runInNewContext(code,{module,exports:module.exports,require:name=>name==='react'?react:name==='framer-motion'?{motion:{div:'div'},useInView:()=>true,useReducedMotion:()=>reduced}:require(name),navigator:{},document,requestAnimationFrame:fn=>fn()});
  const render=()=>{s=0;r=0;return module.exports.default({videoSrc:'/Test%20About.mp4'})};
  render();const video={currentTime:90,muted:true,loop:true,paused:true,plays:0,pauses:0,play(){this.paused=false;this.plays++;return Promise.resolve()},pause(){this.paused=true;this.pauses++}};refs[1].current=video;
  return {render,video,effects,listeners,document};
}
function nodes(node){if(!node||typeof node!=='object')return[];return[node,...[node.props?.children].flat(Infinity).flatMap(nodes)]}
const button=(tree,label)=>nodes(tree).find(node=>node.type==='button'&&node.props['aria-label']===label);

test('story video: transparent preview controls start the same inline player with sound from the beginning',()=>{
  for(const label of ['Play story video with sound',null]){
    const f=fixture(),tree=f.render();const trigger=label?button(tree,label):nodes(tree).find(node=>node.type==='button'&&!node.props['aria-label']);
    trigger.props.onClick();assert.equal(f.video.currentTime,0);assert.equal(f.video.muted,false);assert.equal(f.video.loop,false);assert.equal(f.video.plays,1);
    const active=f.render();assert.equal(nodes(active).find(node=>node.type==='video').props.controls,undefined);assert.ok(button(active,'Close story playback'));assert.ok(!button(active,'Play story video with sound'));assert.ok(!nodes(active).some(node=>node.props.role==='dialog'));
  }
});

test('story video: tap pauses/resumes and close returns to the muted loop without opening a modal',()=>{
  const f=fixture();button(f.render(),'Play story video with sound').props.onClick();let tree=f.render();nodes(tree).find(node=>node.type==='video').props.onPlay();tree=f.render();
  button(tree,'Pause story video').props.onClick();assert.equal(f.video.paused,true);nodes(tree).find(node=>node.type==='video').props.onPause();
  tree=f.render();button(tree,'Resume story video').props.onClick();assert.equal(f.video.paused,false);
  button(f.render(),'Close story playback').props.onClick();tree=f.render();assert.equal(f.video.muted,true);assert.equal(f.video.loop,true);assert.equal(f.video.currentTime,0);assert.equal(nodes(tree).find(node=>node.type==='video').props.controls,undefined);assert.ok(button(tree,'Play story video with sound'));
});

test('story video: reduced motion suppresses the background preview while explicit playback stays available',()=>{
  const f=fixture(true);f.effects[1]();assert.equal(f.video.plays,0);assert.equal(f.video.paused,true);
  button(f.render(),'Play story video with sound').props.onClick();assert.equal(f.video.plays,1);
});

test('story video: one custom play/pause control retains seeking and mute without native controls',()=>{
  const f=fixture();button(f.render(),'Play story video with sound').props.onClick();
  let tree=f.render();let media=nodes(tree).find(node=>node.type==='video');
  media.props.onLoadedMetadata({currentTarget:{duration:120}});media.props.onPlay();
  tree=f.render();assert.equal(nodes(tree).find(node=>node.type==='video').props.controls,undefined);
  assert.equal(nodes(tree).filter(node=>node.type==='button'&&/^(Pause|Resume) story video$/.test(node.props['aria-label']||'')).length,1);
  const seek=nodes(tree).find(node=>node.props['aria-label']==='Seek story video');assert.equal(seek.props.max,120);
  seek.props.onChange({target:{value:'45'}});assert.equal(f.video.currentTime,45);
  button(f.render(),'Mute story video').props.onClick();assert.equal(f.video.muted,true);
  button(f.render(),'Unmute story video').props.onClick();assert.equal(f.video.muted,false);
});

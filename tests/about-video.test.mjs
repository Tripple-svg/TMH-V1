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
  vm.runInNewContext(code,{module,exports:module.exports,require:name=>name==='react'?react:name==='framer-motion'?{motion:{div:'div'},useInView:()=>true,useReducedMotion:()=>reduced}:require(name),navigator:{},sessionStorage:{getItem:()=>null,setItem(){},removeItem(){}},setTimeout:()=>1,clearTimeout(){},document,requestAnimationFrame:fn=>fn()});
  const render=()=>{s=0;r=0;return module.exports.default({videoSrc:'/Test%20About.mp4'})};
  render();const video={currentTime:90,duration:NaN,volume:1,muted:true,loop:true,paused:true,plays:0,pauses:0,play(){this.paused=false;this.plays++;return Promise.resolve()},pause(){this.paused=true;this.pauses++}};refs[1].current=video;
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
  const f=fixture(true);f.effects.forEach(fn=>fn());assert.equal(f.video.plays,0);assert.equal(f.video.paused,true);
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

test('story video resumes the audible position after returning to the looping preview and removes fullscreen',()=>{const f=fixture();button(f.render(),'Play story video with sound').props.onClick();f.video.currentTime=12;button(f.render(),'Close story playback').props.onClick();assert.equal(f.video.currentTime,0);button(f.render(),'Play story video with sound').props.onClick();assert.equal(f.video.currentTime,12);assert.equal(button(f.render(),'Show story video fullscreen'),undefined);});

const media = tree => nodes(tree).find(node=>node.type==='video');
const timeline = tree => nodes(tree).find(node=>node.props['aria-label']==='Seek story video');
const text = node => Array.isArray(node) ? node.map(text).join('') : node&&typeof node==='object' ? text(node.props?.children) : typeof node==='string' ? node : '';

test('story video timeline waits for a finite duration, updates seconds and seeks the actual inline media',()=>{
  const f=fixture();button(f.render(),'Play story video with sound').props.onClick();
  assert.equal(timeline(f.render()).props.disabled,true);
  assert.match(text(f.render()),/0:00 \/ --:--/);
  for(const invalid of [NaN,Infinity,-1]){
    f.video.duration=invalid;media(f.render()).props.onDurationChange({currentTarget:f.video});
    assert.equal(timeline(f.render()).props.disabled,true);
    assert.ok(!/NaN|Infinity/.test(text(f.render())));
  }
  f.video.duration=348.75;media(f.render()).props.onDurationChange({currentTarget:f.video});
  assert.equal(timeline(f.render()).props.max,348.75);
  assert.equal(timeline(f.render()).props.disabled,false);
  f.video.currentTime=67.2;media(f.render()).props.onTimeUpdate({currentTarget:f.video});
  assert.equal(timeline(f.render()).props.value,67.2);
  assert.match(text(f.render()),/1:07 \/ 5:48/);
  timeline(f.render()).props.onChange({target:{value:'122.4'}});
  assert.equal(f.video.currentTime,122.4);
  media(f.render()).props.onSeeking({currentTarget:f.video});
  media(f.render()).props.onSeeked({currentTarget:f.video});
  assert.equal(timeline(f.render()).props.value,122.4);
  assert.equal(timeline(f.render()).props['aria-valuetext'],'2:02 of 5:48');
  timeline(f.render()).props.onChange({target:{value:'999'}});
  assert.equal(f.video.currentTime,348.75);
});

test('story video restores a seek after metadata arrives and keeps preview progress separate from audible playback',()=>{
  const f=fixture();button(f.render(),'Play story video with sound').props.onClick();
  f.video.duration=180;media(f.render()).props.onLoadedMetadata({currentTarget:f.video});
  timeline(f.render()).props.onChange({target:{value:'35'}});
  button(f.render(),'Close story playback').props.onClick();
  f.video.currentTime=80;media(f.render()).props.onTimeUpdate({currentTarget:f.video});
  f.video.duration=NaN;
  let current=80,ready=false;
  Object.defineProperty(f.video,'currentTime',{get:()=>current,set:value=>{if(!ready)throw new Error('metadata not ready');current=value;}});
  assert.doesNotThrow(()=>button(f.render(),'Play story video with sound').props.onClick());
  assert.equal(timeline(f.render()).props.disabled,true);
  ready=true;f.video.duration=180;media(f.render()).props.onLoadedMetadata({currentTarget:f.video});
  assert.equal(f.video.currentTime,35);
  assert.equal(timeline(f.render()).props.value,35);
  assert.match(text(f.render()),/0:35 \/ 3:00/);
  button(f.render(),'Close story playback').props.onClick();
  assert.equal(f.video.currentTime,0);
  assert.equal(f.video.muted,true);assert.equal(f.video.loop,true);
  assert.ok(!nodes(f.render()).some(node=>node.props.role==='dialog'));
});

test('story video rejects non-finite playback positions and restarts a completed story',()=>{
  const f=fixture();button(f.render(),'Play story video with sound').props.onClick();
  f.video.duration=90;media(f.render()).props.onLoadedData({currentTarget:f.video});
  f.video.currentTime=Infinity;media(f.render()).props.onTimeUpdate({currentTarget:f.video});
  assert.equal(timeline(f.render()).props.value,0);
  f.video.currentTime=89.5;button(f.render(),'Close story playback').props.onClick();
  button(f.render(),'Play story video with sound').props.onClick();
  assert.equal(f.video.currentTime,0);
  media(f.render()).props.onEmptied();assert.equal(timeline(f.render()).props.disabled,true);
  media(f.render()).props.onProgress({currentTarget:f.video});assert.equal(timeline(f.render()).props.max,90);
});

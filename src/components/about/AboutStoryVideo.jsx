import { useCallback, useEffect, useRef, useState } from 'react';
import { useInView, useReducedMotion } from 'framer-motion';
import { Play, Pause, VolumeX, Volume2, X } from 'lucide-react';

const seconds = value => Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : 0;
const mediaDuration = video => seconds(video?.duration);
const elapsed = value => `${Math.floor(seconds(value)/60)}:${String(Math.floor(seconds(value)%60)).padStart(2,'0')}`;

export default function AboutStoryVideo({ videoSrc, poster }) {
  const shellRef = useRef(null);
  const videoRef = useRef(null);
  const playRef = useRef(null);
  const inView = useInView(shellRef, { amount: 0.15 });
  const reduceMotion = useReducedMotion();
  const resumeRef = useRef(0);
  const pendingSeekRef = useRef(null);
  const activeRef = useRef(false);
  const hideRef = useRef(null);
  const [controlsVisible,setControlsVisible] = useState(true);
  const progressKey = 'tmh_story_progress:' + videoSrc;
  useEffect(()=>{resumeRef.current=0;pendingSeekRef.current=null;try{resumeRef.current=seconds(sessionStorage.getItem(progressKey));}catch{/* Storage is optional. */}},[progressKey]);
  const saveProgress=()=>{const video=videoRef.current;if(!video||!activeRef.current)return;resumeRef.current=video.ended?0:seconds(video.currentTime);try{sessionStorage.setItem(progressKey,String(resumeRef.current));}catch{/* Optional storage. */}};
  const revealControls=()=>{clearTimeout(hideRef.current);setControlsVisible(true);if(playing)hideRef.current=setTimeout(()=>setControlsVisible(false),2000);};
  const [active, setActive] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [saveData, setSaveData] = useState(() => typeof navigator !== 'undefined' && navigator.connection?.saveData === true);
  const [playbackError, setPlaybackError] = useState(false);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  useEffect(()=>{if(active&&playing)hideRef.current=setTimeout(()=>setControlsVisible(false),2000);return()=>clearTimeout(hideRef.current);},[active,playing]);

  const syncTimeline = event => {
    const video = event.currentTarget;
    const total = mediaDuration(video);
    setDuration(total);
    // A click can arrive before metadata, especially with data-saving enabled.
    // Restore the audible position only once the real duration is available.
    if (activeRef.current && pendingSeekRef.current !== null && total > 0) {
      const target = pendingSeekRef.current >= total - 1 ? 0 : Math.min(pendingSeekRef.current, total);
      try { video.currentTime = target; pendingSeekRef.current = null; } catch { /* A later media event can retry. */ }
    }
    const current = seconds(video.currentTime);
    setPosition(total > 0 ? Math.min(current, total) : current);
  };
  const seekPlayback = event => {
    const video = videoRef.current;
    const total = mediaDuration(video) || duration;
    if (!video || !total) return;
    const target = Math.min(seconds(event.target.value), total);
    try {
      video.currentTime = target;
      pendingSeekRef.current = null;
      setPosition(target);
      saveProgress();
    } catch { /* Keep the current position until media becomes seekable. */ }
  };

  useEffect(() => {
    const connection = navigator.connection;
    const update = () => setSaveData(connection?.saveData === true);
    connection?.addEventListener?.('change', update);
    return () => connection?.removeEventListener?.('change', update);
  }, []);

  // Keep one inline media element. User-initiated play happens in the click
  // handler so Safari can unmute it within the original user gesture.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const sync = () => {
      if (document.visibilityState === 'hidden' || !inView) video.pause();
      else if (!active && !reduceMotion && !saveData) video.play()?.catch(() => {});
      else if (!active) video.pause();
    };
    sync();
    document.addEventListener('visibilitychange', sync);
    return () => document.removeEventListener('visibilitychange', sync);
  }, [active, inView, reduceMotion, saveData]);

  const closePlayback = useCallback(() => {
    const video = videoRef.current;
    if(video){resumeRef.current=video.ended?0:seconds(video.currentTime);try{sessionStorage.setItem('tmh_story_progress:'+videoSrc,String(resumeRef.current));}catch{/* Optional storage. */}}
    activeRef.current = false; pendingSeekRef.current = null;
    if (video) { video.muted = true; video.loop = true; try { video.currentTime = 0; } catch { /* Metadata may still be loading. */ } }
    setPosition(0); setActive(false); setMuted(true); setControlsVisible(true); setAutoplayBlocked(false); setPlaybackError(false);
    requestAnimationFrame(() => playRef.current?.focus({ preventScroll: true }));
  }, [videoSrc,setActive,setAutoplayBlocked,setPlaybackError]);

  useEffect(() => {
    if (!active) return;
    const key = event => { if (event.key === 'Escape') { event.preventDefault(); closePlayback(); } };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [active, closePlayback]);

  const startPlayback = () => {
    const video = videoRef.current;
    if (!video) return;
    const total = mediaDuration(video);
    const resume = total && resumeRef.current >= total - 1 ? 0 : seconds(resumeRef.current);
    pendingSeekRef.current = total ? null : resume;
    try { video.currentTime = resume; } catch { pendingSeekRef.current = resume; }
    video.muted = false; video.loop = false; activeRef.current = true;
    if(video.volume===0){video.volume=1;setVolume(1);}
    setDuration(total); setPosition(resume); setMuted(false); setControlsVisible(true);
    setPlaybackError(false); setAutoplayBlocked(false); setActive(true);
    video.play()?.catch(() => setAutoplayBlocked(true));
  };
  const togglePlayback = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) video.play()?.catch(() => setAutoplayBlocked(true));
    else video.pause();
  };

  return <div ref={shellRef} onPointerMove={revealControls} onPointerDown={revealControls} onFocusCapture={revealControls}
    className="relative w-full rounded-[26px] border border-white/30 bg-white/[0.08] p-[3px] shadow-2xl shadow-black/20 backdrop-blur-lg dark:border-white/20 dark:bg-white/[0.06] sm:rounded-[30px]">
    <div className="relative aspect-video overflow-hidden rounded-[22px] bg-zinc-950 ring-1 ring-inset ring-white/10 sm:rounded-[26px]">
      {videoSrc ? <video key={videoSrc} ref={videoRef} src={videoSrc} muted={!active || muted} loop={!active} playsInline
        autoPlay={!saveData && !reduceMotion} preload={saveData || reduceMotion ? 'none' : 'auto'} aria-label={active ? 'TMH story video player' : undefined} aria-hidden={!active}
        onPlay={() => { setPlaying(true); setAutoplayBlocked(false); }} onPause={() => {saveProgress();setPlaying(false);}} onEnded={() => {resumeRef.current=0;try{sessionStorage.removeItem(progressKey);}catch{/* Optional storage. */}setPlaying(false);}}
        onClick={active ? togglePlayback : undefined}
        onLoadedMetadata={syncTimeline} onDurationChange={syncTimeline} onLoadedData={syncTimeline} onProgress={syncTimeline}
        onTimeUpdate={syncTimeline} onSeeking={syncTimeline} onSeeked={event=>{syncTimeline(event);saveProgress();}}
        onEmptied={()=>{setDuration(0);setPosition(0);}}
        onVolumeChange={event=>{setMuted(event.currentTarget.muted);setVolume(seconds(event.currentTarget.volume));}}
        onError={() => setPlaybackError(true)} className="absolute inset-0 h-full w-full object-cover" />
        : poster && <img src={poster} alt="" className="absolute inset-0 h-full w-full object-cover" />}
      {!active && <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/5" />}
      {videoSrc && !active && <>
        <button ref={playRef} type="button" onClick={startPlayback}
          className="absolute left-1/2 top-1/2 inline-flex -translate-x-1/2 -translate-y-1/2 items-center gap-3 whitespace-nowrap rounded-full border border-white/35 bg-white/[0.04] px-5 py-3 text-sm font-medium text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18)] backdrop-blur-[2px] transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white">
          <Play className="h-5 w-5" fill="currentColor" aria-hidden="true" /> Play video
        </button>
        <button type="button" onClick={startPlayback} aria-label="Play story video with sound" title="Play story with sound"
          className="absolute right-3 top-3 rounded-full border border-white/25 bg-white/[0.04] p-2.5 text-white backdrop-blur-[2px] hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-white">
          <VolumeX className="h-4 w-4" aria-hidden="true" />
        </button>
      </>}
      {active && <>
        <div className={`${controlsVisible || !playing ? 'opacity-100' : 'pointer-events-none opacity-0'} transition-opacity focus-within:pointer-events-auto focus-within:opacity-100 absolute inset-x-2 bottom-2 flex flex-wrap items-center gap-2 rounded-xl border border-white/20 bg-black/25 p-2 text-white backdrop-blur-md sm:inset-x-3 sm:bottom-3`}>
          <button type="button" onClick={togglePlayback} aria-label={playing ? 'Pause story video' : 'Resume story video'} className="rounded-lg border border-white/20 bg-white/10 p-2 focus-visible:outline-2 focus-visible:outline-white">{playing?<Pause className="h-4 w-4" aria-hidden="true"/>:<Play className="h-4 w-4" fill="currentColor" aria-hidden="true"/>}</button>
          <input type="range" min="0" max={duration||0} step="0.1" value={Math.min(position,duration||0)} disabled={!duration} aria-label="Seek story video" aria-valuetext={duration?`${elapsed(position)} of ${elapsed(duration)}`:'Video duration is loading'} onChange={seekPlayback} className="min-w-12 flex-1 accent-white"/>
          <span className="whitespace-nowrap text-[10px] tabular-nums" aria-live="off">{elapsed(position)} / {duration?elapsed(duration):'—:—'}</span>
          <button type="button" aria-label={muted?'Unmute story video':'Mute story video'} onClick={()=>{if(videoRef.current){videoRef.current.muted=!muted;setMuted(!muted);}}} className="rounded-lg p-2 focus-visible:outline-2 focus-visible:outline-white">{muted?<VolumeX className="h-4 w-4"/>:<Volume2 className="h-4 w-4"/>}</button>
          <input type="range" min="0" max="1" step="0.05" value={volume} aria-label="Story video volume" onChange={event=>{const value=Number(event.target.value);if(videoRef.current){videoRef.current.volume=value;videoRef.current.muted=value===0;setVolume(value);setMuted(value===0);}}} className="hidden w-16 accent-white sm:block"/>
        </div>
        <button type="button" onClick={closePlayback} aria-label="Close story playback" title="Return to muted preview"
          className="absolute right-3 top-3 z-10 rounded-full border border-white/25 bg-black/20 p-2.5 text-white backdrop-blur-sm hover:bg-black/40 focus-visible:outline-2 focus-visible:outline-white"><X className="h-4 w-4" aria-hidden="true" /></button>
      </>}
      {!active && <div className="pointer-events-none absolute bottom-4 left-4 sm:bottom-5 sm:left-5">
        <h4 className="text-base font-bold tracking-tight text-white sm:text-lg">Who We Really Are</h4>
        <p className="mt-0.5 text-[11px] font-light text-zinc-300 sm:text-xs">The Marketing Haven</p>
      </div>}
      {playbackError && <p role="alert" className="absolute inset-x-3 bottom-12 rounded-lg bg-black/80 p-3 text-center text-xs text-zinc-200">The video could not load. Check your connection and try again.</p>}
      {autoplayBlocked && !playbackError && <p role="status" className="pointer-events-none absolute inset-x-3 bottom-12 rounded-lg bg-black/70 p-3 text-center text-xs text-white">Tap the player to start playback.</p>}
    </div>
  </div>;
}

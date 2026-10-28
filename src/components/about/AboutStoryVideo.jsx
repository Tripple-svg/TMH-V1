import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, useInView, useReducedMotion } from 'framer-motion';
import { Play, VolumeX, X } from 'lucide-react';

export default function AboutStoryVideo({ videoSrc, poster }) {
  const shellRef = useRef(null);
  const videoRef = useRef(null);
  const playRef = useRef(null);
  const inView = useInView(shellRef, { amount: 0.15 });
  const reduceMotion = useReducedMotion();
  const [active, setActive] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [saveData, setSaveData] = useState(() => typeof navigator !== 'undefined' && navigator.connection?.saveData === true);
  const [playbackError, setPlaybackError] = useState(false);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);

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
    if (video) { video.muted = true; video.loop = true; video.currentTime = 0; }
    setActive(false); setAutoplayBlocked(false); setPlaybackError(false);
    requestAnimationFrame(() => playRef.current?.focus({ preventScroll: true }));
  }, []);

  useEffect(() => {
    if (!active) return;
    const key = event => { if (event.key === 'Escape') { event.preventDefault(); closePlayback(); } };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [active, closePlayback]);

  const startPlayback = () => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = 0; video.muted = false; video.loop = false;
    setPlaybackError(false); setAutoplayBlocked(false); setActive(true);
    video.play()?.catch(() => setAutoplayBlocked(true));
  };
  const togglePlayback = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) video.play()?.catch(() => setAutoplayBlocked(true));
    else video.pause();
  };

  return <motion.div ref={shellRef}
    initial={{ opacity: 0, y: reduceMotion ? 0 : 20 }}
    whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
    transition={{ duration: reduceMotion ? 0 : 0.6 }}
    className="relative w-full rounded-[26px] border border-white/30 bg-white/[0.08] p-[3px] shadow-2xl shadow-black/20 backdrop-blur-lg dark:border-white/20 dark:bg-white/[0.06] sm:rounded-[30px]">
    <div className="relative aspect-video overflow-hidden rounded-[22px] bg-zinc-950 ring-1 ring-inset ring-white/10 sm:rounded-[26px]">
      {videoSrc ? <video ref={videoRef} src={videoSrc} poster={poster} muted={!active} loop={!active} playsInline controls={active}
        preload={saveData || reduceMotion ? 'none' : 'metadata'} aria-label={active ? 'TMH story video player' : undefined} aria-hidden={!active}
        onPlay={() => { setPlaying(true); setAutoplayBlocked(false); }} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)}
        onError={() => setPlaybackError(true)} className="absolute inset-0 h-full w-full object-cover" />
        : poster && <img src={poster} alt="" className="absolute inset-0 h-full w-full object-cover" />}
      {!active && <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/5" />}
      {videoSrc && !active && <>
        <button ref={playRef} type="button" onClick={startPlayback}
          className="absolute left-1/2 top-1/2 inline-flex -translate-x-1/2 -translate-y-1/2 items-center gap-3 whitespace-nowrap rounded-full border border-white/35 bg-white/[0.04] px-5 py-3 text-sm font-medium text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18)] backdrop-blur-[2px] transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white">
          <Play className="h-5 w-5" fill="currentColor" aria-hidden="true" /> Play video
        </button>
        <button type="button" onClick={startPlayback} aria-label="Play story video with sound" title="Play from the beginning with sound"
          className="absolute right-3 top-3 rounded-full border border-white/25 bg-white/[0.04] p-2.5 text-white backdrop-blur-[2px] hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-white">
          <VolumeX className="h-4 w-4" aria-hidden="true" />
        </button>
      </>}
      {active && <>
        <button type="button" onClick={togglePlayback} aria-label={playing ? 'Pause story video' : 'Resume story video'}
          className="absolute inset-x-0 bottom-12 top-0 flex items-center justify-center focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-white">
          {!playing && <span className="rounded-full border border-white/30 bg-black/20 p-3 text-white backdrop-blur-sm"><Play className="h-7 w-7" fill="currentColor" aria-hidden="true" /></span>}
        </button>
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
  </motion.div>;
}

import { useRef, useEffect, useState } from 'react';
import { motion,useReducedMotion } from 'framer-motion';

// Imports the video file placed in your src/assets folder
import logoVideo from '../assets/Logo_loading_animation.mp4';

export default function Preloader({ onComplete }) {
  const videoRef = useRef(null);
  const [hasError, setHasError] = useState(false);
  const reduceMotion=useReducedMotion();
  const skipAnimation=reduceMotion||(typeof navigator!=='undefined'&&(navigator.connection?.saveData||/^(slow-)?2g$/.test(navigator.connection?.effectiveType||'')));
  const complete=useRef(onComplete);
  useEffect(()=>{complete.current=onComplete;},[onComplete]);

  useEffect(() => {
    if(skipAnimation){complete.current?.();return;}
    // A decorative intro must never hold the website behind a slow video.
    const timeout=setTimeout(()=>complete.current?.(),1800);
    if (videoRef.current) {
      // 2.25x speed turns the 9-second animation into ~4 seconds
      videoRef.current.playbackRate = 2.25;

      const playPromise = videoRef.current.play();
      if (playPromise !== undefined) {
        playPromise.catch(() => {
          console.warn("Brand intro could not play.");
          setHasError(true);
          complete.current?.();
        });
      }
    }
    return()=>clearTimeout(timeout);
  }, [skipAnimation]);

  return (
    <motion.div
      initial={{ opacity: 1 }}
      exit={{ opacity: 0, scale: reduceMotion?1:1.01 }}
      transition={{ duration: reduceMotion?0:0.2, ease: 'easeOut' }}
      className="preloader-container"
    >
      <style>{`
        .preloader-container {
          position: fixed;
          inset: 0;
          z-index: 9999;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          background-color: #000000;
          color: #ffffff;
          overflow: hidden;
        }

        .preloader-video {
          width: 90vw;
          max-width: 640px;
          height: auto;
          aspect-ratio: 16 / 9;
          object-fit: contain;
        }
      `}</style>

      {!hasError && !skipAnimation ? (
        <video
          ref={videoRef}
          src={logoVideo}
          autoPlay
          muted
          playsInline
          preload="auto"
          onEnded={onComplete}
          onError={() => {
            setHasError(true);
            if (onComplete) onComplete();
          }}
          className="preloader-video"
        />
      ) : (
        <div className="text-center">
          <h1 className="text-3xl font-extrabold uppercase tracking-widest text-white">
            TMH
          </h1>
          <p className="mt-2 text-sm uppercase tracking-[0.3em] text-gray-400">
            The Marketing Haven
          </p>
        </div>
      )}
    </motion.div>
  );
}

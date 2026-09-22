import React, { useRef, useEffect, useState } from 'react';
import { motion } from 'framer-motion';

// Imports the video file placed in your src/assets folder
import logoVideo from '../assets/Logo_loading_animation.mp4';

export default function Preloader({ onComplete }) {
  const videoRef = useRef(null);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    if (videoRef.current) {
      // 2.25x speed turns the 9-second animation into ~4 seconds
      videoRef.current.playbackRate = 2.25;

      const playPromise = videoRef.current.play();
      if (playPromise !== undefined) {
        playPromise.catch((err) => {
          console.warn("Autoplay blocked or playback error:", err);
          setHasError(true);
          if (onComplete) onComplete();
        });
      }
    }
  }, [onComplete]);

  return (
    <motion.div
      initial={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.05 }}
      transition={{ duration: 0.8, ease: [0.76, 0, 0.24, 1] }}
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

      {!hasError ? (
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
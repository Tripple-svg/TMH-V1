// src/components/about/AboutStoryVideo.jsx
// Landscape story video bubble for the About section.

import React, { useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Play } from 'lucide-react';

export default function AboutStoryVideo({ videoSrc, poster }) {
  const videoRef = useRef(null);
  const [playing, setPlaying] = useState(false);

  const toggle = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) v.play();
    else v.pause();
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.6 }}
      className="relative w-full aspect-video rounded-2xl sm:rounded-3xl overflow-hidden border border-zinc-200 dark:border-zinc-800 shadow-2xl shadow-black/40 bg-zinc-950"
    >
      {videoSrc ? (
        <video
          ref={videoRef}
          src={videoSrc}
          poster={poster}
          playsInline
          preload="metadata"
          onClick={toggle}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          className="absolute inset-0 w-full h-full object-cover cursor-pointer"
        />
      ) : (
        <>
          {poster && (
            <div
              className="absolute inset-0 bg-contain bg-center bg-no-repeat opacity-20"
              style={{ backgroundImage: `url(${poster})` }}
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-br from-zinc-950 via-black to-zinc-950" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
        </>
      )}

      {/* Play overlay */}
      {!playing && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-blue-600 flex items-center justify-center shadow-2xl shadow-blue-600/40">
            <Play className="w-7 h-7 sm:w-8 sm:h-8 text-white ml-1" fill="currentColor" />
          </div>
        </div>
      )}

      {/* Bottom label — matches testimonial pattern */}
      <div className="absolute bottom-4 left-4 sm:bottom-5 sm:left-5 z-10 pointer-events-none">
        <h4 className="text-white font-bold text-base sm:text-lg tracking-tight">
          Who We Really Are :
        </h4>
        <p className="text-zinc-400 text-[11px] sm:text-xs mt-0.5 font-light">
          The Marketing Haven
        </p>
      </div>
    </motion.div>
  );
}
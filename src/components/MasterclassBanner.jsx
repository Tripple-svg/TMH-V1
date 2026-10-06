import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, X } from 'lucide-react';

const YOUTUBE_VIDEO_ID = 'REPLACE_WITH_VIDEO_ID';

export default function MasterclassBanner() {
  const [isPlaying, setIsPlaying] = useState(false);

  const handlePlay = () => setIsPlaying(true);
  const handleClose = (e) => {
    e?.stopPropagation();
    setIsPlaying(false);
  };

  return (
    <section
      id="free-class"
      className="relative w-full py-16 sm:py-24 px-4 sm:px-6 lg:px-8 bg-[#09090b]"
    >
      <div className="absolute top-0 left-0 right-0 h-24 bg-gradient-to-b from-[#09090b] to-transparent pointer-events-none" />

      <div className="max-w-5xl mx-auto relative z-10">

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center max-w-3xl mx-auto mb-10 sm:mb-12"
        >
          {/* Plain bold label — no pill, no glass, no dashes */}
          <h3 className="text-sm sm:text-base font-bold uppercase tracking-[0.2em] text-white mb-5">
            The Marketing Room 
          </h3>

          <h2 className="text-4xl sm:text-5xl md:text-6xl font-bold text-white tracking-tight leading-tight mb-5">
            The Difference Between Running a Business and Building a Brand.
          </h2>

          <p className="text-zinc-400 text-sm sm:text-base font-light leading-relaxed max-w-xl mx-auto">
            Learn the difference between having a business and building a brand. One class, broken down simply.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.15 }}
          className="max-w-4xl mx-auto"
        >
          <div
            className={`relative w-full aspect-video rounded-2xl sm:rounded-3xl overflow-hidden border border-white/10 bg-[#121215] shadow-2xl ${
              !isPlaying ? 'cursor-pointer group' : ''
            }`}
            onClick={!isPlaying ? handlePlay : undefined}
          >
            <AnimatePresence>
              {!isPlaying && (
                <motion.div
                  initial={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3 }}
                  className="absolute inset-0 z-0"
                >
                  <img
                    src="https://images.unsplash.com/photo-1552664730-d307ca884978?q=80&w=2670&auto=format&fit=crop"
                    alt=""
                    className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-700 opacity-40"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#09090b]/80 via-[#09090b]/40 to-[#09090b]/30" />
                </motion.div>
              )}
            </AnimatePresence>

            {isPlaying && (
              <div className="absolute inset-0 z-0 bg-black">
                <iframe
                  src={`https://www.youtube.com/embed/${YOUTUBE_VIDEO_ID}?autoplay=1&rel=0&modestbranding=1`}
                  title="Free Class — The Marketing Haven"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  className="absolute inset-0 w-full h-full"
                />
              </div>
            )}

            <AnimatePresence>
              {!isPlaying && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ duration: 0.4, delay: 0.2 }}
                  className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none"
                >
                  <div className="w-16 h-16 sm:w-20 sm:h-20 md:w-24 md:h-24 rounded-full bg-blue-600 flex items-center justify-center shadow-2xl shadow-blue-600/40 transition-transform group-hover:scale-105">
                    <Play
                      className="w-7 h-7 sm:w-8 sm:h-8 md:w-9 md:h-9 text-white ml-1"
                      fill="currentColor"
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {isPlaying && (
              <button
                type="button"
                onClick={handleClose}
                aria-label="Close video"
                className="absolute top-4 right-4 z-20 w-10 h-10 rounded-full bg-black/70 backdrop-blur-md border border-white/15 text-zinc-300 hover:text-white hover:border-white/30 flex items-center justify-center transition-all"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </motion.div>

      </div>
    </section>
  );
}
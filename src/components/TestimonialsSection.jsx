// src/components/TestimonialsSection.jsx
import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Star, Quote, Play, Pause, X } from 'lucide-react';

export default function TestimonialsSection() {
  const [isVideoOpen, setIsVideoOpen] = useState(false);
  const [isPlaying, setIsPlaying] = useState(true);
  const [progress, setProgress] = useState(0);
  const videoRef = useRef(null);

  // Sync video time with localStorage
  useEffect(() => {
    if (isVideoOpen && videoRef.current) {
      const savedTime = localStorage.getItem('tmh_testimonial_time');
      if (savedTime) {
        videoRef.current.currentTime = parseFloat(savedTime);
      }
    }
  }, [isVideoOpen]);

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      const current = videoRef.current.currentTime;
      const total = videoRef.current.duration;
      if (total > 0) {
        setProgress((current / total) * 100);
      }
      localStorage.setItem('tmh_testimonial_time', current.toString());
    }
  };

  const togglePlayPause = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const handleVideoEnded = () => {
    if (videoRef.current) {
      videoRef.current.currentTime = 0;
      videoRef.current.play();
      setIsPlaying(true);
    }
  };

  return (
    <section 
      id="testimonials" 
      className="relative w-full py-20 sm:py-28 px-4 sm:px-6 lg:px-8 bg-white text-zinc-900 dark:bg-zinc-950 dark:text-white transition-colors duration-300"
    >
      <div className="max-w-5xl mx-auto relative z-10">
        
        {/* Header */}
        <div className="text-center max-w-2xl mx-auto mb-14">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <span className="text-xs font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-widest bg-blue-100 dark:bg-blue-600/10 border border-blue-200 dark:border-blue-500/20 px-3 py-1 rounded-full">
              Real Feedback
            </span>
            <h2 className="text-3xl sm:text-4xl font-bold mt-4 tracking-tight text-zinc-900 dark:text-white">
              What People Are Saying
            </h2>
            <p className="text-zinc-600 dark:text-zinc-400 text-sm sm:text-base mt-2 font-light">
              Direct feedback from business owners and founders we've worked with.
            </p>
          </motion.div>
        </div>

        {/* Top Featured Video Preview Card */}
        <motion.div 
          initial={{ opacity: 0, y: 25 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="mb-10"
        >
          <div 
            onClick={() => {
              setIsVideoOpen(true);
              setIsPlaying(true);
            }}
            className="group relative w-full h-80 sm:h-[420px] rounded-2xl sm:rounded-3xl overflow-hidden cursor-pointer border border-zinc-200 dark:border-white/10 bg-gradient-to-br from-zinc-900 via-zinc-950 to-black shadow-xl hover:border-blue-500/50 transition-all duration-300 flex items-center justify-center"
          >
            <div className="absolute inset-0 bg-black/40 group-hover:bg-black/20 transition-colors duration-300 z-10" />

            <div className="relative z-20 flex flex-col items-center gap-3">
              <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-blue-600 text-white flex items-center justify-center shadow-lg shadow-blue-600/40 group-hover:scale-110 transition-transform duration-300">
                <Play className="w-7 h-7 sm:w-8 sm:h-8 fill-white ml-1" />
              </div>
              <span className="text-xs sm:text-sm font-semibold tracking-wider text-white uppercase bg-black/60 backdrop-blur-md px-4 py-1.5 rounded-full border border-white/20">
                Watch Full Video Review
              </span>
            </div>

            <div className="absolute bottom-6 left-6 z-20 text-left">
              <h3 className="text-lg sm:text-2xl font-bold text-white tracking-wide uppercase font-mono">
                Damilola's Personal Experience
              </h3>
              <p className="text-xs sm:text-sm text-zinc-300 font-light">
                With The Marketing Haven
              </p>
            </div>
          </div>
        </motion.div>

        {/* Secondary Authentic Text Testimonial */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.15 }}
          className="relative p-6 sm:p-8 rounded-2xl bg-zinc-50 dark:bg-white/[0.03] border border-zinc-200 dark:border-white/10 flex flex-col justify-between group hover:border-blue-500/40 transition-all duration-300"
        >
          <div>
            <div className="flex items-center gap-1 mb-4 text-amber-400">
              {[...Array(5)].map((_, i) => (
                <Star key={i} className="w-4 h-4 fill-amber-400 text-amber-400" />
              ))}
            </div>

            <Quote className="w-8 h-8 text-blue-500/40 mb-2 group-hover:text-blue-500/60 transition-colors" />

            {/* High Contrast Typography for Light/Dark Mode */}
            <p className="text-zinc-800 dark:text-zinc-200 text-sm sm:text-base leading-relaxed font-medium mb-6">
              "Hi! I’m honored to have a copy of this book. I’ve been able to trace the things that are hindering me from seeing the results that I need in my business especially the 'marketing by accident' part I do this alottt! Thank you so much."
            </p>
          </div>

          <div className="pt-4 border-t border-zinc-200 dark:border-white/5 flex items-center justify-between">
            <div>
              <h4 className="text-sm font-bold text-zinc-900 dark:text-white">Early Reviewee</h4>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">Business Owner & Playbook Reader</p>
            </div>
          </div>
        </motion.div>

      </div>

      {/* Clean Custom Vertical Video Modal */}
      <AnimatePresence>
        {isVideoOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[80] flex items-center justify-center p-4 sm:p-6 bg-black/85 backdrop-blur-md"
          >
            <div 
              className="fixed inset-0" 
              onClick={() => setIsVideoOpen(false)} 
            />

            <motion.div
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              className="relative w-full max-w-sm sm:max-w-md h-[80vh] max-h-[700px] rounded-3xl bg-black border border-white/20 shadow-2xl overflow-hidden z-10 flex flex-col"
            >
              {/* Close Button */}
              <button
                onClick={() => setIsVideoOpen(false)}
                className="absolute top-4 right-4 z-30 w-9 h-9 rounded-full bg-black/60 backdrop-blur-md border border-white/20 text-white flex items-center justify-center hover:bg-black transition-colors"
              >
                <X className="w-5 h-5" />
              </button>

              {/* Tap to Play/Pause Video Frame */}
              <div 
                onClick={togglePlayPause}
                className="relative w-full h-full bg-black cursor-pointer flex items-center justify-center select-none"
              >
                <video
                  ref={videoRef}
                  src="/Testimonial.mp4"
                  autoPlay
                  playsInline
                  onTimeUpdate={handleTimeUpdate}
                  onEnded={handleVideoEnded}
                  className="w-full h-full object-cover"
                />

                {/* Play/Pause Pulse Indicator */}
                {!isPlaying && (
                  <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                    <div className="w-16 h-16 rounded-full bg-black/60 backdrop-blur-md border border-white/20 flex items-center justify-center text-white">
                      <Pause className="w-8 h-8 fill-white" />
                    </div>
                  </div>
                )}

                {/* Minimalist Progress Line */}
                <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-white/20 z-20">
                  <div 
                    className="h-full bg-blue-500 transition-all duration-150 ease-linear"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
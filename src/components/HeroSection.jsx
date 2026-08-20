// src/components/sections/HeroSection.jsx
import React from 'react';
import { motion } from 'framer-motion';

export default function HeroSection({ onOpenReview, onOpenHaven }) {
  return (
    <section className="relative w-full min-h-[85vh] flex flex-col justify-center pt-28 pb-12 sm:pt-36 sm:pb-20 px-4 sm:px-6 lg:px-8 overflow-hidden bg-zinc-950">
      {/* Background Video Layer */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute inset-0 bg-gradient-to-b from-zinc-950/80 via-zinc-950/60 to-zinc-950 z-10" />

        <video
          autoPlay
          loop
          muted
          playsInline
          preload="auto"
          className="w-full h-full object-cover opacity-45 scale-105"
        >
          <source src="/HeroSection.mp4" type="video/mp4" />
        </video>
      </div>

      {/* Hero Content Glass Card */}
      <div className="relative z-20 max-w-3xl w-full mx-auto my-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="backdrop-blur-2xl bg-zinc-900/70 dark:bg-zinc-900/60 border border-zinc-200/20 dark:border-zinc-800/60 rounded-3xl py-12 px-6 sm:py-16 sm:px-12 text-center shadow-2xl flex flex-col justify-between min-h-[500px] sm:min-h-0"
        >
          <div className="flex flex-col justify-center my-auto">
            <motion.h1
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="text-3xl sm:text-5xl md:text-6xl font-black tracking-tight text-white uppercase leading-snug sm:leading-tight"
            >
              HERE TO TRANSFORM YOUR BRAND.
            </motion.h1>

            <motion.h2
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="bg-gradient-to-r from-blue-500 to-emerald-400 bg-clip-text text-transparent font-semibold text-xl sm:text-2xl mt-4 sm:mt-5"
            >
              Everything starts from you.
            </motion.h2>

            <motion.p
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.3 }}
              className="text-zinc-300 text-sm sm:text-base max-w-lg mx-auto mt-5 sm:mt-6 leading-relaxed"
            >
              Get to know where your brand really stands in today's market by requesting a free brand review.
            </motion.p>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.4 }}
            className="flex flex-col sm:flex-row items-center justify-center gap-4 mt-8 sm:mt-12"
          >
            <button
              onClick={onOpenReview}
              className="w-full sm:w-auto bg-blue-600 hover:bg-blue-500 text-white font-bold py-4 px-8 rounded-xl shadow-lg shadow-blue-600/30 transition-all hover:scale-[1.02] active:scale-[0.98] text-sm sm:text-base"
            >
              Request a Free Brand Review →
            </button>

            <button
              onClick={onOpenHaven}
              className="w-full sm:w-auto bg-zinc-800/80 hover:bg-zinc-700/80 text-zinc-100 border border-zinc-700/50 font-bold py-4 px-8 rounded-xl transition-all hover:scale-[1.02] active:scale-[0.98] text-sm sm:text-base"
            >
              Talk to Our Team
            </button>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
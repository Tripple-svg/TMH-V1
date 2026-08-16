// src/components/HeroSection.jsx
import React from 'react';
import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';

export default function HeroSection({ onOpenReview }) {
  return (
    <section className="relative w-full min-h-screen overflow-hidden flex items-center justify-center pt-20 bg-[#09090b]">
      {/* Background Media & Overlay */}
      <div className="absolute inset-0 z-0">
        <video 
          autoPlay 
          loop 
          muted 
          playsInline 
          className="w-full h-full object-cover opacity-40"
          poster="https://images.unsplash.com/photo-1557804506-669a67965ba0?q=80&w=2574&auto=format&fit=crop"
        >
          <source 
            src="https://assets.mixkit.co/videos/preview/mixkit-digital-animation-of-a-city-at-night-12654-large.mp4" 
            type="video/mp4" 
          />
        </video>
        <div className="absolute inset-0 bg-gradient-to-b from-[#09090b]/80 via-[#09090b]/60 to-[#09090b]" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#09090b]/40 via-transparent to-[#09090b]/40" />
      </div>

      {/* Hero Glass Card Container */}
      <motion.div 
        className="relative z-10 mx-4 sm:mx-6 md:mx-8 w-full max-w-4xl"
        initial={{ opacity: 0, scale: 0.95, y: 30 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="group relative rounded-2xl sm:rounded-3xl bg-white/5 backdrop-blur-md border border-white/10 p-8 sm:p-12 md:p-16 text-center transition-all duration-500 ease-out hover:border-blue-600/40 hover:shadow-[0_0_60px_-12px_rgba(37,99,235,0.25)]">
          <div className="absolute inset-0 rounded-2xl sm:rounded-3xl border border-white/5 pointer-events-none" />
          <div 
            className="absolute -inset-[1px] rounded-2xl sm:rounded-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" 
            style={{ background: 'radial-gradient(600px circle at 50% 50%, rgba(37,99,235,0.12), transparent 40%)' }} 
          />
          
          <div className="relative z-10 flex flex-col items-center gap-5 sm:gap-6">
            <motion.div
              className="font-bold text-white leading-[0.85] tracking-tighter text-center"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.4 }}
            >
              <span className="block text-6xl sm:text-7xl md:text-8xl lg:text-9xl">THE</span>
              <span className="block text-5xl sm:text-6xl md:text-7xl lg:text-8xl mt-1 sm:mt-2">MARKETING</span>
              <span className="block text-6xl sm:text-7xl md:text-8xl lg:text-9xl mt-1 sm:mt-2">HAVEN</span>
            </motion.div>

            <motion.h2 
              className="text-lg sm:text-xl md:text-2xl text-gray-200 font-medium tracking-wide text-center"
              initial={{ opacity: 0, y: 20 }} 
              animate={{ opacity: 1, y: 0 }} 
              transition={{ duration: 0.6, delay: 0.55 }}
            >
              Here to transform your brand.
            </motion.h2>

            <motion.h3 
              className="text-sm sm:text-base md:text-lg text-gray-400 font-light tracking-widest uppercase text-center"
              initial={{ opacity: 0, y: 20 }} 
              animate={{ opacity: 1, y: 0 }} 
              transition={{ duration: 0.6, delay: 0.7 }}
            >
              Everything starts from you.
            </motion.h3>

            <motion.div 
              className="w-16 h-[1px] bg-gradient-to-r from-transparent via-blue-500/60 to-transparent my-2" 
              initial={{ scaleX: 0 }} 
              animate={{ scaleX: 1 }} 
              transition={{ duration: 0.8, delay: 0.85 }} 
            />
            
            <motion.button 
              onClick={onOpenReview} 
              className="relative mt-2 px-8 py-3.5 sm:px-10 sm:py-4 rounded-full text-white font-semibold text-sm sm:text-base tracking-wide uppercase border border-blue-500/50 overflow-hidden transition-all duration-300 hover:bg-blue-500 hover:scale-105 hover:shadow-[0_0_30px_rgba(37,99,235,0.4)] active:scale-95 bg-blue-600" 
              initial={{ opacity: 0, y: 20 }} 
              animate={{ opacity: 1, y: 0 }} 
              transition={{ duration: 0.6, delay: 1.0 }} 
              whileTap={{ scale: 0.97 }}
            >
              <span className="absolute inset-0 rounded-full border border-blue-400/30 animate-pulse" />
              <span className="relative z-10 flex items-center gap-2 whitespace-nowrap">
                Request a Free Brand Review
                <ArrowRight className="w-4 h-4 sm:w-5 sm:h-5 transition-transform duration-300 group-hover:translate-x-1" />
              </span>
            </motion.button>
          </div>
        </div>
      </motion.div>

      {/* Bottom transition gradient into the next section */}
      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-[#09090b] to-transparent z-10 pointer-events-none" />
    </section>
  );
}
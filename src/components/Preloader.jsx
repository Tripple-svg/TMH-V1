import React from 'react';
import { motion } from 'framer-motion';

export default function Preloader({ onComplete }) {
  return (
    <motion.div
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5, ease: 'easeInOut' }}
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-[#0a0f1d] text-white px-4"
    >
      <div className="flex flex-col items-center gap-6 max-w-md text-center">
        {/* Animated Brand Logo / Badge */}
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.5 }}
          className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center shadow-lg shadow-blue-500/30 border border-white/20"
        >
          <span className="font-extrabold text-2xl tracking-tighter">TMH</span>
        </motion.div>

        {/* Text Fade In */}
        <motion.div
          initial={{ y: 10, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.5 }}
        >
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white mb-1">
            THE MARKETING HAVEN
          </h1>
          <p className="text-xs sm:text-sm text-gray-400 font-medium tracking-wide uppercase">
            Architecting Digital Growth
          </p>
        </motion.div>

        {/* Progress Bar - Triggers onComplete when finished */}
        <div className="w-48 h-1 bg-white/10 rounded-full overflow-hidden mt-2">
          <motion.div
            className="h-full bg-blue-500 rounded-full"
            initial={{ width: "0%" }}
            animate={{ width: "100%" }}
            transition={{ duration: 1.8, ease: "easeInOut" }}
            onAnimationComplete={onComplete}
          />
        </div>
      </div>
    </motion.div>
  );
}
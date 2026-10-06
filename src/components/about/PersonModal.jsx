// src/components/about/PersonModal.jsx
// Centered modal showing one team member's photo, role, and bio.

import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';

export default function PersonModal({ person, onClose }) {
  // Lock body scroll while open
  useEffect(() => {
    if (!person) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [person]);

  // Escape to close
  useEffect(() => {
    if (!person) return;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [person, onClose]);

  return (
    <AnimatePresence>
      {person && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-md"
          />

          {/* Modal wrapper */}
          <div className="fixed inset-0 z-[101] flex items-center justify-center p-4 pointer-events-none">
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.96 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
              className="pointer-events-auto relative w-full max-w-md max-h-[90vh] overflow-y-auto rounded-3xl border border-zinc-200/80 dark:border-zinc-800/80 bg-white/95 dark:bg-zinc-950/90 backdrop-blur-2xl shadow-2xl"
            >
              {/* Close */}
              <button
                onClick={onClose}
                aria-label="Close"
                className="absolute top-4 right-4 z-10 w-9 h-9 rounded-full bg-zinc-900/80 backdrop-blur-md border border-white/10 text-zinc-300 hover:text-white hover:border-white/30 flex items-center justify-center transition-all active:scale-90"
              >
                <X className="w-4 h-4" />
              </button>

              {/* Round photo */}
              <div className="flex justify-center pt-10 pb-6">
                <div className="w-28 h-28 sm:w-32 sm:h-32 rounded-full overflow-hidden border-2 border-zinc-200 dark:border-zinc-800 bg-zinc-900 flex items-center justify-center">
                  {person.image ? (
                    <img
                      src={person.image}
                      alt={person.name}
                      className="w-full h-full object-cover object-top"
                    />
                  ) : (
                    <span className="text-zinc-500 text-3xl font-black tracking-tighter leading-none select-none">
                      {person.initials}
                    </span>
                  )}
                </div>
              </div>

              {/* Info */}
              <div className="px-6 sm:px-8 pb-8 text-center">
                <span className="text-[10px] font-mono uppercase tracking-[0.3em] text-blue-500 dark:text-blue-400">
                  {person.tag}
                </span>
                <h3 className="mt-3 text-xl sm:text-2xl font-bold tracking-tight text-zinc-900 dark:text-white">
                  {person.name}
                </h3>
                <p className="mt-1.5 text-sm text-zinc-500 dark:text-zinc-400">
                  {person.role}
                </p>
                {person.bio && (
                  <p className="mt-5 text-sm sm:text-[15px] leading-relaxed text-zinc-600 dark:text-zinc-300 font-light">
                    {person.bio}
                  </p>
                )}
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
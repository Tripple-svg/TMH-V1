// src/components/about/PersonModal.jsx
// Centered modal showing one team member's photo, role, and bio.

import React, { useEffect, useRef } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import ProgressiveImage from '../ui/ProgressiveImage';
import { X } from 'lucide-react';

export default function PersonModal({ person, onClose }) {
  const reduceMotion = useReducedMotion();
  const modalRef = useRef(null);
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
    const previousFocus = document.activeElement;
    const modal = modalRef.current;
    modal?.focus({ preventScroll: true });
    const onKey = (e) => {
      if (e.key === 'Tab' && modal) {
        const controls = [...modal.querySelectorAll('button,a[href]')];
        const first = controls[0], last = controls.at(-1);
        if (e.shiftKey && (document.activeElement === first || document.activeElement === modal)) { e.preventDefault(); last?.focus(); }
        else if (!e.shiftKey && (document.activeElement === last || document.activeElement === modal)) { e.preventDefault(); first?.focus(); }
      }
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); previousFocus?.focus({ preventScroll: true }); };
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
              ref={modalRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label={person.name}
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

              <div className="flex justify-center pt-10 pb-6" style={{ perspective: '800px' }}>
                <motion.div key={person.name} initial={{ rotateY: 0 }}
                  animate={{ rotateY: reduceMotion ? 0 : [0, 180, 360] }}
                  transition={{ duration: reduceMotion ? 0 : 1.5, delay: 0.15, ease: 'easeInOut' }}
                  className="relative h-28 w-28 sm:h-32 sm:w-32" style={{ transformStyle: 'preserve-3d' }}>
                  {[false, true].map((back) => <div key={String(back)} aria-hidden={back || undefined}
                    className="absolute inset-0 flex items-center justify-center overflow-hidden rounded-full border-2 border-zinc-700 dark:border-zinc-300 bg-zinc-900"
                    style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden', transform: back ? 'rotateY(180deg)' : 'rotateY(0deg)' }}>
                    {person.image ? <ProgressiveImage src={person.image} alt={back ? '' : person.name} loading="eager" fallback={person.initials} className="relative h-full w-full" imageClassName="object-top" />
                      : <span className="text-3xl font-black text-zinc-300">{person.initials}</span>}
                  </div>)}
                </motion.div>
              </div>

              {/* Info */}
              <div className="px-6 sm:px-8 pb-8 text-center">
                <span className="text-[10px] font-mono uppercase tracking-[0.3em] text-zinc-600 dark:text-zinc-400">
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
// src/components/about/TeamSlideshow.jsx
// Background slideshow + inline viewer for the About section story card.

import React, { useEffect, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';

const AUTOPLAY_MS = 5000;

/**
 * TeamSlideshow — renders inside the story card.
 *
 * Two states managed internally:
 *   - 'slideshow' : autoplaying background photos + "The Marketing Haven" branding
 *   - 'viewer'    : one person at a time with prev/next controls
 *
 * Controlled via props:
 *   team                : array of { name, role, tag, image, initials }
 *   viewerIndex         : number | null (null = slideshow state)
 *   onOpenViewer        : (i) => void
 *   onCloseViewer       : () => void
 *   onNavigate          : (i) => void
 */
export default function TeamSlideshow({
  team,
  viewerIndex,
  onOpenViewer,
  onCloseViewer,
  onNavigate,
}) {
  // Only members WITH a photo go into the background slideshow.
  // If none have photos yet, we show a plain gradient.
  const photosForSlideshow = useMemo(
    () => team.map((p, i) => ({ ...p, _index: i })).filter(p => Boolean(p.image)),
    [team]
  );

  const [slideIdx, setSlideIdx] = useState(0);

  // Autoplay the background rotation
  useEffect(() => {
    if (viewerIndex !== null) return;
    if (photosForSlideshow.length <= 1) return;
    const t = setInterval(() => {
      setSlideIdx(prev => (prev + 1) % photosForSlideshow.length);
    }, AUTOPLAY_MS);
    return () => clearInterval(t);
  }, [viewerIndex, photosForSlideshow.length]);

  const isViewer = viewerIndex !== null && viewerIndex !== undefined;
  const currentPerson = isViewer ? team[viewerIndex] : null;

  const handlePrev = (e) => {
    e?.stopPropagation();
    if (viewerIndex === null) return;
    const next = (viewerIndex - 1 + team.length) % team.length;
    onNavigate?.(next);
  };

  const handleNext = (e) => {
    e?.stopPropagation();
    if (viewerIndex === null) return;
    const next = (viewerIndex + 1) % team.length;
    onNavigate?.(next);
  };

  // ────────────────────────────────────────────────────────────
  // Slideshow view
  // ────────────────────────────────────────────────────────────
  const renderSlideshow = () => (
    <motion.div
      key="slideshow"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
      className="absolute inset-0 cursor-pointer"
      onClick={() => onOpenViewer?.(0)}
    >
      {/* Background photo layer */}
      {photosForSlideshow.length > 0 ? (
        <div className="absolute inset-0 overflow-hidden">
          <AnimatePresence mode="sync">
            <motion.img
              key={photosForSlideshow[slideIdx]?._index}
              src={photosForSlideshow[slideIdx]?.image}
              alt={photosForSlideshow[slideIdx]?.name}
              initial={{ opacity: 0, scale: 1.06 }}
              animate={{ opacity: 0.32, scale: 1.0 }}
              exit={{ opacity: 0, scale: 1.02 }}
              transition={{ duration: 1.2, ease: 'easeOut' }}
              className="absolute inset-0 w-full h-full object-cover object-top"
              style={{ imageRendering: '-webkit-optimize-contrast' }}
            />
          </AnimatePresence>
        </div>
      ) : (
        // No photos yet — clean dark gradient
        <div className="absolute inset-0 bg-gradient-to-br from-zinc-900 via-black to-zinc-900" />
      )}

      {/* Vignette — ensures text is always readable */}
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/70 to-black/40" />

            {/* Branding content — anchored to bottom third */}
      <div className="relative z-10 h-full w-full flex flex-col items-center justify-end text-center px-6 pb-8 sm:pb-10">
        <h3 className="text-white font-bold text-2xl sm:text-3xl tracking-tight">
          The Marketing Haven
        </h3>
        <p className="text-blue-400 text-[10px] sm:text-xs font-mono uppercase tracking-[0.3em] mt-2">
          Digital Marketing &amp; Brand Strategy Agency
        </p>

        {/* Meet-the-team — glass pill for presence */}
        <div className="mt-6 inline-flex items-center gap-2 px-4 py-2 rounded-full border border-white/15 bg-black/40 backdrop-blur-md text-zinc-200 hover:text-white hover:border-blue-400/50 hover:bg-blue-500/10 transition-all text-xs font-medium">
          <span>Meet the team</span>
          <ChevronRight className="w-3.5 h-3.5" />
        </div>
      </div>
    </motion.div>
  );

  // ────────────────────────────────────────────────────────────
  // Viewer view (one person)
  // ────────────────────────────────────────────────────────────
  const renderViewer = () => {
    if (!currentPerson) return null;
    const hasPhoto = Boolean(currentPerson.image);
    const initials = currentPerson.initials || 'TM';

    return (
      <motion.div
        key={`viewer-${viewerIndex}`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.35 }}
        className="absolute inset-0 flex flex-col"
      >
        {/* Photo layer */}
        <div className="absolute inset-0 overflow-hidden">
          {hasPhoto ? (
            <img
              src={currentPerson.image}
              alt={currentPerson.name}
              className="absolute inset-0 w-full h-full object-cover object-top"
              style={{ imageRendering: '-webkit-optimize-contrast' }}
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-zinc-900 via-black to-zinc-900">
              <span className="text-zinc-700 text-[120px] sm:text-[160px] font-black tracking-tighter leading-none select-none">
                {initials}
              </span>
            </div>
          )}
        </div>

        {/* Readability gradient */}
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/70 to-black/20" />

        {/* Close button */}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onCloseViewer?.(); }}
          aria-label="Close team viewer"
          className="absolute top-4 right-4 z-20 w-9 h-9 rounded-full bg-black/60 backdrop-blur-md border border-white/10 text-zinc-400 hover:text-white hover:border-white/20 flex items-center justify-center transition-all cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Prev / Next — premium glass buttons */}
        <button
          type="button"
          onClick={handlePrev}
          aria-label="Previous team member"
          className="absolute left-3 sm:left-4 top-1/2 -translate-y-1/2 z-20 w-11 h-11 rounded-full bg-black/50 backdrop-blur-md border border-white/10 text-zinc-300 hover:text-white hover:border-blue-500/40 flex items-center justify-center transition-all cursor-pointer"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <button
          type="button"
          onClick={handleNext}
          aria-label="Next team member"
          className="absolute right-3 sm:right-4 top-1/2 -translate-y-1/2 z-20 w-11 h-11 rounded-full bg-black/50 backdrop-blur-md border border-white/10 text-zinc-300 hover:text-white hover:border-blue-500/40 flex items-center justify-center transition-all cursor-pointer"
        >
          <ChevronRight className="w-5 h-5" />
        </button>

        {/* Info at bottom */}
        <motion.div
          key={`info-${viewerIndex}`}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.35 }}
          className="relative z-10 mt-auto pb-8 sm:pb-10 px-8 text-center"
        >
          <span className="text-[10px] font-mono uppercase tracking-[0.3em] text-blue-400">
            {currentPerson.tag || 'Team Haven'}
          </span>
          <h3 className="text-2xl sm:text-3xl font-bold text-white tracking-tight mt-3">
            {currentPerson.name}
          </h3>
          <p className="text-sm text-zinc-300 mt-1.5">
            {currentPerson.role}
          </p>
        </motion.div>
      </motion.div>
    );
  };

  return (
    <>
      <AnimatePresence mode="wait">
        {isViewer ? renderViewer() : renderSlideshow()}
      </AnimatePresence>
    </>
  );
}
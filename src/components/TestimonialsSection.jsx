// src/components/TestimonialsSection.jsx
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Star, Quote, Play, X, ChevronLeft, ChevronRight, Maximize2 } from 'lucide-react';

const TESTIMONIALS = [
  {
    id: 'damilola',
    name: 'Damilola',
    initials: 'DA',
    image: null,
    videoSrc: '/Testimonial.mp4',
    wordsImage: null,
    wordsLabel: 'In Her Own Words',
    words:
      "Damilola's full message will appear here once her screenshot is ready. It will be her own words about the Playbook and what shifted for her.",
  },
  {
    id: 'stephanie',
    name: 'Stephanie',
    initials: 'ST',
    image: null,
    videoSrc: null,
    wordsImage: null,
    wordsLabel: 'In Her Own Words',
    words:
      "Stephanie's story is being put together. Check back soon.",
  },
  {
    id: 'more',
    name: 'More Stories',
    initials: '—',
    image: null,
    videoSrc: null,
    wordsImage: null,
    wordsLabel: 'In Their Words',
    words:
      'We are collecting more testimonials from clients and Playbook readers. New stories will land here.',
  },
];

const REVIEW_SCREENSHOT = '/Testimonial.jpeg';

const patternStyle = {
  backgroundColor: '#1c1814',
  backgroundImage: `
    radial-gradient(circle at 25% 30%, rgba(217, 119, 6, 0.18), transparent 55%),
    radial-gradient(circle at 75% 70%, rgba(180, 83, 9, 0.14), transparent 55%),
    repeating-linear-gradient(45deg, transparent 0, transparent 14px, rgba(245, 158, 11, 0.06) 14px, rgba(245, 158, 11, 0.06) 15px),
    repeating-linear-gradient(-45deg, transparent 0, transparent 14px, rgba(245, 158, 11, 0.06) 14px, rgba(245, 158, 11, 0.06) 15px)
  `,
};

const slideVariants = {
  enter: (dir) => ({ x: dir > 0 ? 60 : -60, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir) => ({ x: dir > 0 ? -60 : 60, opacity: 0 }),
};

export default function TestimonialsSection() {
  const slides = useMemo(
    () =>
      TESTIMONIALS.flatMap((person) => [
        { type: 'profile', person, key: `${person.id}-profile` },
        { type: 'words', person, key: `${person.id}-words` },
      ]),
    []
  );

  const [slideIndex, setSlideIndex] = useState(0);
  const [direction, setDirection] = useState(0);
  const [isVideoOpen, setIsVideoOpen] = useState(false);
  const [isPlaying, setIsPlaying] = useState(true);
  const [progress, setProgress] = useState(0);
  const [isQuoteOpen, setIsQuoteOpen] = useState(false);
  const videoRef = useRef(null);

  const currentSlide = slides[slideIndex];
  const currentPerson = currentSlide.person;
  const storageKey = `tmh_testimonial_time_${currentPerson.id}`;

  useEffect(() => {
    if (isVideoOpen && videoRef.current) {
      const saved = localStorage.getItem(storageKey);
      if (saved) videoRef.current.currentTime = parseFloat(saved);
    }
  }, [isVideoOpen, storageKey]);

  useEffect(() => {
    const anyOpen = isVideoOpen || isQuoteOpen;
    if (!anyOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [isVideoOpen, isQuoteOpen]);

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      const t = videoRef.current.currentTime;
      const total = videoRef.current.duration;
      if (total > 0) setProgress((t / total) * 100);
      localStorage.setItem(storageKey, t.toString());
    }
  };

  const togglePlayPause = () => {
    if (!videoRef.current) return;
    if (isPlaying) videoRef.current.pause();
    else videoRef.current.play();
    setIsPlaying(!isPlaying);
  };

  const handleVideoEnded = () => {
    if (videoRef.current) {
      videoRef.current.currentTime = 0;
      setIsPlaying(false);
      setProgress(0);
      localStorage.removeItem(storageKey);
    }
  };

  const openVideo = () => {
    if (!currentPerson.videoSrc) return;
    setIsVideoOpen(true);
    setIsPlaying(true);
  };

  const goNext = () => {
    if (slideIndex < slides.length - 1) {
      setDirection(1);
      setSlideIndex(slideIndex + 1);
    }
  };

  const goPrev = () => {
    if (slideIndex > 0) {
      setDirection(-1);
      setSlideIndex(slideIndex - 1);
    }
  };

  const jumpToPerson = (personIndex) => {
    const targetIdx = slides.findIndex(
      (s) => s.person.id === TESTIMONIALS[personIndex].id && s.type === 'profile'
    );
    setDirection(targetIdx > slideIndex ? 1 : -1);
    setSlideIndex(targetIdx);
  };

  const activePersonIndex = TESTIMONIALS.findIndex((t) => t.id === currentPerson.id);

  const arrowClass =
    'w-11 h-11 rounded-full flex items-center justify-center transition-all shadow-lg ' +
    'bg-zinc-900 text-white hover:bg-zinc-800 ' +
    'dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-100 ' +
    'disabled:opacity-25 disabled:cursor-not-allowed active:scale-95';

  return (
    <section
      id="testimonials"
      className="relative w-full py-16 sm:py-20 px-4 sm:px-6 lg:px-8 bg-white text-zinc-900 dark:bg-zinc-950 dark:text-white transition-colors duration-300"
    >
      <div className="max-w-5xl mx-auto relative z-10">

        {/* Header — top gap tightened (mb-8 → mb-4) */}
        <div className="text-center max-w-2xl mx-auto mb-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight text-zinc-900 dark:text-white">
              What People Are Saying
            </h2>
            <p className="text-zinc-600 dark:text-zinc-400 text-sm sm:text-base mt-3 font-light">
              Direct feedback from brand owners and creators we have worked with.
            </p>
          </motion.div>
        </div>

        <div className="relative mb-6">
          {/* Carousel min-height reduced — card sits closer to heading */}
          <div className="relative overflow-hidden min-h-[380px] sm:min-h-[460px]">
            <AnimatePresence mode="wait" custom={direction}>
              <motion.div
                key={currentSlide.key}
                custom={direction}
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.35, ease: 'easeOut' }}
                className="absolute inset-0 flex flex-col items-center justify-center"
              >
                {currentSlide.type === 'profile' && (
                  <div
                    onClick={openVideo}
                    className={`relative w-full max-w-xs sm:max-w-sm aspect-[4/5] rounded-3xl overflow-hidden border border-zinc-200 dark:border-white/10 shadow-2xl ${
                      currentPerson.videoSrc ? 'cursor-pointer group' : ''
                    }`}
                    style={currentPerson.image ? undefined : patternStyle}
                  >
                    {currentPerson.image ? (
                      <img
                        src={currentPerson.image}
                        alt={currentPerson.name}
                        className="absolute inset-0 w-full h-full object-cover object-center"
                      />
                    ) : (
                      <span className="absolute inset-0 flex items-center justify-center text-white/15 text-[140px] sm:text-[160px] font-black tracking-tighter select-none leading-none">
                        {currentPerson.initials}
                      </span>
                    )}

                    {currentPerson.videoSrc && (
                      <div className="absolute inset-0 flex items-center justify-center transition-colors group-hover:bg-black/10">
                        <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-white flex items-center justify-center shadow-2xl transition-transform group-hover:scale-105">
                          <Play
                            className="w-7 h-7 sm:w-8 sm:h-8 text-zinc-900 ml-1"
                            fill="currentColor"
                          />
                        </div>
                      </div>
                    )}

                    {!currentPerson.videoSrc && (
                      <div className="absolute bottom-20 left-0 right-0 flex justify-center">
                        <span className="text-[10px] font-mono uppercase tracking-[0.25em] text-white/40">
                          Coming Soon
                        </span>
                      </div>
                    )}

                    <div className="absolute bottom-0 left-0 right-0 z-10 px-5 pb-5 pt-16 bg-gradient-to-t from-black/90 via-black/60 to-transparent text-left">
                      <h3 className="text-sm sm:text-base font-bold text-white tracking-wide uppercase font-mono leading-tight">
                        {currentPerson.name}'s Personal Experience
                      </h3>
                      <p className="mt-1 text-[11px] sm:text-xs text-zinc-300 font-light">
                        With The Marketing Haven
                      </p>
                    </div>
                  </div>
                )}

                {currentSlide.type === 'words' && (
                  <div className="w-full max-w-xl">
                    <div
                      className="relative w-full rounded-3xl overflow-hidden border border-zinc-200 dark:border-white/10 shadow-xl p-8 sm:p-12"
                      style={currentPerson.wordsImage ? undefined : patternStyle}
                    >
                      {currentPerson.wordsImage ? (
                        <div className="relative">
                          <div className="rounded-2xl overflow-hidden border border-white/10 bg-zinc-900/60 backdrop-blur-md p-3">
                            <img
                              src={currentPerson.wordsImage}
                              alt={`${currentPerson.name}'s message`}
                              className="w-full h-auto rounded-xl"
                            />
                          </div>
                          <p className="mt-4 text-[11px] font-mono uppercase tracking-[0.2em] text-zinc-400/70 text-center">
                            {currentPerson.name}
                          </p>
                        </div>
                      ) : (
                        <>
                          <div className="flex items-center gap-2 mb-6 justify-center">
                            <span className="block w-5 h-px bg-zinc-500/60" />
                            <span className="text-[10px] font-mono uppercase tracking-[0.28em] text-zinc-300/70">
                              {currentPerson.wordsLabel}
                            </span>
                            <span className="block w-5 h-px bg-zinc-500/60" />
                          </div>

                          <Quote className="w-7 h-7 text-amber-500/50 mb-4 mx-auto" />

                          <p className="text-base sm:text-lg leading-relaxed text-zinc-100 text-center font-light max-w-lg mx-auto">
                            {currentPerson.words}
                          </p>

                          <p className="mt-7 text-[11px] font-mono uppercase tracking-[0.2em] text-zinc-400/70 text-center">
                            {currentPerson.name}
                          </p>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </div>

          <div className="flex items-center justify-center gap-4 mt-2">
            <button
              type="button"
              onClick={goPrev}
              disabled={slideIndex === 0}
              aria-label="Previous"
              className={arrowClass}
            >
              <ChevronLeft className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2 px-2">
              {TESTIMONIALS.map((t, i) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => jumpToPerson(i)}
                  aria-label={`Go to ${t.name}`}
                  className={`h-1.5 rounded-full transition-all ${
                    i === activePersonIndex
                      ? 'bg-amber-500 w-6'
                      : 'bg-zinc-400 dark:bg-zinc-700 hover:bg-zinc-500 w-1.5'
                  }`}
                />
              ))}
            </div>

            <button
              type="button"
              onClick={goNext}
              disabled={slideIndex === slides.length - 1}
              aria-label="Next"
              className={arrowClass}
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.15 }}
          className="max-w-2xl mx-auto"
        >
          <button
            type="button"
            onClick={() => setIsQuoteOpen(true)}
            aria-label="Read the full review"
            className="group relative w-full p-4 sm:p-5 rounded-2xl bg-zinc-50 dark:bg-white/[0.03] border border-zinc-200 dark:border-white/10 hover:border-zinc-400 dark:hover:border-white/20 transition-all cursor-pointer text-left"
          >
            <div className="flex items-center gap-2 mb-3">
              <span className="block w-5 h-px bg-zinc-400 dark:bg-zinc-500" />
              <span className="text-[10px] font-mono uppercase tracking-[0.28em] text-zinc-500 dark:text-zinc-400">
                Early Reviewee
              </span>
            </div>

            <div className="relative rounded-xl overflow-hidden border border-white/10 dark:border-white/10 bg-zinc-900/60 backdrop-blur-md max-w-sm mx-auto">
              <img
                src={REVIEW_SCREENSHOT}
                alt="Early Reviewee — review message"
                className="w-full h-auto transition-transform duration-500 group-hover:scale-[1.02]"
                style={{ imageRendering: '-webkit-optimize-contrast' }}
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
              />
              <div className="absolute top-3 right-3 w-9 h-9 rounded-full bg-black/60 backdrop-blur-md border border-white/20 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <Maximize2 className="w-4 h-4" />
              </div>
            </div>

            <div className="mt-3 flex items-center justify-between">
              <div>
                <h4 className="text-sm font-bold text-zinc-900 dark:text-white">Brand Owner</h4>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">
                  Playbook Reader
                </p>
              </div>
              <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-500 dark:text-zinc-500">
                Tap to read
              </span>
            </div>
          </button>
        </motion.div>

      </div>

      <AnimatePresence>
        {isVideoOpen && currentPerson.videoSrc && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[80] flex items-center justify-center p-4 sm:p-6 bg-black/85 backdrop-blur-md"
          >
            <div className="fixed inset-0" onClick={() => setIsVideoOpen(false)} />

            <motion.div
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              className="relative w-full max-w-sm sm:max-w-md h-[80vh] max-h-[700px] rounded-3xl bg-black border border-white/20 shadow-2xl overflow-hidden z-10 flex flex-col"
            >
              <button
                onClick={() => setIsVideoOpen(false)}
                aria-label="Close video"
                className="absolute top-4 right-4 z-30 w-9 h-9 rounded-full bg-black/60 backdrop-blur-md border border-white/20 text-white flex items-center justify-center hover:bg-black transition-colors"
              >
                <X className="w-5 h-5" />
              </button>

              <div
                onClick={togglePlayPause}
                className="relative w-full h-full bg-black cursor-pointer flex items-center justify-center select-none"
              >
                <video
                  ref={videoRef}
                  src={currentPerson.videoSrc}
                  autoPlay
                  playsInline
                  onTimeUpdate={handleTimeUpdate}
                  onEnded={handleVideoEnded}
                  className="w-full h-full object-cover"
                />

                {!isPlaying && (
                  <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                    <div className="w-16 h-16 rounded-full bg-black/60 backdrop-blur-md border border-white/20 flex items-center justify-center text-white">
                      <Play className="w-8 h-8 fill-white ml-1" />
                    </div>
                  </div>
                )}

                <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-white/20 z-20">
                  <div
                    className="h-full bg-white transition-all duration-150 ease-linear"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isQuoteOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[90] flex items-center justify-center p-4 sm:p-6 bg-black/85 backdrop-blur-md"
          >
            <div className="fixed inset-0" onClick={() => setIsQuoteOpen(false)} />

            <motion.div
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              className="relative w-full max-w-2xl max-h-[90vh] rounded-3xl border border-white/20 bg-zinc-900/40 backdrop-blur-2xl shadow-2xl overflow-hidden z-10 flex flex-col"
            >
              <button
                onClick={() => setIsQuoteOpen(false)}
                aria-label="Close review"
                className="absolute top-4 right-4 z-30 w-10 h-10 rounded-full bg-black/70 backdrop-blur-md border border-white/20 text-white flex items-center justify-center hover:bg-black transition-colors"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="overflow-auto p-6 sm:p-8">
                <div className="flex items-center gap-2 mb-4">
                  <span className="block w-5 h-px bg-zinc-400 dark:bg-zinc-500" />
                  <span className="text-[10px] font-mono uppercase tracking-[0.28em] text-zinc-400">
                    Early Reviewee
                  </span>
                </div>
                <img
                  src={REVIEW_SCREENSHOT}
                  alt="Early Reviewee — review message"
                  className="w-full h-auto rounded-2xl border border-white/10 max-w-xl mx-auto"
                  style={{ imageRendering: '-webkit-optimize-contrast' }}
                />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
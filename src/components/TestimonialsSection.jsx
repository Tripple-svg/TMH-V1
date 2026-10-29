// src/components/TestimonialsSection.jsx
import { useState, useRef, useEffect, useMemo } from 'react';
import { motion, AnimatePresence, useReducedMotion, useInView } from 'framer-motion';
import ProgressiveImage from './ui/ProgressiveImage';
import { Quote, Play, X, ChevronLeft, ChevronRight, Maximize2 } from 'lucide-react';

const TESTIMONIALS = [
  {
    id: 'damilola',
    name: 'Damilola',
    initials: 'DA',
    image: '/Dammy.jpeg',
    imagePosition: 'object-center',
    videoSrc: '/Testimonial.mp4',
    wordsImage: null,
    wordsLabel: 'In Her Own Words',
    words:
      "Honestly, at first glance I thought this was just another standard marketing agency. But after just one session, I was completely convinced I made the right choice. Unlike other agencies, they treat and carry your brand like it's their own. And as a founder, there's no better feeling than that.",
  },
  {
    id: 'stephanie',
    name: 'Stephanie',
    initials: 'ST',
    image: '/112.jpeg',
    imagePosition: 'object-[center_100%]',
    videoSrc: null,
    wordsImage: null,
    wordsLabel: 'In Her Own Words',
    pending: true,
    words: "Stephanie's video and written experience are being prepared. Check back soon.",
  },
  {
    id: 'more',
    name: 'More Stories',
    initials: 'TMH',
    image: null,
    imagePosition: 'object-center',
    videoSrc: null,
    wordsImage: null,
    wordsLabel: 'In Their Own Words',
    pending: true,
    words: 'The next story is on its way. We will add the video and written experience here when it is ready.',
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
  enter: (dir) => ({ x: dir > 0 ? 32 : -32, scale: 0.97, opacity: 0 }),
  center: { x: 0, scale: 1, opacity: 1 },
  exit: (dir) => ({ x: dir > 0 ? -24 : 24, scale: 0.985, opacity: 0 }),
};

export default function TestimonialsSection() {
  const reduceMotion = useReducedMotion();
  const sectionRef = useRef(null);
  const nearView = useInView(sectionRef, { once: true, margin: '600px' });
  useEffect(() => {
    if (!nearView) return;
    // Warm only the small carousel asset set as the section approaches the viewport.
    [REVIEW_SCREENSHOT, '/Background.jpeg', ...TESTIMONIALS.map((person) => person.image)].filter(Boolean).forEach((src) => {
      const image = new Image(); image.decoding = 'async'; image.src = src;
    });
  }, [nearView]);
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

  const closeVideo = () => {
    if (videoRef.current) {
      try { videoRef.current.pause(); } catch { /* Optional browser storage may be unavailable. */ }
    }
    setIsVideoOpen(false);
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
      ref={sectionRef}
      className="relative w-full pt-4 sm:pt-6 pb-16 sm:pb-20 px-4 sm:px-6 lg:px-8 bg-white text-zinc-900 dark:bg-zinc-950 dark:text-white transition-colors duration-300"
    >
      <div className="max-w-5xl mx-auto relative z-10">

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
          <div className="relative overflow-hidden min-h-[380px] sm:min-h-[460px]">
            <AnimatePresence mode="sync" initial={false} custom={direction}>
              <motion.div
                key={currentSlide.key}
                custom={direction}
                variants={reduceMotion ? { enter: { opacity: 0 }, center: { opacity: 1 }, exit: { opacity: 0 } } : slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: reduceMotion ? 0 : 0.45, ease: [0.22, 1, 0.36, 1] }}
                drag={reduceMotion ? false : 'x'} dragConstraints={{ left: 0, right: 0 }} dragElastic={0.08}
                onDragEnd={(_, info) => { if (info.offset.x < -45) goNext(); else if (info.offset.x > 45) goPrev(); }}
                style={{ touchAction: 'pan-y' }}
                className="absolute inset-0 flex flex-col items-center justify-center"
              >
                {currentSlide.type === 'profile' && (
                  <div
                    onClick={openVideo}
                    role={currentPerson.videoSrc ? 'button' : undefined}
                    tabIndex={currentPerson.videoSrc ? 0 : undefined}
                    aria-label={currentPerson.videoSrc ? `Watch ${currentPerson.name}'s experience` : undefined}
                    onKeyDown={(event) => { if (currentPerson.videoSrc && ['Enter',' '].includes(event.key)) { event.preventDefault(); openVideo(); } }}
                    className={`relative w-full max-w-xs sm:max-w-sm aspect-[4/5] rounded-3xl overflow-hidden border border-zinc-200 dark:border-white/10 shadow-2xl group ${
                      currentPerson.videoSrc ? 'cursor-pointer' : 'cursor-default'
                    }`}
                    style={currentPerson.image ? undefined : patternStyle}
                  >
                    {currentPerson.image ? (
                      <ProgressiveImage src={currentPerson.image} alt={currentPerson.name} fallback={currentPerson.initials} loading="eager"
                        className="absolute inset-0 w-full h-full" imageClassName={currentPerson.imagePosition || 'object-center'} />
                    ) : (
                      <span className="absolute inset-0 flex items-center justify-center text-white/15 text-[140px] sm:text-[160px] font-black tracking-tighter select-none leading-none">
                        {currentPerson.initials}
                      </span>
                    )}

                    {/* Play button — centered, smaller, rounded square */}
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 transition-colors group-hover:bg-black/10">
                      <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-white flex items-center justify-center shadow-2xl transition-transform group-hover:scale-105">
                        <Play
                          className="w-5 h-5 sm:w-6 sm:h-6 text-zinc-900 ml-0.5"
                          fill="currentColor"
                        />
                      </div>
                      {!currentPerson.videoSrc && <span className="rounded border border-white/15 bg-black/60 px-3 py-1.5 text-[10px] uppercase tracking-[0.14em] text-zinc-200">Video coming soon</span>}
                    </div>

                    <div className="absolute bottom-0 left-0 right-0 z-10 px-5 pb-5 pt-16 bg-gradient-to-t from-black/90 via-black/60 to-transparent text-left">
                      <h3 className="text-sm sm:text-base font-bold text-white tracking-wide uppercase font-mono leading-tight">
                        {currentPerson.videoSrc ? `${currentPerson.name}'s Personal Experience` : currentPerson.name}
                      </h3>
                      <p className="mt-1 text-[11px] sm:text-xs text-zinc-300 font-light">
                        With The Marketing Haven
                      </p>
                    </div>
                  </div>
                )}

                {currentSlide.type === 'words' && (
                  <div className="w-full max-w-xl">
                    <div className="relative w-full rounded-3xl overflow-hidden border border-zinc-200 dark:border-white/10 shadow-xl bg-zinc-50 dark:bg-zinc-900 p-8 sm:p-12">
                      {/* Keep the image treatment and text contrast appropriate to each theme. */}
                      <ProgressiveImage src="/Background.jpeg" alt="" aria-hidden="true" loading="eager" className="absolute inset-0 w-full h-full" />
                      <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-black/15 to-black/10" />

                      <div className="relative z-10">
                        <div className="flex items-center gap-2 mb-6 justify-center">
                          <span className="block w-5 h-px bg-white/50" />
                          <span className="text-[10px] font-mono uppercase tracking-[0.28em] text-white/90">
                            {currentPerson.wordsLabel}
                          </span>
                          <span className="block w-5 h-px bg-white/50" />
                        </div>

                        {currentPerson.pending ? <p className="mb-4 text-center text-[10px] uppercase tracking-[0.2em] text-zinc-300">Story coming soon</p> : <Quote className="w-7 h-7 text-zinc-200 mb-4 mx-auto" />}

                        <p className="text-base sm:text-lg leading-relaxed text-white text-center font-light max-w-lg mx-auto drop-shadow-md">
                          {currentPerson.words}
                        </p>

                        <p className="mt-7 text-[11px] font-mono uppercase tracking-[0.2em] text-white/80 text-center">
                          {currentPerson.name}
                        </p>
                      </div>
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
              <ProgressiveImage src={REVIEW_SCREENSHOT} alt="Early reviewee: review message" fit="contain" className="relative w-full aspect-[1080/477]" imageClassName="group-hover:scale-[1.02]" />
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
            <div className="fixed inset-0" onClick={closeVideo} />

            <motion.div
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              className="relative w-full max-w-sm sm:max-w-md h-[80vh] max-h-[700px] rounded-3xl bg-black border border-white/20 shadow-2xl overflow-hidden z-10 flex flex-col"
            >
              <button
                onClick={closeVideo}
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
                <ProgressiveImage src={REVIEW_SCREENSHOT} alt="Early reviewee: review message" loading="eager" fit="contain" className="relative w-full aspect-[1080/477] rounded-2xl border border-white/10 max-w-xl mx-auto" />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

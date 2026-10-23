import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Menu, X, Sun, Moon, ArrowRight } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';

const navLinks = [
  { label: 'Home', href: '#hero' },
  { label: 'About', href: '#about' },
  { label: 'Services', href: '#services' },
  { label: 'Playbook', href: '#shop' },
  { label: 'Class', href: '#free-class' },
  { label: 'Testimonials', href: '#testimonials' },
];

export default function Header({ onOpenReview }) {
  const { theme, toggleTheme } = useTheme();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [logoError, setLogoError] = useState(false);
  const reduceMotion = useReducedMotion();
  const menuButtonRef = useRef(null);
  const drawerRef = useRef(null);

  const isDark = theme === 'dark';

  useEffect(() => {
    if (!drawerOpen) return;
    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement;
    const menuButton = menuButtonRef.current;
    const panel = drawerRef.current;
    document.body.style.overflow = 'hidden';
    panel?.querySelector('button')?.focus();
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setDrawerOpen(false);
      if (event.key !== 'Tab') return;
      const focusable = panel?.querySelectorAll('a[href], button:not([disabled]), [tabindex="0"]');
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === panel)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
      if (panel?.contains(document.activeElement)) (previousFocus || menuButton)?.focus();
    };
  }, [drawerOpen]);

  const handleNavClick = (e, href) => {
    e.preventDefault();
    setDrawerOpen(false);
    const behavior = reduceMotion ? 'auto' : 'smooth';
    if (href === '#hero') {
      window.scrollTo({ top: 0, behavior });
    } else {
      const el = document.querySelector(href);
      if (el) el.scrollIntoView({ behavior, block: 'start' });
    }
  };

  return (
    <>
      <header className="fixed top-4 left-0 right-0 z-40 px-3 sm:px-6 lg:px-6 flex justify-center pointer-events-none">
        <div
          style={{ transform: 'translateZ(0)', willChange: 'backdrop-filter' }}
          className="pointer-events-auto relative w-full max-w-7xl h-16 sm:h-18 rounded-full border border-white/70 dark:border-white/[0.08] shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] isolate"
        >
          {/* Isolated backdrop layer — fixes the bottom-edge band artifact */}
          <div className="absolute inset-0 rounded-full bg-white/55 dark:bg-zinc-950/35 backdrop-blur-xl overflow-hidden" aria-hidden="true" />

          <div className="relative h-full px-4 sm:px-6 flex items-center justify-between gap-3">
            <a
              href="#hero"
              onClick={(e) => handleNavClick(e, '#hero')}
              className="flex items-center gap-2 sm:gap-3 min-w-0"
            >
              {!logoError ? (
                <img
                  src="/Tmhh.jpeg"
                  alt="The Marketing Haven"
                  className="h-7 sm:h-9 w-auto shrink-0 rounded-full object-cover transition-opacity duration-300"
                  onError={() => setLogoError(true)}
                />
              ) : (
                <div className="h-7 w-7 sm:h-9 sm:w-9 shrink-0 rounded-full bg-zinc-900 dark:bg-zinc-100 flex items-center justify-center text-white dark:text-zinc-900 text-[9px] sm:text-[10px] font-bold tracking-tight">
                  TMH
                </div>
              )}
              <span className="font-semibold text-sm sm:text-lg tracking-tight text-zinc-900 dark:text-white transition-colors duration-300 truncate">
                The Marketing Haven
              </span>
            </a>

            <nav aria-label="Primary navigation" className="hidden xl:flex items-center gap-6">
              {navLinks.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  onClick={(e) => handleNavClick(e, link.href)}
                  className="relative text-xs sm:text-sm font-medium uppercase tracking-wider text-zinc-600 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white transition-colors duration-200 group py-1 whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-zinc-500"
                >
                  {link.label}
                  <span className="absolute -bottom-1 left-0 right-0 h-px origin-left scale-x-0 bg-zinc-500 transition-transform duration-200 group-hover:scale-x-100" />
                </a>
              ))}
            </nav>

            <div className="flex items-center gap-2 sm:gap-3 shrink-0">
              <button
                onClick={toggleTheme}
                type="button"
                className="w-10 h-10 rounded-full flex items-center justify-center text-zinc-700 dark:text-zinc-200 bg-white/50 dark:bg-zinc-800/50 border border-white/70 dark:border-white/10 hover:bg-white/80 dark:hover:bg-zinc-700/60 transition-colors duration-200 cursor-pointer overflow-hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-500"
                aria-label="Toggle theme"
              >
                <AnimatePresence mode="wait" initial={false}>
                  <motion.div
                    key={isDark ? 'sun' : 'moon'}
                    initial={{ opacity: 0, rotate: reduceMotion ? 0 : -45, scale: reduceMotion ? 1 : 0.9 }}
                    animate={{ opacity: 1, rotate: 0, scale: 1 }}
                    exit={{ opacity: 0, rotate: reduceMotion ? 0 : 45, scale: reduceMotion ? 1 : 0.9 }}
                    transition={{ duration: reduceMotion ? 0 : 0.16, ease: 'easeOut' }}
                  >
                    {isDark ? (
                      <Sun className="w-4 h-4 text-zinc-300" />
                    ) : (
                      <Moon className="w-4 h-4 text-zinc-700" />
                    )}
                  </motion.div>
                </AnimatePresence>
              </button>

              <button
                onClick={onOpenReview}
                className="hidden sm:flex items-center gap-2 bg-zinc-900 hover:bg-zinc-700 dark:bg-zinc-100 dark:hover:bg-white text-white dark:text-zinc-950 font-medium px-5 py-2.5 rounded-xl transition-colors duration-200 text-xs sm:text-sm whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-500"
              >
                <span>Request Review</span>
                <ArrowRight className="w-4 h-4" />
              </button>

              <button
                ref={menuButtonRef}
                onClick={() => setDrawerOpen(true)}
                className="block xl:hidden w-10 h-10 rounded-full flex items-center justify-center text-zinc-900 dark:text-white bg-white/50 dark:bg-zinc-800/50 border border-white/70 dark:border-white/10 transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-500"
                aria-label="Open menu"
                aria-expanded={drawerOpen}
                aria-controls="tmh-mobile-menu"
              >
                <Menu className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </header>

      <AnimatePresence>
        {drawerOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reduceMotion ? 0 : 0.2 }}
              onClick={() => setDrawerOpen(false)}
              className="fixed inset-0 z-50 bg-black/60 xl:hidden"
            />

            <motion.div
              ref={drawerRef}
              id="tmh-mobile-menu"
              role="dialog"
              aria-modal="true"
              aria-labelledby="tmh-mobile-menu-title"
              tabIndex={-1}
              initial={{ x: reduceMotion ? 0 : '100%', opacity: reduceMotion ? 0 : 1 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: reduceMotion ? 0 : '100%', opacity: reduceMotion ? 0 : 1 }}
              transition={{ duration: reduceMotion ? 0 : 0.28, ease: [0.22, 1, 0.36, 1] }}
              className="fixed top-0 right-0 bottom-0 z-50 w-[85%] sm:w-[60%] md:w-[45%] max-w-sm bg-zinc-50 dark:bg-zinc-950 border-l border-white/70 dark:border-white/10 shadow-2xl shadow-black/25 flex flex-col"
            >
              <div className="flex items-center justify-between p-6 border-b border-white/40 dark:border-white/[0.06]">
                <span id="tmh-mobile-menu-title" className="font-semibold text-lg tracking-tight text-zinc-900 dark:text-white">
                  Menu
                </span>
                <button
                  onClick={() => setDrawerOpen(false)}
                  aria-label="Close menu"
                  className="w-11 h-11 rounded-xl flex items-center justify-center text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200/60 dark:hover:bg-white/5 transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-zinc-500"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <nav aria-label="Mobile navigation" className="flex-1 overflow-y-auto p-6 space-y-2">
                {navLinks.map((link) => (
                  <a
                    key={link.href}
                    href={link.href}
                    onClick={(e) => handleNavClick(e, link.href)}
                    className="block px-4 py-3 rounded-xl text-base font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-200/60 dark:hover:bg-white/5 transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-zinc-500"
                  >
                    {link.label}
                  </a>
                ))}
              </nav>

              <div className="p-6 border-t border-white/40 dark:border-white/[0.06]">
                <button
                  onClick={() => {
                    setDrawerOpen(false);
                    onOpenReview();
                  }}
                  className="w-full bg-zinc-900 hover:bg-zinc-700 dark:bg-zinc-100 dark:hover:bg-white text-white dark:text-zinc-950 font-medium py-3.5 rounded-xl transition-colors duration-200 text-center flex items-center justify-center gap-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-500"
                >
                  <span>Request a Free Brand Review</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

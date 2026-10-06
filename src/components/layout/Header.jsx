import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Menu, X, Sun, Moon, ArrowRight } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';

const navLinks = [
  { label: 'Home', href: '#hero' },
  { label: 'About Us', href: '#about' },
  { label: 'Services', href: '#services' },
  { label: 'The Playbook', href: '#shop' },
  { label: 'Free Class', href: '#free-class' },
  { label: 'Testimonials', href: '#testimonials' },
];

export default function Header({ onOpenReview }) {
  const { theme, toggleTheme } = useTheme();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [logoError, setLogoError] = useState(false);

  const isDark = theme === 'dark';

  useEffect(() => {
    document.body.style.overflow = drawerOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [drawerOpen]);

  const handleNavClick = (e, href) => {
    e.preventDefault();
    setDrawerOpen(false);
    if (href === '#hero') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      const el = document.querySelector(href);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <>
      <header className="fixed top-4 left-0 right-0 z-40 px-3 sm:px-6 lg:px-6 flex justify-center pointer-events-none">
        <div className="pointer-events-auto w-full max-w-7xl h-16 sm:h-18 px-4 sm:px-6 flex items-center justify-between rounded-full bg-white/75 dark:bg-zinc-950/40 backdrop-blur-xl border border-zinc-200/80 dark:border-zinc-700/50 shadow-lg shadow-black/10 dark:shadow-black/40 transition-all duration-300">

          {/* Branding */}
          <a
            href="#hero"
            onClick={(e) => handleNavClick(e, '#hero')}
            className="flex items-center gap-2 sm:gap-3 shrink-0"
          >
            {!logoError ? (
              <img
                src="/Tmhh.jpeg"
                alt="The Marketing Haven"
                className="h-7 sm:h-9 w-auto rounded-full object-cover transition-opacity duration-300"
                onError={() => setLogoError(true)}
              />
            ) : (
              <div className="h-7 w-7 sm:h-9 sm:w-9 rounded-full bg-blue-600 flex items-center justify-center text-white text-[9px] sm:text-[10px] font-bold tracking-tight">
                TMH
              </div>
            )}
            <span className="font-bold text-sm sm:text-lg tracking-tight text-zinc-900 dark:text-white transition-colors duration-300 whitespace-nowrap">
              The Marketing Haven
            </span>
          </a>

          {/* Desktop Navigation */}
          <nav className="hidden xl:flex items-center gap-7">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={(e) => handleNavClick(e, link.href)}
                className="relative text-xs sm:text-sm font-medium uppercase tracking-wider text-zinc-800 dark:text-zinc-200 hover:text-blue-600 dark:hover:text-blue-400 transition-colors duration-200 group py-1"
              >
                {link.label}
                <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-blue-600 transition-all duration-300 group-hover:w-full" />
              </a>
            ))}
          </nav>

          {/* Actions & Mobile Toggle */}
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              onClick={toggleTheme}
              type="button"
              className="w-10 h-10 rounded-full flex items-center justify-center text-zinc-700 dark:text-zinc-200 bg-white/50 dark:bg-zinc-800/50 border border-zinc-200/80 dark:border-zinc-700/60 hover:bg-white/80 dark:hover:bg-zinc-700/70 backdrop-blur-md transition-all duration-200 active:scale-90 cursor-pointer overflow-hidden"
              aria-label="Toggle theme"
            >
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={isDark ? 'sun' : 'moon'}
                  initial={{ opacity: 0, rotate: -90, scale: 0.5 }}
                  animate={{ opacity: 1, rotate: 0, scale: 1 }}
                  exit={{ opacity: 0, rotate: 90, scale: 0.5 }}
                  transition={{ duration: 0.2, ease: 'easeOut' }}
                >
                  {isDark ? (
                    <Sun className="w-4 h-4 text-amber-400" />
                  ) : (
                    <Moon className="w-4 h-4 text-blue-500" />
                  )}
                </motion.div>
              </AnimatePresence>
            </button>

            <button
              onClick={onOpenReview}
              className="hidden sm:flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-medium px-5 py-2.5 rounded-full transition-all duration-200 shadow-lg shadow-blue-600/25 active:scale-95 text-xs sm:text-sm border border-blue-400/30"
            >
              <span>Request a Free Brand Review</span>
              <ArrowRight className="w-4 h-4" />
            </button>

            <button
              onClick={() => setDrawerOpen(true)}
              className="block xl:hidden w-10 h-10 rounded-full flex items-center justify-center text-zinc-900 dark:text-white bg-white/50 dark:bg-zinc-800/50 border border-zinc-200/80 dark:border-zinc-700/60 backdrop-blur-md transition-colors duration-200 active:scale-90"
              aria-label="Open menu"
            >
              <Menu className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      {/* Mobile & Tablet Drawer — opacity matched to header */}
      <AnimatePresence>
        {drawerOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setDrawerOpen(false)}
              className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm xl:hidden"
            />

            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed top-0 right-0 bottom-0 z-50 w-[85%] sm:w-[60%] md:w-[45%] max-w-sm bg-white/75 dark:bg-zinc-950/40 backdrop-blur-2xl border-l border-zinc-200/80 dark:border-zinc-800/60 shadow-2xl flex flex-col"
            >
              <div className="flex items-center justify-between p-6 border-b border-zinc-200/50 dark:border-zinc-800/50">
                <span className="font-extrabold text-lg tracking-tight text-zinc-900 dark:text-white">
                  Menu
                </span>
                <button
                  onClick={() => setDrawerOpen(false)}
                  className="w-10 h-10 rounded-full flex items-center justify-center text-zinc-900 dark:text-white bg-white/60 dark:bg-zinc-800/50 border border-zinc-200/80 dark:border-zinc-700/50 backdrop-blur-md transition-colors duration-200"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-2">
                {navLinks.map((link) => (
                  <a
                    key={link.href}
                    href={link.href}
                    onClick={(e) => handleNavClick(e, link.href)}
                    className="block px-4 py-3 rounded-xl text-base font-medium text-zinc-700 dark:text-zinc-200 hover:bg-white/70 dark:hover:bg-zinc-800/60 backdrop-blur-md transition-colors duration-200"
                  >
                    {link.label}
                  </a>
                ))}
              </div>

              <div className="p-6 border-t border-zinc-200/50 dark:border-zinc-800/50">
                <button
                  onClick={() => {
                    setDrawerOpen(false);
                    onOpenReview();
                  }}
                  className="w-full bg-blue-600 hover:bg-blue-500 text-white font-medium py-3.5 rounded-full transition-all duration-200 shadow-md shadow-blue-600/20 active:scale-95 text-center flex items-center justify-center gap-2"
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
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Menu, X, Moon, Sun, ArrowRight } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

const navLinks = [
  { label: 'Home', href: '#hero' },
  { label: 'Services', href: '#services' },
  { label: 'Shop', href: '#shop' },
  { label: 'About Us', href: '#about' },
  { label: 'Free Class', href: '#free-class' },
  { label: 'Testimonials', href: '#testimonials' },
];

export default function Navbar({ onOpenReview }) {
  // Correctly destruct properties matching ThemeContext.jsx
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const handleNav = (e, href) => {
    e.preventDefault();
    setMobileOpen(false);

    if (href === '#hero') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      const el = document.querySelector(href);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }
  };

  return (
    <>
      <nav
        className={`fixed top-0 left-0 right-0 z-40 transition-colors duration-200 border-b ${
          isDark
            ? 'bg-zinc-950/80 backdrop-blur-xl border-white/10 text-white'
            : 'bg-white/80 backdrop-blur-xl border-zinc-200 text-zinc-900'
        } ${scrolled ? 'shadow-lg shadow-black/10' : ''}`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 sm:h-20">
            {/* Brand Logo */}
            <a
              href="#hero"
              onClick={(e) => handleNav(e, '#hero')}
              className="flex items-center gap-2.5 sm:gap-3 shrink-0"
            >
              <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold text-base sm:text-lg shadow-md shadow-blue-600/30">
                T
              </div>
              <span
                className={`font-bold text-xs sm:text-sm tracking-wider uppercase transition-colors ${
                  isDark ? 'text-white' : 'text-zinc-900'
                }`}
              >
                The Marketing Haven
              </span>
            </a>

            {/* Navigation - Hidden on iPad/Tablets (<1280px) to prevent clustering */}
            <div className="hidden xl:flex items-center gap-6 2xl:gap-8">
              {navLinks.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  onClick={(e) => handleNav(e, link.href)}
                  className={`relative text-sm font-medium tracking-wide transition-colors hover:text-blue-500 group ${
                    isDark ? 'text-zinc-300' : 'text-zinc-600'
                  }`}
                >
                  {link.label}
                  <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-blue-500 transition-all duration-300 group-hover:w-full" />
                </a>
              ))}
            </div>

            {/* Right Header Actions */}
            <div className="flex items-center gap-2.5 sm:gap-4">
              {/* Ultra-Smooth Theme Switcher */}
              <button
                onClick={toggleTheme}
                className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center transition-transform active:scale-90 border ${
                  isDark
                    ? 'border-white/15 bg-zinc-900/50 text-amber-400 hover:border-amber-400/40'
                    : 'border-zinc-300 bg-zinc-100 text-zinc-700 hover:border-blue-500/40'
                }`}
                aria-label="Toggle Theme"
              >
                {isDark ? (
                  <Sun className="w-4 h-4 text-amber-400 transition-transform duration-200 rotate-0 hover:rotate-45" />
                ) : (
                  <Moon className="w-4 h-4 text-zinc-700 transition-transform duration-200 rotate-0 hover:-rotate-12" />
                )}
              </button>

              {/* Header Primary CTA */}
              <button
                onClick={onOpenReview}
                className="hidden sm:flex items-center gap-2 px-4 sm:px-5 py-2.5 rounded-full bg-blue-600 text-white text-xs sm:text-sm font-semibold tracking-wide hover:bg-blue-500 hover:shadow-lg hover:shadow-blue-600/30 transition-all active:scale-95 border border-blue-400/30 group whitespace-nowrap"
              >
                <span>Request a Free Brand Review</span>
                <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
              </button>

              {/* Tablet & Mobile Menu Button */}
              <button
                onClick={() => setMobileOpen(true)}
                className={`xl:hidden w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center transition-colors border ${
                  isDark
                    ? 'border-white/10 text-white hover:bg-white/10'
                    : 'border-zinc-200 text-zinc-900 hover:bg-zinc-100'
                }`}
              >
                <Menu className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Drawer Overlay & Panel */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              onClick={() => setMobileOpen(false)}
              className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm xl:hidden"
            />

            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className={`fixed top-0 right-0 bottom-0 z-50 w-[80%] sm:w-[60%] md:w-[45%] max-w-sm shadow-2xl border-l backdrop-blur-2xl ${
                isDark
                  ? 'bg-zinc-950/95 border-white/10 text-white'
                  : 'bg-white/95 border-zinc-200 text-zinc-900'
              }`}
            >
              <div className="flex flex-col h-full p-6">
                <div className="flex items-center justify-between mb-8 pb-4 border-b border-zinc-500/10">
                  <span className="font-bold text-xs tracking-widest uppercase opacity-70">
                    Menu
                  </span>
                  <button
                    onClick={() => setMobileOpen(false)}
                    className={`w-9 h-9 rounded-xl flex items-center justify-center transition-colors border ${
                      isDark
                        ? 'border-white/10 text-white hover:bg-white/10'
                        : 'border-zinc-200 text-zinc-900 hover:bg-zinc-100'
                    }`}
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="flex flex-col gap-1">
                  {navLinks.map((link, i) => (
                    <motion.a
                      key={link.href}
                      href={link.href}
                      onClick={(e) => handleNav(e, link.href)}
                      initial={{ opacity: 0, x: 15 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.03 }}
                      className={`px-4 py-3 rounded-xl text-base font-medium transition-colors ${
                        isDark
                          ? 'text-zinc-200 hover:bg-white/10 hover:text-white'
                          : 'text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900'
                      }`}
                    >
                      {link.label}
                    </motion.a>
                  ))}
                </div>

                <div className="mt-auto pt-6 border-t border-zinc-500/10">
                  <button
                    onClick={() => {
                      setMobileOpen(false);
                      onOpenReview();
                    }}
                    className="w-full py-3.5 rounded-xl bg-blue-600 text-white font-semibold text-sm tracking-wide hover:bg-blue-500 transition-all active:scale-95 shadow-lg shadow-blue-600/30 flex items-center justify-center gap-2"
                  >
                    <span>Request a Free Brand Review</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
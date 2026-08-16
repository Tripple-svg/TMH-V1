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
  const { darkMode, toggleDarkMode } = useTheme();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll);
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
        className={`fixed top-0 left-0 right-0 z-40 transition-all duration-300 border-b ${
          darkMode
            ? 'bg-[#09090b]/80 backdrop-blur-md border-white/10'
            : 'bg-white/80 backdrop-blur-md border-gray-200'
        } ${scrolled ? 'shadow-lg shadow-black/10' : ''}`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 sm:h-20">
            
            {/* Logo */}
            <a 
              href="#hero" 
              onClick={(e) => handleNav(e, '#hero')}
              className="flex items-center gap-3 group"
            >
              <div className="w-9 h-9 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold text-lg shadow-md shadow-blue-600/30 transition-transform group-hover:scale-105">
                T
              </div>
              <span className={`hidden sm:block font-bold text-sm tracking-widest uppercase transition-colors ${
                darkMode ? 'text-white' : 'text-gray-900'
              }`}>
                The Marketing Haven
              </span>
            </a>

            {/* Desktop Navigation */}
            <div className="hidden lg:flex items-center gap-8">
              {navLinks.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  onClick={(e) => handleNav(e, link.href)}
                  className={`relative text-sm font-medium tracking-wide transition-colors hover:text-blue-500 group ${
                    darkMode ? 'text-gray-300' : 'text-gray-600'
                  }`}
                >
                  {link.label}
                  <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-blue-500 transition-all duration-300 group-hover:w-full" />
                </a>
              ))}
            </div>

            {/* Right Actions */}
            <div className="flex items-center gap-3 sm:gap-4">
              {/* Theme Toggle Button */}
              <button
                onClick={toggleDarkMode}
                className={`w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300 border ${
                  darkMode
                    ? 'border-white/10 text-gray-300 hover:bg-white/10 hover:border-blue-500/30'
                    : 'border-gray-200 text-gray-600 hover:bg-gray-100 hover:border-blue-500/30'
                }`}
                aria-label="Toggle theme"
              >
                <AnimatePresence mode="wait" initial={false}>
                  <motion.div
                    key={darkMode ? 'moon' : 'sun'}
                    initial={{ y: -10, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: 10, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    {darkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-gray-700" />}
                  </motion.div>
                </AnimatePresence>
              </button>

              {/* Primary Header CTA */}
              <button
                onClick={onOpenReview}
                className="hidden sm:flex items-center gap-2 px-5 py-2.5 rounded-full bg-blue-600 text-white text-sm font-semibold tracking-wide hover:bg-blue-500 hover:shadow-lg hover:shadow-blue-600/25 transition-all active:scale-95 border border-blue-400/30 group"
              >
                <span>Request a Free Brand Review</span>
                <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
              </button>

              {/* Mobile Hamburger Icon */}
              <button
                onClick={() => setMobileOpen(true)}
                className={`lg:hidden w-10 h-10 rounded-lg flex items-center justify-center transition-colors ${
                  darkMode ? 'text-white hover:bg-white/10' : 'text-gray-900 hover:bg-gray-100'
                }`}
              >
                <Menu className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Mobile Drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileOpen(false)}
              className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
            />

            {/* Drawer Side Panel */}
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 280 }}
              className={`fixed top-0 right-0 bottom-0 z-50 w-[70%] sm:w-[60%] md:w-[50%] max-w-sm shadow-2xl border-l backdrop-blur-xl ${
                darkMode
                  ? 'bg-[#09090b]/95 border-white/10'
                  : 'bg-white/95 border-gray-200'
              }`}
            >
              <div className="flex flex-col h-full p-6">
                {/* Header */}
                <div className="flex items-center justify-between mb-10">
                  <span className={`font-bold text-sm tracking-widest uppercase ${
                    darkMode ? 'text-white' : 'text-gray-900'
                  }`}>
                    Menu
                  </span>
                  <button
                    onClick={() => setMobileOpen(false)}
                    className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors ${
                      darkMode ? 'text-white hover:bg-white/10' : 'text-gray-900 hover:bg-gray-100'
                    }`}
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Nav Links with Stagger Animations */}
                <div className="flex flex-col gap-2">
                  {navLinks.map((link, i) => (
                    <motion.a
                      key={link.href}
                      href={link.href}
                      onClick={(e) => handleNav(e, link.href)}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.05 }}
                      className={`px-4 py-3 rounded-xl text-base font-medium transition-colors ${
                        darkMode
                          ? 'text-gray-200 hover:bg-white/5 hover:text-white'
                          : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'
                      }`}
                    >
                      {link.label}
                    </motion.a>
                  ))}
                </div>

                {/* Drawer CTA Button */}
                <div className="mt-auto pt-6">
                  <motion.button
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                    onClick={() => {
                      setMobileOpen(false);
                      onOpenReview();
                    }}
                    className="w-full py-3.5 rounded-xl bg-blue-600 text-white font-semibold text-sm tracking-wide hover:bg-blue-500 transition-all active:scale-95 shadow-lg shadow-blue-600/20 flex items-center justify-center gap-2"
                  >
                    <span>Request a Free Brand Review</span>
                    <ArrowRight className="w-4 h-4" />
                  </motion.button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
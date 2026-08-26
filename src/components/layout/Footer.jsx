import React from 'react';
import { useHaven } from '../haven/HavenContext'; // 1. Imported useHaven

const InstagramIcon = () => (
  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
  </svg>
);

const XIcon = () => (
  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
  </svg>
);

const TikTokIcon = () => (
  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z" />
  </svg>
);

const FacebookIcon = () => (
  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
  </svg>
);

const EmailIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
    <polyline points="22,6 12,13 2,6" />
  </svg>
);

export default function Footer({ onOpenReview, onOpenPolicy, onOpenTerms, onOpenSupport }) {
  const { toggleDrawer } = useHaven(); // 2. Connected toggleDrawer here

  const handleSupportClick = () => {
    if (onOpenSupport) onOpenSupport();
    toggleDrawer(); // Opens Haven drawer on click
  };

  const handleNav = (e, href) => {
    e.preventDefault();
    if (href === '#hero') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      const el = document.querySelector(href);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const socialLinks = [
    { label: 'Instagram', href: 'https://www.instagram.com/the.marketing_haven?igsh=c25kZzFubDV4N2Fi&igsi=c25kZzFubDV4N2Fi', icon: <InstagramIcon /> },
    { label: 'X', href: 'https://x.com/tmh_officiall', icon: <XIcon /> },
    { label: 'TikTok', href: 'https://www.tiktok.com/@the_marketing_haven?_r=1&_t=ZS-990wByWnZzA', icon: <TikTokIcon /> },
    { label: 'Facebook', href: 'https://www.facebook.com/share/1HoqmzfJhu/', icon: <FacebookIcon /> },
    { label: 'Email', href: 'mailto:info@themarketinghaven.xyz', icon: <EmailIcon /> },
  ];

  return (
    <>
      <footer className="relative w-full border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 transition-colors duration-300">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-12 md:gap-8">
            
            {/* Brand Column */}
            <div className="md:col-span-5">
              <h3 className="text-xl font-extrabold tracking-tight text-zinc-900 dark:text-white mb-3">
                The Marketing Haven
              </h3>
              <p className="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed max-w-sm">
                Digital marketing and brand strategy agency built on systems, clarity, and performance.
              </p>

              {/* Social Icons */}
              <div className="flex items-center gap-3 mt-6">
                {socialLinks.map((social) => (
                  <a
                    key={social.label}
                    href={social.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={social.label}
                    className="w-10 h-10 rounded-xl flex items-center justify-center text-zinc-500 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 hover:text-blue-500 dark:hover:text-blue-400 hover:border-blue-500/30 dark:hover:border-blue-500/30 hover:shadow-[0_0_12px_rgba(59,130,246,0.25)] transition-all duration-300"
                  >
                    {social.icon}
                  </a>
                ))}
              </div>
            </div>

            {/* Quick Navigation */}
            <div className="md:col-span-3 md:col-start-7">
              <h4 className="text-sm font-semibold tracking-wider uppercase text-zinc-900 dark:text-white mb-4">
                Quick Navigation
              </h4>
              <ul className="space-y-3">
                <li>
                  <a href="#hero" onClick={(e) => handleNav(e, '#hero')} className="text-sm text-zinc-600 dark:text-zinc-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                    Home
                  </a>
                </li>
                <li>
                  <a href="#about" onClick={(e) => handleNav(e, '#about')} className="text-sm text-zinc-600 dark:text-zinc-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                    About Us
                  </a>
                </li>
                <li>
                  <a href="#services" onClick={(e) => handleNav(e, '#services')} className="text-sm text-zinc-600 dark:text-zinc-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                    Services
                  </a>
                </li>
                <li>
                  <a href="#free-class" onClick={(e) => handleNav(e, '#free-class')} className="text-sm text-zinc-600 dark:text-zinc-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                    Free Class
                  </a>
                </li>
                <li>
                  <a href="#testimonials" onClick={(e) => handleNav(e, '#testimonials')} className="text-sm text-zinc-600 dark:text-zinc-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                    Testimonials
                  </a>
                </li>
                <li>
                  <button onClick={onOpenReview} className="text-sm text-zinc-600 dark:text-zinc-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors cursor-pointer">
                    Request Review
                  </button>
                </li>
              </ul>
            </div>

            {/* Legal & Safety */}
            <div className="md:col-span-3">
              <h4 className="text-sm font-semibold tracking-wider uppercase text-zinc-900 dark:text-white mb-4">
                Legal & Safety
              </h4>
              <ul className="space-y-3">
                <li>
                  <button onClick={onOpenPolicy} className="text-sm text-zinc-600 dark:text-zinc-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors cursor-pointer">
                    Privacy Policy
                  </button>
                </li>
                <li>
                  <button onClick={onOpenTerms} className="text-sm text-zinc-600 dark:text-zinc-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors cursor-pointer">
                    Terms of Service
                  </button>
                </li>
              </ul>
            </div>
          </div>

          {/* Copyright */}
          <div className="mt-16 pt-8 border-t border-zinc-200 dark:border-zinc-800 flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-xs text-zinc-500 dark:text-zinc-500">
              Built with precision. Engineered for performance.
            </p>
            <p className="text-xs text-zinc-500 dark:text-zinc-500">
              © 2026 The Marketing Haven. All rights reserved.
            </p>
          </div>
        </div>
      </footer>

      {/* Persistent Floating Support Trigger */}
      <button
        onClick={handleSupportClick}
        className="fixed bottom-6 left-6 z-30 bg-zinc-950/90 text-white border border-zinc-700/60 text-xs py-2.5 px-4 rounded-full shadow-2xl backdrop-blur-md flex items-center gap-2.5 hover:scale-105 hover:border-emerald-500/50 transition-all cursor-pointer group"
      >
        <span className="relative flex h-2.5 w-2.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
        </span>
        <span className="font-medium tracking-wide">Customer Support</span>
      </button>
    </>
  );
}
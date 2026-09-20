import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { getCookieConsent, setCookieConsent } from '../lib/cookieService';

export default function CookieBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const timeout = window.setTimeout(() => setVisible(getCookieConsent() === null), 1500);
    return () => window.clearTimeout(timeout);
  }, []);

  const choose = async (consented) => {
    setVisible(false);
    await setCookieConsent(consented);
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.aside
          initial={{ opacity: 0, y: 100 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 100 }}
          transition={{ type: 'spring', damping: 20, stiffness: 200 }}
          className="fixed bottom-4 left-4 right-4 z-[100] flex items-center gap-3 rounded-2xl border border-zinc-700/60 bg-zinc-950/95 p-4 pr-10 text-sm text-zinc-300 shadow-2xl backdrop-blur-xl sm:left-auto sm:right-6 sm:max-w-sm"
          role="dialog"
          aria-label="Cookie consent"
        >
          <img src="/Tmhh.jpeg" alt="TMH" className="h-8 w-8 shrink-0 rounded-lg object-cover" />
          <p className="flex-1">We use cookies to improve your experience.</p>
          <div className="flex shrink-0 items-center gap-3">
            <button type="button" onClick={() => choose(false)} className="text-xs text-zinc-400 transition hover:text-white">Decline</button>
            <button type="button" onClick={() => choose(true)} className="rounded-full bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-500">Accept All</button>
          </div>
          <button type="button" onClick={() => choose(false)} aria-label="Dismiss cookie notice" className="absolute right-3 top-3 text-zinc-500 transition hover:text-white"><X className="h-4 w-4" /></button>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}

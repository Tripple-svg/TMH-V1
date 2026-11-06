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
          className="fixed bottom-4 left-4 right-4 z-[45] rounded-2xl border border-zinc-700/60 bg-zinc-950/95 p-5 text-sm text-zinc-300 shadow-2xl backdrop-blur-xl sm:left-auto sm:right-6 sm:max-w-md"
          role="region"
          aria-label="Cookie consent"
        >
          <div className="flex items-start gap-3 pr-8"><img src="/Tmhh.jpeg" alt="" className="h-9 w-9 shrink-0 rounded-lg object-cover" />
          <p className="leading-6">Want to help us improve? Allow optional analytics. You can still use all our tools without it.</p></div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <button  type="button" aria-label="Decline optional analytics" onClick={() => choose(false)} className="min-h-11 rounded-xl border border-white/20 px-4 py-3 text-sm font-medium text-zinc-200 transition hover:bg-white/10">Decline</button>
            <button  type="button" aria-label="Accept optional analytics" onClick={() => choose(true)} className="min-h-11 rounded-xl bg-zinc-100 px-4 py-3 text-sm font-semibold text-zinc-950 transition hover:bg-white">Accept</button>
          </div>
          <button type="button" onClick={() => choose(false)} aria-label="Decline optional analytics and dismiss notice" className="absolute right-2 top-2 flex h-11 w-11 items-center justify-center rounded-lg text-zinc-300 transition hover:bg-white/10 hover:text-white"><X className="h-4 w-4" /></button>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}

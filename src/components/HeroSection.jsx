import { motion, useReducedMotion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { useHaven } from './haven/context/HavenContext';

export default function HeroSection({ onOpenReview }) {
  const { openDrawer } = useHaven();
  const reduceMotion = useReducedMotion();

  const handleTalkToTeam = () => {
    openDrawer('support', {
      profileData: { entryContext: 'team_inquiry' },
    });
  };

  return <section className="relative flex min-h-[75vh] w-full flex-col justify-center overflow-hidden bg-zinc-950 px-4 pb-8 pt-36 sm:px-6 sm:pb-12 sm:pt-32 lg:px-8">
    <div className="pointer-events-none absolute inset-0 overflow-hidden"><div className="absolute inset-0 z-10 bg-gradient-to-b from-zinc-950/60 via-zinc-950/40 to-zinc-950" /><video autoPlay={!reduceMotion} loop={!reduceMotion} muted playsInline preload="metadata" className="h-full w-full object-cover opacity-60"><source src="/HeroSection.mp4" type="video/mp4" /></video></div>
    <div className="relative z-20 mx-auto my-auto mt-2 w-full max-w-3xl sm:mt-0"><motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }} className="flex min-h-[420px] flex-col justify-between rounded-3xl border border-black/40 bg-zinc-900/35 px-6 py-10 text-center shadow-2xl sm:backdrop-blur-lg sm:min-h-0 sm:px-10 sm:py-14"><div className="my-auto flex flex-col justify-center"><motion.h1 initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.1 }} className="text-3xl font-black uppercase leading-snug tracking-tight text-white drop-shadow-md sm:text-5xl sm:leading-tight md:text-6xl">Here to transform your brand.</motion.h1><motion.h2 initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.2 }} className="mt-3 text-xl font-medium text-zinc-300 sm:mt-4 sm:text-2xl">Everything starts from you.</motion.h2><motion.p initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.3 }} className="mx-auto mt-4 max-w-lg text-sm font-light leading-relaxed text-zinc-200 drop-shadow-sm sm:mt-5 sm:text-base">Share a website, a profile screenshot, or where you are starting from. Haven, our AI guide, helps you spot a practical next step for your brand.</motion.p></div><motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.4 }} className="mt-6 flex flex-col items-center justify-center gap-3.5 sm:mt-10 sm:flex-row"><button type="button" onClick={onOpenReview} className="group flex w-full items-center justify-center gap-3 rounded-xl border border-white/70 bg-zinc-100 shadow-[0_6px_20px_rgba(0,0,0,0.15)] px-7 py-3.5 text-xs font-semibold text-zinc-950 transition-colors hover:bg-white sm:w-auto sm:text-sm">Request a Free Brand Review <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1 motion-reduce:transform-none" /></button><button type="button" onClick={handleTalkToTeam} className="w-full rounded-xl border border-white/20 bg-zinc-900/60 px-7 py-3.5 text-xs font-semibold text-white transition hover:scale-[1.02] hover:bg-zinc-800/80 active:scale-[0.98] sm:w-auto sm:text-sm">Talk to Our Team</button></motion.div></motion.div></div>
  </section>;
}

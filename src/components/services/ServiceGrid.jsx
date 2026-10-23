// src/components/services/ServiceGrid.jsx
// Clean — no dead props, Haven calls go to 'service' bucket only,
// zero contamination with support or audit sessions.

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import {
  Code2, TrendingUp, Share2, ArrowRight,
  X, Calendar, MessageSquare,
} from 'lucide-react';
import { useHaven } from '../haven/context/HavenContext';

const SERVICES = [
  {
    id: 'web',
    icon: Code2,
    title: 'Brand & Web Engineering',
    short: 'Identity systems, high-converting websites, and technical architecture.',
    overview:
      'Our Brand & Web Engineering service bridges high-level creative direction with robust technical infrastructure. We design custom digital assets, landing pages, and web applications built to scale, ensuring fast loading speeds, seamless UX, and optimized conversion pathways.',
    details: [
      'Custom brand identity & visual systems',
      'High-performance landing pages & funnels',
      'Technical SEO & speed optimization',
      'Conversion tracking & analytics setup',
    ],
  },
  {
    id: 'growth',
    icon: TrendingUp,
    title: 'Strategic Growth & Consulting',
    short: 'Data-driven campaigns, positioning, and revenue acceleration.',
    overview:
      'We construct data-led acquisition strategies tailored to your target market. From auditing existing conversion funnels to deploying high-ROI paid media campaigns, we engineer long-term systems that turn traffic into repeatable business growth.',
    details: [
      'Market positioning & competitive audit',
      'Paid acquisition strategy (Meta, Google, TikTok)',
      'Email & retention systems',
      'Quarterly growth roadmaps',
    ],
  },
  {
    id: 'content',
    icon: Share2,
    title: 'Content & Social Architecture',
    short: 'Content systems, editorial calendars, and community building.',
    overview:
      "Content shouldn't be random. We establish structured media engines that consistently distribute high-value content across your channels. Build brand equity, nurture prospect trust, and build an active online presence.",
    details: [
      'Platform-specific content strategy',
      'Editorial calendar & asset production',
      'Community management frameworks',
      'Influencer & partnership outreach',
    ],
  },
];

const SERVICE_CTA_LABELS = {
  web: 'Explore Web',
  growth: 'Explore Growth',
  content: 'Explore Content',
};

export default function ServiceGrid() {
  const [selectedService, setSelectedService] = useState(null);
  const reduceMotion = useReducedMotion();

  const { openDrawer } = useHaven();

  useEffect(() => {
    if (!selectedService) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setSelectedService(null);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [selectedService]);

  const handleGetMoreInfo = () => {
    const svc = selectedService;
    setSelectedService(null);

    openDrawer('service_inquiry', {
      serviceData: {
        id: svc.id,
        title: svc.title,
        summary: svc.short,
        overview: svc.overview,
        details: svc.details,
      },
    });
  };

  const handleBookCall = () => {
    const svc = selectedService;
    setSelectedService(null);
    openDrawer('booking', { source: 'services', serviceId: svc.id });
  };

  return (
    <section
      id="services"
      className="relative w-full pt-0 sm:pt-16 pb-12 sm:pb-28 px-4 sm:px-6 lg:px-8 bg-zinc-50 dark:bg-zinc-950/50 transition-colors duration-300"
    >
      <div className="max-w-7xl mx-auto">
        <motion.div
          className="text-center mb-10 sm:mb-16"
          initial={{ opacity: 0, y: reduceMotion ? 0 : 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: reduceMotion ? 0 : 0.4 }}
        >
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-zinc-900 dark:text-white tracking-tight mb-4">
            Services
          </h2>
          <p className="text-zinc-600 dark:text-zinc-400 text-sm sm:text-lg max-w-2xl mx-auto">
            End-to-end digital strategy for brands ready to dominate their space.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {SERVICES.map((s, i) => {
            const Icon = s.icon;
            return (
              <motion.div
                key={s.id}
                initial={{ opacity: 0, y: reduceMotion ? 0 : 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: reduceMotion ? 0 : 0.4, delay: reduceMotion ? 0 : i * 0.06 }}
                className="group relative text-left rounded-2xl bg-white/90 dark:bg-zinc-900/80 border border-zinc-200/80 dark:border-white/[0.08] p-6 sm:p-8 hover:border-zinc-400 dark:hover:border-white/20 shadow-[0_16px_40px_-28px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.8)] dark:shadow-[0_16px_40px_-28px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,0.05)] transition-colors duration-200 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-6">
                    <div className="w-12 h-12 rounded-xl bg-zinc-100/80 dark:bg-white/[0.04] border border-zinc-200/80 dark:border-white/[0.08] flex items-center justify-center">
                      <Icon className="w-5 h-5 text-zinc-600 dark:text-zinc-300" />
                    </div>
                    <span aria-hidden="true" className="text-[10px] tracking-[0.2em] tabular-nums text-zinc-400 dark:text-zinc-500">0{i + 1}</span>
                  </div>
                  <h3 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-white mb-3">
                    {s.title}
                  </h3>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed mb-6">
                    {s.short}
                  </p>
                  <ul className="space-y-2 border-t border-zinc-100 dark:border-zinc-800/80 pt-4">
                    {s.details.map((item, idx) => (
                      <li key={idx} className="text-xs text-zinc-500 dark:text-zinc-400 flex items-center gap-2">
                        <span className="w-1 h-1 rounded-full bg-zinc-400 dark:bg-zinc-500 shrink-0" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>

                <button
                  type="button"
                  onClick={() => setSelectedService(s)}
                  className="mt-8 flex items-center text-xs font-semibold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider hover:text-zinc-950 dark:hover:text-white w-full pt-4 border-t border-zinc-200/70 dark:border-white/[0.06] cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-zinc-500"
                >
                  <span>{SERVICE_CTA_LABELS[s.id]}</span>
                  <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1.5 transition-transform" />
                </button>
              </motion.div>
            );
          })}
        </div>
      </div>

      <AnimatePresence>
        {selectedService && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6" role="dialog" aria-modal="true" aria-labelledby="service-overview-title">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedService(null)}
              className="fixed inset-0 bg-black/70"
            />

            <motion.div
              initial={{ opacity: 0, scale: reduceMotion ? 1 : 0.98, y: reduceMotion ? 0 : 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: reduceMotion ? 1 : 0.98, y: reduceMotion ? 0 : 16 }}
              transition={{ duration: reduceMotion ? 0 : 0.22, ease: [0.22, 1, 0.36, 1] }}
              className="relative z-10 w-full max-w-xl bg-zinc-50 dark:bg-zinc-950 sm:bg-white/95 sm:dark:bg-zinc-950/95 sm:backdrop-blur-lg border border-white/70 dark:border-white/10 rounded-2xl p-6 sm:p-8 shadow-2xl max-h-[90vh] overflow-y-auto"
            >
              <button
                type="button"
                onClick={() => setSelectedService(null)}
                aria-label="Close service details"
                className="absolute top-4 right-4 w-11 h-11 rounded-xl flex items-center justify-center text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-200/60 dark:hover:bg-white/5 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-zinc-500"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-zinc-100 dark:bg-white/[0.04] border border-zinc-200 dark:border-white/[0.08] flex items-center justify-center text-zinc-600 dark:text-zinc-300">
                  {React.createElement(selectedService.icon, { className: 'w-5 h-5' })}
                </div>
                <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-zinc-500 dark:text-zinc-400">
                  Strategy Overview
                </span>
              </div>

              <h3 id="service-overview-title" className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-white mb-3">
                {selectedService.title}
              </h3>

              <p className="text-sm text-zinc-600 dark:text-zinc-300 leading-relaxed mb-6">
                {selectedService.overview}
              </p>

              <div className="border-t border-zinc-200 dark:border-white/10 pt-5 mb-6">
                <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-3">
                  Key Deliverables
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {selectedService.details.map((item, idx) => (
                    <div key={idx} className="flex items-center gap-2 text-xs text-zinc-700 dark:text-zinc-300">
                      <span aria-hidden="true" className="w-1 h-1 rounded-full bg-zinc-400 dark:bg-zinc-500 shrink-0" />
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleGetMoreInfo}
                  className="w-full bg-zinc-900 hover:bg-zinc-700 dark:bg-zinc-100 dark:hover:bg-white text-white dark:text-zinc-950 font-medium py-3 px-4 rounded-xl transition-colors text-xs sm:text-sm flex items-center justify-center gap-2 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-500"
                >
                  <MessageSquare className="w-4 h-4" />
                  <span>Get More Info</span>
                </button>

                <button
                  type="button"
                  onClick={handleBookCall}
                  className="w-full bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-white font-medium py-3 px-4 rounded-xl transition-all active:scale-95 text-xs sm:text-sm flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Calendar className="w-4 h-4" />
                  <span>Book a Strategy Call</span>
                </button>
              </div>

            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </section>
  );
}

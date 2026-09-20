// src/components/services/ServiceGrid.jsx
// Clean — no dead props, Haven calls go to 'service' bucket only,
// zero contamination with support or audit sessions.

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Code2, TrendingUp, Share2, ArrowRight,
  X, Calendar, MessageSquare, CheckCircle2,
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

// No props — Haven is consumed directly via context.
// This is what prevents the service sessions from ever bleeding
// into the support or audit session buckets.
export default function ServiceGrid() {
  const [selectedService, setSelectedService] = useState(null);
  const [bookingToast, setBookingToast] = useState(false);

  const { openDrawer } = useHaven();

  // Scroll lock while detail modal is open
  useEffect(() => {
    document.body.style.overflow = selectedService ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [selectedService]);

  // Routes to 'service' bucket — completely isolated from support and audit
  const handleGetMoreInfo = () => {
    const svc = selectedService;
    setSelectedService(null); // close detail modal first

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

  // Routes to booking notice — NOT to Haven support chat
  const handleBookCall = () => {
    setSelectedService(null);
    openDrawer('booking'); // triggers BookingComingSoonModal via context
  };

  return (
    <section
      id="services"
      className="relative w-full py-16 sm:py-28 px-4 sm:px-6 lg:px-8 bg-zinc-50 dark:bg-zinc-950/50 transition-colors duration-300"
    >
      <div className="max-w-7xl mx-auto">
        {/* Heading */}
        <motion.div
          className="text-center mb-10 sm:mb-16"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-zinc-900 dark:text-white tracking-tight mb-4">
            Services
          </h2>
          <p className="text-zinc-600 dark:text-zinc-400 text-sm sm:text-lg max-w-2xl mx-auto">
            End-to-end digital strategy for brands ready to dominate their space.
          </p>
        </motion.div>

        {/* Service Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {SERVICES.map((s, i) => {
            const Icon = s.icon;
            return (
              <motion.div
                key={s.id}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: i * 0.1 }}
                className="group relative text-left rounded-3xl bg-white dark:bg-zinc-900/60 border border-zinc-200/80 dark:border-zinc-800/80 backdrop-blur-md p-6 sm:p-8 hover:border-blue-500/50 dark:hover:border-blue-500/50 hover:shadow-2xl hover:shadow-blue-500/10 transition-all duration-300 flex flex-col justify-between"
              >
                <div>
                  <div className="w-12 h-12 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mb-6 group-hover:scale-110 group-hover:bg-blue-600 transition-all duration-300">
                    <Icon className="w-6 h-6 text-blue-600 dark:text-blue-400 group-hover:text-white transition-colors" />
                  </div>
                  <h3 className="text-xl font-bold text-zinc-900 dark:text-white mb-3">
                    {s.title}
                  </h3>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed mb-6">
                    {s.short}
                  </p>
                  <ul className="space-y-2 border-t border-zinc-100 dark:border-zinc-800/80 pt-4">
                    {s.details.map((item, idx) => (
                      <li key={idx} className="text-xs text-zinc-500 dark:text-zinc-400 flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>

                <button
                  type="button"
                  onClick={() => setSelectedService(s)}
                  className="mt-8 flex items-center text-xs font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider group-hover:text-blue-500 w-full pt-4 border-t border-zinc-100 dark:border-zinc-800/40 cursor-pointer"
                >
                  <span>Explore Strategy</span>
                  <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1.5 transition-transform" />
                </button>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Service Detail Modal */}
      <AnimatePresence>
        {selectedService && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
            {/* Overlay — no blur, plain dim */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedService(null)}
              className="fixed inset-0 bg-black/70"
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="relative z-10 w-full max-w-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 sm:p-8 shadow-2xl max-h-[90vh] overflow-y-auto"
            >
              <button
                type="button"
                onClick={() => setSelectedService(null)}
                className="absolute top-5 right-5 w-9 h-9 rounded-xl bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700/60 flex items-center justify-center text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>

              {/* Modal header */}
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-600 dark:text-blue-400">
                  {React.createElement(selectedService.icon, { className: 'w-5 h-5' })}
                </div>
                <span className="text-xs font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-400 bg-blue-500/10 px-3 py-1 rounded-full">
                  Strategy Overview
                </span>
              </div>

              <h3 className="text-2xl font-bold text-zinc-900 dark:text-white mb-3">
                {selectedService.title}
              </h3>

              <p className="text-sm text-zinc-600 dark:text-zinc-300 leading-relaxed mb-6">
                {selectedService.overview}
              </p>

              {/* Deliverables */}
              <div className="bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200/80 dark:border-zinc-800 rounded-2xl p-4 mb-6">
                <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-3">
                  Key Deliverables
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {selectedService.details.map((item, idx) => (
                    <div key={idx} className="flex items-center gap-2 text-xs text-zinc-700 dark:text-zinc-300">
                      <CheckCircle2 className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Actions */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleGetMoreInfo}
                  className="w-full bg-blue-600 hover:bg-blue-500 text-white font-medium py-3 px-4 rounded-xl transition-all shadow-md shadow-blue-600/20 active:scale-95 text-xs sm:text-sm flex items-center justify-center gap-2 cursor-pointer"
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

              {/* Booking coming soon toast */}
              <AnimatePresence>
                {bookingToast && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    className="mt-4 p-3 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 rounded-xl text-center text-xs font-medium text-blue-700 dark:text-blue-300"
                  >
                    📅 Calendar scheduling coming soon. Use "Get More Info" to chat with Haven now.
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </section>
  );
}
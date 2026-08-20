// src/components/services/ServiceGrid.jsx
import React from 'react';
import { motion } from 'framer-motion';
import { Code2, TrendingUp, Share2, ArrowRight } from 'lucide-react';

const services = [
  {
    id: 'web',
    icon: Code2,
    title: 'Brand & Web Engineering',
    short: 'Identity systems, high-converting websites, and technical architecture.',
    priceRange: '₦150,000 — ₦500,000',
    details: [
      'Custom brand identity & visual systems',
      'High-performance landing pages & funnels',
      'Technical SEO & speed optimization',
      'Conversion tracking & analytics setup'
    ]
  },
  {
    id: 'growth',
    icon: TrendingUp,
    title: 'Strategic Growth & Consulting',
    short: 'Data-driven campaigns, positioning, and revenue acceleration.',
    priceRange: '₦100,000 — ₦400,000',
    details: [
      'Market positioning & competitive audit',
      'Paid acquisition strategy (Meta, Google, TikTok)',
      'Email & retention systems',
      'Quarterly growth roadmaps'
    ]
  },
  {
    id: 'content',
    icon: Share2,
    title: 'Content & Social Architecture',
    short: 'Content systems, editorial calendars, and community building.',
    priceRange: '₦80,000 — ₦350,000',
    details: [
      'Platform-specific content strategy',
      'Editorial calendar & asset production',
      'Community management frameworks',
      'Influencer & partnership outreach'
    ]
  }
];

export default function ServiceGrid({ onSelect, onOpenReview }) {
  const handleCardClick = (service) => {
    if (onSelect) {
      onSelect(service);
    } else if (onOpenReview) {
      onOpenReview(service);
    }
  };

  return (
    <section id="services" className="relative w-full py-16 sm:py-28 px-4 sm:px-6 lg:px-8 bg-zinc-50 dark:bg-zinc-950/50 transition-colors duration-300">
      <div className="max-w-7xl mx-auto">
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

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {services.map((s, i) => (
            <motion.button
              key={s.id}
              onClick={() => handleCardClick(s)}
              className="group relative text-left rounded-3xl bg-white dark:bg-zinc-900/60 border border-zinc-200/80 dark:border-zinc-800/80 backdrop-blur-md p-6 sm:p-8 hover:border-blue-500/50 dark:hover:border-blue-500/50 hover:shadow-2xl hover:shadow-blue-500/10 transition-all duration-300 flex flex-col justify-between"
              initial={{ opacity: 0, y: 30 }} 
              whileInView={{ opacity: 1, y: 0 }} 
              viewport={{ once: true }} 
              transition={{ duration: 0.5, delay: i * 0.1 }}
            >
              <div>
                <div className="w-12 h-12 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mb-6 group-hover:scale-110 group-hover:bg-blue-600 group-hover:text-white transition-all duration-300">
                  <s.icon className="w-6 h-6 text-blue-600 dark:text-blue-400 group-hover:text-white transition-colors" />
                </div>
                <h3 className="text-xl font-bold text-zinc-900 dark:text-white mb-2">
                  {s.title}
                </h3>
                <p className="text-xs font-semibold text-blue-600 dark:text-blue-400 mb-3">
                  {s.priceRange}
                </p>
                <p className="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">
                  {s.short}
                </p>

                <ul className="mt-6 space-y-2 border-t border-zinc-100 dark:border-zinc-800/80 pt-4">
                  {s.details.map((item, idx) => (
                    <li key={idx} className="text-xs text-zinc-500 dark:text-zinc-400 flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="mt-8 flex items-center text-xs font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider group-hover:text-blue-500">
                Explore Strategy <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1.5 transition-transform" />
              </div>
            </motion.button>
          ))}
        </div>
      </div>
    </section>
  );
}
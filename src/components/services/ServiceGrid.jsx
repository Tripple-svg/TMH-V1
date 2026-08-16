import React from 'react';
import { motion } from 'framer-motion';
import { Code2, TrendingUp, Share2 } from 'lucide-react';

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

export default function ServiceGrid({ onSelect }) {
  return (
    <section id="services" className="relative w-full py-24 sm:py-32 px-4 sm:px-6 lg:px-8 dark:bg-gray-900 bg-gray-50">
      <div className="max-w-7xl mx-auto">
        <motion.div className="text-center mb-16" initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.6 }}>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold dark:text-white text-gray-900 tracking-tight mb-4">Services</h2>
          <p className="dark:text-gray-400 text-gray-600 max-w-2xl mx-auto">End-to-end digital strategy for brands ready to dominate their space.</p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {services.map((s, i) => (
            <motion.button
              key={s.id}
              onClick={() => onSelect(s)}
              className="group relative text-left rounded-2xl dark:bg-white/5 bg-white dark:border-white/10 border-gray-200 border backdrop-blur-sm p-8 hover:border-blue-500/30 dark:hover:bg-white/[0.07] hover:shadow-xl hover:shadow-blue-900/5 transition-all duration-500 flex flex-col justify-between"
              initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.5, delay: i * 0.1 }}>
              <div>
                <div className="w-12 h-12 rounded-xl bg-blue-600/10 border border-blue-500/20 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300">
                  <s.icon className="w-6 h-6 text-blue-500" />
                </div>
                <h3 className="text-lg font-semibold dark:text-white text-gray-900 mb-3">{s.title}</h3>
                <p className="text-sm dark:text-gray-400 text-gray-600 leading-relaxed">{s.short}</p>
              </div>
              <div className="mt-8 flex items-center text-xs font-medium text-blue-500 uppercase tracking-wider">
                Explore <TrendingUp className="w-3.5 h-3.5 ml-1.5 group-hover:translate-x-1 transition-transform" />
              </div>
            </motion.button>
          ))}
        </div>
      </div>
    </section>
  );
}
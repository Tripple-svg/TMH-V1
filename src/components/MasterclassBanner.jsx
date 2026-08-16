import React from 'react';
import { motion } from 'framer-motion';
import { Play, ArrowUpRight } from 'lucide-react';

export default function MasterclassBanner() {
  return (
    <section id="free-class" className="relative w-full py-16 sm:py-24 px-4 sm:px-6 lg:px-8 bg-[#09090b]">
      {/* Top transition blur */}
      <div className="absolute top-0 left-0 right-0 h-24 bg-gradient-to-b from-[#09090b] to-transparent pointer-events-none" />

      <div className="max-w-5xl mx-auto relative z-10">
        <motion.div
          className="relative rounded-2xl sm:rounded-3xl overflow-hidden border border-white/10 group shadow-2xl bg-[#121215]"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          {/* Flexible Responsive Layout instead of fixed Aspect Ratio */}
          <div className="relative min-h-[360px] sm:min-h-[420px] flex items-center p-6 sm:p-12 lg:p-16">
            
            {/* Background Image with Dark Gradient Layering */}
            <div className="absolute inset-0 z-0">
              <img
                src="https://images.unsplash.com/photo-1552664730-d307ca884978?q=80&w=2670&auto=format&fit=crop"
                alt="Masterclass"
                className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-700 opacity-40"
              />
              <div className="absolute inset-0 bg-gradient-to-r from-[#09090b] via-[#09090b]/85 to-transparent" />
              <div className="absolute inset-0 bg-blue-900/10 mix-blend-overlay" />
            </div>

            {/* Banner Text Content */}
            <motion.div 
              className="relative z-10 max-w-xl"
              initial={{ opacity: 0, x: -20 }} 
              whileInView={{ opacity: 1, x: 0 }} 
              viewport={{ once: true }} 
              transition={{ duration: 0.6, delay: 0.2 }}
            >
              <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-blue-600/20 border border-blue-500/30 text-blue-300 text-xs font-semibold uppercase tracking-wider mb-4">
                <Play className="w-3 h-3 fill-blue-300" />
                <span>Free Video Class</span>
              </div>

              <h3 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white leading-tight mb-3">
                "The Unseen System": How to Build a High-Ticket Brand
              </h3>

              <p className="text-gray-300 text-sm sm:text-base max-w-lg mb-8 leading-relaxed font-light">
                Learn the exact framework to transition from a generic online vendor into a structured, high-conversion brand that commands respect and drives sales.
              </p>

              <a 
                href="https://freeclass.themarketinghaven.xyz" 
                target="_blank" 
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-7 py-3.5 rounded-full bg-blue-600 text-white font-semibold text-sm hover:bg-blue-500 hover:shadow-[0_0_30px_rgba(37,99,235,0.4)] transition-all active:scale-95 group/btn"
              >
                <span>Watch Free Class</span> 
                <ArrowUpRight className="w-4 h-4 transition-transform group-hover/btn:translate-x-0.5 group-hover/btn:-translate-y-0.5" />
              </a>
            </motion.div>

          </div>
        </motion.div>
      </div>
    </section>
  );
}
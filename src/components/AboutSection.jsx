import React from 'react';
import { motion } from 'framer-motion';
import { Crown, UserCheck, Shield, Sparkles, Code, Megaphone, Users } from 'lucide-react';

export default function AboutSection() {
  const leadership = [
    { 
      name: 'Founder & MD', 
      role: 'Managing Director & Lead Brand Strategist', 
      tag: 'Leadership & Strategy' 
    },
    { 
      name: 'Pascal', 
      role: 'Chief Information Officer (CIO)', 
      tag: 'Technology & Operations' 
    }
  ];

  const teamRoles = [
    { 
      title: 'Front-End & Web Engineering', 
      lead: 'Custom Funnels & Web Systems',
      icon: Code
    },
    { 
      title: 'Brand Strategy & Growth', 
      lead: 'TMH Strategy Collective',
      icon: Megaphone
    },
    { 
      title: 'Community & Outreach', 
      lead: 'Brand Ambassador Network',
      icon: Users
    }
  ];

  return (
    <section id="about" className="relative w-full py-24 sm:py-32 px-4 sm:px-6 lg:px-8 bg-[#09090b] overflow-hidden">
      
      {/* Background Accent Elements */}
      <div className="absolute top-1/2 left-0 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl pointer-events-none -translate-y-1/2" />
      
      <div className="max-w-7xl mx-auto relative z-10">
        
        {/* Story Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-center mb-20">
          
          {/* Visual Brand Box */}
          <motion.div 
            initial={{ opacity: 0, x: -30 }} 
            whileInView={{ opacity: 1, x: 0 }} 
            viewport={{ once: true }} 
            transition={{ duration: 0.7 }}
          >
            <div className="relative rounded-2xl sm:rounded-3xl overflow-hidden border border-white/10 bg-white/5 backdrop-blur-md aspect-[4/3] flex items-center justify-center group hover:border-blue-500/30 transition-colors">
              <div className="absolute inset-0 bg-gradient-to-br from-blue-600/15 via-transparent to-black/60" />
              
              <div className="relative z-10 text-center p-6 sm:p-8">
                <div className="w-20 h-20 rounded-2xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center mx-auto mb-5 shadow-lg shadow-blue-600/20 group-hover:scale-105 transition-transform">
                  <Crown className="w-10 h-10 text-blue-400" />
                </div>
                <h3 className="text-white font-bold text-2xl sm:text-3xl tracking-tight">The Marketing Haven</h3>
                <p className="text-blue-400 text-xs font-mono uppercase tracking-widest mt-2 flex items-center justify-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" />
                  Digital Brand Strategy Agency
                </p>
              </div>
            </div>
          </motion.div>

          {/* Copy Content */}
          <motion.div 
            initial={{ opacity: 0, x: 30 }} 
            whileInView={{ opacity: 1, x: 0 }} 
            viewport={{ once: true }} 
            transition={{ duration: 0.7 }}
          >
            <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-blue-600/10 border border-blue-500/20 text-blue-400 text-xs font-semibold uppercase tracking-wider mb-4">
              Our Story & Philosophy
            </div>

            <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white tracking-tight mb-6">
              Built on Systems, Clarity & Performance.
            </h2>

            <div className="space-y-4 text-gray-300 leading-relaxed font-light text-sm sm:text-base">
              <p>
                We are a digital marketing agency obsessed with transforming generic businesses into structured, high-ticket brands.
              </p>
              <p>
                Every strategy we map out, funnel we deploy, and custom code we engineer is rooted in market data and behavioral buyer psychology—not surface-level guesswork.
              </p>
              <p>
                Whether you're launching a new venture in Nigeria or scaling an established business globally, TMH provides the strategic blueprint you need to command authority.
              </p>
            </div>

            {/* Metrics */}
            <div className="mt-8 pt-8 border-t border-white/10 flex items-center gap-8 sm:gap-12">
              <div>
                <p className="text-3xl sm:text-4xl font-bold text-white">9 Chapters</p>
                <p className="text-xs sm:text-sm text-gray-400 mt-1">Full Strategy Framework</p>
              </div>
              <div className="w-[1px] h-12 bg-white/10" />
              <div>
                <p className="text-3xl sm:text-4xl font-bold text-blue-400">100%</p>
                <p className="text-xs sm:text-sm text-gray-400 mt-1">Data-Driven Execution</p>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Leadership & Team Section */}
        <div className="pt-16 border-t border-white/10">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <h3 className="text-2xl sm:text-3xl font-bold text-white mb-3">Our Leadership & Execution Team</h3>
            <p className="text-sm text-gray-400 font-light">
              The minds driving our strategy frameworks, technology infrastructure, and client success.
            </p>
          </div>

          {/* Leadership Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto mb-10">
            {leadership.map((l, i) => (
              <div key={i} className="p-6 rounded-2xl bg-white/5 border border-white/10 hover:border-blue-500/30 transition-all flex items-center gap-4 group">
                <div className="w-14 h-14 rounded-full bg-blue-600/20 border border-blue-500/30 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                  <UserCheck className="w-6 h-6 text-blue-400" />
                </div>
                <div>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-blue-400 bg-blue-600/10 px-2.5 py-0.5 rounded-full border border-blue-500/20">
                    {l.tag}
                  </span>
                  <h4 className="text-lg font-bold text-white mt-1.5">{l.name}</h4>
                  <p className="text-xs text-gray-400 mt-0.5">{l.role}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Departmental Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-4xl mx-auto">
            {teamRoles.map((r, i) => {
              const Icon = r.icon;
              return (
                <div key={i} className="p-5 rounded-2xl bg-white/[0.03] border border-white/5 hover:border-white/10 text-center transition-colors">
                  <div className="w-9 h-9 rounded-xl bg-blue-600/10 border border-blue-500/20 flex items-center justify-center mx-auto mb-3">
                    <Icon className="w-4 h-4 text-blue-400" />
                  </div>
                  <h5 className="text-xs font-semibold text-white mb-1">{r.title}</h5>
                  <p className="text-[11px] text-gray-400">{r.lead}</p>
                </div>
              );
            })}
          </div>
        </div>

      </div>
    </section>
  );
}
// src/components/TestimonialsSection.jsx
import React from 'react';
import { motion } from 'framer-motion';
import { Star, Quote } from 'lucide-react';

export default function TestimonialsSection() {
  // Placeholder testimonials - easily editable when you're ready
  const testimonials = [
    {
      name: 'Agency Client',
      role: 'Brand Case Study',
      content: 'Working with The Marketing Haven completely changed how we present our business online. The strategy was clear, direct, and gave us a solid brand identity.',
      rating: 5,
    },
    {
      name: 'Waitlist Member',
      role: 'Community Participant',
      content: 'The insights from the masterclass opened my eyes to how brand positioning actually works. Highly structured and practical information.',
      rating: 5,
    },
    {
      name: 'Early Reviewee',
      role: 'Business Owner',
      content: 'The brand review highlighted clear gaps in our digital messaging that we were completely blind to. Invaluable feedback.',
      rating: 5,
    },
  ];

  return (
    <section id="testimonials" className="relative w-full py-20 sm:py-28 px-4 sm:px-6 lg:px-8 bg-[#09090b]">
      <div className="max-w-7xl mx-auto relative z-10">
        
        {/* Header */}
        <div className="text-center max-w-2xl mx-auto mb-16">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <span className="text-xs font-semibold text-blue-400 uppercase tracking-widest bg-blue-600/10 border border-blue-500/20 px-3 py-1 rounded-full">
              Real Feedback
            </span>
            <h2 className="text-3xl sm:text-4xl font-bold text-white mt-4 tracking-tight">
              What People Are Saying
            </h2>
            <p className="text-gray-400 text-sm sm:text-base mt-2 font-light">
              Direct feedback from business owners and founders we've worked with.
            </p>
          </motion.div>
        </div>

        {/* Testimonials Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8">
          {testimonials.map((item, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.15 }}
              className="relative p-6 sm:p-8 rounded-2xl bg-white/[0.03] border border-white/10 flex flex-col justify-between group hover:border-blue-500/40 transition-all duration-300"
            >
              <div>
                {/* Rating Stars */}
                <div className="flex items-center gap-1 mb-4 text-amber-400">
                  {[...Array(item.rating)].map((_, i) => (
                    <Star key={i} className="w-4 h-4 fill-amber-400 text-amber-400" />
                  ))}
                </div>

                <Quote className="w-8 h-8 text-blue-500/20 mb-2 group-hover:text-blue-500/40 transition-colors" />

                <p className="text-gray-300 text-sm leading-relaxed font-light mb-6">
                  "{item.content}"
                </p>
              </div>

              <div className="pt-4 border-t border-white/5 flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-semibold text-white">{item.name}</h4>
                  <p className="text-xs text-gray-500">{item.role}</p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>

      </div>
    </section>
  );
}
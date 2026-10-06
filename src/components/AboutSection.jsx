// src/components/AboutSection.jsx
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { ChevronRight } from 'lucide-react';
import AboutStoryVideo from './about/AboutStoryVideo';
import PersonModal from './about/PersonModal';

const TEAM = [
  {
    name: 'Francis Fadeyi',
    role: 'Founder & Chief Executive Officer (CEO)',
    tag: 'Leadership & Execution',
    image: '/Francis.jpeg',
    initials: 'FF',
    bio: 'Francis leads TMH. He sets the direction, makes the calls, and drives execution. Ideas turn into shipped work because he makes sure they do.',
  },
  {
    name: 'Paschal Ikiriko',
    role: 'Co-Founder & Chief Operations Officer (COO)',
    tag: 'Strategy & Operations',
    image: '/Paschalll.jpeg',
    initials: 'PI',
    bio: 'Paschal is the strategist in the room. He brings a constant flow of ideas and sharpens the thinking behind every move. He runs operations and keeps the engine going.',
  },
  {
    name: 'Great Jordan',
    role: 'Head of Content & Communications',
    tag: 'Content & Communication',
    image: null,
    initials: 'GJ',
    bio: 'Jordan is the voice of TMH. He leads content and communications across every platform, from the blog to X. He is also stepping in front of the camera as the face of the brand.',
  },
  {
    name: 'Obabi Babalola',
    role: 'Brand Strategy Advisor',
    tag: 'Brand Strategy',
    image: null,
    initials: 'OB',
    bio: 'Obabi is our brand strategy advisor, based in Canada. He was one of the key minds behind TMH from the very start and continues to shape how we think about positioning and identity.',
  },
  {
    name: 'Yakubu Dalil',
    role: 'CTO & Tech Lead',
    tag: 'Technology',
    image: null,
    initials: 'OD',
    bio: 'Dalil is our CTO and tech lead. He built the preloader on this site, brings sharp technical ideas, and handles the engineering behind everything TMH builds.',
  },
];

export default function AboutSection() {
  const [activeIndex, setActiveIndex] = useState(null);

  const openModal = (i) => setActiveIndex(i);
  const closeModal = () => setActiveIndex(null);

  const activePerson = activeIndex !== null ? TEAM[activeIndex] : null;

  return (
    <section
      id="about"
      className="relative w-full py-24 sm:py-32 px-4 sm:px-6 lg:px-8 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 transition-colors duration-300 overflow-hidden"
    >
      <div className="max-w-7xl mx-auto relative z-10">

        {/* Section label — plain bold text, no dashes */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center max-w-3xl mx-auto mb-12 lg:mb-16"
        >
          <h3 className="text-sm sm:text-base font-bold uppercase tracking-[0.2em] text-zinc-900 dark:text-white">
            Our Story &amp; Philosophy
          </h3>
        </motion.div>

        {/* Story */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center mb-20 lg:mb-24">
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7 }}
          >
            <AboutStoryVideo videoSrc={null} poster="/Tmhh.jpeg" />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7 }}
            className="text-center lg:text-left"
          >
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight">
              We Turn Businesses Into Brands That Last.
            </h2>

            <div className="mt-6 space-y-4 text-zinc-600 dark:text-zinc-300 leading-relaxed font-light text-sm sm:text-base max-w-xl mx-auto lg:mx-0">
              <p>
                We are a digital marketing agency that turns businesses into brands that last. Structure and identity are what separate a business that sells from a brand that stays.
              </p>
              <p>
                Every strategy we map out, every funnel we deploy, and every line of code we engineer is rooted in market data and buyer psychology. Not guesswork.
              </p>
              <p>
                Whether you are launching a new venture in Nigeria or scaling an established business globally, TMH gives you the blueprint to grow the right way.
              </p>
            </div>
          </motion.div>
        </div>

        {/* Team section */}
        <div className="pt-16 border-t border-zinc-200 dark:border-zinc-800">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-center max-w-2xl mx-auto mb-12"
          >
            <h3 className="text-sm sm:text-base font-bold uppercase tracking-[0.2em] text-zinc-900 dark:text-white mb-4">
              Team Haven
            </h3>

            <h2 className="text-2xl sm:text-3xl font-bold mb-3">
              The Team Behind Every Review.
            </h2>
            <p className="text-sm text-zinc-600 dark:text-zinc-400 font-light">
              A small, elite group of strategists, builders, and operators. Everyone here plays an equal part.
            </p>
          </motion.div>

          <div className="flex flex-wrap justify-center gap-4 max-w-4xl mx-auto">
            {TEAM.map((person, i) => {
              const hasPhoto = Boolean(person.image);
              return (
                <motion.button
                  key={person.name}
                  type="button"
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: i * 0.06 }}
                  whileHover={{ y: -3 }}
                  onClick={() => openModal(i)}
                  className="group relative flex items-center gap-4 p-4 sm:p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/60 hover:border-zinc-400 dark:hover:border-zinc-600 transition-all cursor-pointer text-left w-full sm:w-[calc(50%-0.5rem)]"
                >
                  <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full overflow-hidden shrink-0 border-2 border-zinc-300 dark:border-zinc-700 bg-zinc-900 flex items-center justify-center group-hover:scale-105 transition-transform">
                    {hasPhoto ? (
                      <img
                        src={person.image}
                        alt={person.name}
                        className="w-full h-full object-cover object-top"
                      />
                    ) : (
                      <span className="text-zinc-600 dark:text-zinc-500 text-xl sm:text-2xl font-black tracking-tighter leading-none select-none">
                        {person.initials}
                      </span>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <span className="text-[9px] sm:text-[10px] font-mono uppercase tracking-[0.2em] text-blue-500 dark:text-blue-400">
                      {person.tag}
                    </span>
                    <h5 className="text-sm sm:text-base font-semibold text-zinc-900 dark:text-white mt-1 truncate">
                      {person.name}
                    </h5>
                    <p className="text-[11px] sm:text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 leading-snug line-clamp-2">
                      {person.role}
                    </p>
                  </div>

                  <div className="shrink-0 w-7 h-7 rounded-full border border-zinc-300 dark:border-zinc-700 flex items-center justify-center text-zinc-400 group-hover:text-white group-hover:border-blue-500/50 group-hover:bg-blue-500/10 transition-all">
                    <ChevronRight className="w-3.5 h-3.5" />
                  </div>
                </motion.button>
              );
            })}
          </div>
        </div>
      </div>

      <PersonModal person={activePerson} onClose={closeModal} />
    </section>
  );
}
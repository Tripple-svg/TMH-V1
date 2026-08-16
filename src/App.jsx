// src/App.jsx (Root Layout Wrapper)
import React, { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Sparkles } from 'lucide-react';
import { ThemeProvider } from './context/ThemeContext';
import { UserProvider } from './context/UserContext';

// Navigation & Header Component
import Header from './components/layout/Header';

// Section & Feature Components
import ReviewForm from './components/review/ReviewForm';
import HavenChat from './components/review/HavenChat';
import ServiceGrid from './components/services/ServiceGrid';
import ServiceDetail from './components/services/ServiceDetail';
import MasterclassBanner from './components/MasterclassBanner';
import ShopSection from './components/ShopSection';
import TestimonialsSection from './components/TestimonialsSection';
import AboutSection from './components/AboutSection';
import Footer from './components/Footer';
import Preloader from './components/Preloader';
import HeroSection from './components/HeroSection';

export default function App() {
  const [loading, setLoading] = useState(true);
  const [showReview, setShowReview] = useState(false);
  const [showHaven, setShowHaven] = useState(false);
  const [selectedService, setSelectedService] = useState(null);
  const [reviewPayload, setReviewPayload] = useState(null);

  // Fallback safety timer: ensures loader releases after 2.2s no matter what
  useEffect(() => {
    const timer = setTimeout(() => {
      setLoading(false);
    }, 2200);
    return () => clearTimeout(timer);
  }, []);

  // Lock body scroll reliably across mobile & desktop when any modal or drawer is active
  useEffect(() => {
    const isLocked = showReview || showHaven || Boolean(selectedService);
    if (isLocked) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [showReview, showHaven, selectedService]);

  const handleLaunchHaven = (data) => {
    if (data) setReviewPayload(data);
    setShowReview(false);
    setShowHaven(true);
  };

  return (
    <ThemeProvider>
      <UserProvider>
        {/* Main Wrapper: Enforces theme background colors & zero horizontal scroll overflow */}
        <div className="relative w-full overflow-x-hidden min-h-screen bg-[#09090b] dark:bg-[#09090b] text-gray-900 dark:text-white transition-colors duration-300 selection:bg-blue-600/30 selection:text-blue-200">
          
          <AnimatePresence mode="wait">
            {loading && (
              <Preloader key="preloader" onComplete={() => setLoading(false)} />
            )}
          </AnimatePresence>

          {!loading && (
            <>
              {/* Header with dark/light mode toggle & mobile drawer */}
              <Header onOpenReview={() => setShowReview(true)} />

              <main className="relative w-full pt-16 sm:pt-20">
                <section id="hero">
                  <HeroSection onOpenReview={() => setShowReview(true)} />
                </section>

                <section id="services" className="scroll-mt-20">
                  <ServiceGrid onSelect={setSelectedService} />
                </section>

                <section id="free-class" className="scroll-mt-20">
                  <MasterclassBanner />
                </section>

                <section id="shop" className="scroll-mt-20">
                  <ShopSection />
                </section>

                <section id="about" className="scroll-mt-20">
                  <AboutSection />
                </section>

                <section id="testimonials" className="scroll-mt-20">
                  <TestimonialsSection />
                </section>

                <Footer onOpenReview={() => setShowReview(true)} />
              </main>

              {/* Floating Haven AI Quick Trigger (Displays when session payload exists) */}
              {!showHaven && !showReview && reviewPayload && (
                <motion.button
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0, opacity: 0 }}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setShowHaven(true)}
                  className="fixed bottom-6 right-6 z-40 flex items-center gap-2 px-4 py-3 rounded-full bg-blue-600 border border-blue-400/30 text-white font-medium text-xs sm:text-sm shadow-[0_0_25px_rgba(37,99,235,0.4)] backdrop-blur-md transition-all"
                >
                  <Sparkles className="w-4 h-4 text-blue-200 animate-pulse" />
                  <span>Resume Haven Scan</span>
                </motion.button>
              )}

              {/* Modals & Overlays */}
              <AnimatePresence>
                {showReview && (
                  <ReviewForm
                    key="review-modal"
                    onClose={() => setShowReview(false)}
                    onSubmitForm={handleLaunchHaven}
                    onLaunchHaven={handleLaunchHaven}
                  />
                )}
              </AnimatePresence>

              <AnimatePresence>
                {showHaven && (
                  <HavenChat
                    key="haven-modal"
                    userData={reviewPayload}
                    mode={
                      reviewPayload?.platformType === 'none'
                        ? 'newbie'
                        : 'scan'
                    }
                    onClose={() => setShowHaven(false)}
                  />
                )}
              </AnimatePresence>

              <AnimatePresence>
                {selectedService && (
                  <ServiceDetail
                    key="service-detail"
                    service={selectedService}
                    onClose={() => setSelectedService(null)}
                  />
                )}
              </AnimatePresence>
            </>
          )}
        </div>
      </UserProvider>
    </ThemeProvider>
  );
}
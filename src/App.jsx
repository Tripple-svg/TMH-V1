// src/App.jsx
import React, { useState, useEffect } from 'react';
import { AnimatePresence } from 'framer-motion';
import Header from './components/layout/Header';
import HeroSection from './components/HeroSection';
import AboutSection from './components/AboutSection';
import ServiceGrid from './components/services/ServiceGrid';
import MasterclassBanner from './components/MasterclassBanner';
import ShopSection from './components/ShopSection';
import TestimonialsSection from './components/TestimonialsSection';
import Footer from './components/layout/Footer';
import BrandReviewModal from './components/modals/BrandReviewModal';
import Preloader from './components/Preloader';
import PrivacyPolicyModal from './components/legal/PrivacyPolicyModal';
import TermsOfServiceModal from './components/legal/TermsOfServiceModal';

// Haven AI Imports
import { HavenProvider } from './components/haven/HavenContext';
import HavenDrawer from './components/haven/HavenDrawer';

export default function App() {
  const [loading, setLoading] = useState(true);
  const [showReview, setShowReview] = useState(false);
  const [showPolicy, setShowPolicy] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [userPayload, setUserPayload] = useState(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem('tmh_user_data');
      if (raw) {
        setUserPayload(JSON.parse(raw));
      }
    } catch {
      setUserPayload(null);
    }
  }, []);

  useEffect(() => {
    const isLocked = loading || showReview || showPolicy || showTerms;
    document.body.style.overflow = isLocked ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [loading, showReview, showPolicy, showTerms]);

  const handleOpenReview = () => {
    setShowReview(true);
  };

  const handleReviewSubmit = (payload) => {
    localStorage.setItem('tmh_user_data', JSON.stringify(payload));
    setUserPayload(payload);
    setShowReview(false);
  };

  return (
    <HavenProvider>
      <div className="min-h-screen overflow-x-hidden bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100 transition-colors duration-300">
        <AnimatePresence mode="wait">
          {loading && (
            <Preloader 
              key="preloader" 
              onComplete={() => setLoading(false)} 
            />
          )}
        </AnimatePresence>

        <Header
          onOpenReview={handleOpenReview}
          onOpenPolicy={() => setShowPolicy(true)}
          onOpenTerms={() => setShowTerms(true)}
        />

        <main className="relative w-full">
          <section id="hero">
            <HeroSection 
              onOpenReview={handleOpenReview} 
            />
          </section>

          <section id="about">
            <AboutSection />
          </section>

          <section id="services">
            <ServiceGrid 
              onOpenReview={handleOpenReview}
            />
          </section>

          <section id="free-class">
            <MasterclassBanner />
          </section>

          <section id="shop">
            <ShopSection />
          </section>

          <section id="testimonials">
            <TestimonialsSection />
          </section>
        </main>

        <Footer
          onOpenReview={handleOpenReview}
          onOpenPolicy={() => setShowPolicy(true)}
          onOpenTerms={() => setShowTerms(true)}
        />

        {/* Brand Review Modal */}
        <BrandReviewModal
          isOpen={showReview}
          onClose={() => setShowReview(false)}
          onSubmit={handleReviewSubmit}
        />

        {/* Privacy & Terms Modals */}
        <PrivacyPolicyModal
          isOpen={showPolicy}
          onClose={() => setShowPolicy(false)}
        />
        <TermsOfServiceModal
          isOpen={showTerms}
          onClose={() => setShowTerms(false)}
        />

        {/* Haven AI Sliding Drawer */}
        <HavenDrawer />
      </div>
    </HavenProvider>
  );
}
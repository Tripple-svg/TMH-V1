// src/App.jsx
import React, { useState, useEffect } from 'react';
import { AnimatePresence } from 'framer-motion';
import { BrowserRouter, Routes, Route } from 'react-router-dom';

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
import CookieBanner from './components/CookieBanner';
import AdminRoute from './pages/AdminRoute';

import { HavenProvider, useHaven } from './components/haven/context/HavenContext';
import HavenDrawer from './components/haven/components/HavenDrawer';

function AppInner() {
  const { openDrawer, hasExistingReview, getSavedReviewFormData } = useHaven();

  const [loading, setLoading]       = useState(true);
  const [showReview, setShowReview] = useState(false);
  const [showPolicy, setShowPolicy] = useState(false);
  const [showTerms, setShowTerms]   = useState(false);

  // Scroll lock while any modal is open
  useEffect(() => {
    const isLocked = loading || showReview || showPolicy || showTerms;
    document.body.style.overflow = isLocked ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [loading, showReview, showPolicy, showTerms]);

  // Listen for `open-legal-modal` events dispatched from the review form's
  // consent checkbox links. Detail shape: { modal: 'privacy' | 'terms' }
  useEffect(() => {
    const handler = (e) => {
      const modal = e?.detail?.modal;
      if (modal === 'privacy') setShowPolicy(true);
      if (modal === 'terms') setShowTerms(true);
    };
    window.addEventListener('open-legal-modal', handler);
    return () => window.removeEventListener('open-legal-modal', handler);
  }, []);

  // Opens the review flow.
  //  - Fresh user     → show the two-step form
  //  - Returning user → skip form, resume their existing audit session
  //                     with a fresh "welcome back" greeting
  const handleOpenReview = () => {
    if (hasExistingReview()) {
      openDrawer('audit', {
        profileData: {
          ...getSavedReviewFormData(),
          isReturningUser: true,
        },
        returning: true,
      });
    } else {
      setShowReview(true);
    }
  };

  // Called when the user completes the two-step form
  const handleReviewSubmit = (payload) => {
    setShowReview(false);

    // 300ms delay lets the modal exit animation complete before drawer slides in
    setTimeout(() => {
      openDrawer('audit', {
        profileData: {
          name:           payload.fullName || payload.name,
          brandName:      payload.brandName,
          email:          payload.email,
          whatsapp:       payload.whatsapp,
          platform:       payload.socialPlatform || null,
          handle:         payload.socialLink     || null,
          businessDomain: payload.platformType   || payload.presenceType,
          screenshot:     payload.screenshotBase64 || null,
          screenshotFileName: payload.screenshotFileName || null,
          websiteUrl:     payload.websiteUrl     || null,
          mainGoal:       payload.mainGoal       || null,
          isReturningUser: false,
          silentAccountId: payload.id            || null,
          agreedToTerms:  payload.agreedToTerms  || false,
          agreedAt:       payload.agreedAt       || null,
        },
      });
    }, 300);
  };

  return (
    <div className="min-h-screen overflow-x-hidden bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100 transition-colors duration-300">
      <AnimatePresence mode="wait">
        {loading && (
          <Preloader key="preloader" onComplete={() => setLoading(false)} />
        )}
      </AnimatePresence>

      <Header
        onOpenReview={handleOpenReview}
        onOpenPolicy={() => setShowPolicy(true)}
        onOpenTerms={() => setShowTerms(true)}
      />

      <main className="relative w-full">
        <section id="hero">
          <HeroSection onOpenReview={handleOpenReview} />
        </section>
        <section id="about">
          <AboutSection />
        </section>
        <section id="services">
          <ServiceGrid />
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

      {/* Modals */}
      <BrandReviewModal
        isOpen={showReview}
        onClose={() => setShowReview(false)}
        onSubmit={handleReviewSubmit}
      />
      <PrivacyPolicyModal
        isOpen={showPolicy}
        onClose={() => setShowPolicy(false)}
      />
      <TermsOfServiceModal
        isOpen={showTerms}
        onClose={() => setShowTerms(false)}
      />

      {/* Haven AI Drawer */}
      <HavenDrawer />

      {/* Cookie consent banner */}
      <CookieBanner />
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/admin" element={<AdminRoute />} />
        <Route
          path="*"
          element={
            <HavenProvider>
              <AppInner />
            </HavenProvider>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}
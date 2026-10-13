// src/App.jsx
import React, { useState, useEffect, useRef } from 'react';
import { AnimatePresence } from 'framer-motion';
import { BrowserRouter, Routes, Route, useNavigate } from 'react-router-dom';

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
import CookieBanner from './components/CookieBanner';
import AdminRoute from './pages/AdminRoute';
import PrivacyPage from './pages/PrivacyPage';
import TermsPage from './pages/TermsPage';

import { HavenProvider, useHaven } from './components/haven/context/HavenContext';
import HavenDrawer from './components/haven/components/HavenDrawer';
import { captureTrackingData } from './lib/trackingUtils';
import { createBrandReview } from './lib/brandReviewService';

const REVIEW_ID_KEY = 'haven_review_id';
const SESSION_ID_KEY = 'haven_session_id';

function AppInner() {
  const { openDrawer, hasExistingReview, getSavedReviewFormData } = useHaven();
  const navigate = useNavigate();

  const [loading, setLoading]       = useState(true);
  const [showReview, setShowReview] = useState(false);

  // Capture tracking data ONCE per page load — UTM, referrer, device,
  // visit count, first visit timestamp, days to convert. Read on submit.
  const trackingRef = useRef(null);

  useEffect(() => {
    try {
      trackingRef.current = captureTrackingData();
    } catch (e) {
      console.warn('Tracking capture failed:', e);
      trackingRef.current = null;
    }
  }, []);

  useEffect(() => {
    const isLocked = loading || showReview;
    document.body.style.overflow = isLocked ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [loading, showReview]);

  useEffect(() => {
    const handler = (e) => {
      const modal = e?.detail?.modal;
      if (modal === 'privacy') navigate('/privacy');
      if (modal === 'terms') navigate('/terms');
    };
    window.addEventListener('open-legal-modal', handler);
    return () => window.removeEventListener('open-legal-modal', handler);
  }, [navigate]);

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

  const handleReviewSubmit = async (payload) => {
    setShowReview(false);

    const tracking = trackingRef.current || {};

    // Task 1's real write: insert brand_reviews + haven_sessions +
    // upload screenshot to tmh-screenshots, all via the anon key.
    const { success, reviewId, sessionId, error } = await createBrandReview({
      id: payload.id,
      fullName: payload.fullName,
      brandName: payload.brandName,
      email: payload.email,
      whatsapp: payload.whatsapp,
      mainGoal: payload.mainGoal,
      platformType: payload.platformType,
      socialPlatform: payload.socialPlatform,
      socialLink: payload.socialLink,
      websiteUrl: payload.websiteUrl,
      screenshotBase64: payload.screenshotBase64,
      agreedToTerms: payload.agreedToTerms,
      agreedAt: payload.agreedAt,
      utmSource: tracking.utmSource || null,
      utmCampaign: tracking.utmCampaign || null,
      referrerUrl: tracking.referrerUrl || null,
      deviceType: tracking.deviceType || null,
      visitCount: tracking.visitCount ?? null,
      firstVisitAt: tracking.firstVisitAt || null,
      daysToConvert: tracking.daysToConvert ?? null,
      country: tracking.country || null,
      city: tracking.city || null,
    });

    if (success && reviewId && sessionId) {
      try {
        localStorage.setItem(REVIEW_ID_KEY, reviewId);
        localStorage.setItem(SESSION_ID_KEY, sessionId);
      } catch (e) {
        console.warn('Could not persist review/session ids:', e);
      }
    } else if (error) {
      console.error('Brand review write failed:', error);
    }

    // Open the drawer regardless so the user is never blocked.
    setTimeout(() => {
      openDrawer('audit', {
        profileData: {
          reviewId: reviewId || null,
          sessionId: sessionId || null,
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
          utmSource:      tracking.utmSource     || null,
          utmCampaign:    tracking.utmCampaign   || null,
          referrerUrl:    tracking.referrerUrl   || null,
          deviceType:     tracking.deviceType    || null,
          visitCount:     tracking.visitCount    ?? null,
          firstVisitAt:   tracking.firstVisitAt  || null,
          daysToConvert:  tracking.daysToConvert ?? null,
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
      />

      <BrandReviewModal
        isOpen={showReview}
        onClose={() => setShowReview(false)}
        onSubmit={handleReviewSubmit}
      />
      <HavenDrawer />

      <CookieBanner />
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/admin" element={<AdminRoute />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/terms" element={<TermsPage />} />
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

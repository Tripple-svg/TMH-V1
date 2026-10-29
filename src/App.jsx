// src/App.jsx
import { lazy, Suspense, useState, useEffect, useRef } from 'react';
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
import SiteErrorBoundary from './components/layout/SiteErrorBoundary';
import DataDeletionModal from './components/legal/DataDeletionModal';

import { HavenProvider, useHaven } from './components/haven/context/HavenContext';
import HavenDrawer from './components/haven/components/HavenDrawer';
import { captureTrackingData } from './lib/trackingUtils';
import { createBrandReview } from './lib/brandReviewService';

const REVIEW_ID_KEY = 'haven_review_id';
const SESSION_ID_KEY = 'haven_session_id';
const AdminRoute = lazy(() => import('./pages/AdminRoute'));
const PrivacyPage = lazy(() => import('./pages/PrivacyPage'));
const TermsPage = lazy(() => import('./pages/TermsPage'));
const DataDeletionConfirmPage = lazy(() => import('./pages/DataDeletionConfirmPage'));
const TeamBriefPage = lazy(() => import('./pages/TeamBriefPage'));
const AdminInvitePage = lazy(() => import('./pages/AdminInvitePage'));

function AppInner() {
  const { openDrawer, hasExistingReview, getSavedReviewFormData } = useHaven();
  const navigate = useNavigate();

  const [loading, setLoading]       = useState(true);
  const [showReview, setShowReview] = useState(false);
  const [showDataDeletion, setShowDataDeletion] = useState(false);

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

  const reviewLinkHandled = useRef(false);
  useEffect(() => {
    if (loading || reviewLinkHandled.current) return;
    const url = new URL(window.location.href);
    if (url.searchParams.get('review') !== 'continue') return;
    const timer = window.setTimeout(() => {
      reviewLinkHandled.current = true;
      url.searchParams.delete('review');
      window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
      // Navigation never restores a capability or bypasses ownership verification.
      if (hasExistingReview()) openDrawer('audit', { profileData: { ...getSavedReviewFormData(), isReturningUser: true }, returning: true });
      else openDrawer('support');
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loading, hasExistingReview, getSavedReviewFormData, openDrawer]);

  const handleReviewSubmit = async (payload) => {
    const tracking = trackingRef.current || {};

    const { success, reviewId, sessionId, accessToken, submission, error: submissionError, code: submissionCode } = await createBrandReview({
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
      screenshotFileName: payload.screenshotFileName,
      agreedToTerms: payload.agreedToTerms,
      agreedAt: payload.agreedAt,
      hcaptchaToken: payload.hcaptchaToken,
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

    if (!success || !reviewId || !sessionId || !/^[a-f\d]{64}$/i.test(accessToken || '')) {
      return { success: false, error: submissionError?.message, code: submissionCode };
    }
    try {
      localStorage.setItem(REVIEW_ID_KEY, reviewId);
      localStorage.setItem(SESSION_ID_KEY, sessionId);
    } catch { /* The current drawer can still use the returned capability. */ }
    setShowReview(false);
    const savedPayload = submission || payload;
    setTimeout(() => {
      openDrawer('audit', {
        profileData: {
          reviewId,
          sessionId,
          accessToken,
          name:           savedPayload.fullName || savedPayload.name,
          brandName:      savedPayload.brandName,
          email:          savedPayload.email,
          whatsapp:       savedPayload.whatsapp,
          platform:       savedPayload.socialPlatform || null,
          handle:         savedPayload.socialLink     || null,
          businessDomain: savedPayload.platformType   || savedPayload.presenceType,
          screenshot:     savedPayload.screenshotBase64 || null,
          screenshotFileName: savedPayload.screenshotFileName || null,
          websiteUrl:     savedPayload.websiteUrl     || null,
          mainGoal:       savedPayload.mainGoal       || null,
          isReturningUser: false,
          silentAccountId: reviewId,
          agreedToTerms:  savedPayload.agreedToTerms  || false,
          agreedAt:       savedPayload.agreedAt       || null,
          utmSource:      savedPayload.utmSource     ?? tracking.utmSource ?? null,
          utmCampaign:    savedPayload.utmCampaign   ?? tracking.utmCampaign ?? null,
          referrerUrl:    savedPayload.referrerUrl   ?? tracking.referrerUrl ?? null,
          deviceType:     savedPayload.deviceType    ?? tracking.deviceType ?? null,
          visitCount:     savedPayload.visitCount    ?? tracking.visitCount ?? null,
          firstVisitAt:   savedPayload.firstVisitAt  ?? tracking.firstVisitAt ?? null,
          daysToConvert:  savedPayload.daysToConvert ?? tracking.daysToConvert ?? null,
        },
      });
    }, 300);
    return { success: true };
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
        onOpenDataDeletion={() => setShowDataDeletion(true)}
      />

      <BrandReviewModal
        isOpen={showReview}
        onClose={() => setShowReview(false)}
        onSubmit={handleReviewSubmit}
      />
      <DataDeletionModal
        isOpen={showDataDeletion}
        onClose={() => setShowDataDeletion(false)}
      />
      <HavenDrawer />

      <CookieBanner />
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <SiteErrorBoundary>
      <Suspense fallback={<div role="status" className="flex min-h-screen items-center justify-center bg-zinc-950 text-sm text-zinc-400">Loading page…</div>}>
      <Routes>
        <Route path="/admin" element={<AdminRoute />} />
        <Route path="/admin/accept-invite" element={<AdminInvitePage />} />
        <Route path="/team-brief" element={<TeamBriefPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/terms" element={<TermsPage />} />
        <Route path="/data-deletion/confirm" element={<DataDeletionConfirmPage />} />
        <Route
          path="*"
          element={
            <HavenProvider>
              <AppInner />
            </HavenProvider>
          }
        />
      </Routes>
      </Suspense>
      </SiteErrorBoundary>
    </BrowserRouter>
  );
}

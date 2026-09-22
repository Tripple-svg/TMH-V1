import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ShieldCheck } from 'lucide-react';

export default function PrivacyPolicyModal({ isOpen, onClose }) {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 sm:p-6">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 15 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="relative w-full max-w-2xl max-h-[85vh] flex flex-col bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl z-10 text-zinc-200 overflow-hidden"
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 bg-zinc-900/50 shrink-0">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-blue-400" />
                <h3 className="text-lg font-bold text-white">Privacy Policy</h3>
              </div>
              <button
                onClick={onClose}
                className="p-1 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 text-sm leading-relaxed text-zinc-300 custom-scrollbar">
              <p className="text-xs text-zinc-500 uppercase font-semibold">Effective Date: September 2026</p>
              
              <h4 className="text-white font-semibold pt-2">1. Information We Collect</h4>
              <p>We collect information you provide directly when requesting a brand review or interacting with Haven AI, including: full name, email address, WhatsApp number, brand name, social media handles or website URLs, and screenshots of your digital presence. We also collect automatically: device type, approximate location (country and city via IP), visit count and first visit timestamp, traffic source (UTM parameters), and how you interact with Haven conversations.</p>

              <h4 className="text-white font-semibold pt-2">2. How We Use Your Information</h4>
              <p>Your data is used to: conduct brand diagnostic reviews via Haven AI, deliver personalised marketing strategy recommendations, send confirmation emails for strategy calls booked through our platform, improve Haven&apos;s diagnostic accuracy, and contact you with strategic follow-up relevant to your review. We do not sell or share your personal information with third parties for advertising purposes.</p>

              <h4 className="text-white font-semibold pt-2">3. Cookie Usage</h4>
              <p>We use a cookie consent mechanism on this website. If you accept, we store a small identifier in your browser to track your visit count and session preferences. If you decline, no tracking cookies are stored. You can revoke consent at any time by clearing your browser&apos;s local storage for this site.</p>

              <h4 className="text-white font-semibold pt-2">4. Data Storage</h4>
              <p>Your information is stored securely in our Supabase database hosted on servers in the European Union. Screenshots you upload are stored in private cloud storage and are never publicly accessible. Only The Marketing Haven team can view your submitted information via our internal admin dashboard.</p>

              <h4 className="text-white font-semibold pt-2">5. Data Retention</h4>
              <p>We retain your information for as long as necessary to deliver services and follow up on your brand review. You may request deletion of your data at any time by contacting us at info@themarketinghaven.xyz.</p>

              <h4 className="text-white font-semibold pt-2">6. Your Rights</h4>
              <p>You have the right to request access to, correction of, or deletion of your personal data. Contact: info@themarketinghaven.xyz</p>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

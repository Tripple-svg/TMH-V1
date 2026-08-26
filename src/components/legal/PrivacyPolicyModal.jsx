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
              <p className="text-xs text-zinc-500 uppercase font-semibold">Effective Date: August 2026</p>
              
              <h4 className="text-white font-semibold pt-2">1. Information Collection</h4>
              <p>We collect essential information provided directly by users when interacting with The Marketing Haven platforms, including contact details submitted for brand reviews, class registrations, or service inquiries.</p>

              <h4 className="text-white font-semibold pt-2">2. How Information Is Used</h4>
              <p>Collected data is used to conduct brand evaluations, deliver requested educational content, process transactions securely via Paystack, and deliver direct strategic support via Haven AI or WhatsApp communication.</p>

              <h4 className="text-white font-semibold pt-2">3. Storage & Security</h4>
              <p>Your privacy is strictly guarded. We do not sell or transfer your personal or brand performance metrics to third parties. Local session data stored on your client environment remains under your local browser domain.</p>

              <h4 className="text-white font-semibold pt-2">4. Communications</h4>
              <p>By requesting an audit or interacting with Haven, you permit our team to reach out with tailored transformation roadmaps or requested consultation updates.</p>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
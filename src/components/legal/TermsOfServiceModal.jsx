import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, FileText } from 'lucide-react';

export default function TermsOfServiceModal({ isOpen, onClose }) {
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
                <FileText className="w-5 h-5 text-blue-400" />
                <h3 className="text-lg font-bold text-white">Terms of Service</h3>
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
              
              <h4 className="text-white font-semibold pt-2">1. Services Provided</h4>
              <p>The Marketing Haven provides digital marketing strategy, brand diagnostics via Haven AI, educational products including The Unseen Playbook, and paid agency services. By using this website or Haven AI, you agree to these terms.</p>

              <h4 className="text-white font-semibold pt-2">2. Free Brand Review</h4>
              <p>The free brand review is provided at no cost. Haven AI will conduct a diagnostic conversation and provide strategic recommendations. Results depend on the accuracy of information you provide. The review is not a guarantee of specific business outcomes.</p>

              <h4 className="text-white font-semibold pt-2">3. Intellectual Property</h4>
              <p>All content on this website, including Haven AI&apos;s responses, The Unseen Playbook framework, brand assets, and code, is the intellectual property of The Marketing Haven. Reproduction without written permission is prohibited.</p>

              <h4 className="text-white font-semibold pt-2">4. Paid Products and Services</h4>
              <p>Purchases of The Unseen Playbook or agency service packages grant you a personal, non-transferable licence to use the purchased content. Digital products are non-refundable after download unless a defect exists. Agency service agreements are governed by separate contracts issued at time of engagement.</p>

              <h4 className="text-white font-semibold pt-2">5. Strategy Call Bookings</h4>
              <p>Strategy calls are provided free of charge. TMH reserves the right to cancel or reschedule calls with reasonable notice. Repeated no-shows may result in restricted booking access.</p>

              <h4 className="text-white font-semibold pt-2">6. Limitation of Liability</h4>
              <p>The Marketing Haven is not liable for business outcomes resulting from acting on Haven AI recommendations. All strategic advice is provided for informational purposes and should be applied using your own professional judgement.</p>

              <h4 className="text-white font-semibold pt-2">7. Contact</h4>
              <p>For any questions regarding these terms: info@themarketinghaven.xyz</p>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

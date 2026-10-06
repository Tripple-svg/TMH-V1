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
              <p className="text-xs text-zinc-500 uppercase font-semibold">
                Effective Date: September 2026
              </p>

              <p>
                These Terms of Service govern your use of this website and the services offered by The Marketing Haven ("TMH", "we", "our"). By using this website or interacting with Haven AI, you agree to these terms. If you do not agree, please do not use the site.
              </p>

              <h4 className="text-white font-semibold pt-2">1. Who We Are</h4>
              <p>
                The Marketing Haven is a digital marketing agency based in Nigeria. We operate as part of a larger organization structure and enter into all agreements through The Marketing Haven as the contracting entity. Contact: info@themarketinghaven.xyz.
              </p>

              <h4 className="text-white font-semibold pt-2">2. Services We Provide</h4>
              <p>The Marketing Haven offers:</p>
              <ul className="list-disc list-inside space-y-1 text-zinc-300 ml-1">
                <li>Free brand diagnostic reviews through Haven AI</li>
                <li>Free 25 minute strategy calls booked through Calendly</li>
                <li>The Unseen Playbook, a paid digital product</li>
                <li>Paid agency services including website builds, landing pages, VSL funnels, ad copywriting, content strategy, brand positioning, marketing consultancy, paid ads, and branding</li>
              </ul>

              <h4 className="text-white font-semibold pt-2">3. Free Brand Review</h4>
              <p>
                The free brand review is provided at no cost. Haven AI conducts a conversational diagnostic and offers strategic direction based on the information you provide. Results depend on the accuracy of your inputs. The review is not a guarantee of any specific business outcome and is not a substitute for a professional consulting engagement.
              </p>

              <h4 className="text-white font-semibold pt-2">4. Artificial Intelligence Disclosure</h4>
              <p>
                Haven AI is an artificial intelligence system. It may occasionally produce responses that are incomplete, inaccurate, or not suitable for your specific situation. You should apply your own judgement before acting on anything Haven says. When Haven recommends a strategy call, we encourage you to take it, since a human conversation is often the right next step for anything complex.
              </p>

              <h4 className="text-white font-semibold pt-2">5. The Unseen Playbook</h4>
              <p>
                The Unseen Playbook is a digital product delivered as a PDF. When you purchase it, you receive a personal licence to read and use the material for your own business or personal development. This licence may not be transferred, resold, shared publicly, or used to create derivative products. All content remains the intellectual property of The Marketing Haven.
              </p>

              <h4 className="text-white font-semibold pt-2">6. Refund Policy</h4>
              <p>
                All purchases of The Unseen Playbook are final. Because the product is delivered digitally and made available for download immediately upon payment confirmation, we do not offer refunds once a purchase has been completed and the download has been accessed.
              </p>
              <p>
                If you experience a genuine technical problem with your download, or you believe you were charged in error, contact us at info@themarketinghaven.xyz. We will investigate and resolve legitimate issues. This does not extend to a general right of return on a completed digital purchase.
              </p>

              <h4 className="text-white font-semibold pt-2">7. Payments and Pricing</h4>
              <p>
                Payments for The Unseen Playbook are processed by Paystack. We do not receive or store your card details. By making a payment, you agree to Paystack's own terms of service. The price shown at checkout is the price charged.
              </p>
              <p>
                <span className="text-white">No discounts and no haggling.</span> The listed price is the price. We do not offer discounts, coupon codes, or price reductions through chat, direct message, or negotiation on any platform. Any exception to this, if one is ever offered, will be published clearly on this website in advance and will apply equally to all buyers. Anyone claiming to offer a discount on our behalf is not authorized to do so.
              </p>

              <h4 className="text-white font-semibold pt-2">8. Strategy Call Bookings</h4>
              <p>
                Strategy calls are free and run for 25 minutes. We reserve the right to reschedule or cancel a call with reasonable notice. Repeatedly missing scheduled calls without notice may result in restricted booking access. Booking is handled by Calendly, and their own terms apply to the scheduling process.
              </p>

              <h4 className="text-white font-semibold pt-2">9. Paid Agency Services</h4>
              <p>
                Paid services such as website builds, funnels, ad copywriting, and branding are governed by separate written agreements issued at the time of engagement. Those agreements define the scope of work, deliverables, timelines, and payment terms. These Terms of Service do not override any provision in a signed service agreement.
              </p>

              <h4 className="text-white font-semibold pt-2">10. Intellectual Property</h4>
              <p>
                All content on this website, including Haven AI's responses, The Unseen Playbook, brand assets, copy, design, code, and framework, is the intellectual property of The Marketing Haven. You may not reproduce, distribute, or create derivative works without written permission, except where the law allows for personal, non commercial use.
              </p>

              <h4 className="text-white font-semibold pt-2">11. Acceptable Use</h4>
              <p>
                You agree not to misuse this website. This includes not attempting to break into our systems, not uploading malicious files, not using Haven AI to generate content that is illegal or harmful, and not impersonating anyone else. We reserve the right to restrict access if we detect misuse.
              </p>

              <h4 className="text-white font-semibold pt-2">12. Limitation of Liability</h4>
              <p>
                The Marketing Haven is not liable for any business outcomes that result from acting on recommendations from Haven AI or from any free strategy call. All guidance is provided for informational purposes. You are responsible for your own business decisions. To the fullest extent permitted by law, our total liability for any claim related to this website or its services is limited to the amount you paid us, if any, for the specific service in question.
              </p>

              <h4 className="text-white font-semibold pt-2">13. Third Party Links and Services</h4>
              <p>
                This website links to and integrates with services we do not own, including Calendly, Paystack, and TikTok. We are not responsible for the content, policies, or practices of those services. When you use them, their own terms apply.
              </p>

              <h4 className="text-white font-semibold pt-2">14. Changes to These Terms</h4>
              <p>
                We may update these terms from time to time. When we do, we will change the effective date at the top of this page. Continued use of the site after an update means you accept the updated terms.
              </p>

              <h4 className="text-white font-semibold pt-2">15. Governing Law</h4>
              <p>
                These terms are governed by the laws of the Federal Republic of Nigeria. Any dispute arising from the use of this website or its services will be subject to the jurisdiction of Nigerian courts.
              </p>

              <h4 className="text-white font-semibold pt-2">16. Contact</h4>
              <p>
                The Marketing Haven<br />
                Email: info@themarketinghaven.xyz<br />
                Website: themarketinghaven.xyz
              </p>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
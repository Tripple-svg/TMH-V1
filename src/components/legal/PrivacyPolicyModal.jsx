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
              <p className="text-xs text-zinc-500 uppercase font-semibold">
                Effective Date: September 2026
              </p>

              <p>
                The Marketing Haven ("TMH", "we", "our") operates this website, Haven AI, and the services offered here. This policy explains what information we collect, why we collect it, how we store it, and the control you have over it. By using this website, you agree to this policy.
              </p>

              <h4 className="text-white font-semibold pt-2">1. Who We Are</h4>
              <p>
                The Marketing Haven is a digital marketing agency based in Nigeria. We operate as part of a larger organization structure. For the purposes of this policy, The Marketing Haven is the entity responsible for the personal data you submit through this website. You can contact us at info@themarketinghaven.xyz for any privacy concern.
              </p>

              <h4 className="text-white font-semibold pt-2">2. Information We Collect</h4>
              <p>We collect the following categories of information:</p>
              <p>
                <span className="text-white">Information you provide directly:</span> your full name, email address, phone number or WhatsApp number, brand or business name, website URL, social media handles, screenshots you upload, and any messages you send to Haven AI or through the brand review form.
              </p>
              <p>
                <span className="text-white">Information collected automatically:</span> device type and browser, approximate location (country and city derived from IP address), number of visits, first visit timestamp, traffic source (such as UTM parameters), referring website, and how you interact with Haven AI during a conversation.
              </p>
              <p>
                <span className="text-white">Information from payments:</span> when you purchase The Unseen Playbook, our payment partner Paystack processes the transaction. We receive a payment reference and the email you entered. We do not receive or store your card details. Paystack handles those directly and stores them under their own security standards.
              </p>

              <h4 className="text-white font-semibold pt-2">3. How We Use Your Information</h4>
              <p>Your information is used to:</p>
              <ul className="list-disc list-inside space-y-1 text-zinc-300 ml-1">
                <li>Run your brand diagnostic review through Haven AI</li>
                <li>Generate tailored strategic recommendations for your brand</li>
                <li>Deliver products you have paid for, including The Unseen Playbook</li>
                <li>Send you a payment receipt through Paystack</li>
                <li>Send you a welcome or confirmation email when we have that system live</li>
                <li>Prepare for strategy calls you have booked</li>
                <li>Improve the accuracy and usefulness of Haven AI over time</li>
                <li>Contact you with follow-up information relevant to your review</li>
              </ul>
              <p>
                We do not sell your personal information. We do not share it with advertising networks.
              </p>

              <h4 className="text-white font-semibold pt-2">4. Artificial Intelligence Processing</h4>
              <p>
                Haven AI runs on Google's Gemini models, with a fallback model provided by Groq. When you chat with Haven, your messages are sent to these services for processing. Your website and social media content may also be sent to these services when you request a brand review or upload a screenshot. We do not use your conversations to train public models. Google and Groq process this data under their own terms as service providers.
              </p>

              <h4 className="text-white font-semibold pt-2">5. Service Providers We Work With</h4>
              <p>
                To operate this website we rely on the following third parties, each of which may process parts of your data:
              </p>
              <ul className="list-disc list-inside space-y-1 text-zinc-300 ml-1">
                <li><span className="text-white">Supabase:</span> database, file storage, and backend functions. Servers are located in the European Union.</li>
                <li><span className="text-white">Paystack:</span> payment processing and receipts for The Unseen Playbook.</li>
                <li><span className="text-white">Google (Gemini):</span> artificial intelligence processing for Haven and brand review scoring.</li>
                <li><span className="text-white">Groq:</span> fallback AI processing when the primary model is unavailable.</li>
                <li><span className="text-white">Jina AI:</span> reads your website URL when you request a website brand review.</li>
                <li><span className="text-white">Calendly:</span> handles bookings for free strategy calls.</li>
                <li><span className="text-white">Resend:</span> sends transactional emails when that system is live.</li>
                <li><span className="text-white">Netlify:</span> hosts this website.</li>
              </ul>
              <p>
                Each of these providers is bound by their own privacy and security commitments. We choose providers that meet reasonable industry standards for data protection.
              </p>

              <h4 className="text-white font-semibold pt-2">6. Cookies and Local Storage</h4>
              <p>
                We use browser cookies and local storage to run this website. Specifically:
              </p>
              <ul className="list-disc list-inside space-y-1 text-zinc-300 ml-1">
                <li>A consent flag that remembers whether you have accepted or declined cookie use</li>
                <li>A session identifier to keep track of your visit count and preferences</li>
                <li>Haven AI conversation history so that you can return to an in-progress chat</li>
                <li>Purchase status for The Unseen Playbook so that you are not asked to pay twice</li>
              </ul>
              <p>
                If you decline cookie consent, we do not store tracking cookies. Essential local storage items (such as purchase status and chat history) remain so that the website functions correctly. You can clear all local storage at any time through your browser settings.
              </p>

              <h4 className="text-white font-semibold pt-2">7. Data Storage and Security</h4>
              <p>
                Data is stored in Supabase with row level security enabled. Screenshots you upload are stored in a private storage bucket that only The Marketing Haven team can access. Payment card details never reach our servers. We use encrypted connections throughout the site.
              </p>

              <h4 className="text-white font-semibold pt-2">8. Data Retention</h4>
              <p>
                We keep your information for as long as it is needed to deliver the service you requested and to follow up on your brand review. If you ask us to delete your data, we will do so within a reasonable time, except where we are required to retain records for legal, tax, or accounting purposes.
              </p>

              <h4 className="text-white font-semibold pt-2">9. Your Rights</h4>
              <p>
                Under the Nigeria Data Protection Regulation (NDPR) and applicable law, you have the right to:
              </p>
              <ul className="list-disc list-inside space-y-1 text-zinc-300 ml-1">
                <li>Request a copy of the personal data we hold about you</li>
                <li>Ask us to correct information that is inaccurate</li>
                <li>Ask us to delete your information</li>
                <li>Object to certain uses of your information</li>
                <li>Withdraw consent for cookies by clearing your browser storage</li>
              </ul>
              <p>
                To exercise any of these rights, email us at info@themarketinghaven.xyz. We will respond as soon as we can.
              </p>

              <h4 className="text-white font-semibold pt-2">10. Children</h4>
              <p>
                This website and its services are intended for business owners and professionals. We do not knowingly collect data from anyone under 18. If you believe a minor has submitted information, contact us and we will remove it.
              </p>

              <h4 className="text-white font-semibold pt-2">11. Changes to This Policy</h4>
              <p>
                We may update this policy from time to time. When we do, we will change the effective date at the top. Material changes will be reflected on this page. Continued use of the site after an update means you accept the updated policy.
              </p>

              <h4 className="text-white font-semibold pt-2">12. Contact</h4>
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
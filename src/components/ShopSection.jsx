import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BookOpen, CheckCircle2, ArrowRight, X, ShieldCheck, Zap,
  Download,
} from 'lucide-react';
import ConfirmModal from './ui/ConfirmModal';

const PAYSTACK_PUBLIC_KEY = 'pk_live_bb9d07c83cbd8bc94ee9c7fb5fb95e14a35fa93b';
const PAYSTACK_AMOUNT_KOBO = 10000; // ₦100 test — revert to 963900 before launch

const PLAYBOOK_DOWNLOAD_PATH = '/The_Unseen_Playbook!.pdf';
const PLAYBOOK_FILENAME      = 'The_Unseen_Playbook.pdf';
const PURCHASE_STORAGE_KEY   = 'tmh_playbook_purchase';

const features = [
  'Stop guessing with marketing and build deep audience clarity',
  'Master the strategy filter: learn what to say no to',
  'Uncover the hidden drivers of influence and real consumer decisions',
  'Shift from knowing to doing with the TMH execution framework',
];

const playbookModules = [
  { title: "Chapter 1-3: The Setup & Strategy", desc: "Expose marketing's biggest lies, navigate the illusion of more, and use strategy as a ruthless filter." },
  { title: "Chapter 4-6: The Execution Engine", desc: "Discover the hidden drivers of influence, shift from knowing to doing, and realize why the brand is you." },
  { title: "Chapter 7-8: The Final Plays", desc: "Overcome everyday brand roadblocks and execute your unseen playbook step-by-step." },
  { title: "Chapter 9: The Wrap Up & Action Plan", desc: "Execute your immediate 24-hour action plan to turn attention into real conversions." },
];

export default function ShopSection() {
  const [isPreviewOpen, setIsPreviewOpen]       = useState(false);
  const [email, setEmail]                       = useState('');
  const [loading, setLoading]                   = useState(false);
  const [paymentSuccess, setPaymentSuccess]     = useState(false);
  const [paymentReference, setPaymentReference] = useState('');
  const [deliveryContact, setDeliveryContact]   = useState('');
  const [alreadyDownloaded, setAlreadyDownloaded] = useState(false);

  const [alertState, setAlertState]             = useState(null);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  const paystackHandlerRef = useRef(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(PURCHASE_STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (data?.reference) {
        setPaymentReference(data.reference);
        setDeliveryContact(data.email || '');
        setPaymentSuccess(true);
        setAlreadyDownloaded(Boolean(data.downloadedAt));
      }
    } catch {}
  }, []);

  useEffect(() => {
    const handler = () => setIsPreviewOpen(true);
    window.addEventListener('open-playbook-modal', handler);
    return () => window.removeEventListener('open-playbook-modal', handler);
  }, []);

  useEffect(() => {
    if (!isPreviewOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isPreviewOpen]);

  const loadPaystackScript = () => {
    return new Promise((resolve) => {
      if (window.PaystackPop) {
        resolve(true);
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://js.paystack.co/v1/inline.js';
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  };

  const persistPurchase = (ref, mail, downloadedAt = null) => {
    try {
      localStorage.setItem(
        PURCHASE_STORAGE_KEY,
        JSON.stringify({
          reference: ref,
          email: mail,
          paidAt: new Date().toISOString(),
          downloadedAt,
        })
      );
    } catch {}
  };

  const handlePaystackCheckout = async (e) => {
    if (e) e.preventDefault();

    const trimmed = email.trim();

    // Empty email → distinct message
    if (!trimmed) {
      setLoading(false);
      setAlertState({
        title: 'Email required',
        message: 'Please enter your email address to continue to payment.',
        variant: 'default',
        confirmText: 'Got it',
      });
      return;
    }

    // Invalid format → distinct message
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
    if (!emailOk) {
      setLoading(false);
      setAlertState({
        title: 'Check your email',
        message: "That email doesn't look right. Double-check it and try again.",
        variant: 'default',
        confirmText: 'Got it',
      });
      return;
    }

    setLoading(true);
    const scriptLoaded = await loadPaystackScript();

    if (!scriptLoaded) {
      setLoading(false);
      setAlertState({
        title: 'Connection problem',
        message: 'We could not load the payment system. Check your internet connection and try again.',
        variant: 'danger',
        confirmText: 'Retry',
      });
      return;
    }

    const handler = window.PaystackPop.setup({
      key: PAYSTACK_PUBLIC_KEY,
      email: trimmed,
      amount: PAYSTACK_AMOUNT_KOBO,
      currency: 'NGN',
      ref: 'UNSEEN_' + Math.floor(Math.random() * 1000000000 + 1),
      metadata: {
        custom_fields: [
          {
            display_name: "Product Name",
            variable_name: "product_name",
            value: "The Unseen Playbook",
          },
        ],
      },
      callback: function (response) {
        const ref = response.reference || '';
        setLoading(false);
        setPaymentReference(ref);
        setDeliveryContact(trimmed);
        setPaymentSuccess(true);
        setAlreadyDownloaded(false);
        persistPurchase(ref, trimmed, null);
        setEmail('');
        paystackHandlerRef.current = null;
      },
      onClose: function () {
        setLoading(false);
        setShowCancelConfirm(true);
        paystackHandlerRef.current = handler;
      },
    });

    paystackHandlerRef.current = handler;
    handler.openIframe();
  };

  const handleConfirmCancelPayment = () => {
    setShowCancelConfirm(false);
    paystackHandlerRef.current = null;
  };

  const handleDeclineCancelPayment = () => {
    setShowCancelConfirm(false);
    const h = paystackHandlerRef.current;
    if (h) {
      h.openIframe();
    }
  };

  const handleDownloadPlaybook = () => {
    if (alreadyDownloaded) return;

    const a = document.createElement('a');
    a.href = PLAYBOOK_DOWNLOAD_PATH;
    a.download = PLAYBOOK_FILENAME;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    setAlreadyDownloaded(true);
    persistPurchase(paymentReference, deliveryContact, new Date().toISOString());
  };

  const handleCloseModal = () => {
    setIsPreviewOpen(false);
    setTimeout(() => {
      const hasPurchase = (() => {
        try {
          return Boolean(localStorage.getItem(PURCHASE_STORAGE_KEY));
        } catch {
          return false;
        }
      })();

      if (!hasPurchase) {
        setPaymentSuccess(false);
        setPaymentReference('');
        setDeliveryContact('');
        setAlreadyDownloaded(false);
      }
    }, 300);
  };

  return (
    <section
      id="shop"
      className="relative w-full py-24 sm:py-32 px-4 sm:px-6 lg:px-8 bg-white text-zinc-900 dark:bg-zinc-950 dark:text-white transition-colors duration-300"
    >
      <div className="absolute top-0 left-0 right-0 h-32 pointer-events-none bg-gradient-to-b from-zinc-100 to-transparent dark:from-zinc-900 dark:to-transparent transition-colors duration-300" />

      <div className="max-w-5xl mx-auto relative z-10">
        <motion.div
          className="text-center mb-12"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight mb-4 text-zinc-900 dark:text-white">
            Digital Products
          </h2>
          <p className="max-w-2xl mx-auto text-sm sm:text-base text-zinc-600 dark:text-zinc-400">
            Tools and templates built by strategists, for strategists.
          </p>
        </motion.div>

        <motion.div
          className="relative rounded-2xl sm:rounded-3xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 backdrop-blur-sm shadow-xl dark:shadow-none overflow-hidden transition-colors duration-300"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <div className="grid grid-cols-1 md:grid-cols-2">
            <div className="relative aspect-square md:aspect-auto flex items-center justify-center p-8 bg-gradient-to-br from-blue-50 via-zinc-100 to-blue-100/50 dark:from-blue-950/40 dark:via-zinc-900 dark:to-black transition-colors duration-300">
              <div className="relative w-48 h-64 sm:w-56 sm:h-72 rounded-lg shadow-2xl transform rotate-[-2deg] hover:rotate-0 transition-transform duration-500 overflow-hidden">
                <img
                  src="/Playbook.jpeg"
                  alt="The Unseen Playbook"
                  className="w-full h-full object-cover rounded-lg"
                />
              </div>
            </div>

            <div className="p-8 sm:p-10 flex flex-col justify-center">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider w-fit mb-4 bg-zinc-100 border border-zinc-200 text-zinc-700 dark:bg-white/5 dark:border-white/10 dark:text-zinc-300">
                Featured Playbook
              </div>

              <h3 className="text-2xl sm:text-3xl font-bold mb-2 text-zinc-900 dark:text-white">
                The Unseen Playbook
              </h3>

              <p className="text-sm mb-6 font-medium text-zinc-500 dark:text-zinc-400">
                How Marketing Really Works
              </p>

              <ul className="space-y-3 mb-8">
                {features.map((f, i) => (
                  <li key={i} className="flex items-start gap-3 text-sm text-zinc-700 dark:text-zinc-300">
                    <CheckCircle2 className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>

              <button
                onClick={() => setIsPreviewOpen(true)}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-3.5 rounded-xl bg-blue-600 text-white font-semibold text-sm hover:bg-blue-500 hover:shadow-lg hover:shadow-blue-600/25 transition-all active:scale-95"
              >
                Get The Unseen Playbook <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </motion.div>
      </div>

      <AnimatePresence>
        {isPreviewOpen && (
          <motion.div
            className="fixed inset-0 z-[70] flex items-center justify-center p-4 sm:p-6 overflow-y-auto overscroll-contain"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div
              className="fixed inset-0 bg-black/80 backdrop-blur-md"
              onClick={handleCloseModal}
            />

            <motion.div
              className="relative w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white shadow-2xl overflow-hidden my-auto z-10 transition-colors duration-300"
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
            >
              <div className="flex items-center justify-between p-6 border-b border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-white/5">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center border ${
                      paymentSuccess
                        ? 'bg-zinc-100 dark:bg-white/5 border-zinc-200 dark:border-white/10'
                        : 'bg-blue-100 dark:bg-blue-600/20 border-blue-200 dark:border-blue-500/30'
                    }`}
                  >
                    {paymentSuccess ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                    ) : (
                      <BookOpen className="w-5 h-5 text-blue-600" />
                    )}
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-zinc-900 dark:text-white">
                      {paymentSuccess ? "You're In." : 'The Unseen Playbook'}
                    </h3>
                    <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                      {paymentSuccess
                        ? (alreadyDownloaded ? 'Download Delivered' : 'Payment Confirmed')
                        : 'Digital Blueprint & Strategy Guide'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleCloseModal}
                  className="w-9 h-9 rounded-full border border-zinc-200 dark:border-white/10 bg-zinc-100 dark:bg-white/5 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white flex items-center justify-center transition-all"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {paymentSuccess ? (
                <div className="p-6 sm:p-8 overflow-y-auto overscroll-contain space-y-6 text-center">
                  <motion.div
                    initial={{ scale: 0.6, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: 'spring', stiffness: 260, damping: 18 }}
                    className="w-20 h-20 mx-auto rounded-full flex items-center justify-center bg-emerald-100 dark:bg-emerald-500/15 border border-emerald-200 dark:border-emerald-500/30"
                  >
                    <CheckCircle2 className="w-10 h-10 text-emerald-600 dark:text-emerald-400" />
                  </motion.div>

                  <div className="space-y-2">
                    <h4 className="text-xl sm:text-2xl font-bold text-zinc-900 dark:text-white">
                      Payment Successful
                    </h4>
                    <p className="text-sm text-zinc-600 dark:text-zinc-400 max-w-md mx-auto leading-relaxed">
                      Thank you for grabbing The Unseen Playbook. Your copy is ready. Click below to download it straight to your device.
                    </p>
                  </div>

                  <div className="flex flex-col items-center gap-3 p-4 rounded-xl border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-white/5 text-xs">
                    <div className="flex items-center gap-2 text-zinc-600 dark:text-zinc-400">
                      <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                      <span>Reference:</span>
                      <span className="font-mono font-semibold text-zinc-900 dark:text-white">
                        {paymentReference || '—'}
                      </span>
                    </div>
                    {deliveryContact && (
                      <div className="text-[11px] text-zinc-500 dark:text-zinc-500">
                        Receipt sent to <span className="font-medium text-zinc-700 dark:text-zinc-300">{deliveryContact}</span>
                      </div>
                    )}
                  </div>

                  {alreadyDownloaded ? (
                    <div className="w-full inline-flex items-center justify-center gap-3 px-8 py-4 rounded-xl bg-zinc-200 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 font-semibold text-base cursor-not-allowed select-none border border-zinc-300 dark:border-zinc-700">
                      <Download className="w-5 h-5" />
                      Download Completed
                    </div>
                  ) : (
                    <button
                      onClick={handleDownloadPlaybook}
                      className="w-full inline-flex items-center justify-center gap-3 px-8 py-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-base transition-all shadow-lg shadow-emerald-600/25 active:scale-[0.98]"
                    >
                      <Download className="w-5 h-5" />
                      Download The Unseen Playbook
                    </button>
                  )}

                  <div className="pt-6 mt-2 border-t border-zinc-200 dark:border-white/10 text-left">
                    <div className="flex items-center gap-2">
                      <span className="block w-5 h-px bg-blue-500" />
                      <span className="text-[10px] font-mono uppercase tracking-[0.28em] text-zinc-500 dark:text-zinc-500">
                        A Note From Us
                      </span>
                    </div>
                    <p className="mt-4 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
                      Congratulations on your copy. Enjoy the read. And if you need any clarity or help applying anything, reach out to us anytime. We are here.
                    </p>
                  </div>

                  <button
                    onClick={handleCloseModal}
                    className="w-full px-4 py-3 rounded-xl text-sm font-semibold text-white bg-emerald-700 hover:bg-emerald-600 transition-all active:scale-[0.98] shadow-md shadow-emerald-700/20"
                  >
                    Close
                  </button>
                </div>
              ) : (
                <>
                  <div className="p-6 sm:p-8 overflow-y-auto overscroll-contain space-y-6">
                    <div>
                      <h4 className="text-base font-semibold mb-2 text-zinc-900 dark:text-white">
                        What's Inside The Playbook?
                      </h4>
                      <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
                        Remove the fluff and noise. This playbook gives founders, creators, and marketers the exact lenses needed to stop guessing and build systems with absolute clarity.
                      </p>
                    </div>

                    <div className="space-y-3">
                      {playbookModules.map((m, idx) => (
                        <div
                          key={idx}
                          className="p-4 rounded-xl border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-white/5"
                        >
                          <div className="flex items-center gap-2 text-sm font-semibold text-blue-600 mb-1">
                            <Zap className="w-4 h-4" />
                            {m.title}
                          </div>
                          <p className="text-xs leading-relaxed text-zinc-600 dark:text-zinc-300">
                            {m.desc}
                          </p>
                        </div>
                      ))}
                    </div>

                    <form id="paystack-form" onSubmit={handlePaystackCheckout} className="space-y-3 pt-2">
                      <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
                        Email for your receipt *
                      </label>
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="your@email.com"
                        className="w-full px-4 py-3 rounded-xl border border-zinc-300 dark:border-white/10 bg-zinc-50 dark:bg-white/5 text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-500 focus:outline-none focus:border-blue-600 transition-colors"
                      />
                      <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                        Your receipt will be sent here. Your download starts the moment payment confirms.
                      </p>
                    </form>

                    <div className="flex items-center gap-3 p-4 rounded-xl border border-emerald-200 dark:border-emerald-500/20 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-800 dark:text-emerald-400 text-xs">
                      <ShieldCheck className="w-5 h-5 shrink-0 text-emerald-600" />
                      <span>Instant download. Easy access after payment.</span>
                    </div>
                  </div>

                  <div className="p-6 border-t border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-white/5 flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div>
                      <span className="text-xs uppercase tracking-wider block text-zinc-500 dark:text-zinc-400">
                        Total Investment
                      </span>
                      <div className="flex items-baseline gap-2">
                        <span className="text-2xl font-bold text-zinc-900 dark:text-white">₦9,639</span>
                        <span className="text-xs text-zinc-400 line-through">₦15,000</span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={handlePaystackCheckout}
                      disabled={loading}
                      className="w-full sm:w-auto px-8 py-3.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-sm transition-all shadow-lg shadow-blue-600/30 active:scale-95 flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      {loading ? 'Opening Checkout...' : 'Confirm & Pay via Paystack'}
                    </button>
                  </div>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <ConfirmModal
        isOpen={Boolean(alertState)}
        onClose={() => setAlertState(null)}
        title={alertState?.title || ''}
        message={alertState?.message || ''}
        confirmText={alertState?.confirmText || 'OK'}
        variant={alertState?.variant || 'default'}
        mode="alert"
      />

      <ConfirmModal
        isOpen={showCancelConfirm}
        onClose={handleDeclineCancelPayment}
        onConfirm={handleConfirmCancelPayment}
        title="Cancel payment?"
        message="Your payment has not gone through. If you change your mind, you can start over any time."
        confirmText="Yes, cancel"
        cancelText="No, continue"
        variant="danger"
        mode="confirm"
      />
    </section>
  );
}
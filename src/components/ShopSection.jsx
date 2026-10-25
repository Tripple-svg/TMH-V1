import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import {
  BookOpen, CheckCircle2, ArrowRight, X, ShieldCheck,
  Download,
} from 'lucide-react';
import ConfirmModal from './ui/ConfirmModal';
import { supabase } from '../lib/supabase';

const PAYSTACK_PUBLIC_KEY = 'pk_live_bb9d07c83cbd8bc94ee9c7fb5fb95e14a35fa93b';
const PAYSTACK_AMOUNT_KOBO = 10000; // ₦100 test — revert to 963900 before launch

const PLAYBOOK_FILENAME      = 'The_Unseen_Playbook.pdf';
const PURCHASE_STORAGE_KEY   = 'tmh_playbook_purchase';
const PAYMENT_TIMEOUT_MS     = 90 * 1000; // 90s — reset if Paystack goes silent

const features = [
  'Understand why people ask your price, then disappear',
  'Explain what your product changes for the person buying it',
  'Build trust with proof, not louder promises or more posts',
  'Leave with one product and a practical 24-hour action plan',
];

const playbookModules = [
  { title: 'Chapters 1–3 · Find your direction', desc: 'The Unseen Path, The Illusion of More, and Strategy Is a Filter. Understand why attention is not a sale and choose what deserves your effort.' },
  { title: 'Chapters 4–6 · Give people a reason to choose you', desc: 'The Hidden Drivers of Influence, The Shift From Knowing to Doing, and The Brand Is You. Connect your offer to a real need, show proof, and make buying easier.' },
  { title: 'Chapters 7–8 · Work through the sticking points', desc: 'Making It Real and Your Unseen Playbook. Tackle posts that get likes without orders, connect helpful content to your offer, and adjust what is already there.' },
  { title: 'Chapter 9 · Make your next move', desc: 'The Wrap Up & 24-Hour Action Plan. Start with one product, one buyer problem, and a focused post you can put into practice.' },
];

export default function ShopSection() {
  const reduceMotion = useReducedMotion();
  const [isPreviewOpen, setIsPreviewOpen]       = useState(false);
  const [email, setEmail]                       = useState('');
  const [loading, setLoading]                   = useState(false);
  const [paymentSuccess, setPaymentSuccess]     = useState(false);
  const [paymentReference, setPaymentReference] = useState('');
  const [deliveryContact, setDeliveryContact]   = useState('');
  const [alreadyDownloaded, setAlreadyDownloaded] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [verificationError, setVerificationError] = useState('');
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [recoveryEmail, setRecoveryEmail] = useState('');
  const [recoveryReference, setRecoveryReference] = useState('');

  const [alertState, setAlertState]             = useState(null);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  const paystackHandlerRef = useRef(null);
  const paymentTimeoutRef  = useRef(null);
  const dialogRef = useRef(null);

  const clearPaymentTimeout = () => {
    if (paymentTimeoutRef.current) {
      clearTimeout(paymentTimeoutRef.current);
      paymentTimeoutRef.current = null;
    }
  };

  useEffect(() => {
    try {
      const raw = localStorage.getItem(PURCHASE_STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (data?.reference) {
        setPaymentReference(data.reference);
        setDeliveryContact(data.email || '');
        setPaymentSuccess(false);
        setAlreadyDownloaded(Boolean(data.downloadedAt));
        void verifyPurchase(data.reference, data.email);
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

  // Cleanup any pending timeout on unmount
  useEffect(() => {
    return () => clearPaymentTimeout();
  }, []);

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
      const saved = JSON.parse(localStorage.getItem(PURCHASE_STORAGE_KEY) || 'null');
      localStorage.setItem(
        PURCHASE_STORAGE_KEY,
        JSON.stringify({
          ...(saved?.reference === ref ? { accessToken: saved.accessToken } : {}),
          reference: ref,
          email: mail,
          paidAt: new Date().toISOString(),
          downloadedAt,
        })
      );
    } catch {}
  };

  async function verifyPurchase(reference, purchaseEmail) {
    setVerifying(true);
    setDownloadUrl('');
    setVerificationError('');
    try {
      const { data, error } = await supabase.functions.invoke('verify-paystack', { body: { reference, email: purchaseEmail }, signal: AbortSignal.timeout(25000) });
      if (error || !data?.ok || !data.url) throw new Error('Verification failed');
      setDownloadUrl(data.url);
      setPaymentReference(reference); setDeliveryContact(purchaseEmail); setPaymentSuccess(true);
      try {
        const saved = JSON.parse(localStorage.getItem(PURCHASE_STORAGE_KEY) || 'null');
        setAlreadyDownloaded(saved?.reference === reference && Boolean(saved.downloadedAt));
        localStorage.setItem(PURCHASE_STORAGE_KEY, JSON.stringify({ ...(saved?.reference === reference ? saved : {}), reference, email: purchaseEmail, accessToken: data.playbookAccessToken }));
      } catch { /* Verified access works for this visit even if storage is unavailable. */ }
      return data.url;
    } catch {
      setPaymentSuccess(false);
      setVerificationError('We could not verify this purchase. Check the checkout email and Paystack reference, or contact info@themarketinghaven.xyz. Please do not pay again to recover a purchase.');
      return null;
    } finally {
      setVerifying(false);
    }
  }

  const handlePaystackCheckout = async (e) => {
    if (e) e.preventDefault();
    if (verifying || loading || recoveryOpen) return;

    const trimmed = email.trim();

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
      ref: `UNSEEN_${crypto.randomUUID()}`,
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
        clearPaymentTimeout();
        const ref = response.reference || '';
        setLoading(false);
        setPaymentReference(ref);
        setDeliveryContact(trimmed);
        setPaymentSuccess(false);
        setAlreadyDownloaded(false);
        persistPurchase(ref, trimmed, null);
        void verifyPurchase(ref, trimmed);
        setEmail('');
        paystackHandlerRef.current = null;
      },
      onClose: function () {
        clearPaymentTimeout();
        setLoading(false);
        setShowCancelConfirm(true);
        paystackHandlerRef.current = handler;
      },
    });

    paystackHandlerRef.current = handler;
    handler.openIframe();

    // If Paystack goes silent (script hangs, network drop, iframe never
    // loads), reset the button after 90s so the user isn't stuck.
    clearPaymentTimeout();
    paymentTimeoutRef.current = setTimeout(() => {
      setLoading(false);
      setAlertState({
        title: 'Payment did not open',
        message: "Something blocked the payment window. Check your connection and try again.",
        variant: 'default',
        confirmText: 'Got it',
      });
      paymentTimeoutRef.current = null;
    }, PAYMENT_TIMEOUT_MS);
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

  const handleDownloadPlaybook = (url = downloadUrl) => {
    if (!url) return;

    const a = document.createElement('a');
    a.href = url;
    a.download = PLAYBOOK_FILENAME;
    a.target = '_self';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    setAlreadyDownloaded(true);
    persistPurchase(paymentReference, deliveryContact, new Date().toISOString());
  };

  const handleRedownloadPlaybook = async (event) => {
    event.preventDefault();
    if (verifying) return;
    const url = await verifyPurchase(paymentReference, deliveryContact);
    if (url) handleDownloadPlaybook(url);
  };

  const handleCloseModal = useCallback(() => {
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
  }, []);

  useEffect(() => {
    if (!isPreviewOpen || loading || alertState || showCancelConfirm) return;
    const panel = dialogRef.current, previous = document.activeElement;
    panel?.focus({ preventScroll: true });
    const handleKey = (event) => {
      if (event.key === 'Escape') { event.preventDefault(); handleCloseModal(); return; }
      if (event.key !== 'Tab' || !panel) return;
      const controls = [...panel.querySelectorAll('button:not([disabled]),a[href],input:not([disabled])')].filter((element) => element.getClientRects().length);
      const first = controls[0], last = controls.at(-1);
      if (!first) { event.preventDefault(); return; }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === panel)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === panel)) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', handleKey);
    return () => { document.removeEventListener('keydown', handleKey); previous?.focus?.({ preventScroll: true }); };
  }, [isPreviewOpen, loading, alertState, showCancelConfirm, handleCloseModal]);

  return (
    <section
      id="shop"
     className="relative w-full pt-24 pb-12 sm:py-32 px-4 sm:px-6 lg:px-8 bg-white text-zinc-900 dark:bg-zinc-950 dark:text-white transition-colors duration-300"
    >
      <div className="absolute top-0 left-0 right-0 h-32 pointer-events-none bg-gradient-to-b from-zinc-100 to-transparent dark:from-zinc-900 dark:to-transparent transition-colors duration-300" />

      <div className="max-w-5xl mx-auto relative z-10">
        <motion.div
          className="text-center mb-12"
          initial={{ opacity: 0, y: reduceMotion ? 0 : 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: reduceMotion ? 0 : 0.4 }}
        >
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight mb-4 text-zinc-900 dark:text-white">
            Digital Products
          </h2>
          <p className="max-w-2xl mx-auto text-sm sm:text-base text-zinc-600 dark:text-zinc-400">
            For the moments when you are posting, showing up, and still wondering why people are not buying.
          </p>
        </motion.div>

        <motion.div
          className="relative rounded-2xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-900/80 shadow-[0_16px_40px_-28px_rgba(0,0,0,0.3)] overflow-hidden transition-colors duration-300"
          initial={{ opacity: 0, y: reduceMotion ? 0 : 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: reduceMotion ? 0 : 0.4 }}
        >
          <div className="grid grid-cols-1 md:grid-cols-2">
            <div className="relative aspect-square md:aspect-auto flex items-center justify-center p-8 bg-zinc-100 dark:bg-zinc-900 transition-colors duration-300">
              <motion.div initial={false} whileHover={reduceMotion ? undefined : { y: -6, rotate: 0 }} whileTap={reduceMotion ? undefined : { scale: 0.98 }} transition={{ duration: 0.25 }} className={`relative w-48 h-64 sm:w-56 sm:h-72 rounded-lg shadow-2xl overflow-hidden ${reduceMotion ? '' : 'rotate-[-2deg] hover:rotate-0 transition-transform duration-300'}`}>
                <img
                  src="/Playbook.jpeg"
                  alt="The Unseen Playbook"
                  loading="lazy"
                  decoding="async"
                  className="w-full h-full object-cover rounded-lg"
                />
              </motion.div>
            </div>

            <div className="p-8 sm:p-10 flex flex-col justify-center">
              <div className="text-[10px] font-medium uppercase tracking-[0.24em] mb-4 text-zinc-500 dark:text-zinc-400">
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
                    <span aria-hidden="true" className="w-1 h-1 rounded-full bg-zinc-400 mt-2 shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>

              <p className="mb-5 text-2xl font-medium tracking-tight text-zinc-900 dark:text-white">₦9,639 <del className="ml-2 text-sm font-normal text-zinc-500">₦15,000</del> <span className="ml-2 text-xs font-normal tracking-normal text-zinc-500">Playbook price</span></p>
              <button
                onClick={() => setIsPreviewOpen(true)}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-3.5 rounded-lg bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-950 font-semibold text-sm hover:bg-zinc-700 dark:hover:bg-white transition-colors active:scale-[0.98]"
              >
                Get The Unseen Playbook <ArrowRight className="w-4 h-4" />
              </button>
              <button type="button" onClick={() => { setRecoveryOpen(true); setIsPreviewOpen(true); }} className="mt-4 self-start text-xs text-zinc-500 underline underline-offset-4 hover:text-zinc-800 dark:hover:text-zinc-200">Already purchased? Recover your copy</button>
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
              className="fixed inset-0 bg-black/80"
              onClick={handleCloseModal}
            />

            <motion.div
              ref={dialogRef} tabIndex={-1}
              className="relative w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl border border-white/10 bg-zinc-900 text-white shadow-[0_32px_96px_rgba(0,0,0,0.5)] overflow-hidden my-auto z-10"
              role="dialog"
              aria-modal="true"
              aria-label="Playbook checkout"
              style={{ colorScheme: 'dark' }}
              initial={{ opacity: 0, scale: reduceMotion ? 1 : 0.98, y: reduceMotion ? 0 : 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: reduceMotion ? 1 : 0.98, y: reduceMotion ? 0 : 16 }}
              transition={{ duration: reduceMotion ? 0 : 0.24, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className="flex items-center justify-between gap-4 p-6 sm:px-8 border-b border-white/10">
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center bg-white/5 text-zinc-300"
                  >
                    {paymentSuccess ? (
                      <CheckCircle2 className="w-5 h-5" />
                    ) : (
                      <BookOpen className="w-5 h-5" />
                    )}
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold tracking-tight text-white">
                      {paymentSuccess ? "You're In." : 'The Unseen Playbook'}
                    </h3>
                    <p className="text-xs text-zinc-400">
                      {paymentSuccess
                        ? (alreadyDownloaded ? 'Download opened on this device' : 'Purchase verified')
                        : 'Digital Blueprint & Strategy Guide'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleCloseModal}
                  aria-label="Close Playbook checkout"
                  className="w-11 h-11 shrink-0 rounded-lg text-zinc-400 hover:text-white hover:bg-white/5 flex items-center justify-center transition-colors focus-visible:outline-2 focus-visible:outline-zinc-400"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {paymentSuccess ? (
                <div className="p-6 sm:p-8 overflow-y-auto overscroll-contain space-y-6 text-center">
                  <motion.div
                    initial={{ scale: reduceMotion ? 1 : 0.92, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ duration: reduceMotion ? 0 : 0.24, ease: 'easeOut' }}
                    className="w-16 h-16 mx-auto rounded-full flex items-center justify-center bg-white/5"
                  >
                    <CheckCircle2 className="w-8 h-8 text-zinc-200" />
                  </motion.div>

                  <div className="space-y-2">
                    <h4 className="text-2xl sm:text-3xl font-semibold tracking-tight text-white">
                      Your copy is ready.
                    </h4>
                    <p className="text-sm text-zinc-400 max-w-md mx-auto leading-relaxed">
                      Thank you for grabbing The Unseen Playbook. Your copy is ready. Click below to download it straight to your device.
                    </p>
                  </div>

                  <div className="flex flex-col items-center gap-3 py-4 text-xs">
                    <div className="flex flex-wrap justify-center items-center gap-2 text-zinc-400">
                      <ShieldCheck className="w-4 h-4 text-zinc-400" />
                      <span>Reference:</span>
                      <span className="font-mono break-all text-zinc-200">
                        {paymentReference || '—'}
                      </span>
                    </div>
                    {deliveryContact && (
                      <div className="text-[11px] text-zinc-400 break-all">
                        Checkout email: <span className="text-zinc-300">{deliveryContact}</span>
                      </div>
                    )}
                  </div>

                  {alreadyDownloaded ? (
                    <div className="w-full inline-flex items-center justify-center gap-3 px-8 py-4 rounded-lg bg-white/5 text-zinc-400 font-medium text-base cursor-not-allowed select-none">
                      <Download className="w-5 h-5" />
                      Download opened
                    </div>
                  ) : downloadUrl && !verifying ? (
                    <a
                      href={downloadUrl}
                      download={PLAYBOOK_FILENAME}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(event) => { event.preventDefault(); handleDownloadPlaybook(); }}
                      className="w-full inline-flex items-center justify-center gap-3 px-8 py-4 rounded-lg bg-zinc-100 hover:bg-white text-zinc-950 font-semibold text-base transition-colors active:scale-[0.98]"
                    >
                      <Download className="w-5 h-5" />
                      Download The Unseen Playbook
                    </a>
                  ) : null}
                  {verifying && <p role="status" className="text-sm text-zinc-400">Verifying your payment...</p>}
                  {verificationError && <p role="alert" className="text-sm text-red-300">{verificationError}</p>}
                  {alreadyDownloaded && downloadUrl && !verifying && (
                    <a href={downloadUrl} onClick={handleRedownloadPlaybook} className="block text-xs text-zinc-300 underline underline-offset-4 hover:text-white">
                      Re-download Playbook
                    </a>
                  )}

                  <div className="pt-6 mt-2 border-t border-white/10 text-left">
                    <div className="flex items-center gap-2">
                      <span className="block w-5 h-px bg-zinc-600" />
                      <span className="text-[10px] uppercase tracking-[0.24em] text-zinc-400">
                        A Note From Us
                      </span>
                    </div>
                    <p className="mt-4 text-sm leading-relaxed text-zinc-300">
                      Congratulations on your copy. Enjoy the read. And if you need any clarity or help applying anything, reach out to us anytime. We are here.
                    </p>
                  </div>

                  <button
                    onClick={handleCloseModal}
                    className="w-full px-4 py-3 rounded-lg text-sm font-medium text-zinc-300 hover:text-white hover:bg-white/5 transition-colors active:scale-[0.98]"
                  >
                    Close
                  </button>
                </div>
              ) : (
                <>
                  <div className="p-6 sm:p-8 overflow-y-auto overscroll-contain space-y-6">
                    <div>
                      <h4 className="text-2xl sm:text-3xl font-semibold tracking-tight mb-3 text-white">
                        What's Inside The Playbook?
                      </h4>
                      <p className="text-sm leading-relaxed text-zinc-400">
                        People like the post. They ask the price. Then the conversation stops. These nine chapters help you understand the gap and give your next marketing move a clear purpose.
                      </p>
                    </div>

                    <div className="divide-y divide-white/10">
                      {playbookModules.map((m, idx) => (
                        <div
                          key={idx}
                          className="py-4 first:pt-0 last:pb-0"
                        >
                          <div className="flex items-center gap-3 text-sm font-medium text-zinc-100 mb-2">
                            <span aria-hidden="true" className="h-1 w-1 shrink-0 rounded-full bg-zinc-500" />
                            {m.title}
                          </div>
                          <p className="pl-4 text-sm leading-relaxed text-zinc-400">
                            {m.desc}
                          </p>
                        </div>
                      ))}
                    </div>

                    <div className="rounded-xl border border-white/10 p-4">
                      <button type="button" aria-expanded={recoveryOpen} onClick={() => setRecoveryOpen((value) => !value)} className="text-sm text-zinc-200 underline underline-offset-4">Already purchased?</button>
                      {recoveryOpen && <form onSubmit={async (event) => { event.preventDefault(); await verifyPurchase(recoveryReference.trim(), recoveryEmail.trim()); }} className="mt-4 space-y-3">
                        <p className="text-xs leading-relaxed text-zinc-400">Recover your download on this device using the email and reference from your Paystack receipt. No extra payment is needed.</p>
                        <label className="block text-xs text-zinc-400">Checkout email<input required type="email" value={recoveryEmail} onChange={(event) => setRecoveryEmail(event.target.value)} className="mt-2 w-full rounded-lg border border-white/15 bg-zinc-950 px-3 py-3 text-base text-white" autoComplete="email" /></label>
                        <label className="block text-xs text-zinc-400">Paystack reference<input required value={recoveryReference} onChange={(event) => setRecoveryReference(event.target.value)} placeholder="UNSEEN_…" className="mt-2 w-full rounded-lg border border-white/15 bg-zinc-950 px-3 py-3 text-base text-white" autoCapitalize="none" spellCheck={false} /></label>
                        <button disabled={verifying} className="rounded-lg bg-zinc-100 px-4 py-3 text-xs font-semibold text-zinc-950 disabled:opacity-50">{verifying ? 'Verifying purchase…' : 'Verify & access your copy'}</button>
                      </form>}
                      {verificationError && <p role="alert" className="mt-3 text-xs leading-relaxed text-red-300">{verificationError}</p>}
                      {verifying && !recoveryOpen && <p role="status" className="mt-3 text-xs text-zinc-400">Checking your saved purchase…</p>}
                    </div>

                    {!recoveryOpen && <form id="paystack-form" onSubmit={handlePaystackCheckout} className="space-y-3 pt-2">
                      <label htmlFor="playbook-receipt-email" className="block text-[10px] font-medium uppercase tracking-[0.2em] text-zinc-300">
                        Email for your receipt
                      </label>
                      <input
                        id="playbook-receipt-email"
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="your@email.com"
                        className="w-full px-4 py-3 rounded-lg border border-white/15 bg-zinc-950/40 text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-400 transition-colors"
                      />
                      <p className="text-xs text-zinc-400">
                        Use an email you can access. Your download is available after payment verification.
                      </p>
                    </form>}

                    <div className="flex items-center gap-2 text-zinc-400 text-xs">
                      <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                      <span>Secure checkout via Paystack</span>
                    </div>
                  </div>

                  <div className="p-6 sm:px-8 border-t border-white/10 bg-zinc-900 flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div>
                      <span className="text-[10px] uppercase tracking-[0.2em] block text-zinc-400">
                        Total Investment
                      </span>
                      <div className="flex items-baseline gap-2">
                        <span className="text-3xl font-medium tracking-tight text-white">₦9,639</span>
                        <span className="text-xs text-zinc-400 line-through">₦15,000</span>
                      </div>
                      {PAYSTACK_AMOUNT_KOBO === 10000 && <p className="mt-2 text-xs text-zinc-300">Current live checkout charge: ₦100 (testing).</p>}
                    </div>

                    {recoveryOpen ? <button type="button" onClick={() => setRecoveryOpen(false)} className="rounded-lg border border-white/15 px-5 py-3 text-sm text-zinc-200">Back to checkout</button> : <button
                      type="button"
                      onClick={handlePaystackCheckout}
                      disabled={loading || verifying}
                      className="w-full sm:w-auto px-8 py-3.5 rounded-lg bg-zinc-100 hover:bg-white text-zinc-950 font-semibold text-sm transition-colors active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {loading ? 'Opening Checkout...' : 'Confirm & Pay via Paystack'}
                    </button>}
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

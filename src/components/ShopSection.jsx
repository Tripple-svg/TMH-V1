import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BookOpen, CheckCircle2, ArrowRight, X, ShieldCheck, Zap } from 'lucide-react';

const PAYSTACK_PUBLIC_KEY = 'pk_live_bb9d07c83cbd8bc94ee9c7fb5fb95e14a35fa93b';

const features = [
  'Stop guessing with marketing and build deep audience clarity',
  'Master the strategy filter: learn what to say no to',
  'Uncover the hidden drivers of influence and real consumer decisions',
  'Shift from knowing to doing with the TMH execution framework'
];

const playbookModules = [
  { title: "Chapter 1-3: The Setup & Strategy", desc: "Expose marketing's biggest lies, navigate the illusion of more, and use strategy as a ruthless filter." },
  { title: "Chapter 4-6: The Execution Engine", desc: "Discover the hidden drivers of influence, shift from knowing to doing, and realize why the brand is you." },
  { title: "Chapter 7-8: The Final Plays", desc: "Overcome everyday brand roadblocks and execute your unseen playbook step-by-step." },
  { title: "Chapter 9: The Wrap Up & Action Plan", desc: "Execute your immediate 24-hour action plan to turn attention into real conversions." },
];

export default function ShopSection() {
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [identifier, setIdentifier] = useState('');
  const [loading, setLoading] = useState(false);

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

  const handlePaystackCheckout = async (e) => {
    if (e) e.preventDefault();
    if (!identifier) {
      alert('Please enter a valid WhatsApp number or email address to proceed.');
      return;
    }

    setLoading(true);
    const scriptLoaded = await loadPaystackScript();

    if (!scriptLoaded) {
      alert('Paystack SDK failed to load. Please check your network connection.');
      setLoading(false);
      return;
    }

    const handler = window.PaystackPop.setup({
      key: PAYSTACK_PUBLIC_KEY,
      email: identifier.includes('@') ? identifier : 'customer@themarketingheaven.xyz',
      amount: 963900, // ₦9,639 in kobo
      currency: 'NGN',
      ref: 'UNSEEN_' + Math.floor(Math.random() * 1000000000 + 1),
      metadata: {
        custom_fields: [
          {
            display_name: "Product Name",
            variable_name: "product_name",
            value: "The Unseen Playbook"
          },
          {
            display_name: "Delivery Contact",
            variable_name: "delivery_contact",
            value: identifier
          }
        ]
      },
      callback: function (response) {
        setLoading(false);
        alert(`Transaction successful! Reference: ${response.reference}. Access dispatched to ${identifier}.`);
        setIsPreviewOpen(false);
        setIdentifier('');
      },
      onClose: function () {
        setLoading(false);
      }
    });

    handler.openIframe();
  };

  return (
    <section 
      id="shop" 
      className="relative w-full py-24 sm:py-32 px-4 sm:px-6 lg:px-8 bg-white text-zinc-900 dark:bg-zinc-950 dark:text-white transition-colors duration-300"
    >
      {/* Background Top Gradient Overlay */}
      <div className="absolute top-0 left-0 right-0 h-32 pointer-events-none bg-gradient-to-b from-zinc-100 to-transparent dark:from-zinc-900 dark:to-transparent transition-colors duration-300" />

      <div className="max-w-5xl mx-auto relative z-10">
        {/* Section Header */}
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

        {/* Product Card */}
        <motion.div
          className="relative rounded-2xl sm:rounded-3xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 backdrop-blur-sm shadow-xl dark:shadow-none overflow-hidden transition-colors duration-300"
          initial={{ opacity: 0, y: 30 }} 
          whileInView={{ opacity: 1, y: 0 }} 
          viewport={{ once: true }} 
          transition={{ duration: 0.6 }}
        >
          <div className="grid grid-cols-1 md:grid-cols-2">
            {/* Playbook Visual Container */}
            <div className="relative aspect-square md:aspect-auto flex items-center justify-center p-8 bg-gradient-to-br from-blue-50 via-zinc-100 to-blue-100/50 dark:from-blue-950/40 dark:via-zinc-900 dark:to-black transition-colors duration-300">
              <div className="relative w-48 h-64 sm:w-56 sm:h-72 rounded-lg shadow-2xl transform rotate-[-2deg] hover:rotate-0 transition-transform duration-500 overflow-hidden">
                <img 
                  src="/Playbook.jpeg" 
                  alt="The Unseen Playbook" 
                  className="w-full h-full object-cover rounded-lg"
                />
              </div>
            </div>

            {/* Product Meta Details */}
            <div className="p-8 sm:p-10 flex flex-col justify-center">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider w-fit mb-4 bg-blue-100 border border-blue-200 text-blue-700 dark:bg-blue-600/10 dark:border-blue-500/20 dark:text-blue-400">
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

      {/* Modal View */}
      <AnimatePresence>
        {isPreviewOpen && (
          <motion.div 
            className="fixed inset-0 z-[70] flex items-center justify-center p-4 sm:p-6 overflow-y-auto"
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            exit={{ opacity: 0 }}
          >
            <div className="fixed inset-0 bg-black/80 backdrop-blur-md" onClick={() => setIsPreviewOpen(false)} />

            <motion.div 
              className="relative w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white shadow-2xl overflow-hidden my-auto z-10 transition-colors duration-300"
              initial={{ scale: 0.95, y: 20 }} 
              animate={{ scale: 1, y: 0 }} 
              exit={{ scale: 0.95, y: 20 }}
            >
              <div className="flex items-center justify-between p-6 border-b border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-white/5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-blue-100 border border-blue-200 dark:bg-blue-600/20 dark:border-blue-500/30">
                    <BookOpen className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-zinc-900 dark:text-white">The Unseen Playbook</h3>
                    <p className="text-xs text-blue-600 font-medium">Digital Blueprint & Strategy Guide</p>
                  </div>
                </div>
                <button 
                  onClick={() => setIsPreviewOpen(false)} 
                  className="w-9 h-9 rounded-full border border-zinc-200 dark:border-white/10 bg-zinc-100 dark:bg-white/5 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white flex items-center justify-center transition-all"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-6 sm:p-8 overflow-y-auto space-y-6">
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
                    Enter WhatsApp Number or Email for Delivery *
                  </label>
                  <input
                    type="text"
                    required
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder="e.g. 08012345678 or your@email.com"
                    className="w-full px-4 py-3 rounded-xl border border-zinc-300 dark:border-white/10 bg-zinc-50 dark:bg-white/5 text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-500 focus:outline-none focus:border-blue-600 transition-colors"
                  />
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                    We will dispatch your copy directly to your WhatsApp or email upon successful payment.
                  </p>
                </form>

                <div className="flex items-center gap-3 p-4 rounded-xl border border-emerald-200 dark:border-emerald-500/20 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-800 dark:text-emerald-400 text-xs">
                  <ShieldCheck className="w-5 h-5 shrink-0 text-emerald-600" />
                  <span>Instant delivery access dispatched upon successful transaction via Paystack.</span>
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
                  className="w-full sm:w-auto px-8 py-3.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-sm transition-all shadow-lg shadow-blue-600/30 active:scale-95 flex items-center justify-center gap-2"
                >
                  {loading ? 'Opening Checkout...' : 'Confirm & Pay via Paystack'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
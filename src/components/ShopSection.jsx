import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BookOpen, CheckCircle2, ArrowRight, X, ShieldCheck, Zap } from 'lucide-react';

const PAYSTACK_PUBLIC_KEY = 'pk_live_bb9d07c83cbd8bc94ee9c7fb5fb95e14a35fa93b';

const features = [
  'Brand architecture frameworks used by 7-figure businesses',
  'Positioning strategies that separate you from competitors',
  'Conversion blueprints for high-ticket sales funnels',
  'Social proof systems that build instant trust'
];

const playbookModules = [
  { title: "Chapter 1-3: Fundamentals & Positioning", desc: "Define your market core, audience psychology, and non-negotiable brand authority." },
  { title: "Chapter 4-6: Funnels & System Mechanics", desc: "Build offer structures that convert cold traffic without desperate discounting." },
  { title: "Chapter 7-8: Content Architecture & Scaling", desc: "Platform distribution strategies to automate inbound brand demand." },
  { title: "Chapter 9: The Brand Is You", desc: "Personal positioning frameworks to leverage founder authority for maximum impact." },
];

export default function ShopSection() {
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);

  // Load Paystack Inline JS dynamically without npm
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
    if (!email) {
      alert('Please enter a valid email address to proceed.');
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
      email: email,
      amount: 963900, // ₦9,639 in kobo
      currency: 'NGN',
      ref: 'UNSEEN_' + Math.floor(Math.random() * 1000000000 + 1),
      metadata: {
        custom_fields: [
          {
            display_name: "Product Name",
            variable_name: "product_name",
            value: "The Unseen Playbook"
          }
        ]
      },
      callback: function (response) {
        setLoading(false);
        alert(`Transaction successful! Reference: ${response.reference}. Check your email for instant download access.`);
        setIsPreviewOpen(false);
        setEmail('');
      },
      onClose: function () {
        setLoading(false);
      }
    });

    handler.openIframe();
  };

  return (
    <section id="shop" className="relative w-full py-24 sm:py-32 px-4 sm:px-6 lg:px-8 bg-gray-950">
      <div className="absolute top-0 left-0 right-0 h-32 bg-gradient-to-b from-gray-900 to-transparent pointer-events-none" />
      <div className="max-w-5xl mx-auto relative z-10">
        
        {/* Section Title */}
        <motion.div className="text-center mb-12" initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.6 }}>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white tracking-tight mb-4">Digital Products</h2>
          <p className="text-gray-400 max-w-2xl mx-auto">Tools and templates built by strategists, for strategists.</p>
        </motion.div>

        {/* Product Card */}
        <motion.div
          className="relative rounded-2xl sm:rounded-3xl bg-white/5 border border-white/10 backdrop-blur-sm overflow-hidden hover:border-blue-500/30 transition-all duration-500 shadow-xl"
          initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.6 }}>
          <div className="grid grid-cols-1 md:grid-cols-2">
            
            {/* Playbook Visual */}
            <div className="relative aspect-square md:aspect-auto bg-gradient-to-br from-blue-900/40 via-gray-900 to-black flex items-center justify-center p-8">
              <div className="relative w-48 h-64 sm:w-56 sm:h-72 rounded-lg shadow-2xl shadow-black/80 transform rotate-[-2deg] hover:rotate-0 transition-transform duration-500">
                <div className="absolute inset-0 rounded-lg bg-gradient-to-br from-blue-600 to-indigo-900 flex flex-col items-center justify-center text-center p-6 border border-white/20">
                  <BookOpen className="w-12 h-12 text-white/90 mb-4" />
                  <h4 className="text-white font-bold text-xl leading-tight tracking-wide">The Unseen<br/>Playbook</h4>
                  <p className="text-blue-200 text-xs mt-3 uppercase tracking-widest font-semibold">How Marketing<br/>Really Works</p>
                </div>
              </div>
            </div>

            {/* Content Details */}
            <div className="p-8 sm:p-10 flex flex-col justify-center">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-600/10 border border-blue-500/20 text-blue-400 text-xs font-semibold uppercase tracking-wider w-fit mb-4">
                Featured Playbook
              </div>
              <h3 className="text-2xl sm:text-3xl font-bold text-white mb-2">The Unseen Playbook</h3>
              <p className="text-sm text-gray-400 mb-6 font-medium">How Marketing Really Works</p>

              <ul className="space-y-3 mb-8">
                {features.map((f, i) => (
                  <li key={i} className="flex items-start gap-3 text-sm text-gray-300">
                    <CheckCircle2 className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>

              <div className="flex items-center gap-4 mb-6">
                <span className="text-3xl font-bold text-blue-500">₦9,639</span>
                <span className="text-sm text-gray-500 line-through">₦15,000</span>
              </div>

              {/* Action Trigger */}
              <button 
                onClick={() => setIsPreviewOpen(true)}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-3.5 rounded-xl bg-blue-600 text-white font-semibold text-sm hover:bg-blue-500 hover:shadow-[0_0_30px_rgba(37,99,235,0.35)] transition-all active:scale-95">
                Get The Unseen Playbook <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Playbook Preview & Direct Paystack Modal */}
      <AnimatePresence>
        {isPreviewOpen && (
          <motion.div className="fixed inset-0 z-[70] flex items-center justify-center p-4 sm:p-6 overflow-y-auto"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="fixed inset-0 bg-black/80 backdrop-blur-md" onClick={() => setIsPreviewOpen(false)} />

            <motion.div className="relative w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl bg-gray-900 text-white border border-white/10 shadow-2xl overflow-hidden my-auto z-10"
              initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }}>
              
              {/* Modal Header */}
              <div className="flex items-center justify-between p-6 border-b border-white/10 bg-white/5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center">
                    <BookOpen className="w-5 h-5 text-blue-400" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white">The Unseen Playbook</h3>
                    <p className="text-xs text-blue-400">Digital Blueprint & Strategy Guide</p>
                  </div>
                </div>
                <button onClick={() => setIsPreviewOpen(false)} className="w-9 h-9 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-gray-400 hover:text-white transition-all">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-6 sm:p-8 overflow-y-auto space-y-6 custom-scrollbar">
                <div>
                  <h4 className="text-base font-semibold text-white mb-2">What's Inside The Playbook?</h4>
                  <p className="text-sm text-gray-300 leading-relaxed">
                    A comprehensive breakdown of modern marketing execution. Designed specifically for founders, creators, and strategists seeking to build high-converting brand ecosystems.
                  </p>
                </div>

                {/* Chapter breakdown */}
                <div className="space-y-3">
                  {playbookModules.map((m, idx) => (
                    <div key={idx} className="p-4 rounded-xl bg-white/5 border border-white/10">
                      <div className="flex items-center gap-2 text-sm font-semibold text-blue-400 mb-1">
                        <Zap className="w-4 h-4" />
                        {m.title}
                      </div>
                      <p className="text-xs text-gray-300 leading-relaxed">{m.desc}</p>
                    </div>
                  ))}
                </div>

                {/* Email Form Field */}
                <form id="paystack-form" onSubmit={handlePaystackCheckout} className="space-y-3 pt-2">
                  <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider">
                    Enter Email Address for Delivery *
                  </label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="your@email.com"
                    className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors"
                  />
                </form>

                {/* Secure Payment Assurance */}
                <div className="flex items-center gap-3 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs">
                  <ShieldCheck className="w-5 h-5 shrink-0" />
                  <span>Instant PDF download link dispatched upon successful transaction via Paystack.</span>
                </div>
              </div>

              {/* Modal Footer / Purchase Action */}
              <div className="p-6 border-t border-white/10 bg-white/5 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div>
                  <span className="text-xs text-gray-400 uppercase tracking-wider block">Total Investment</span>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-bold text-white">₦9,639</span>
                    <span className="text-xs text-gray-500 line-through">₦15,000</span>
                  </div>
                </div>

                <button 
                  type="button"
                  onClick={handlePaystackCheckout}
                  disabled={loading}
                  className="w-full sm:w-auto px-8 py-3.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-sm transition-all shadow-lg shadow-blue-600/30 active:scale-95 flex items-center justify-center gap-2">
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
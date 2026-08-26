import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ArrowRight, Building2, Globe, Share2, Upload, Camera, Video, MessageSquare, Play } from 'lucide-react';

export default function HeroSection({ onOpenHaven }) {
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [step, setStep] = useState(1);
  const [selectedFile, setSelectedFile] = useState(null);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  
  const [formData, setFormData] = useState({
    fullName: '',
    brandName: '',
    whatsapp: '',
    email: '',
    mainGoal: 'More Leads',
    platformType: 'website',
    socialPlatform: 'Instagram',
    websiteUrl: '',
    socialLink: '',
  });

  // Check for existing submission on mount
  useEffect(() => {
    const savedData = localStorage.getItem('tmh_brand_review_data');
    if (savedData) {
      setHasSubmitted(true);
    }
  }, []);

  const goals = [
    'More Leads',
    'Better Website/Brand Design',
    'Higher Sales & Conversions',
    'Improve Social Media Presence',
    'Build Brand Authority'
  ];

  const socialPlatforms = [
    { name: 'Instagram', icon: Camera },
    { name: 'TikTok', icon: Video },
    { name: 'X/Twitter', icon: MessageSquare },
    { name: 'LinkedIn', icon: Share2 },
    { name: 'YouTube', icon: Play },
  ];

  const handleInputChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
    }
  };

  const handleReviewButtonClick = () => {
    // If user has already submitted, bypass modal and trigger Haven directly
    if (hasSubmitted) {
      const savedData = localStorage.getItem('tmh_brand_review_data');
      const parsedData = savedData ? JSON.parse(savedData) : formData;
      
      if (onOpenHaven) {
        onOpenHaven({
          ...parsedData,
          isReturningUser: true
        });
      }
      return;
    }

    setShowReviewModal(true);
  };

  const handleNextStep = (e) => {
    e.preventDefault();
    setStep(2);
  };

  const handleStartReview = (e) => {
    e.preventDefault();
    
    const submissionData = {
      ...formData,
      hasSubmitted: true,
      submittedAt: new Date().toISOString()
    };

    // Store in localStorage for state persistence
    localStorage.setItem('tmh_brand_review_data', JSON.stringify(submissionData));
    setHasSubmitted(true);

    setShowReviewModal(false);
    setStep(1);

    // Pass collected data to Haven AI trigger
    if (onOpenHaven) {
      onOpenHaven({
        ...submissionData,
        screenshot: selectedFile
      });
    }
  };

  return (
    <section className="relative w-full min-h-[75vh] flex flex-col justify-center pt-36 pb-8 sm:pt-32 sm:pb-12 px-4 sm:px-6 lg:px-8 overflow-hidden bg-zinc-950">
      
      {/* Background Video Layer */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute inset-0 bg-gradient-to-b from-zinc-950/60 via-zinc-950/40 to-zinc-950 z-10" />

        <video
          autoPlay
          loop
          muted
          playsInline
          preload="auto"
          className="w-full h-full object-cover opacity-60 scale-105"
        >
          <source src="/HeroSection.mp4" type="video/mp4" />
        </video>
      </div>

      {/* Hero Content Liquid Glass Card */}
      <div className="relative z-20 max-w-3xl w-full mx-auto my-auto mt-2 sm:mt-0">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="backdrop-blur-xl bg-zinc-900/35 dark:bg-zinc-900/30 border border-white/20 dark:border-white/15 rounded-3xl py-10 px-6 sm:py-14 sm:px-10 text-center shadow-2xl flex flex-col justify-between min-h-[420px] sm:min-h-0 backdrop-saturate-150"
        >
          <div className="flex flex-col justify-center my-auto">
            <motion.h1
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="text-3xl sm:text-5xl md:text-6xl font-black tracking-tight text-white uppercase leading-snug sm:leading-tight drop-shadow-md"
            >
              HERE TO TRANSFORM YOUR BRAND.
            </motion.h1>

            <motion.h2
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="bg-gradient-to-r from-blue-400 via-sky-300 to-emerald-300 bg-clip-text text-transparent font-semibold text-xl sm:text-2xl mt-3 sm:mt-4"
            >
              Everything starts from you.
            </motion.h2>

            <motion.p
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.3 }}
              className="text-zinc-200 text-sm sm:text-base max-w-lg mx-auto mt-4 sm:mt-5 leading-relaxed font-light drop-shadow-sm"
            >
              Get to know where your brand really stands in today's market by requesting a free brand review.
            </motion.p>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.4 }}
            className="flex flex-col sm:flex-row items-center justify-center gap-3.5 mt-6 sm:mt-10"
          >
            <button
              onClick={handleReviewButtonClick}
              className="w-full sm:w-auto bg-blue-600 hover:bg-blue-500 text-white font-bold py-3.5 px-7 rounded-xl shadow-lg shadow-blue-600/30 transition-all hover:scale-[1.02] active:scale-[0.98] text-xs sm:text-sm flex items-center justify-center gap-2"
            >
              <span>{hasSubmitted ? "REQUEST A FREE BRAND REVIEW" : "REQUEST A FREE BRAND REVIEW"}</span>
              <ArrowRight className="w-4 h-4" />
            </button>

            <button
              onClick={onOpenHaven}
              className="w-full sm:w-auto bg-zinc-900/60 hover:bg-zinc-800/80 text-white border border-white/20 font-semibold py-3.5 px-7 rounded-xl transition-all hover:scale-[1.02] active:scale-[0.98] text-xs sm:text-sm backdrop-blur-md"
            >
              Talk to Our Team
            </button><br style={{ display: 'block', marginBottom: '4px' }} />
          </motion.div>
        </motion.div>
      </div>

      {/* Dynamic Brand Review Modal */}
      <AnimatePresence>
        {showReviewModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowReviewModal(false)}
              className="fixed inset-0 bg-black/80 backdrop-blur-md"
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative z-10 w-full max-w-lg bg-zinc-900/95 border border-white/15 rounded-3xl p-6 sm:p-8 shadow-2xl overflow-hidden text-white backdrop-blur-2xl"
            >
              <button
                onClick={() => setShowReviewModal(false)}
                className="absolute top-5 right-5 w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-zinc-300 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="mb-6">
                <h3 className="text-2xl font-black uppercase tracking-tight text-white mb-1">
                  Request Your Free Brand Review
                </h3>
                <p className="text-xs text-zinc-400">
                  Tell us about your brand. We'll audit your presence and deliver a strategic roadmap.
                </p>
              </div>

              {/* Progress Indicator */}
              <div className="flex items-center gap-2 mb-6 text-[11px] font-mono">
                <span className={`px-3 py-1 rounded-md border ${step === 1 ? 'bg-blue-600/30 border-blue-500 text-blue-300 font-bold' : 'bg-white/5 border-white/10 text-zinc-400'}`}>
                  STEP 1 — YOUR DETAILS
                </span>
                <span className={`px-3 py-1 rounded-md border ${step === 2 ? 'bg-blue-600/30 border-blue-500 text-blue-300 font-bold' : 'bg-white/5 border-white/10 text-zinc-400'}`}>
                  STEP 2 — PLATFORM AUDIT
                </span>
              </div>

              {step === 1 ? (
                <form onSubmit={handleNextStep} className="space-y-4">
                  <div>
                    <label className="block text-[10px] font-mono uppercase tracking-wider text-zinc-400 mb-1.5">Full Name</label>
                    <input
                      type="text"
                      required
                      name="fullName"
                      value={formData.fullName}
                      onChange={handleInputChange}
                      placeholder="Frank Smith"
                      className="w-full bg-zinc-800/80 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-mono uppercase tracking-wider text-zinc-400 mb-1.5">Business / Brand Name</label>
                    <input
                      type="text"
                      required
                      name="brandName"
                      value={formData.brandName}
                      onChange={handleInputChange}
                      placeholder="Acme Co."
                      className="w-full bg-zinc-800/80 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-mono uppercase tracking-wider text-zinc-400 mb-1.5">WhatsApp Number</label>
                    <input
                      type="tel"
                      required
                      name="whatsapp"
                      value={formData.whatsapp}
                      onChange={handleInputChange}
                      placeholder="+234 800 000 0000"
                      className="w-full bg-zinc-800/80 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-mono uppercase tracking-wider text-zinc-400 mb-1.5">Email Address</label>
                    <input
                      type="email"
                      required
                      name="email"
                      value={formData.email}
                      onChange={handleInputChange}
                      placeholder="john@acme.com"
                      className="w-full bg-zinc-800/80 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full mt-6 bg-blue-600 hover:bg-blue-500 text-white font-bold py-3.5 rounded-xl transition-all text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg shadow-blue-600/20"
                  >
                    <span>Continue to Step 2</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </form>
              ) : (
                <form onSubmit={handleStartReview} className="space-y-4">
                  {/* Main Goal Selection */}
                  <div>
                    <label className="block text-[10px] font-mono uppercase tracking-wider text-zinc-400 mb-1.5">Primary Aim Right Now</label>
                    <select
                      name="mainGoal"
                      value={formData.mainGoal}
                      onChange={handleInputChange}
                      className="w-full bg-zinc-800/80 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-blue-500"
                    >
                      {goals.map((g, idx) => (
                        <option key={idx} value={g}>{g}</option>
                      ))}
                    </select>
                  </div>

                  {/* Presence Selector Tabs */}
                  <div>
                    <label className="block text-[10px] font-mono uppercase tracking-wider text-zinc-400 mb-2">Digital Presence Setup</label>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { id: 'website', label: 'I Have a Website', icon: Globe },
                        { id: 'social', label: 'Social Media Only', icon: Share2 },
                        { id: 'none', label: 'None Yet', icon: Building2 }
                      ].map((item) => (
                        <button
                          type="button"
                          key={item.id}
                          onClick={() => setFormData({ ...formData, platformType: item.id })}
                          className={`p-3 rounded-xl border text-[11px] font-medium flex flex-col items-center justify-center text-center gap-1.5 transition-all ${
                            formData.platformType === item.id 
                              ? 'bg-blue-600/20 border-blue-500 text-white font-bold shadow-md shadow-blue-500/10' 
                              : 'bg-zinc-800/40 border-white/5 text-zinc-400 hover:bg-zinc-800'
                          }`}
                        >
                          <item.icon className={`w-4 h-4 ${formData.platformType === item.id ? 'text-blue-400' : 'text-zinc-400'}`} />
                          <span>{item.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Conditional Inputs */}
                  {formData.platformType === 'website' && (
                    <div>
                      <label className="block text-[10px] font-mono uppercase tracking-wider text-zinc-400 mb-1.5">Current Website URL</label>
                      <input
                        type="url"
                        required
                        name="websiteUrl"
                        value={formData.websiteUrl}
                        onChange={handleInputChange}
                        placeholder="https://yourbrand.com"
                        className="w-full bg-zinc-800/80 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500"
                      />
                    </div>
                  )}

                  {formData.platformType === 'social' && (
                    <div className="space-y-3">
                      {/* Social Platform Selection Grid */}
                      <div>
                        <label className="block text-[10px] font-mono uppercase tracking-wider text-zinc-400 mb-1.5">Select Social Platform</label>
                        <div className="grid grid-cols-5 gap-1.5">
                          {socialPlatforms.map((platform) => {
                            const IconComponent = platform.icon;
                            const isSelected = formData.socialPlatform === platform.name;
                            return (
                              <button
                                type="button"
                                key={platform.name}
                                onClick={() => setFormData({ ...formData, socialPlatform: platform.name })}
                                className={`p-2 rounded-lg border text-[10px] flex flex-col items-center gap-1 transition-all ${
                                  isSelected
                                    ? 'bg-blue-600/30 border-blue-500 text-white font-bold'
                                    : 'bg-zinc-800/40 border-white/5 text-zinc-400 hover:bg-zinc-800'
                                }`}
                              >
                                <IconComponent className={`w-3.5 h-3.5 ${isSelected ? 'text-blue-400' : 'text-zinc-400'}`} />
                                <span className="truncate w-full text-center">{platform.name}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div>
                        <label className="block text-[10px] font-mono uppercase tracking-wider text-zinc-400 mb-1.5">
                          {formData.socialPlatform} Link / Handle
                        </label>
                        <input
                          type="text"
                          required
                          name="socialLink"
                          value={formData.socialLink}
                          onChange={handleInputChange}
                          placeholder={`https://${formData.socialPlatform.toLowerCase()}.com/yourbrand or @handle`}
                          className="w-full bg-zinc-800/80 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-mono uppercase tracking-wider text-zinc-400 mb-1.5">Upload Profile Screenshot (for Haven AI Analysis)</label>
                        <label className="flex items-center justify-center gap-2 w-full bg-zinc-800/40 border border-dashed border-white/20 hover:border-blue-500 rounded-xl p-3 text-xs text-zinc-300 cursor-pointer transition-colors">
                          <Upload className="w-4 h-4 text-blue-400" />
                          <span>{selectedFile ? selectedFile.name : 'Choose image file'}</span>
                          <input type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
                        </label>
                      </div>
                    </div>
                  )}

                  {formData.platformType === 'none' && (
                    <div className="p-3.5 bg-blue-500/10 border border-blue-500/20 rounded-xl text-xs text-blue-300 leading-relaxed">
                      💡 No setup needed! Haven AI will help you construct your initial digital roadmap from scratch in chat.
                    </div>
                  )}

                  {/* Submit Action */}
                  <div className="flex gap-2 pt-3">
                    <button
                      type="button"
                      onClick={() => setStep(1)}
                      className="w-1/3 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold py-3.5 rounded-xl transition-all text-xs uppercase tracking-wider"
                    >
                      Back
                    </button>
                    <button
                      type="submit"
                      className="w-2/3 bg-blue-600 hover:bg-blue-500 text-white font-bold py-3.5 rounded-xl transition-all text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg shadow-blue-600/20"
                    >
                      <span>Start Free Brand Review</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </form>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </section>
  );
}
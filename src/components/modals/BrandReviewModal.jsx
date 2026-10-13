import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import HCaptcha from '@hcaptcha/react-hcaptcha';
import {
  ArrowRight, Building2, Camera, CheckCircle2, ChevronDown, Globe, Play,
  Share2, Upload, Video, X,
} from 'lucide-react';
import {
  loadReviewFormData,
  saveReviewFormData,
  loadReviewFormStep,
  saveReviewFormStep,
  clearReviewFormData,
  DEFAULT_FORM_DATA,
} from '../haven/utils/reviewPersistence';

const HCAPTCHA_SITE_KEY = '2506b35e-f496-40aa-a6e4-32cc1eb84e4c';

const goals = [
  'More Leads & Enquiries',
  'Higher Sales & Conversions',
  'Better Website / Brand Design',
  'Improve Social Media Presence',
  'Build Brand Authority',
];

const platforms = [
  { id: 'website', label: 'Website', icon: Globe },
  { id: 'social', label: 'Social', icon: Share2 },
  { id: 'none', label: 'None yet', icon: Building2 },
];

const socialPlatforms = [
  { name: 'Instagram', icon: Camera },
  { name: 'TikTok', icon: Video },
  { name: 'X / Twitter', icon: Share2 },
  { name: 'LinkedIn', icon: Building2 },
  { name: 'YouTube', icon: Play },
];

const openLegalModal = (modal) => {
  window.dispatchEvent(new CustomEvent('open-legal-modal', { detail: { modal } }));
};

function CustomSelect({ value, onChange, options, placeholder = 'Select…' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`w-full flex items-center justify-between rounded-xl border bg-white/60 dark:bg-white/[0.04] backdrop-blur-sm px-4 py-3 text-sm text-zinc-900 dark:text-white outline-none transition ${
          open
            ? 'border-blue-500/60 bg-white/80 dark:bg-white/[0.06]'
            : 'border-zinc-300 dark:border-white/[0.08] hover:border-zinc-400 dark:hover:border-white/20'
        }`}
      >
        <span className={value ? 'text-zinc-900 dark:text-white' : 'text-zinc-500'}>
          {value || placeholder}
        </span>
        <ChevronDown
          className={`h-4 w-4 text-zinc-500 dark:text-zinc-400 transition-transform duration-200 ${
            open ? 'rotate-180' : ''
          }`}
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className="absolute z-40 left-0 right-0 mt-2 rounded-xl border border-zinc-200/80 dark:border-white/[0.08] bg-white/95 dark:bg-zinc-950/95 backdrop-blur-xl shadow-2xl shadow-black/20 dark:shadow-black/50 overflow-hidden"
          >
            {options.map((opt) => {
              const selected = opt === value;
              return (
                <button
                  key={opt}
                  type="button"
                  onClick={() => {
                    onChange(opt);
                    setOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-4 py-2.5 text-sm text-left transition ${
                    selected
                      ? 'bg-blue-600/10 dark:bg-blue-600/15 text-blue-700 dark:text-blue-300'
                      : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/[0.04] hover:text-zinc-900 dark:hover:text-white'
                  }`}
                >
                  <span>{opt}</span>
                  {selected && <CheckCircle2 className="h-3.5 w-3.5" />}
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function BrandReviewModal({ isOpen, onClose, onSubmit }) {
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState(DEFAULT_FORM_DATA);
  const [errors, setErrors] = useState({});
  const [screenshotBase64, setScreenshotBase64] = useState(null);
  const [screenshotFileName, setScreenshotFileName] = useState('');
  const [imageLoading, setImageLoading] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [captchaToken, setCaptchaToken] = useState(null);
  const [captchaExpired, setCaptchaExpired] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const fileInputRef = useRef(null);
  const captchaRef = useRef(null);
  const submittingRef = useRef(false);

  useEffect(() => {
    if (isOpen) {
      setFormData(loadReviewFormData());
      setStep(loadReviewFormStep());
      setErrors({});
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) saveReviewFormData(formData);
  }, [formData, isOpen]);

  useEffect(() => {
    if (isOpen) saveReviewFormStep(step);
  }, [step, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  const hardReset = () => {
    setStep(1);
    setFormData(DEFAULT_FORM_DATA);
    setErrors({});
    setScreenshotBase64(null);
    setScreenshotFileName('');
    setImageLoading(false);
    setAgreedToTerms(false);
    setCaptchaToken(null);
    setCaptchaExpired(false);
    setVerifying(false);
    submittingRef.current = false;
    captchaRef.current?.resetCaptcha();
    clearReviewFormData();
  };

  const close = () => onClose?.();

  const change = (event) => {
    const { name, value } = event.target;
    setFormData((current) => ({ ...current, [name]: value }));
    setErrors((current) => ({ ...current, [name]: '' }));
  };

  const validateStepOne = () => {
    const next = {};
    if (!formData.fullName.trim()) next.fullName = 'Please enter your full name.';
    if (!formData.brandName.trim()) next.brandName = 'Please enter your brand name.';

    const whatsappDigits = (formData.whatsapp || '').replace(/\D/g, '');
    if (!formData.whatsapp.trim()) {
      next.whatsapp = 'Please enter your WhatsApp number.';
    } else if (whatsappDigits.length < 10) {
      next.whatsapp = 'That number looks too short. Please enter a valid WhatsApp number.';
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email))
      next.email = 'Please enter a valid email address.';
    if (!agreedToTerms) next.agreedToTerms = 'Please accept the Terms and Privacy Policy to continue.';
    return next;
  };

  const validateStepTwo = () => {
    const next = {};
    if (formData.platformType === 'website' && !formData.websiteUrl.trim())
      next.websiteUrl = 'Please enter your website URL.';
    if (formData.platformType === 'social') {
      if (!formData.socialPlatform) next.socialPlatform = 'Choose a social platform.';
      if (!formData.socialLink.trim())
        next.socialLink = 'Please enter your handle or profile link.';
    }
    if (!captchaToken) next.captcha = 'Please complete the verification check above.';
    return next;
  };

  const continueToPlatform = () => {
    const next = validateStepOne();
    setErrors(next);
    if (!Object.keys(next).length) setStep(2);
  };

  const selectImage = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setImageLoading(true);
    setScreenshotFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      setScreenshotBase64(String(reader.result));
      setImageLoading(false);
    };
    reader.onerror = () => {
      setScreenshotBase64(null);
      setScreenshotFileName('');
      setImageLoading(false);
    };
    reader.readAsDataURL(file);
  };

  const submit = async () => {
    if (submittingRef.current) return;

    const next = validateStepTwo();
    setErrors(next);
    if (Object.keys(next).length) return;

    submittingRef.current = true;
    setVerifying(true);

    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      const res = await fetch(`${supabaseUrl}/functions/v1/validate-hcaptcha`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${supabaseAnonKey}`,
          apikey: supabaseAnonKey,
        },
        body: JSON.stringify({ token: captchaToken }),
      });
      const data = await res.json();
      setVerifying(false);

      if (!data.success) {
        setErrors({ captcha: 'Verification failed. Please try again.' });
        captchaRef.current?.resetCaptcha();
        setCaptchaToken(null);
        submittingRef.current = false;
        return;
      }
    } catch {
      setVerifying(false);
      setErrors({ captcha: 'Could not verify. Check your connection and try again.' });
      submittingRef.current = false;
      return;
    }

    const payload = {
      id: crypto.randomUUID(),
      ...formData,
      agreedToTerms: true,
      agreedAt: new Date().toISOString(),
      hcaptchaToken: captchaToken,
      screenshotBase64,
      screenshotFileName,
    };
    onSubmit?.(payload);
    hardReset();
  };

  const inputClass = (field) =>
    `w-full rounded-xl border bg-white/60 dark:bg-white/[0.04] backdrop-blur-sm px-4 py-3 text-sm text-zinc-900 dark:text-white placeholder:text-zinc-400 dark:placeholder:text-zinc-500 outline-none transition focus:border-blue-500/60 ${
      errors[field] ? 'border-red-500/60' : 'border-zinc-300 dark:border-white/[0.08]'
    }`;

  return (
    <AnimatePresence>
      {isOpen && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center p-4 sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-label="Request a free brand review"
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={close}
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative z-10 max-h-[90vh] w-full max-w-lg overflow-y-auto overscroll-contain rounded-3xl border border-zinc-200/80 dark:border-white/20 bg-white/85 dark:bg-zinc-950/40 backdrop-blur-2xl p-6 text-zinc-900 dark:text-white shadow-2xl shadow-black/20 dark:shadow-[0_0_60px_-15px_rgba(255,255,255,0.08)] sm:p-8"
          >
            <button
              type="button"
              onClick={close}
              aria-label="Close"
              className="absolute right-5 top-5 rounded-full border border-zinc-200/80 dark:border-white/[0.08] bg-white/60 dark:bg-white/[0.04] p-2 text-zinc-500 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/[0.08] hover:text-zinc-900 dark:hover:text-white transition-colors"
            >
              <X className="h-4 w-4" />
            </button>

            <header className="mb-6 pr-9">
              <h2 className="text-xl font-black uppercase tracking-tight text-zinc-900 dark:text-white">
                Free Brand Review
              </h2>
              <p className="mt-1.5 text-xs leading-relaxed text-zinc-700 dark:text-zinc-400">
                Haven will audit your brand and give you a clarity score. No sales pitch, just real diagnosis.
              </p>
            </header>

            {/* Step indicator */}
            <div className="mb-7 flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => step > 1 && setStep(1)}
                disabled={step === 1}
                className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-[10px] font-mono uppercase tracking-[0.12em] transition-all ${
                  step === 1
                    ? 'border-blue-500/50 bg-blue-600/10 dark:bg-blue-600/15 text-blue-700 dark:text-blue-200 cursor-default'
                    : 'border-emerald-500/40 bg-emerald-600/10 text-emerald-700 dark:text-emerald-300 cursor-pointer hover:bg-emerald-600/15'
                }`}
              >
                <span
                  className={`flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold ${
                    step === 1 ? 'bg-blue-600 text-white' : 'bg-emerald-600 text-white'
                  }`}
                >
                  {step > 1 ? <CheckCircle2 className="h-3 w-3" /> : '1'}
                </span>
                Details
              </button>

              <span
                className={`h-px flex-1 max-w-[24px] transition-colors ${
                  step > 1 ? 'bg-emerald-500/40' : 'bg-zinc-300 dark:bg-white/[0.08]'
                }`}
              />

              <div
                className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-[10px] font-mono uppercase tracking-[0.12em] ${
                  step === 2
                    ? 'border-blue-500/50 bg-blue-600/10 dark:bg-blue-600/15 text-blue-700 dark:text-blue-200'
                    : 'border-zinc-200/80 dark:border-white/[0.06] bg-white/40 dark:bg-white/[0.02] text-zinc-500'
                }`}
              >
                <span
                  className={`flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold ${
                    step === 2 ? 'bg-blue-600 text-white' : 'bg-zinc-200 dark:bg-white/[0.06] text-zinc-500'
                  }`}
                >
                  2
                </span>
                Platform
              </div>
            </div>

            {step === 1 && (
              <div className="space-y-4">
                {[
                  ['Full Name', 'fullName', 'text', 'Frank Smith'],
                  ['Business / Brand Name', 'brandName', 'text', 'Acme Co.'],
                  ['WhatsApp Number', 'whatsapp', 'tel', '+234 800 000 0000'],
                  ['Email Address', 'email', 'email', 'frank@acme.com'],
                ].map(([label, name, type, placeholder]) => (
                  <label
                    key={name}
                    className="block text-[10px] font-mono uppercase tracking-wider text-zinc-700 dark:text-zinc-400"
                  >
                    {label}
                    <input
                      type={type}
                      name={name}
                      value={formData[name]}
                      onChange={change}
                      placeholder={placeholder}
                      className={`mt-1.5 normal-case tracking-normal ${inputClass(name)}`}
                    />
                    {errors[name] && (
                      <span className="mt-1 block normal-case tracking-normal text-red-500 dark:text-red-400">
                        {errors[name]}
                      </span>
                    )}
                  </label>
                ))}

                <div className="pt-1">
                  <label className="flex items-start gap-3 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={agreedToTerms}
                      onChange={(e) => {
                        setAgreedToTerms(e.target.checked);
                        setErrors((current) => ({ ...current, agreedToTerms: '' }));
                      }}
                      className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-zinc-300 dark:border-white/20 bg-white dark:bg-white/[0.04] text-blue-600 focus:ring-blue-500 focus:ring-offset-0"
                    />
                    <span className="text-xs leading-relaxed text-zinc-700 dark:text-zinc-400">
                      I have read and agree to the{' '}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          openLegalModal('terms');
                        }}
                        className="text-zinc-900 dark:text-zinc-200 underline underline-offset-2 hover:text-blue-600 dark:hover:text-white"
                      >
                        Terms of Service
                      </button>{' '}
                      and{' '}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          openLegalModal('privacy');
                        }}
                        className="text-zinc-900 dark:text-zinc-200 underline underline-offset-2 hover:text-blue-600 dark:hover:text-white"
                      >
                        Privacy Policy
                      </button>
                      . I consent to The Marketing Haven storing my submission to deliver the brand review.
                    </span>
                  </label>
                  {errors.agreedToTerms && (
                    <span className="mt-1.5 block text-xs text-red-500 dark:text-red-400">
                      {errors.agreedToTerms}
                    </span>
                  )}
                </div>

                <button
                  type="button"
                  onClick={continueToPlatform}
                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-3.5 text-xs font-bold uppercase tracking-wider text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-500 active:scale-[0.99]"
                >
                  Continue to Step 2 <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-5">
                <div>
                  <p className="mb-2 text-[10px] font-mono uppercase tracking-wider text-zinc-700 dark:text-zinc-400">
                    Primary Aim Right Now
                  </p>
                  <CustomSelect
                    value={formData.mainGoal}
                    onChange={(v) => {
                      setFormData((current) => ({ ...current, mainGoal: v }));
                      setErrors((current) => ({ ...current, mainGoal: '' }));
                    }}
                    options={goals}
                    placeholder="Select an aim"
                  />
                </div>

                <div>
                  <p className="mb-2 text-[10px] font-mono uppercase tracking-wider text-zinc-700 dark:text-zinc-400">
                    Digital Presence Setup
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {platforms.map(({ id, label, icon: Icon }) => (
                      <button
                        type="button"
                        key={id}
                        onClick={() =>
                          setFormData((current) => ({ ...current, platformType: id }))
                        }
                        className={`flex flex-col items-center gap-1.5 rounded-xl border p-3 text-[11px] transition ${
                          formData.platformType === id
                            ? 'border-blue-500/60 bg-blue-600/10 dark:bg-blue-600/15 text-blue-700 dark:text-white'
                            : 'border-zinc-200/80 dark:border-white/[0.06] bg-white/40 dark:bg-white/[0.02] text-zinc-600 dark:text-zinc-400 hover:border-zinc-300 dark:hover:border-white/15 hover:bg-white/70 dark:hover:bg-white/[0.04]'
                        }`}
                      >
                        <Icon className="h-4 w-4" />
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {formData.platformType === 'website' && (
                  <label className="block text-[10px] font-mono uppercase tracking-wider text-zinc-700 dark:text-zinc-400">
                    Website URL
                    <input
                      type="url"
                      name="websiteUrl"
                      value={formData.websiteUrl}
                      onChange={change}
                      placeholder="https://yourbrand.com"
                      className={`mt-1.5 normal-case tracking-normal ${inputClass('websiteUrl')}`}
                    />
                    {errors.websiteUrl && (
                      <span className="mt-1 block normal-case tracking-normal text-red-500 dark:text-red-400">
                        {errors.websiteUrl}
                      </span>
                    )}
                  </label>
                )}

                {formData.platformType === 'social' && (
                  <div className="space-y-4">
                    <div>
                      <p className="mb-2 text-[10px] font-mono uppercase tracking-wider text-zinc-700 dark:text-zinc-400">
                        Select Platform
                      </p>
                      <div className="grid grid-cols-5 gap-1.5">
                        {socialPlatforms.map(({ name, icon: Icon }) => (
                          <button
                            type="button"
                            key={name}
                            onClick={() =>
                              setFormData((current) => ({
                                ...current,
                                socialPlatform: name,
                              }))
                            }
                            className={`flex flex-col items-center gap-1 rounded-lg border p-2 text-[9px] transition ${
                              formData.socialPlatform === name
                                ? 'border-blue-500/60 bg-blue-600/15 text-blue-700 dark:text-white'
                                : 'border-zinc-200/80 dark:border-white/[0.06] bg-white/40 dark:bg-white/[0.02] text-zinc-600 dark:text-zinc-400 hover:bg-white/70 dark:hover:bg-white/[0.04]'
                            }`}
                          >
                            <Icon className="h-3.5 w-3.5" />
                            <span className="w-full truncate">{name}</span>
                          </button>
                        ))}
                      </div>
                      {errors.socialPlatform && (
                        <p className="mt-1.5 text-xs text-red-500 dark:text-red-400">{errors.socialPlatform}</p>
                      )}
                    </div>

                    <label className="block text-[10px] font-mono uppercase tracking-wider text-zinc-700 dark:text-zinc-400">
                      Handle or Profile Link
                      <input
                        type="text"
                        name="socialLink"
                        value={formData.socialLink}
                        onChange={change}
                        placeholder="@yourbrand or profile URL"
                        className={`mt-1.5 normal-case tracking-normal ${inputClass('socialLink')}`}
                      />
                      {errors.socialLink && (
                        <span className="mt-1 block normal-case tracking-normal text-red-500 dark:text-red-400">
                          {errors.socialLink}
                        </span>
                      )}
                    </label>

                    <div>
                      <p className="mb-1.5 text-[10px] font-mono uppercase tracking-wider text-zinc-700 dark:text-zinc-400">
                        Profile Screenshot
                        <span className="normal-case text-zinc-500"> (required for scoring)</span>
                      </p>
                      <p className="mb-2 text-[11px] leading-relaxed text-zinc-500">
                        Screenshot the <span className="text-zinc-800 dark:text-zinc-300">top of your profile</span> so the bio, follower count, and 3–4 recent posts are visible. This is what Haven reads to score you.
                      </p>
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-zinc-300 dark:border-white/[0.14] bg-white/40 dark:bg-white/[0.02] p-3 text-xs text-zinc-700 dark:text-zinc-300 transition-colors hover:border-blue-500/50 hover:bg-white/70 dark:hover:bg-white/[0.04]"
                      >
                        {imageLoading ? (
                          'Reading image…'
                        ) : (
                          <>
                            <Upload className="h-4 w-4 text-blue-500" />
                            {screenshotFileName || 'Choose image file'}
                          </>
                        )}
                      </button>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        onChange={selectImage}
                        className="hidden"
                      />
                      {screenshotBase64 && (
                        <img
                          src={screenshotBase64}
                          alt="Screenshot preview"
                          className="mt-2 h-12 w-12 rounded-lg border border-zinc-200 dark:border-white/[0.08] object-cover"
                        />
                      )}
                    </div>
                  </div>
                )}

                {formData.platformType === 'none' && (
                  <p className="rounded-xl border border-blue-500/20 bg-blue-500/10 p-3.5 text-xs leading-relaxed text-blue-700 dark:text-blue-300">
                    No setup needed. Haven will learn what you're building and guide your right first steps.
                  </p>
                )}

                <div className="pt-1">
                  <p className="mb-2 text-[10px] font-mono uppercase tracking-wider text-zinc-700 dark:text-zinc-400">
                    Verification
                  </p>
                  <div className="flex justify-center sm:justify-start">
                    <HCaptcha
                      ref={captchaRef}
                      sitekey={HCAPTCHA_SITE_KEY}
                      theme="dark"
                      size="normal"
                      onVerify={(token) => {
                        setCaptchaToken(token);
                        setCaptchaExpired(false);
                        setErrors((current) => ({ ...current, captcha: '' }));
                      }}
                      onExpire={() => {
                        setCaptchaToken(null);
                        setCaptchaExpired(true);
                      }}
                      onError={() => {
                        setCaptchaToken(null);
                        setCaptchaExpired(true);
                      }}
                    />
                  </div>
                  {captchaExpired && !errors.captcha && (
                    <span className="mt-1.5 block text-xs text-amber-600 dark:text-amber-400">
                      Verification expired. Please check the box again.
                    </span>
                  )}
                  {errors.captcha && (
                    <span className="mt-1.5 block text-xs text-red-500 dark:text-red-400">
                      {errors.captcha}
                    </span>
                  )}
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setStep(1);
                      setErrors({});
                    }}
                    className="w-1/3 rounded-xl border border-zinc-200/80 dark:border-white/[0.06] bg-white/40 dark:bg-white/[0.02] py-3.5 text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300 transition hover:bg-white/70 dark:hover:bg-white/[0.05]"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    disabled={imageLoading || verifying}
                    onClick={submit}
                    className="flex w-2/3 items-center justify-center gap-2 rounded-xl bg-blue-600 py-3.5 text-xs font-bold uppercase tracking-wider text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-zinc-400 dark:disabled:bg-zinc-700"
                  >
                    {verifying ? 'Verifying…' : (
                      <>
                        Start Free Brand Review <ArrowRight className="h-4 w-4" />
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
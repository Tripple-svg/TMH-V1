import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import HCaptcha from '@hcaptcha/react-hcaptcha';
import { reviewScreenshotError, reviewScreenshotFileError } from '../../lib/reviewScreenshot';
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
const SUBMISSION_ID_KEY = 'tmh_review_submission_id_v1';
const SAVE_ERROR = 'Something went wrong saving your review. Please try again.';

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
        className={`w-full flex items-center justify-between rounded-xl border bg-white/70 dark:bg-white/[0.04] px-4 py-3 text-base sm:text-sm text-zinc-900 dark:text-white outline-none transition-colors ${
          open
            ? 'border-zinc-500 bg-white/90 dark:border-zinc-400 dark:bg-white/[0.06]'
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
            className="absolute z-40 left-0 right-0 mt-2 rounded-xl border border-zinc-200/80 dark:border-white/[0.08] bg-white dark:bg-zinc-900 shadow-xl shadow-black/15 overflow-hidden"
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
                      ? 'bg-zinc-100 dark:bg-white/[0.08] text-zinc-950 dark:text-white'
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
  const reduceMotion = useReducedMotion();
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
  const [checkingEmail, setCheckingEmail] = useState(false);
  const fileInputRef = useRef(null);
  const captchaRef = useRef(null);
  const submittingRef = useRef(false);
  const submissionIdRef = useRef(null);
  const pendingImageRequiredRef = useRef(false);

  useEffect(() => {
    if (isOpen) {
      const savedForm = loadReviewFormData();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Restore the saved browser form when this modal reopens.
      setStep(loadReviewFormStep());
      setErrors({});
      try {
        const pendingId = sessionStorage.getItem(SUBMISSION_ID_KEY);
        const pending = JSON.parse(sessionStorage.getItem(`haven_review_creation_${pendingId}`) || 'null');
        const snapshot = pending?.submission || pending;
        if (pending?.submission) {
          for (const field of Object.keys(DEFAULT_FORM_DATA)) {
            if (snapshot[field] !== undefined) savedForm[field] = snapshot[field];
          }
          setAgreedToTerms(snapshot.agreedToTerms === true);
        }
        if (snapshot?.screenshotBase64) {
          setScreenshotBase64(snapshot.screenshotBase64);
          setScreenshotFileName(snapshot.screenshotFileName || 'Saved screenshot');
        } else if (snapshot?.screenshotFileName) {
          pendingImageRequiredRef.current = true;
          setErrors({ screenshot: 'Please reselect your original screenshot to retry the saved submission.' });
        }
      } catch { /* The original draft remains available if pending storage cannot be read. */ }
      setFormData(savedForm);
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
    setCheckingEmail(false);
    submittingRef.current = false;
    submissionIdRef.current = null;
    pendingImageRequiredRef.current = false;
    try {
      sessionStorage.removeItem(SUBMISSION_ID_KEY);
    } catch { /* Browser storage is optional. */ }
    captchaRef.current?.resetCaptcha();
    clearReviewFormData();
  };

  const close = () => {
    if (!submittingRef.current) onClose?.();
  };

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
      if (pendingImageRequiredRef.current && !screenshotBase64) {
        next.screenshot = 'Please reselect your original screenshot to retry the saved submission.';
      } else if (errors.screenshot && !screenshotBase64) {
        next.screenshot = errors.screenshot;
      }
    }
    const screenshotError = reviewScreenshotError(screenshotBase64);
    if (screenshotError) next.screenshot = screenshotError;
    if (!captchaToken) next.captcha = 'Please complete the verification check above.';
    return next;
  };

  const continueToPlatform = async () => {
    const next = validateStepOne();
    setErrors(next);
    if (Object.keys(next).length || checkingEmail) return;

    setCheckingEmail(true);
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      const response = await fetch(`${supabaseUrl}/functions/v1/check-email-exists`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${supabaseAnonKey}`,
          apikey: supabaseAnonKey,
        },
        body: JSON.stringify({ email: formData.email.trim() }),
      });

      if (!response.ok) {
        setErrors({email:response.status===429?'Too many email checks. Please wait 10 minutes, then try again.':'We could not check your email. Please try again shortly.'});
        return;
      }

      const data = await response.json();
      if (data?.exists === true) {
        setErrors({
          email: 'This email already has a review. Continue on the original device, or contact info@themarketinghaven.xyz for help recovering access.',
        });
        return;
      }
    } catch (error) {
      console.error('Unable to check whether the email has already submitted a review:', error);
      setErrors({email:'We could not check your email. Check your connection and try again.'});
      return;
    } finally {
      setCheckingEmail(false);
    }

    setStep(2);
  };

  const selectImage = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const fileError = reviewScreenshotFileError(file);
    if (fileError) {
      setScreenshotBase64(null);
      setScreenshotFileName('');
      setErrors((current) => ({ ...current, screenshot: fileError }));
      event.target.value = '';
      return;
    }
    setImageLoading(true);
    setScreenshotFileName(file.name);
    setErrors((current) => ({ ...current, screenshot: '' }));
    const reader = new FileReader();
    reader.onload = () => {
      const image = String(reader.result);
      const error = reviewScreenshotError(image);
      if (error) {
        setScreenshotBase64(null);
        setScreenshotFileName('');
        setErrors((current) => ({ ...current, screenshot: error }));
        setImageLoading(false);
        return;
      }
      setScreenshotBase64(image);
      pendingImageRequiredRef.current = false;
      setImageLoading(false);
    };
    reader.onerror = () => {
      setScreenshotBase64(null);
      setScreenshotFileName('');
      setImageLoading(false);
      setErrors((current) => ({ ...current, screenshot: 'This image could not be read. Please select it again.' }));
    };
    reader.readAsDataURL(file);
  };

  const submit = async () => {
    if (submittingRef.current) return;

    const firstStepErrors = validateStepOne();
    const next = { ...firstStepErrors, ...validateStepTwo() };
    setErrors(next);
    if (Object.keys(firstStepErrors).length) setStep(1);
    if (Object.keys(next).length) return;

    submittingRef.current = true;
    setVerifying(true);

    try {
      if (!submissionIdRef.current) {
        let savedId;
        try {
          savedId = sessionStorage.getItem(SUBMISSION_ID_KEY);
        } catch { /* Keep the submission id in memory when storage is unavailable. */ }
        submissionIdRef.current = /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(savedId || '')
          ? savedId : crypto.randomUUID();
        try {
          sessionStorage.setItem(SUBMISSION_ID_KEY, submissionIdRef.current);
        } catch { /* The ref still preserves retries while this modal is mounted. */ }
      }
      const result = await onSubmit?.({
        ...formData,
        id: submissionIdRef.current,
        agreedToTerms,
        agreedAt: new Date().toISOString(),
        hcaptchaToken: captchaToken,
        screenshotBase64,
        screenshotFileName,
      });
      if (result?.success !== true) {
        const error = new Error(result?.error || SAVE_ERROR);
        error.code = result?.code;
        throw error;
      }
      hardReset();
    } catch (error) {
      setErrors({ submit: error.code === 'pending_submission_changed' ? error.message : SAVE_ERROR, pendingChanged: error.code === 'pending_submission_changed' });
      setCaptchaToken(null);
      setCaptchaExpired(false);
      captchaRef.current?.resetCaptcha();
    } finally {
      submittingRef.current = false;
      setVerifying(false);
    }
  };

  const inputClass = (field) =>
    `w-full rounded-xl border bg-white/70 dark:bg-white/[0.04] px-4 py-3 text-base sm:text-sm text-zinc-900 dark:text-white placeholder:text-zinc-400 dark:placeholder:text-zinc-500 outline-none transition-colors focus:border-zinc-500 dark:focus:border-zinc-400 ${
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
          aria-busy={verifying}
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={close}
            className="absolute inset-0 bg-black/70"
          />

          <motion.div
            initial={{ opacity: 0, scale: reduceMotion ? 1 : 0.98, y: reduceMotion ? 0 : 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: reduceMotion ? 1 : 0.98, y: reduceMotion ? 0 : 16 }}
            transition={{ duration: reduceMotion ? 0 : 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="relative z-10 max-h-[90vh] w-full max-w-lg overflow-y-auto overscroll-contain rounded-2xl border border-white/70 dark:border-white/10 bg-zinc-50 dark:bg-zinc-950 sm:bg-white/95 sm:dark:bg-zinc-950/95 sm:backdrop-blur-lg p-6 text-zinc-900 dark:text-white shadow-[0_24px_80px_rgba(0,0,0,0.28)] sm:p-8"
          >
            <button
              type="button"
              onClick={close}
              aria-label="Close"
              disabled={verifying}
              className="absolute right-4 top-4 h-11 w-11 flex items-center justify-center rounded-xl text-zinc-500 dark:text-zinc-300 hover:bg-zinc-200/60 dark:hover:bg-white/[0.08] hover:text-zinc-900 dark:hover:text-white transition-colors focus-visible:outline-2 focus-visible:outline-zinc-500"
            >
              <X className="h-4 w-4" />
            </button>

            <header className="mb-6 pr-9">
              <h2 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-white">
                Free Brand Review
              </h2>
              <p className="mt-1.5 text-xs leading-relaxed text-zinc-700 dark:text-zinc-400">
                Tell Haven about your brand. With a readable website or profile screenshot, you will get a review of the visible offer and next step. You can also start a conversation without one.
              </p>
            </header>

            {errors.submit && (
              <div role="alert" className="mb-5 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-300">
                {errors.submit}
              </div>
            )}

            {/* Step indicator */}
            <div className="mb-7 flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => step > 1 && setStep(1)}
                disabled={step === 1 || verifying}
                aria-current={step === 1 ? 'step' : undefined}
                className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-[10px] font-medium uppercase tracking-[0.12em] transition-colors ${
                  step === 1
                    ? 'border-zinc-300 dark:border-white/20 bg-white/80 dark:bg-white/[0.06] text-zinc-900 dark:text-white cursor-default'
                    : 'border-zinc-200 dark:border-white/10 bg-white/50 dark:bg-white/[0.02] text-zinc-600 dark:text-zinc-300 cursor-pointer hover:bg-white dark:hover:bg-white/[0.06]'
                }`}
              >
                <span
                  className="flex h-5 w-5 items-center justify-center rounded-md bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-950 text-[9px] font-medium"
                >
                  {step > 1 ? <CheckCircle2 className="h-3 w-3" /> : '1'}
                </span>
                Details
              </button>

              <span
                className={`h-px flex-1 max-w-[24px] transition-colors ${
                  step > 1 ? 'bg-zinc-500 dark:bg-zinc-400' : 'bg-zinc-300 dark:bg-white/[0.08]'
                }`}
              />

              <div
                aria-current={step === 2 ? 'step' : undefined}
                className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-[10px] font-medium uppercase tracking-[0.12em] ${
                  step === 2
                    ? 'border-zinc-300 dark:border-white/20 bg-white/80 dark:bg-white/[0.06] text-zinc-900 dark:text-white'
                    : 'border-zinc-200/80 dark:border-white/[0.06] bg-white/40 dark:bg-white/[0.02] text-zinc-500'
                }`}
              >
                <span
                  className={`flex h-5 w-5 items-center justify-center rounded-md text-[9px] font-medium ${
                    step === 2 ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-950' : 'bg-zinc-200 dark:bg-white/[0.06] text-zinc-500'
                  }`}
                >
                  2
                </span>
                Platform
              </div>
            </div>

            <fieldset disabled={verifying} className="min-w-0">
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
                      className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-zinc-300 dark:border-white/20 bg-white dark:bg-white/[0.04] accent-zinc-800 dark:accent-zinc-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-500"
                    />
                    <span className="text-xs leading-relaxed text-zinc-700 dark:text-zinc-400">
                      I have read and agree to the{' '}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          openLegalModal('terms');
                        }}
                        className="text-zinc-900 dark:text-zinc-200 underline underline-offset-2 hover:text-zinc-600 dark:hover:text-white"
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
                        className="text-zinc-900 dark:text-zinc-200 underline underline-offset-2 hover:text-zinc-600 dark:hover:text-white"
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
                  disabled={checkingEmail}
                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-zinc-900 dark:bg-zinc-100 py-3.5 text-xs font-semibold tracking-wide text-white dark:text-zinc-950 transition-colors hover:bg-zinc-700 dark:hover:bg-white disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-500"
                >
                  {checkingEmail ? 'Checking…' : (
                    <>
                      Continue to Step 2 <ArrowRight className="h-4 w-4" />
                    </>
                  )}
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
                            ? 'border-zinc-400 dark:border-white/25 bg-white/90 dark:bg-white/[0.08] text-zinc-950 dark:text-white'
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
                                ? 'border-zinc-400 dark:border-white/25 bg-white/90 dark:bg-white/[0.08] text-zinc-950 dark:text-white'
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
                        Screenshot the <span className="text-zinc-800 dark:text-zinc-300">top of your profile</span> with a readable bio and recent posts. Haven reviews what is visible, not your posting frequency, engagement quality or sales.
                      </p>
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-zinc-300 dark:border-white/[0.14] bg-white/40 dark:bg-white/[0.02] p-3 text-xs text-zinc-700 dark:text-zinc-300 transition-colors hover:border-zinc-500 dark:hover:border-zinc-400 hover:bg-white/70 dark:hover:bg-white/[0.04]"
                      >
                        {imageLoading ? (
                          'Reading image…'
                        ) : (
                          <>
                            <Upload className="h-4 w-4 text-zinc-500 dark:text-zinc-400" />
                            {screenshotFileName || 'Choose image file'}
                          </>
                        )}
                      </button>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
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
                      {errors.screenshot && (
                        <p role="alert" className="mt-2 text-xs text-amber-600 dark:text-amber-400">{errors.screenshot}</p>
                      )}
                    </div>
                  </div>
                )}

                {formData.platformType === 'none' && (
                  <p className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white/60 dark:bg-white/[0.03] p-3.5 text-xs leading-relaxed text-zinc-600 dark:text-zinc-300">
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

                {errors.pendingChanged && <button type="button" onClick={() => {
                  submissionIdRef.current = null;
                  try { sessionStorage.removeItem(SUBMISSION_ID_KEY); } catch { /* Optional storage. */ }
                  setErrors({});
                }} className="w-full rounded-xl border border-zinc-400 px-4 py-3 text-sm text-zinc-800 dark:text-zinc-200">Start a new submission with these details</button>}
                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    disabled={verifying}
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
                    className="flex w-2/3 items-center justify-center gap-2 rounded-xl bg-zinc-900 dark:bg-zinc-100 py-3.5 text-xs font-semibold tracking-wide text-white dark:text-zinc-950 transition-colors hover:bg-zinc-700 dark:hover:bg-white disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-500"
                  >
                    {verifying ? 'Saving…' : (
                      <>
                        Start Free Brand Review <ArrowRight className="h-4 w-4" />
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
            </fieldset>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

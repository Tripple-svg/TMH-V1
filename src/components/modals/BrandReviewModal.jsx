import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, Building2, Camera, CheckCircle2, Globe, Play, Share2, Upload, Video, X } from 'lucide-react';
import {
  loadReviewFormData,
  saveReviewFormData,
  loadReviewFormStep,
  saveReviewFormStep,
  clearReviewFormData,
  DEFAULT_FORM_DATA,
} from '../haven/utils/reviewPersistence';

const goals = ['More Leads & Enquiries', 'Higher Sales & Conversions', 'Better Website / Brand Design', 'Improve Social Media Presence', 'Build Brand Authority'];
const platforms = [{ id: 'website', label: 'Website', icon: Globe }, { id: 'social', label: 'Social', icon: Share2 }, { id: 'none', label: 'None yet', icon: Building2 }];
const socialPlatforms = [{ name: 'Instagram', icon: Camera }, { name: 'TikTok', icon: Video }, { name: 'X / Twitter', icon: Share2 }, { name: 'LinkedIn', icon: Building2 }, { name: 'YouTube', icon: Play }];

export default function BrandReviewModal({ isOpen, onClose, onSubmit }) {
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState(DEFAULT_FORM_DATA);
  const [errors, setErrors] = useState({});
  const [screenshotBase64, setScreenshotBase64] = useState(null);
  const [screenshotFileName, setScreenshotFileName] = useState('');
  const [imageLoading, setImageLoading] = useState(false);
  const fileInputRef = useRef(null);

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

  const hardReset = () => {
    setStep(1);
    setFormData(DEFAULT_FORM_DATA);
    setErrors({});
    setScreenshotBase64(null);
    setScreenshotFileName('');
    setImageLoading(false);
    clearReviewFormData();
  };

  const close = () => { onClose?.(); };

  const change = (event) => {
    const { name, value } = event.target;
    setFormData((current) => ({ ...current, [name]: value }));
    setErrors((current) => ({ ...current, [name]: '' }));
  };

  const validateStepOne = () => {
    const next = {};
    if (!formData.fullName.trim()) next.fullName = 'Please enter your full name.';
    if (!formData.brandName.trim()) next.brandName = 'Please enter your brand name.';
    if (!formData.whatsapp.trim()) next.whatsapp = 'Please enter your WhatsApp number.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) next.email = 'Please enter a valid email address.';
    return next;
  };
  const validateStepTwo = () => {
    const next = {};
    if (formData.platformType === 'website' && !formData.websiteUrl.trim()) next.websiteUrl = 'Please enter your website URL.';
    if (formData.platformType === 'social') {
      if (!formData.socialPlatform) next.socialPlatform = 'Choose a social platform.';
      if (!formData.socialLink.trim()) next.socialLink = 'Please enter your handle or profile link.';
    }
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
    reader.onload = () => { setScreenshotBase64(String(reader.result)); setImageLoading(false); };
    reader.onerror = () => { setScreenshotBase64(null); setScreenshotFileName(''); setImageLoading(false); };
    reader.readAsDataURL(file);
  };
  const submit = () => {
    const next = validateStepTwo();
    setErrors(next);
    if (Object.keys(next).length) return;
    const payload = { id: crypto.randomUUID(), ...formData, screenshotBase64, screenshotFileName };
    onSubmit?.(payload);
    hardReset();
  };
  const inputClass = (field) => `w-full rounded-xl border bg-zinc-800/80 px-4 py-3 text-sm text-white placeholder:text-zinc-500 outline-none transition focus:border-blue-500 ${errors[field] ? 'border-red-500' : 'border-white/10'}`;

  return <AnimatePresence>
    {isOpen && <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 sm:p-6" role="dialog" aria-modal="true" aria-label="Request a free brand review">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={close} className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
      <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }} className="relative z-10 max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl border border-white/15 bg-zinc-900 p-6 text-white shadow-2xl sm:p-8">
        <button type="button" onClick={close} aria-label="Close" className="absolute right-5 top-5 rounded-full bg-white/10 p-2 text-zinc-300 hover:bg-white/20 hover:text-white"><X className="h-4 w-4" /></button>
        <header className="mb-5 pr-9"><h2 className="text-xl font-black uppercase tracking-tight">Free Brand Review</h2><p className="mt-1 text-xs leading-relaxed text-zinc-400">Haven will audit your brand and give you a clarity score — no sales pitch, just real diagnosis.</p></header>
        <div className="mb-6 flex gap-2 text-[10px] font-mono"><span className={`rounded-md border px-3 py-1 ${step === 1 ? 'border-blue-500 bg-blue-600/30 text-blue-200' : 'border-emerald-500/50 bg-emerald-600/20 text-emerald-300'}`}>{step > 1 && <CheckCircle2 className="mr-1 inline h-3 w-3" />}STEP 1 — DETAILS</span><span className={`rounded-md border px-3 py-1 ${step === 2 ? 'border-blue-500 bg-blue-600/30 text-blue-200' : 'border-white/10 bg-white/5 text-zinc-500'}`}>STEP 2 — PLATFORM</span></div>
        {step === 1 && <div className="space-y-4">
          {[['Full Name', 'fullName', 'text', 'Frank Smith'], ['Business / Brand Name', 'brandName', 'text', 'Acme Co.'], ['WhatsApp Number', 'whatsapp', 'tel', '+234 800 000 0000'], ['Email Address', 'email', 'email', 'frank@acme.com']].map(([label, name, type, placeholder]) => <label key={name} className="block text-[10px] font-mono uppercase tracking-wider text-zinc-400">{label}<input type={type} name={name} value={formData[name]} onChange={change} placeholder={placeholder} className={`mt-1.5 normal-case tracking-normal ${inputClass(name)}`} />{errors[name] && <span className="mt-1 block normal-case tracking-normal text-red-400">{errors[name]}</span>}</label>)}
          <button type="button" onClick={continueToPlatform} className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-3.5 text-xs font-bold uppercase tracking-wider text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-500">Continue to Step 2 <ArrowRight className="h-4 w-4" /></button>
        </div>}
        {step === 2 && <div className="space-y-4">
          <label className="block text-[10px] font-mono uppercase tracking-wider text-zinc-400">Primary Aim Right Now<select name="mainGoal" value={formData.mainGoal} onChange={change} className="mt-1.5 w-full rounded-xl border border-white/10 bg-zinc-800/80 px-4 py-3 text-sm normal-case tracking-normal text-white outline-none focus:border-blue-500">{goals.map((goal) => <option key={goal}>{goal}</option>)}</select></label>
          <div><p className="mb-2 text-[10px] font-mono uppercase tracking-wider text-zinc-400">Digital Presence Setup</p><div className="grid grid-cols-3 gap-2">{platforms.map(({ id, label, icon: Icon }) => <button type="button" key={id} onClick={() => setFormData((current) => ({ ...current, platformType: id }))} className={`flex flex-col items-center gap-1.5 rounded-xl border p-3 text-[11px] transition ${formData.platformType === id ? 'border-blue-500 bg-blue-600/20 text-white' : 'border-white/5 bg-zinc-800/40 text-zinc-400 hover:bg-zinc-800'}`}><Icon className="h-4 w-4" />{label}</button>)}</div></div>
          {formData.platformType === 'website' && <label className="block text-[10px] font-mono uppercase tracking-wider text-zinc-400">Website URL<input type="url" name="websiteUrl" value={formData.websiteUrl} onChange={change} placeholder="https://yourbrand.com" className={`mt-1.5 normal-case tracking-normal ${inputClass('websiteUrl')}`} />{errors.websiteUrl && <span className="mt-1 block normal-case tracking-normal text-red-400">{errors.websiteUrl}</span>}</label>}
          {formData.platformType === 'social' && <div className="space-y-3">
            <div>
              <p className="mb-1.5 text-[10px] font-mono uppercase tracking-wider text-zinc-400">Select Platform</p>
              <div className="grid grid-cols-5 gap-1.5">{socialPlatforms.map(({ name, icon: Icon }) => <button type="button" key={name} onClick={() => setFormData((current) => ({ ...current, socialPlatform: name }))} className={`flex flex-col items-center gap-1 rounded-lg border p-2 text-[9px] ${formData.socialPlatform === name ? 'border-blue-500 bg-blue-600/30 text-white' : 'border-white/5 bg-zinc-800/40 text-zinc-400'}`}><Icon className="h-3.5 w-3.5" /><span className="w-full truncate">{name}</span></button>)}</div>
              {errors.socialPlatform && <p className="mt-1 text-xs text-red-400">{errors.socialPlatform}</p>}
            </div>
            <label className="block text-[10px] font-mono uppercase tracking-wider text-zinc-400">Handle or Profile Link<input type="text" name="socialLink" value={formData.socialLink} onChange={change} placeholder="@yourbrand or profile URL" className={`mt-1.5 normal-case tracking-normal ${inputClass('socialLink')}`} />{errors.socialLink && <span className="mt-1 block normal-case tracking-normal text-red-400">{errors.socialLink}</span>}</label>
            <div>
              <p className="mb-1.5 text-[10px] font-mono uppercase tracking-wider text-zinc-400">
                Profile Screenshot
                <span className="normal-case text-zinc-500"> — required for scoring</span>
              </p>
              <p className="mb-2 text-[11px] leading-relaxed text-zinc-500">
                Screenshot the <span className="text-zinc-300">top of your profile</span> so the bio, follower count, and 3–4 recent posts are visible. This is what Haven reads to score you.
              </p>
              <button type="button" onClick={() => fileInputRef.current?.click()} className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-white/20 bg-zinc-800/40 p-3 text-xs text-zinc-300 hover:border-blue-500">{imageLoading ? 'Reading image…' : <><Upload className="h-4 w-4 text-blue-400" />{screenshotFileName || 'Choose image file'}</>}</button>
              <input ref={fileInputRef} type="file" accept="image/*" onChange={selectImage} className="hidden" />
              {screenshotBase64 && <img src={screenshotBase64} alt="Screenshot preview" className="mt-2 h-12 w-12 rounded-lg border border-white/10 object-cover" />}
            </div>
          </div>}
          {formData.platformType === 'none' && <p className="rounded-xl border border-blue-500/20 bg-blue-500/10 p-3.5 text-xs leading-relaxed text-blue-300">No setup needed. Haven will learn what you're building and guide your right first steps.</p>}
          <div className="flex gap-2 pt-2"><button type="button" onClick={() => { setStep(1); setErrors({}); }} className="w-1/3 rounded-xl bg-zinc-800 py-3.5 text-xs font-bold uppercase tracking-wider text-zinc-300 hover:bg-zinc-700">Back</button><button type="button" disabled={imageLoading} onClick={submit} className="flex w-2/3 items-center justify-center gap-2 rounded-xl bg-blue-600 py-3.5 text-xs font-bold uppercase tracking-wider text-white shadow-lg shadow-blue-600/20 hover:bg-blue-500 disabled:bg-zinc-700">Start Free Brand Review <ArrowRight className="h-4 w-4" /></button></div>
        </div>}
      </motion.div>
    </div>}
  </AnimatePresence>;
}
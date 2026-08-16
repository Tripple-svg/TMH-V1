import React, { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Upload, Globe, Smartphone, MessageCircle, ChevronDown, Send,
  User, Phone, Building2, Mail, Link as LinkIcon,
  AtSign, X, AlertCircle
} from 'lucide-react';
import { useUser } from '../../context/UserContext';

const socialPlatforms = [
  'Instagram', 'TikTok', 'Facebook', 'LinkedIn',
  'Twitter / X', 'YouTube', 'Pinterest', 'WhatsApp Business', 'Other'
];

export default function ReviewForm({ onClose, onSubmitForm, onLaunchHaven }) {
  const { saveUserData } = useUser();
  const [form, setForm] = useState({
    fullName: '', whatsapp: '', brandName: '', email: '',
    platformType: 'website',
    websiteUrl: '', socialPlatform: '', socialHandle: ''
  });
  const [files, setFiles] = useState([]);
  const [filePreviews, setFilePreviews] = useState([]);
  const [dragging, setDragging] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Sync previews safely to avoid memory leaks with createObjectURL
  useEffect(() => {
    const newPreviews = files.map(file => URL.createObjectURL(file));
    setFilePreviews(newPreviews);

    return () => {
      newPreviews.forEach(url => URL.revokeObjectURL(url));
    };
  }, [files]);

  const update = e => {
    setErrorMsg('');
    setForm(p => ({ ...p, [e.target.name]: e.target.value }));
  };

  const setType = type => {
    setErrorMsg('');
    setForm(p => ({ ...p, platformType: type }));
  };

  const validateStep1 = () => {
    if (!form.fullName.trim() || !form.whatsapp.trim() || !form.brandName.trim() || !form.email.trim()) {
      setErrorMsg('Please complete all Step 1 identity fields first.');
      return false;
    }
    return true;
  };

  const onDragOver = useCallback(e => { e.preventDefault(); setDragging(true); }, []);
  const onDragLeave = useCallback(e => { e.preventDefault(); setDragging(false); }, []);
  
  const onDrop = useCallback(e => {
    e.preventDefault(); 
    setDragging(false);
    const dropped = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
    setFiles(prev => [...prev, ...dropped].slice(0, 4));
  }, []);

  const onFileInput = e => {
    const selected = Array.from(e.target.files).filter(f => f.type.startsWith('image/'));
    setFiles(prev => [...prev, ...selected].slice(0, 4));
    e.target.value = ''; // Reset input to allow re-selecting same file if needed
  };

  const removeFile = i => setFiles(prev => prev.filter((_, idx) => idx !== i));

  const handleSubmit = e => {
    e.preventDefault();
    if (!validateStep1()) return;

    if (form.platformType === 'none') {
      const payload = { ...form, platformType: 'none' };
      saveUserData(payload);
      onLaunchHaven(payload);
    } else {
      const payload = { ...form, files: files.map(f => f.name) };
      saveUserData(payload);
      onSubmitForm(payload);
    }
  };

  const inputBase = `w-full rounded-xl backdrop-blur-sm border px-4 py-3.5 pl-11 text-sm sm:text-base outline-none transition-all duration-300 focus:border-blue-500/60 focus:ring-2 focus:ring-blue-500/20`;
  const inputTheme = `bg-white/5 border-white/10 text-white placeholder-gray-500 focus:bg-white/10 hover:border-white/20`;
  const labelBase = "block text-xs font-medium tracking-wider uppercase text-gray-400 mb-2";

  return (
    <motion.div className="fixed inset-0 z-[60] flex items-center justify-center p-4 sm:p-6 overflow-y-auto"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}>
      <div className="fixed inset-0 bg-black/80 backdrop-blur-md" onClick={onClose} />
      
      <motion.div className="relative w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl sm:rounded-3xl bg-[#111827]/95 backdrop-blur-xl border border-white/10 shadow-2xl my-auto"
        initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}>
        
        <button onClick={onClose} aria-label="Close modal"
          className="absolute top-4 right-4 z-10 w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 transition-all">
          <X className="w-5 h-5" />
        </button>

        <div className="p-6 sm:p-10 md:p-12">
          <div className="mb-8 sm:mb-10">
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white tracking-tight mb-2">Request Your Free Brand Review</h2>
            <p className="text-gray-400 text-sm sm:text-base">Tell us about your brand. We'll audit your presence and deliver a strategic roadmap.</p>
          </div>

          {errorMsg && (
            <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/30 flex items-center gap-3 text-red-400 text-sm">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-10">
            {/* Step 1 */}
            <div>
              <div className="flex items-center gap-3 mb-6">
                <div className="w-8 h-8 rounded-lg bg-blue-600/20 border border-blue-500/30 flex items-center justify-center">
                  <User className="w-4 h-4 text-blue-400" />
                </div>
                <h3 className="text-sm font-semibold tracking-widest uppercase text-gray-300">Step 1 — Your Identity</h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div className="sm:col-span-2">
                  <label className={labelBase}>Full Name</label>
                  <div className="relative">
                    <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                    <input type="text" name="fullName" required placeholder="John Doe" value={form.fullName} onChange={update} className={`${inputBase} ${inputTheme}`} />
                  </div>
                </div>
                <div>
                  <label className={labelBase}>WhatsApp Number</label>
                  <div className="relative">
                    <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                    <input type="tel" name="whatsapp" required placeholder="+234 800 000 0000" value={form.whatsapp} onChange={update} className={`${inputBase} ${inputTheme}`} />
                  </div>
                </div>
                <div>
                  <label className={labelBase}>Brand Name</label>
                  <div className="relative">
                    <Building2 className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                    <input type="text" name="brandName" required placeholder="Acme Co." value={form.brandName} onChange={update} className={`${inputBase} ${inputTheme}`} />
                  </div>
                </div>
                <div className="sm:col-span-2">
                  <label className={labelBase}>Email Address</label>
                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                    <input type="email" name="email" required placeholder="john@acme.co" value={form.email} onChange={update} className={`${inputBase} ${inputTheme}`} />
                  </div>
                </div>
              </div>
            </div>

            <div className="h-[1px] bg-gradient-to-r from-transparent via-white/10 to-transparent" />

            {/* Step 2 */}
            <div>
              <div className="flex items-center gap-3 mb-6">
                <div className="w-8 h-8 rounded-lg bg-blue-600/20 border border-blue-500/30 flex items-center justify-center">
                  <Globe className="w-4 h-4 text-blue-400" />
                </div>
                <h3 className="text-sm font-semibold tracking-widest uppercase text-gray-300">Step 2 — Your Platform</h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
                <button type="button" onClick={() => setType('website')}
                  className={`flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-300 border ${
                    form.platformType === 'website'
                      ? 'bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-900/30'
                      : 'bg-white/5 border-white/10 text-gray-400 hover:text-gray-200 hover:bg-white/10'
                  }`}>
                  <Globe className="w-4 h-4" /><span>I Have a Website</span>
                </button>
                <button type="button" onClick={() => setType('social')}
                  className={`flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-300 border ${
                    form.platformType === 'social'
                      ? 'bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-900/30'
                      : 'bg-white/5 border-white/10 text-gray-400 hover:text-gray-200 hover:bg-white/10'
                  }`}>
                  <Smartphone className="w-4 h-4" /><span>Social Only</span>
                </button>
                <button type="button" onClick={() => setType('none')}
                  className={`flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-300 border ${
                    form.platformType === 'none'
                      ? 'bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-900/30'
                      : 'bg-white/5 border-white/10 text-gray-400 hover:text-gray-200 hover:bg-white/10'
                  }`}>
                  <MessageCircle className="w-4 h-4" /><span>None Yet</span>
                </button>
              </div>

              <AnimatePresence mode="wait">
                {form.platformType === 'website' && (
                  <motion.div key="web" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.3 }}>
                    <label className={labelBase}>Website URL</label>
                    <div className="relative">
                      <LinkIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                      <input type="url" name="websiteUrl" required placeholder="https://yourbrand.com" value={form.websiteUrl} onChange={update} className={`${inputBase} ${inputTheme}`} />
                    </div>
                  </motion.div>
                )}

                {form.platformType === 'social' && (
                  <motion.div key="soc" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.3 }} className="space-y-5">
                    <div>
                      <label className={labelBase}>Primary Platform</label>
                      <div className="relative">
                        <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
                        <select name="socialPlatform" required value={form.socialPlatform} onChange={update}
                          className={`${inputBase} ${inputTheme} appearance-none pr-10 cursor-pointer`}>
                          <option value="" disabled className="bg-gray-900 text-gray-500">Select platform</option>
                          {socialPlatforms.map(p => <option key={p} value={p} className="bg-gray-900 text-white">{p}</option>)}
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className={labelBase}>Social Handle</label>
                      <div className="relative">
                        <AtSign className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                        <input type="text" name="socialHandle" required placeholder="@yourbrand" value={form.socialHandle} onChange={update} className={`${inputBase} ${inputTheme}`} />
                      </div>
                    </div>
                    <div>
                      <label className={labelBase}>Profile Screenshots</label>
                      <div onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}
                        className={`relative border-2 border-dashed rounded-xl p-6 sm:p-8 transition-all duration-300 text-center cursor-pointer ${
                          dragging ? 'border-blue-500 bg-blue-600/10' : 'border-white/10 bg-white/[0.02] hover:border-white/20 hover:bg-white/5'
                        }`}>
                        <input type="file" accept="image/*" multiple onChange={onFileInput} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                        <div className="flex flex-col items-center gap-3 pointer-events-none">
                          <div className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${dragging ? 'bg-blue-600/30' : 'bg-white/5'}`}>
                            <Upload className={`w-5 h-5 ${dragging ? 'text-blue-400' : 'text-gray-400'}`} />
                          </div>
                          <p className="text-sm text-gray-300 font-medium">{dragging ? 'Drop images here' : 'Drag & drop screenshots'}</p>
                          <p className="text-xs text-gray-500">PNG, JPG • up to 4 files</p>
                        </div>
                      </div>
                      <AnimatePresence>
                        {filePreviews.length > 0 && (
                          <motion.div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}>
                            {filePreviews.map((previewUrl, i) => (
                              <motion.div key={previewUrl} layout initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.8, opacity: 0 }}
                                className="relative group aspect-square rounded-lg border border-white/10 bg-black/30 overflow-hidden">
                                <img src={previewUrl} alt="Screenshot preview" className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" />
                                <button type="button" onClick={() => removeFile(i)}
                                  className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/60 border border-white/10 flex items-center justify-center text-gray-300 hover:text-white hover:bg-red-500/80 transition-all">
                                  <X className="w-3 h-3" />
                                </button>
                              </motion.div>
                            ))}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </motion.div>
                )}

                {form.platformType === 'none' && (
                  <motion.div key="none" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.3 }}
                    className="rounded-xl bg-blue-600/10 border border-blue-500/20 p-5 text-center">
                    <p className="text-sm text-blue-200">No problem! Click the button below and Haven will guide you through building from scratch.</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="h-[1px] bg-gradient-to-r from-transparent via-white/10 to-transparent" />

            {/* Step 3 CTA */}
            {form.platformType === 'none' ? (
              <motion.button type="submit"
                className="relative w-full py-4 sm:py-5 rounded-xl font-semibold text-sm sm:text-base tracking-wide uppercase border border-blue-500/50 transition-all duration-300 flex items-center justify-center gap-3 bg-blue-600 hover:bg-blue-500 hover:shadow-[0_0_40px_rgba(37,99,235,0.35)] active:scale-[0.98]"
                whileTap={{ scale: 0.98 }}>
                <MessageCircle className="w-5 h-5 text-white" />
                <span className="text-white">Talk to Haven — Start from Scratch</span>
              </motion.button>
            ) : (
              <motion.button type="submit"
                className="relative w-full py-4 sm:py-5 rounded-xl font-semibold text-sm sm:text-base tracking-wide uppercase border border-blue-500/50 transition-all duration-300 flex items-center justify-center gap-3 bg-blue-600 hover:bg-blue-500 hover:shadow-[0_0_40px_rgba(37,99,235,0.35)] active:scale-[0.98]"
                whileTap={{ scale: 0.98 }}>
                <Send className="w-5 h-5 text-white" />
                <span className="text-white">Request Free Brand Review</span>
              </motion.button>
            )}
          </form>
        </div>
      </motion.div>
    </motion.div>
  );
}
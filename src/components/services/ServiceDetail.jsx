import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Bot, CheckCircle2 } from 'lucide-react';

export default function ServiceDetail({ service, onClose }) {
  if (!service) return null;

  return (
    <AnimatePresence>
      <motion.div className="fixed inset-0 z-[60] flex items-center justify-center p-4 sm:p-6 overflow-y-auto"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
        
        <motion.div className="relative w-full max-w-lg max-h-[90vh] flex flex-col rounded-2xl bg-gray-900 text-white backdrop-blur-xl border border-white/10 shadow-2xl overflow-hidden my-auto"
          initial={{ y: 20, scale: 0.95 }} animate={{ y: 0, scale: 1 }} exit={{ y: 20, scale: 0.95 }} transition={{ type: 'spring', damping: 25, stiffness: 300 }}>
          
          <div className="p-6 sm:p-8 overflow-y-auto custom-scrollbar">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-blue-600/20 border border-blue-500/30 flex items-center justify-center">
                  <Bot className="w-5 h-5 text-blue-400" />
                </div>
                <div>
                  <h3 className="text-white font-semibold text-base">Haven</h3>
                  <p className="text-xs text-gray-400">Service Specialist</p>
                </div>
              </div>
              <button onClick={onClose} className="w-9 h-9 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 transition-all">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="bg-white/5 border border-white/10 rounded-xl p-5 mb-6">
              <h4 className="text-lg font-bold text-white mb-2">{service.title}</h4>
              <p className="text-sm text-gray-300 leading-relaxed mb-4">{service.short}</p>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-600/10 border border-blue-500/20 text-blue-300 text-xs font-semibold">
                Starting ranges: {service.priceRange}
              </div>
            </div>

            <div className="space-y-3 mb-6">
              {service.details.map((d, i) => (
                <div key={i} className="flex items-start gap-3">
                  <CheckCircle2 className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" />
                  <p className="text-sm text-gray-300">{d}</p>
                </div>
              ))}
            </div>

            <p className="text-xs text-gray-400 italic bg-white/5 p-3 rounded-lg border border-white/5">
              Prices vary based on scope, timeline, and deliverables. Final quotes are provided following a discovery strategy call.
            </p>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
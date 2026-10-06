// src/components/ui/ConfirmModal.jsx
// Reusable alert/confirm modal that matches the site UI.
// mode='alert'   → single confirm button
// mode='confirm' → confirm + cancel buttons

import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertCircle, X } from 'lucide-react';

export default function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title = 'Notice',
  message = '',
  confirmText = 'OK',
  cancelText = 'Cancel',
  mode = 'alert',
  variant = 'default', // 'default' | 'danger'
}) {
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  const confirmButtonClass =
    variant === 'danger'
      ? 'bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-600/25'
      : 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-600/25';

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={mode === 'confirm' ? onClose : undefined}
            className="absolute inset-0 bg-black/70 backdrop-blur-md"
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 15 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="relative w-full max-w-sm bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl z-10 overflow-hidden"
          >
            <button
              onClick={onClose}
              className="absolute top-3 right-3 w-8 h-8 rounded-full flex items-center justify-center text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="p-6 sm:p-7">
              <div className="flex items-start gap-3 mb-4">
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                    variant === 'danger'
                      ? 'bg-red-100 dark:bg-red-600/15 border border-red-200 dark:border-red-500/30'
                      : 'bg-blue-100 dark:bg-blue-600/15 border border-blue-200 dark:border-blue-500/30'
                  }`}
                >
                  <AlertCircle
                    className={`w-5 h-5 ${
                      variant === 'danger'
                        ? 'text-red-600 dark:text-red-400'
                        : 'text-blue-600 dark:text-blue-400'
                    }`}
                  />
                </div>
                <div className="flex-1 pt-0.5">
                  <h3 className="text-base font-bold text-zinc-900 dark:text-white">
                    {title}
                  </h3>
                </div>
              </div>

              {message && (
                <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-300 ml-13 pl-0">
                  {message}
                </p>
              )}

              <div className="flex items-center justify-end gap-2 mt-6">
                {mode === 'confirm' && (
                  <button
                    onClick={onClose}
                    className="px-4 py-2.5 rounded-xl text-sm font-medium text-zinc-600 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
                  >
                    {cancelText}
                  </button>
                )}
                <button
                  onClick={() => {
                    if (mode === 'confirm') {
                      onConfirm?.();
                    } else {
                      onClose?.();
                    }
                  }}
                  className={`px-5 py-2.5 rounded-xl text-sm font-semibold transition-all active:scale-95 ${confirmButtonClass}`}
                >
                  {confirmText}
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
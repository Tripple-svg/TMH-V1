import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function DataDeletionModal({ isOpen, onClose }) {
  if (!isOpen) return null;

  return <DataDeletionDialog onClose={onClose} />;
}

function DataDeletionDialog({ onClose }) {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [requested, setRequested] = useState(false);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  const clearDeviceData = () => {
    try {
      window.localStorage.clear();
      window.sessionStorage.clear();
    } catch {
      // Storage can be disabled by the browser. The deletion request still proceeds.
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const normalizedEmail = email.trim();

    if (!EMAIL_PATTERN.test(normalizedEmail)) {
      setError('Enter a valid email address.');
      return;
    }

    setError('');
    setSubmitting(true);
    clearDeviceData();

    const { data, error: requestError } = await supabase.functions.invoke('request-data-deletion', {
      body: { email: normalizedEmail },
    });

    setSubmitting(false);

    if (requestError || data?.ok !== true) {
      setError('We could not submit your request. Please try again.');
      return;
    }

    setEmail(normalizedEmail);
    setRequested(true);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-[80] flex items-center justify-center bg-zinc-950/45 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="data-deletion-title"
        className="relative w-full max-w-md rounded-3xl border border-zinc-200/80 bg-white/85 p-6 shadow-2xl shadow-zinc-950/15 backdrop-blur-xl dark:border-white/20 dark:bg-zinc-950/40 dark:shadow-black/40"
      >
        <button
              type="button"
              onClick={onClose}
              aria-label="Close data deletion dialog"
              className="absolute right-5 top-5 rounded-lg p-1 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-white"
        >
          <X className="h-5 w-5" />
        </button>

        {requested ? (
              <div className="py-3 text-center">
                <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-500" />
                <h2 id="data-deletion-title" className="mt-5 text-2xl font-bold tracking-tight text-zinc-950 dark:text-white">
                  Check your inbox
                </h2>
                <p className="mt-3 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
                  If {email} is on file with us, a confirmation link is on its way. Click it within 24 hours to complete deletion.
                </p>
                <button
                  type="button"
                  onClick={onClose}
                  className="mt-6 w-full rounded-xl bg-zinc-950 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-zinc-800 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200"
                >
                  Close
                </button>
              </div>
        ) : (
              <>
                <h2 id="data-deletion-title" className="pr-8 text-2xl font-bold tracking-tight text-zinc-950 dark:text-white">
                  Delete Your Data
                </h2>
                <p className="mt-3 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
                  This permanently deletes all of your reviews, chat transcripts, screenshots, and personal information. We will send a confirmation email to verify that you control the address before anything is removed.
                </p>

                <form className="mt-6" onSubmit={handleSubmit} noValidate>
                  <label htmlFor="data-deletion-email" className="block text-xs font-semibold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
                    Email address
                  </label>
                  <input
                    id="data-deletion-email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(event) => {
                      setEmail(event.target.value);
                      if (error) setError('');
                    }}
                    className="mt-2 w-full rounded-xl border border-zinc-300 bg-white/70 px-4 py-3 text-sm text-zinc-950 outline-none transition placeholder:text-zinc-400 focus:border-zinc-500 dark:border-white/15 dark:bg-white/[0.06] dark:text-white dark:placeholder:text-zinc-500 dark:focus:border-white/40"
                    placeholder="you@example.com"
                    aria-invalid={Boolean(error)}
                    aria-describedby={error ? 'data-deletion-error' : undefined}
                  />
                  {error && (
                    <p id="data-deletion-error" className="mt-2 text-xs text-red-600 dark:text-red-400">
                      {error}
                    </p>
                  )}

                  <div className="mt-6 flex gap-3">
                    <button
                      type="button"
                      onClick={onClose}
                      disabled={submitting}
                      className="flex-1 rounded-xl border border-zinc-200 bg-white/60 px-4 py-3 text-sm font-semibold text-zinc-700 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/15 dark:bg-white/[0.04] dark:text-zinc-200 dark:hover:bg-white/[0.09]"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={submitting}
                      className="flex-1 rounded-xl bg-zinc-950 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-500 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200 dark:disabled:bg-zinc-600 dark:disabled:text-zinc-300"
                    >
                      {submitting ? 'Requesting…' : 'Request Deletion'}
                    </button>
                  </div>
                </form>
              </>
        )}
      </motion.div>
    </motion.div>
  );
}

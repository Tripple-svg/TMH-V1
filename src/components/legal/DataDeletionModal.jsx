import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { DELETION_BROWSER_MESSAGE, hasRequestedDeletion, rememberDeletionRequest } from '../../lib/deletionRequestStorage';

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
  const [locked, setLocked] = useState(hasRequestedDeletion);
  const inFlight = useRef(false);

  useEffect(() => {
    const syncLock = () => { if (hasRequestedDeletion()) setLocked(true); };
    window.addEventListener('storage', syncLock);
    return () => window.removeEventListener('storage', syncLock);
  }, []);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const previousFocus=document.activeElement;
    const dialog=document.querySelector('[aria-labelledby="data-deletion-title"]');
    dialog?.querySelector('input,button')?.focus();
    document.body.style.overflow = 'hidden';
    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && !inFlight.current) onClose();
      if(event.key==='Tab'){
        const items=dialog?.querySelectorAll('button:not([disabled]),input:not([disabled]),a[href]');
        if(!items?.length)return;
        const first=items[0],last=items[items.length-1];
        if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
        else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
      previousFocus?.focus?.();
    };
  }, [onClose]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (inFlight.current || requested) return;
    if (hasRequestedDeletion()) {
      setLocked(true);
      return;
    }
    const normalizedEmail = email.trim();

    if (!EMAIL_PATTERN.test(normalizedEmail)) {
      setError('Enter a valid email address.');
      return;
    }

    setError('');
    inFlight.current = true;
    setSubmitting(true);
    try {
      const { data, error: requestError } = await supabase.functions.invoke('request-data-deletion', {
        body: { email: normalizedEmail },
      });
      const detail = requestError?.context?.status === 409 ? await requestError.context.json().catch(() => null) : data;
      if (detail?.code === 'deletion_already_processed') {
        rememberDeletionRequest();
        setLocked(true);
        return;
      }
      if (requestError || data?.ok !== true) throw new Error('Deletion request failed');
      rememberDeletionRequest();
      setEmail(normalizedEmail);
      setRequested(true);
    } catch {
      setError('We could not submit your request. Please try again.');
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-[80] flex items-center justify-center bg-zinc-950/45 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !inFlight.current) onClose();
      }}
    >
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="data-deletion-title"
        className="relative max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-3xl border border-zinc-200/80 bg-white/85 p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.8),0_20px_80px_rgba(0,0,0,0.12)] backdrop-blur-xl dark:border-white/15 dark:bg-zinc-950/85 dark:shadow-black/40 sm:p-8"
      >
        <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              aria-label="Close data deletion dialog"
              className="absolute right-5 top-5 rounded-lg p-1 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-white"
        >
          <X className="h-5 w-5" />
        </button>

        {locked ? (
              <div className="py-3 text-center" aria-live="polite">
                <CheckCircle2 className="mx-auto h-10 w-10 text-zinc-500 dark:text-zinc-300" />
                <h2 id="data-deletion-title" className="mt-5 text-2xl font-bold tracking-tight text-zinc-950 dark:text-white">Deletion request already processed</h2>
                <p className="mt-3 text-sm leading-6 text-zinc-600 dark:text-zinc-300">{DELETION_BROWSER_MESSAGE}</p>
                <a href="mailto:info@themarketinghaven.xyz" className="mt-6 inline-flex min-h-11 items-center rounded-xl bg-zinc-950 px-5 text-sm font-semibold text-white dark:bg-white dark:text-zinc-950">Email Team Haven</a>
              </div>
        ) : requested ? (
              <div className="py-3 text-center">
                <CheckCircle2 className="mx-auto h-10 w-10 text-zinc-500 dark:text-zinc-300" />
                <h2 id="data-deletion-title" className="mt-5 text-2xl font-bold tracking-tight text-zinc-950 dark:text-white">
                  Check your inbox
                </h2>
                <p className="mt-3 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
                  If {email} matches a saved review, we will attempt to send a confirmation link valid for 24 hours. If it does not arrive, <a href="/support?issue=review_access" target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">contact Team Haven Support</a>.
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
                  Delete a Saved Review
                </h2>
                <p className="mt-3 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
                  Confirming by email removes the matching saved review, linked chats and support requests, and stored screenshots. Purchase, booking, security and delivery records, and unlinked guest chats, are outside this automated flow. Contact info@themarketinghaven.xyz to review those records.
                </p>
                <p className="mt-3 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
                  If you confirm on the browser you used for your review, we clear its linked chat history here too. We keep a limited record to prevent repeat free reviews. You can keep using the website and Support.
                </p>

                <form className="mt-6" onSubmit={handleSubmit} noValidate>
                  <label htmlFor="data-deletion-email" className="block text-xs font-semibold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
                    Email address
                  </label>
                  <input
                    id="data-deletion-email"
                    type="email"
                    disabled={submitting}
                    maxLength={254}
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
                    <p id="data-deletion-error" role="alert" className="mt-2 text-xs text-red-600 dark:text-red-400">
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

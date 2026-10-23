import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, LoaderCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';

export default function DataDeletionConfirmPage() {
  const [searchParams] = useSearchParams();
  const [result, setResult] = useState(null);
  const requestedTokenRef = useRef(null);
  const token = searchParams.get('token')?.trim() || '';

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });

    if (!token) {
      return;
    }

    if (requestedTokenRef.current === token) return;
    requestedTokenRef.current = token;

    const confirmDeletion = async () => {
      try {
      const { data, error: confirmationError } = await supabase.functions.invoke('confirm-data-deletion', {
        body: { token },
      });

      if (confirmationError || data?.ok !== true) {
        setResult({ token, status: 'error', error: data?.error || 'Invalid token' });
        return;
      }

      try {
        for (const key of ['tmh_haven_user_profile_v1','tmh_haven_audit_sessions','tmh_haven_audit_preflight_v1']) window.localStorage.removeItem(key);
      } catch { /* Browser storage may be disabled. Server deletion already succeeded. */ }
      setResult({ token, status: 'success', error: '' });
      } catch {
        setResult({ token, status: 'error', error: 'Unable to confirm deletion. Please try again or contact the team.' });
      }
    };

    confirmDeletion();
  }, [token]);

  const displayStatus = !token
    ? 'error'
    : result?.token === token ? result.status : 'confirming';
  const displayError = !token
    ? 'Invalid token'
    : result?.token === token ? result.error : '';
  const linkExpired = displayError === 'Link expired';

  return (
    <main className="flex min-h-screen items-center justify-center bg-white px-4 py-10 text-zinc-900 transition-colors duration-300 dark:bg-zinc-950 dark:text-zinc-100">
      <section className="w-full max-w-md rounded-3xl border border-zinc-200/80 bg-white/85 p-6 text-center shadow-2xl shadow-zinc-950/10 backdrop-blur-xl sm:p-8 dark:border-white/20 dark:bg-zinc-950/40 dark:shadow-black/40">
        {displayStatus === 'confirming' && (
          <div className="py-8">
            <LoaderCircle className="mx-auto h-12 w-12 animate-spin text-zinc-700 dark:text-zinc-300" />
            <h1 className="mt-5 text-2xl font-bold tracking-tight text-zinc-950 dark:text-white">
              Confirming your deletion…
            </h1>
            <p className="mt-3 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
              Please keep this page open while we process the saved review deletion request.
            </p>
          </div>
        )}

        {displayStatus === 'success' && (
          <div className="py-4">
            <CheckCircle2 className="mx-auto h-16 w-16 text-emerald-500" />
            <h1 className="mt-5 text-2xl font-bold tracking-tight text-zinc-950 dark:text-white">
              Saved review deletion completed.
            </h1>
            <p className="mt-3 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
              This request removed matching saved reviews, their linked chat sessions and stored screenshots. Purchase, booking, deletion-request, security and delivery records, and unlinked guest chats, are outside this automated flow. Contact info@themarketinghaven.xyz to review remaining records or a privacy concern.
            </p>
          </div>
        )}

        {displayStatus === 'error' && (
          <div className="py-4">
            <AlertTriangle className="mx-auto h-16 w-16 text-amber-500" />
            <h1 className="mt-5 text-2xl font-bold tracking-tight text-zinc-950 dark:text-white">
              {linkExpired ? 'This link has expired' : 'Deletion could not be confirmed'}
            </h1>
            <p className="mt-3 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
              If the link has expired, request a new one from the footer. Otherwise contact info@themarketinghaven.xyz so the team can check the request and any records already processed.
            </p>
          </div>
        )}

        {displayStatus !== 'confirming' && (
          <Link
            to="/"
            className="mt-6 inline-flex rounded-xl bg-zinc-950 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-zinc-800 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200"
          >
            Back to home
          </Link>
        )}
      </section>
    </main>
  );
}

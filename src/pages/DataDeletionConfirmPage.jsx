import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, LoaderCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { clearReviewFormData } from '../components/haven/utils/reviewPersistence';

function clearDeletedBrowserData({ reviewIds, visitorIds }) {
  const storage = window.localStorage;
  const reviewId = storage.getItem('haven_review_id');
  let visitorId;
  try { visitorId = JSON.parse(storage.getItem('haven_chat_identity_v1') || 'null')?.visitorId; }
  catch { /* A malformed browser identity cannot match a deleted visitor. */ }
  const reviewRemoved = reviewIds?.includes(reviewId);
  const visitorRemoved = visitorIds?.includes(visitorId);
  if (reviewRemoved || (!reviewId && visitorRemoved)) {
    for (const key of ['haven_review_id', 'haven_session_id', 'tmh_haven_user_profile_v1', 'tmh_haven_audit_sessions', 'tmh_haven_audit_preflight_v1']) {
      storage.removeItem(key);
    }
    clearReviewFormData();
    const pendingId = window.sessionStorage.getItem('tmh_review_submission_id_v1');
    if (pendingId) window.sessionStorage.removeItem(`haven_review_creation_${pendingId}`);
    window.sessionStorage.removeItem('tmh_review_submission_id_v1');
  }
  if (visitorRemoved) {
    for (const key of ['haven_chat_identity_v1', 'tmh_haven_support_sessions', 'tmh_haven_service_sessions', 'tmh_haven_last_support_session', 'tmh_haven_last_site_support_session']) {
      storage.removeItem(key);
    }
  }
}

export default function DataDeletionConfirmPage() {
  const [searchParams] = useSearchParams();
  const [result, setResult] = useState(null);
  const requestInProgressRef = useRef(false);
  const token = searchParams.get('token')?.trim() || '';

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, []);

  // Opening an emailed link is not confirmation: scanners and previews may
  // visit it. Only the explicit button below starts the destructive request.
  const confirmDeletion = async () => {
    if (!token || requestInProgressRef.current) return;
    requestInProgressRef.current = true;
    setResult({ token, status: 'confirming', error: '' });
    try {
      const { data, error: confirmationError } = await supabase.functions.invoke('confirm-data-deletion', {
        body: { token },
      });

      if (confirmationError || data?.ok !== true) {
        let detail = data?.error;
        if (!detail && confirmationError?.context?.json) {
          try { detail = (await confirmationError.context.json())?.error; } catch { /* Show a safe retry message. */ }
        }
        setResult({ token, status: 'error', error: detail || 'Unable to confirm deletion. Please retry or contact the team.' });
        return;
      }

      try {
        clearDeletedBrowserData(data);
      } catch { /* Browser storage may be disabled. Server deletion already succeeded. */ }
      setResult({ token, status: 'success', error: '' });
    } catch {
      setResult({ token, status: 'error', error: 'Unable to confirm deletion. Please try again or contact the team.' });
    } finally { requestInProgressRef.current = false; }
  };

  const displayStatus = !token
    ? 'error'
    : result?.token === token ? result.status : 'ready';
  const displayError = !token
    ? 'Invalid token'
    : result?.token === token ? result.error : '';
  const linkExpired = displayError === 'Link expired';

  return (
    <main className="flex min-h-screen items-center justify-center bg-white px-4 py-10 text-zinc-900 transition-colors duration-300 dark:bg-zinc-950 dark:text-zinc-100">
      <section className="w-full max-w-md rounded-3xl border border-zinc-200/80 bg-white/85 p-6 text-center shadow-2xl shadow-zinc-950/10 backdrop-blur-xl sm:p-8 dark:border-white/20 dark:bg-zinc-950/40 dark:shadow-black/40">
        {displayStatus === 'ready' && (
          <div className="py-4">
            <AlertTriangle className="mx-auto h-12 w-12 text-amber-500" />
            <h1 className="mt-5 text-2xl font-bold tracking-tight text-zinc-950 dark:text-white">Delete your saved review?</h1>
            <p className="mt-3 text-sm leading-6 text-zinc-600 dark:text-zinc-300">This permanently removes the matching saved review, linked chats and support requests, and stored screenshots. Purchase access and booking records remain separate. This action cannot be undone.</p>
            <button type="button" onClick={confirmDeletion} className="mt-6 rounded-xl bg-red-700 px-4 py-3 text-sm font-semibold text-white hover:bg-red-800">Delete my saved review</button>
          </div>
        )}
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
              Your saved review, linked chats and support requests, and stored screenshots were removed. You can keep using the site and Support. Contact Team Haven if you need another review.
            </p>
            <p className="mt-3 text-xs leading-5 text-zinc-600 dark:text-zinc-300">We keep a limited record to prevent repeat free reviews. Purchase, booking, deletion-request, security and delivery records, and unlinked guest chats, are outside this automated flow.</p>
          </div>
        )}

        {displayStatus === 'error' && (
          <div className="py-4">
            <AlertTriangle className="mx-auto h-16 w-16 text-amber-500" />
            <h1 className="mt-5 text-2xl font-bold tracking-tight text-zinc-950 dark:text-white">
              {linkExpired ? 'This link has expired' : 'Deletion could not be confirmed'}
            </h1>
            <p className="mt-3 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
              {linkExpired ? 'Request a new deletion link from the website footer.' : displayError} If you need help, contact the team so we can check any records already processed.
            </p>
            {token && !linkExpired && displayError !== 'Already used' && displayError !== 'Invalid token' && <button type="button" onClick={confirmDeletion} className="mt-5 rounded-xl border border-zinc-300 px-4 py-3 text-sm font-semibold dark:border-white/20">Retry confirmation</button>}
          </div>
        )}

        {displayStatus !== 'confirming' && (<>
          <a href="mailto:info@themarketinghaven.xyz?subject=Saved%20review%20deletion%20help" className="mt-5 block text-sm underline underline-offset-4">Contact info@themarketinghaven.xyz</a>
          <Link
            to="/"
            className="mt-6 inline-flex rounded-xl bg-zinc-950 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-zinc-800 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200"
          >
            Back to home
          </Link>
        </>)}
      </section>
    </main>
  );
}

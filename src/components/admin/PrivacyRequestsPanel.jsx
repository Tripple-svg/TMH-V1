import { useRef, useState } from 'react';

const button = 'min-h-11 rounded-lg border border-white/20 px-4 py-2 text-xs text-zinc-200 disabled:opacity-50';

function requestStatus(row) {
  if (row.status === 'confirmed') return 'Completed';
  if (row.records_removed_at) return 'File cleanup pending';
  if (row.status === 'expired' || Date.parse(row.expires_at) <= Date.now()) return 'Confirmation link expired';
  return 'Waiting for email confirmation';
}

export default function PrivacyRequestsPanel({ onRequest, onAuthLost }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const lock = useRef(false);

  const search = async (operation, row) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      if (operation) {
        const result = await onRequest({ action: 'assistPrivacyRequest', id: row.id, operation });
        if (result.code === 'unauthorised') onAuthLost();
        if (!result.ok) throw new Error(result.error || 'The action could not be completed.');
        setNotice(result.message);
      }
      const term = operation ? results.query : query.trim();
      const result = await onRequest({ action: 'privacyRequests', query: term });
      if (result.code === 'unauthorised') onAuthLost();
      if (!result.ok) throw new Error(result.error || 'The search could not be completed.');
      setResults({ query: term, rows: result.requests || [] });
    } catch (failure) {
      setError(failure.message || 'Could not connect. Please try again.');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };

  return <details className="mb-6 rounded-2xl border border-white/10 bg-white/[0.025] p-4 sm:p-5">
    <summary className="cursor-pointer text-sm font-medium text-zinc-100">Help with a deletion request</summary>
    <p className="mt-3 text-xs leading-6 text-zinc-400">Find a request by the saved email address or request reference. The visitor must confirm deletion from their inbox. You can resend the link or finish file cleanup after confirmation.</p>
    <form className="mt-4 flex flex-wrap items-end gap-3" onSubmit={event => { event.preventDefault(); setResults(null); void search(); }}>
      <label className="min-w-0 flex-1 text-xs text-zinc-300">Email address or request reference
        <input type="search" value={query} onChange={event => setQuery(event.target.value)} disabled={busy} required maxLength={254}
          className="mt-2 block min-h-11 w-full min-w-0 rounded-lg border border-white/15 bg-zinc-950 px-3 text-sm" />
      </label>
      <button type="submit" className={button} disabled={busy || !query.trim()}>Find request</button>
    </form>
    {error && <p role="alert" className="mt-4 text-xs text-red-300">{error}</p>}
    {notice && <p role="status" className="mt-4 text-xs text-emerald-200">{notice}</p>}
    {results && <div className="mt-4 space-y-3">
      {results.rows.length === 0 && <p className="text-xs text-zinc-400">No deletion requests match this search.</p>}
      {results.rows.map(row => <article key={row.id} className="rounded-xl border border-white/10 p-4 text-sm">
        <p className="break-all text-zinc-100">{row.email}</p>
        <p className="mt-1 text-xs font-medium text-zinc-300">{requestStatus(row)}</p>
        <p className="mt-2 break-all text-xs text-zinc-400">Reference {row.id}</p>
        <p className="mt-1 text-xs text-zinc-400">Requested {new Date(row.requested_at).toLocaleString()}</p>
        {row.status !== 'confirmed' && <button type="button" className={`${button} mt-3`} disabled={busy}
          onClick={() => void search(row.records_removed_at ? 'retry_cleanup' : 'send_link', row)}>
          {row.records_removed_at ? 'Retry file cleanup' : 'Send confirmation link'}
        </button>}
      </article>)}
    </div>}
  </details>;
}

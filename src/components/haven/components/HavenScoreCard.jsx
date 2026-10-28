import { useState } from 'react';
import { ArrowRight, AlertCircle, Loader2, RotateCcw } from 'lucide-react';
import { scoreFailureCopy } from '../../../../supabase/functions/_shared/scoring-copy.js';
import { RUBRIC_VERSION, WEBSITE_RUBRIC, SOCIAL_RUBRIC, WEBSITE_SCORE_EXPLANATION, SOCIAL_SCORE_EXPLANATION } from '../../../../supabase/functions/_shared/scoring-rubric.js';
import { reviewScreenshotFileError } from '../../../lib/reviewScreenshot.js';

const LEGACY_WEBSITE = { clarity: 'Clarity & positioning', trust: 'Trust signals', conversion: 'Conversion path', technical: 'Technical experience (previous rubric)', content: 'Content quality (previous rubric)' };
const LEGACY_SOCIAL = { profile: 'Profile & bio', consistency: 'Content consistency (previous rubric)', engagement: 'Engagement quality (previous rubric)', readiness: 'Conversion readiness' };
const buttonClass = 'flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/[0.06] px-5 py-3 text-sm font-medium text-white hover:bg-white/10 disabled:opacity-50';

function SourceCorrection({ kind, url, onCorrect }) {
  const [open, setOpen] = useState(false);
  const [newUrl, setNewUrl] = useState(url || '');
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (event) => {
    event.preventDefault(); setError('');
    if (kind === 'social') {
      const problem = reviewScreenshotFileError(file);
      if (problem) { setError(problem); return; }
    }
    setBusy(true);
    try {
      const source = kind === 'website' ? { url: newUrl.trim() } : { screenshot: await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('This screenshot could not be read. Choose it again.'));
        reader.readAsDataURL(file);
      }) };
      await onCorrect(source);
      setOpen(false);
    } catch (failure) { setError(failure.message || 'Could not update this review. Please try again.'); }
    finally { setBusy(false); }
  };
  if (!onCorrect) return null;
  return <div className="w-full">
    <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="w-full py-2 text-xs text-zinc-400 underline decoration-zinc-700 underline-offset-4 hover:text-zinc-200">Wrong website/screenshot? Try Again</button>
    {open && <form onSubmit={submit} className="mt-3 space-y-3 rounded-xl border border-white/10 bg-white/[0.025] p-4 text-left">
      <p className="text-xs leading-relaxed text-zinc-400">Replace the source for this review. Your saved conversation stays available; the previous score will be replaced.</p>
      {kind === 'website' ? <label className="block text-xs text-zinc-300">Website address
        <input required type="url" value={newUrl} onChange={event => setNewUrl(event.target.value)} placeholder="https://yourwebsite.com" disabled={busy} className="mt-2 w-full rounded-lg border border-white/15 bg-zinc-950 p-3 text-base text-white" />
      </label> : <label className="block text-xs text-zinc-300">New profile screenshot
        <input required type="file" accept="image/png,image/jpeg,image/webp" onChange={event => setFile(event.target.files?.[0] || null)} disabled={busy} className="mt-2 block w-full text-xs text-zinc-400" />
        <span className="mt-2 block text-zinc-500">Include a readable bio and visible posts. PNG, JPEG or WebP, up to 5 MB.</span>
      </label>}
      {error && <p role="alert" className="text-xs leading-relaxed text-amber-200">{error}</p>}
      <button type="submit" disabled={busy} className={buttonClass}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}{busy ? 'Updating review…' : 'Review this source'}</button>
    </form>}
  </div>;
}

export default function HavenScoreCard({ preflight, kind = 'website', onProceed, onRetry, onCorrect }) {
  const { status, score, breakdown, biggestIssue, url, error, reason, rubricVersion, evidence } = preflight || {};
  const needsRecovery = /access recovery/.test(error || '');
  const currentRubric = rubricVersion === RUBRIC_VERSION;
  const labels = currentRubric ? (kind === 'social' ? SOCIAL_RUBRIC : WEBSITE_RUBRIC) : (kind === 'social' ? LEGACY_SOCIAL : LEGACY_WEBSITE);
  const hasScore = status === 'ready' && Number.isInteger(score);
  const loading = status === 'scraping';
  return <div className="flex min-h-full flex-col gap-6 px-3 py-8 sm:px-6">
    <div className="space-y-3 text-center">
      {loading ? <Loader2 className="mx-auto h-6 w-6 animate-spin text-zinc-400" /> : !hasScore && <AlertCircle className="mx-auto h-6 w-6 text-zinc-400" />}
      <h3 className="text-base font-semibold tracking-tight text-white">{loading ? (kind === 'social' ? 'Reading your screenshot' : 'Reading your website')
        : needsRecovery ? 'This saved review needs access recovery' : hasScore ? 'Your Haven score' : status === 'failed' ? 'Review unavailable' : 'Not enough evidence to score'}</h3>
      {hasScore && <p className="text-[56px] font-semibold leading-none tracking-tight text-white tabular-nums">{score}<span className="ml-2 text-lg font-medium text-zinc-500">/ 100</span></p>}
      <p className="mx-auto max-w-sm text-[13px] leading-relaxed text-zinc-400">{needsRecovery ? error : status === 'failed' ? error || scoreFailureCopy(reason || 'provider_unavailable', kind)
        : !hasScore && !loading ? scoreFailureCopy(reason, kind)
        : kind === 'social' ? SOCIAL_SCORE_EXPLANATION : WEBSITE_SCORE_EXPLANATION}</p>
      {hasScore && <p className="text-[11px] leading-relaxed text-zinc-500">{currentRubric ? 'A review of visible communication, not a prediction of sales or a test of technical performance.' : 'Saved under the previous rubric. Review your source again for the current evidence-based assessment.'}</p>}
    </div>
    {hasScore && biggestIssue && <div className="space-y-2 rounded-xl border border-white/[0.08] bg-white/[0.025] p-4"><p className="text-[10px] uppercase tracking-[0.15em] text-zinc-500">First thing to review</p><p className="text-[13px] leading-relaxed text-zinc-300">{biggestIssue}</p></div>}
    {hasScore && breakdown && <details className="rounded-xl border border-white/[0.08] p-4 text-xs text-zinc-300">
      <summary className="cursor-pointer font-medium">How this score was reached</summary>
      <div className="mt-5 space-y-5">{Object.entries(labels).filter(([key]) => Number.isInteger(breakdown[key])).map(([key, label]) => <div key={key} className="space-y-2">
        <div className="flex justify-between gap-4"><span>{label}</span><span className="shrink-0 tabular-nums text-zinc-400">{breakdown[key]}/{currentRubric || kind === 'social' ? 25 : 20}</span></div>
        {evidence?.[key] && <><p className="leading-relaxed text-zinc-400">{evidence[key].observation}</p>{evidence[key].quote && <blockquote className="border-l border-zinc-700 pl-3 leading-relaxed text-zinc-500">{evidence[key].quote}</blockquote>}<p className="leading-relaxed text-zinc-300">{evidence[key].improvement}</p></>}
      </div>)}</div>
    </details>}
    {!loading && <div className="mt-auto space-y-3">
      {!needsRecovery && status === 'failed' && <button type="button" onClick={onRetry} className={`${buttonClass} w-full`}><RotateCcw className="h-4 w-4" />Retry this source</button>}
      <button type="button" onClick={onProceed} className={`${buttonClass} w-full`}>Continue to Chat <ArrowRight className="h-4 w-4" /></button>
      {!needsRecovery && <SourceCorrection key={`${kind}/${url || ''}`} kind={kind} url={url} onCorrect={onCorrect} />}
    </div>}
  </div>;
}

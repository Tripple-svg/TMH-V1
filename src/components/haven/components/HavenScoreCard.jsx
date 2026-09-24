// src/components/haven/components/HavenScoreCard.jsx
// V3.1 — Auto-detects website (5 categories × 20) vs social (4 × 25) scoring.

import React from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, AlertCircle, Loader2, RotateCcw } from 'lucide-react';

const WEBSITE_LABELS = {
  clarity:    'Clarity & Positioning',
  trust:      'Trust Signals',
  conversion: 'Conversion Path',
  technical:  'Technical & Experience',
  content:    'Content Quality',
};

const SOCIAL_LABELS = {
  profile:     'Profile & Bio',
  consistency: 'Content Consistency',
  engagement:  'Engagement Quality',
  readiness:   'Conversion Readiness',
};

function detectKind(breakdown) {
  if (!breakdown) return null;
  if (breakdown.profile !== undefined || breakdown.readiness !== undefined) return 'social';
  return 'website';
}

function ScoreBar({ value, max = 20 }) {
  const pct = Math.min(100, Math.round((value / max) * 100));
  return (
    <div className="h-[3px] w-full rounded-full bg-white/[0.04] overflow-hidden">
      <motion.div
        className="h-full bg-blue-500"
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
      />
    </div>
  );
}

function FailedState({ error, onProceed, onRetry, retryCount = 0, kindLabel }) {
  const maxRetries = 2;
  const canRetry = retryCount < maxRetries;

  return (
    <div className="flex flex-col items-center justify-center flex-1 min-h-full text-center px-6 py-12 space-y-6">
      <div className="w-12 h-12 rounded-full flex items-center justify-center bg-white/[0.03] border border-white/[0.08]">
        <AlertCircle className="w-5 h-5 text-zinc-400" />
      </div>
      <div className="space-y-2 max-w-xs">
        <h3 className="text-base font-semibold text-white">
          {canRetry ? `Couldn't read your ${kindLabel}` : `Still can't read your ${kindLabel}`}
        </h3>
        <p className="text-[13px] text-zinc-400 leading-relaxed">
          {error || 'Something went wrong on our end. Try again in a moment.'}
        </p>
        {retryCount > 0 && (
          <p className="text-[11px] text-zinc-500 pt-1">
            Attempt {retryCount + 1} failed
          </p>
        )}
      </div>

      {canRetry ? (
        <>
          <button
            type="button"
            onClick={onRetry}
            className="flex items-center gap-2 px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition-all shadow-lg shadow-blue-600/20 cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" />
            Try again
          </button>
          <button
            type="button"
            onClick={onProceed}
            className="text-[12px] text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer"
          >
            Skip and continue to chat
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={onProceed}
          className="flex items-center gap-2 px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition-all shadow-lg shadow-blue-600/20 cursor-pointer"
        >
          Continue to Chat <ArrowRight className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}

export default function HavenScoreCard({ preflight, userName, brandName, onProceed, onRetry }) {
  const { status, score, breakdown, biggestIssue, url, error, retryCount = 0 } = preflight || {};

  const kind = detectKind(breakdown);
  const labels = kind === 'social' ? SOCIAL_LABELS : WEBSITE_LABELS;
  const kindLabel = kind === 'social' ? 'profile' : 'site';

  // ─── Loading ───
  if (status === 'scraping') {
    return (
      <div className="flex flex-col items-center justify-center flex-1 min-h-full text-center px-6 py-12 space-y-7">
        <div className="relative w-14 h-14">
          <motion.div
            className="absolute inset-0 rounded-full border border-blue-500/20"
            animate={{ scale: [1, 1.2, 1], opacity: [0.4, 0.1, 0.4] }}
            transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
          />
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />
          </div>
        </div>
        <div className="space-y-2.5 max-w-xs">
          <h3 className="text-base font-semibold text-white tracking-tight">
            {retryCount > 0 ? 'Retrying' : (kind === 'social' ? 'Reading your profile' : 'Reading your site')}
          </h3>
          <p className="text-[13px] text-zinc-400 leading-relaxed">
            {kind === 'social'
              ? 'Haven is going through the screenshot — bio, content, engagement, conversion.'
              : (url
                  ? <>Haven is going through <span className="text-zinc-200">{url}</span> — clarity, trust, conversion path.</>
                  : 'Haven is going through your website.')}
          </p>
        </div>
        <p className="text-[11px] text-zinc-600">Takes a few seconds</p>
      </div>
    );
  }

  // ─── Failed ───
  if (status === 'failed') {
    return (
      <FailedState
        error={error}
        onProceed={onProceed}
        onRetry={onRetry}
        retryCount={retryCount}
        kindLabel={kindLabel}
      />
    );
  }

  // ─── Score unavailable ───
  if (score == null) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 min-h-full text-center px-6 py-12 space-y-6">
        <div className="w-12 h-12 rounded-full flex items-center justify-center bg-white/[0.03] border border-white/[0.08]">
          <AlertCircle className="w-5 h-5 text-zinc-400" />
        </div>
        <div className="space-y-2 max-w-xs">
          <h3 className="text-base font-semibold text-white">Score unavailable</h3>
          <p className="text-[13px] text-zinc-400 leading-relaxed">
            We couldn't generate a score right now. Haven has still read the content — let's talk through it.
          </p>
        </div>
        <button
          type="button"
          onClick={onProceed}
          className="flex items-center gap-2 px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition-all shadow-lg shadow-blue-600/20 cursor-pointer"
        >
          Continue to Chat <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    );
  }

  // ─── Score ready ───
  const passed = score >= 60;
  const maxPerCategory = kind === 'social' ? 25 : 20;

  return (
    <div className="flex flex-col flex-1 min-h-full px-6 py-8 space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="flex flex-col items-center text-center space-y-3 pt-2"
      >
        <span className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-medium">
          {kind === 'social' ? 'Profile Score' : 'Website Score'}
        </span>
        <div className="flex items-baseline gap-1.5">
          <motion.span
            className="text-[56px] leading-none font-semibold text-white tracking-tight tabular-nums"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.15, type: 'spring', stiffness: 180, damping: 20 }}
          >
            {score}
          </motion.span>
          <span className="text-lg text-zinc-500 font-medium">/ 100</span>
        </div>
        <span className={`text-[11px] font-medium px-2.5 py-1 rounded-full border ${
          passed
            ? 'bg-blue-500/10 text-blue-300 border-blue-500/25'
            : 'bg-white/[0.03] text-zinc-400 border-white/[0.08]'
        }`}>
          {passed ? 'Above pass mark' : 'Below pass mark (60)'}
        </span>
      </motion.div>

      {breakdown && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="space-y-4 pt-2"
        >
          {Object.entries(labels).map(([key, label], idx) => {
            const val = breakdown[key] ?? 0;
            return (
              <motion.div
                key={key}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.35 + idx * 0.06 }}
                className="space-y-2"
              >
                <div className="flex items-center justify-between text-[12px]">
                  <span className="text-zinc-400">{label}</span>
                  <span className="text-zinc-200 font-medium tabular-nums">{val}/{maxPerCategory}</span>
                </div>
                <ScoreBar value={val} max={maxPerCategory} />
              </motion.div>
            );
          })}
        </motion.div>
      )}

      {biggestIssue && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7 }}
          className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 space-y-2"
        >
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.15em] text-zinc-500 font-medium">
            <AlertCircle className="w-3 h-3" />
            Biggest issue
          </div>
          <p className="text-[13px] text-zinc-300 leading-relaxed">{biggestIssue}</p>
        </motion.div>
      )}

      <motion.button
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.9 }}
        type="button"
        onClick={onProceed}
        className="mt-auto flex items-center justify-center gap-2 w-full px-5 py-3.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition-all cursor-pointer"
      >
        Proceed to Chat <ArrowRight className="w-4 h-4" />
      </motion.button>
    </div>
  );
}
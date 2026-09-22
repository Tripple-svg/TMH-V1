// src/components/haven/components/HavenScoreCard.jsx
// V2.0 — Restrained aesthetic. Electric blue accent. No color-coded bars.

import React from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, AlertCircle, Loader2, Sparkles } from 'lucide-react';

const CATEGORY_LABELS = {
  clarity:    'Clarity & Positioning',
  trust:      'Trust Signals',
  conversion: 'Conversion Path',
  technical:  'Technical & Experience',
  content:    'Content Quality',
};

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

export default function HavenScoreCard({ preflight, userName, brandName, onProceed }) {
  const { status, score, breakdown, biggestIssue, url, error } = preflight || {};

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
          <h3 className="text-base font-semibold text-white tracking-tight">Reading your site</h3>
          <p className="text-[13px] text-zinc-400 leading-relaxed">
            {url
              ? <>Haven is going through <span className="text-zinc-200">{url}</span> — clarity, trust, conversion path.</>
              : 'Haven is going through your website.'}
          </p>
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-zinc-600">
          <span>Takes a few seconds</span>
        </div>
      </div>
    );
  }

  // ─── Failed ───
  if (status === 'failed') {
    return (
      <div className="flex flex-col items-center justify-center flex-1 min-h-full text-center px-6 py-12 space-y-6">
        <div className="w-12 h-12 rounded-full flex items-center justify-center bg-white/[0.03] border border-white/[0.08]">
          <AlertCircle className="w-5 h-5 text-zinc-400" />
        </div>
        <div className="space-y-2 max-w-xs">
          <h3 className="text-base font-semibold text-white">Couldn't read the site</h3>
          <p className="text-[13px] text-zinc-400 leading-relaxed">
            {error || 'The site may be blocking visitors or temporarily down.'}
          </p>
        </div>
        <button
          type="button"
          onClick={onProceed}
          className="flex items-center gap-2 px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition-all"
        >
          Continue anyway <ArrowRight className="w-4 h-4" />
        </button>
      </div>
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
          className="flex items-center gap-2 px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition-all"
        >
          Continue to Chat <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    );
  }

  // ─── Score ready ───
  const passed = score >= 60;

  return (
    <div className="flex flex-col flex-1 min-h-full px-6 py-8 space-y-6">
      {/* Score hero */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="flex flex-col items-center text-center space-y-3 pt-2"
      >
        <span className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-medium">
          Website Score
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

      {/* Breakdown */}
      {breakdown && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="space-y-4 pt-2"
        >
          {Object.entries(CATEGORY_LABELS).map(([key, label], idx) => {
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
                  <span className="text-zinc-200 font-medium tabular-nums">{val}/20</span>
                </div>
                <ScoreBar value={val} />
              </motion.div>
            );
          })}
        </motion.div>
      )}

      {/* Biggest issue */}
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

      {/* Proceed */}
      <motion.button
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.9 }}
        type="button"
        onClick={onProceed}
        className="mt-auto flex items-center justify-center gap-2 w-full px-5 py-3.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition-all"
      >
        Proceed to Chat <ArrowRight className="w-4 h-4" />
      </motion.button>
    </div>
  );
}
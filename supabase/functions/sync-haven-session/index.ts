// supabase/functions/sync-haven-session/index.ts
// Server-side writer for audit chat state. Service role key.
// RLS does not apply.

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

const MAX_MESSAGES = 200;
const VALID_LEADS = ['HOT', 'WARM', 'COLD'];
const VALID_STEPS = [
  'GREETING', 'AWAITING_UPLOAD', 'AWAITING_SCREENSHOT_CONFIRMATION',
  'AWAITING_MISMATCH_RESOLUTION', 'AWAITING_DIAGNOSTIC_Q1',
  'AWAITING_DIAGNOSTIC_Q2', 'AWAITING_SERIOUSNESS_CHECK',
  'DELIVERING_DIAGNOSIS', 'AWAITING_PERMISSION', 'ROUTING_TO_CALL',
  'ROUTING_TO_PLAYBOOK', 'ROUTING_TO_CONTENT', 'CLEAN_EXIT',
  'SERVICE_GRID_OPEN', 'CUSTOMER_SUPPORT_OPEN', 'TEAM_INQUIRY',
  'RE_VISIT_GREETING',
];

const ALLOWED_ORIGINS = [
  'https://themarketinghaven.xyz',
  'https://www.themarketinghaven.xyz',
  'http://localhost:5173',
  'http://localhost:3000',
];

function corsHeaders(origin: string | null) {
  const allowed = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
}

function json(body: unknown, origin: string | null, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
  });
}

serve(async (req) => {
  const origin = req.headers.get('origin');

  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(origin) });
  if (req.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, origin, 405);

  try {
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      return json({ ok: false, error: 'Server misconfigured' }, origin, 500);
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return json({ ok: false, error: 'Invalid JSON' }, origin, 400);
    }

    const {
      sessionId,
      reviewId,
      messages,
      currentStep,
      lastStepReached,
      totalExchanges,
      leadTemperature,
      clickedBookingLink,
      clickedPlaybookLink,
      websiteScore,
      scoreBreakdown,
      biggestLeak,
      assessmentSummary,
    } = body;

    if (!sessionId) return json({ ok: false, error: 'Missing sessionId' }, origin, 400);

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    const results: Record<string, unknown> = {};

    // Normalize step values against whitelist.
    const safeStep = VALID_STEPS.includes(currentStep) ? currentStep : 'GREETING';
    const safeLastStep = VALID_STEPS.includes(lastStepReached) ? lastStepReached : safeStep;

    // Write 1: haven_sessions
    try {
      const { error } = await supabase
        .from('haven_sessions')
        .update({
          messages: Array.isArray(messages) ? messages.slice(-MAX_MESSAGES) : [],
          current_step: safeStep,
          last_step_reached: safeLastStep,
          total_exchanges: Number(totalExchanges) || 0,
          updated_at: new Date().toISOString(),
        })
        .eq('id', sessionId);

      results.session = error ? { ok: false, error: error.message } : { ok: true };
    } catch (e) {
      results.session = { ok: false, error: String(e) };
    }

    // Write 2: brand_reviews
    if (reviewId) {
      try {
        const reviewUpdate: Record<string, unknown> = {
          updated_at: new Date().toISOString(),
        };

        if (VALID_LEADS.includes(leadTemperature)) {
          reviewUpdate.lead_temperature = leadTemperature;
        }
        if (clickedBookingLink) reviewUpdate.clicked_booking_link = true;
        if (clickedPlaybookLink) reviewUpdate.clicked_playbook_link = true;

        if (
          typeof websiteScore === 'number' &&
          Number.isFinite(websiteScore) &&
          websiteScore >= 0 &&
          websiteScore <= 100
        ) {
          reviewUpdate.haven_score = websiteScore;
        }
        if (scoreBreakdown && typeof scoreBreakdown === 'object') {
          reviewUpdate.score_breakdown = scoreBreakdown;
        }
        if (typeof biggestLeak === 'string' && biggestLeak.trim().length > 0) {
          reviewUpdate.biggest_leak = biggestLeak.trim();
        }
        if (typeof assessmentSummary === 'string' && assessmentSummary.trim().length > 0) {
          reviewUpdate.assessment_summary = assessmentSummary.trim();
        }

        const { error } = await supabase
          .from('brand_reviews')
          .update(reviewUpdate)
          .eq('id', reviewId);

        results.review = error ? { ok: false, error: error.message } : { ok: true };
      } catch (e) {
        results.review = { ok: false, error: String(e) };
      }
    } else {
      results.review = { ok: true, skipped: 'no reviewId' };
    }

    console.log('sync-haven-session:', { sessionId, reviewId, results });
    return json({ ok: true, results }, origin);
  } catch (err) {
    console.error('sync-haven-session error:', err);
    return json({ ok: false, error: String(err) }, origin, 500);
  }
});
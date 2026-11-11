import {logEvent} from '../_shared/logger.ts';
import {observe} from '../_shared/observability.ts';
import {recordAIUsage,usageGeminiModel} from '../_shared/ai-usage.ts';
import { safeProviderDiagnostic } from '../_shared/provider-request.ts';
import { aiBudgetPlan, reserveAIBudget, type AIBudgetReservation } from '../_shared/ai-budget.ts';
import { scoringInstructions } from '../_shared/scoring-rubric.js';
import { enforceScoringLimits } from '../_shared/haven-limits.ts';
// supabase/functions/score-social/index.ts
// Verified screenshot review; the saved result is authoritative for chat.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.118.0';
import { geminiProcessingEnabled, geminiModel, geminiGenerationConfig, geminiText } from '../_shared/haven-model.ts';
import { verifyReviewAccess, ReviewAccessError, storedReviewScreenshot } from '../_shared/review-access.ts';
import { HavenRequestError, responseHeaders, verifyOrigin, readBoundedJson, screenshotPart } from '../_shared/haven-request.ts';
import { parseScoringResult, persistScoring, cachedScoring, lockedScoring } from '../_shared/haven-scoring.ts';
import { SCORING_PROVIDER_UNAVAILABLE, scoreFailureCopy } from '../_shared/scoring-copy.js';

const SOCIAL_SCORING_PROMPT = scoringInstructions('social');

async function scoreWithGemini(db:any,budget:AIBudgetReservation,screenshot: string) {
  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (!apiKey) throw new Error('GEMINI_API_KEY not configured.');

  const response = await budget.request('gemini',
    `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel()}:generateContent`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey.trim() },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: SOCIAL_SCORING_PROMPT }] },
        contents: [{ role: 'user', parts: [screenshotPart(screenshot), { text: 'Score only the visible profile in this screenshot.' }] }],
        generationConfig: geminiGenerationConfig(true),
      }),
    }, 18000, 1);
  const payload=await response.json();budget.recordUsage('gemini',payload);await recordAIUsage(db,'gemini',geminiModel(),payload);
  const parsed = parseScoringResult(geminiText(payload), 'social');
  if (!parsed) throw new Error('gemini_invalid_score');
  return parsed;
}

Deno.serve(observe('score-social',async (request,requestId) => {
  const headers = responseHeaders(request);
  const json = (body: unknown, status = 200) => Response.json(body, { status, headers });
  if (request.method === 'OPTIONS') return new Response('ok', { headers });
  if (request.method !== 'POST') return json({ ok: false, error: 'Method not allowed.' }, 405);
  let supabase, review, budget:AIBudgetReservation|undefined, started = false;
  try {
    verifyOrigin(request);
    const body = await readBoundedJson(request);
    if (body.screenshot) screenshotPart(body.screenshot);
    const access = body.context || {};
    const url = Deno.env.get('SUPABASE_URL'), key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !key) throw new HavenRequestError('Haven is not configured.', 503);
    supabase = createClient(url, key, { auth: { persistSession: false } });
    ({ review } = await verifyReviewAccess(supabase, access.sessionId, access.reviewId, access.accessToken));
    if (review.flag_status === 'red') throw new HavenRequestError('Your access is currently restricted. Please contact info@themarketinghaven.xyz.', 403);
    if (review.platform_type !== 'social') throw new HavenRequestError('This review does not have a social profile to score.');
    if (review.source_locked_at) return json({ ok: true, ...lockedScoring(review) });
    const cached = body.force === true ? null : cachedScoring(review, 'social');
    if (cached) return json({ ok: true, ...cached, revision: review.scoring_revision || 0, cached: true,
      ...(cached.state === 'insufficient_evidence' ? { message: scoreFailureCopy(cached.reason,'social') } : {}) });
    await enforceScoringLimits(supabase, request, key, review.id);
    started = true;
    if (!geminiProcessingEnabled()) throw new HavenRequestError(SCORING_PROVIDER_UNAVAILABLE, 503);
    // The saved private object, not a browser-swapped image, is authoritative.
    const screenshot = await storedReviewScreenshot(supabase, review);
    budget = await reserveAIBudget(supabase,request,key,'scoring',{reviewId:review.id},[
      aiBudgetPlan('gemini',{prompt:SOCIAL_SCORING_PROMPT,screenshot},4096,2,true),
    ]);

    let parsed;
    try { parsed = await scoreWithGemini(supabase,budget,screenshot); }
    catch (error) {
      await recordAIUsage(supabase,'gemini',usageGeminiModel(),{},safeProviderDiagnostic(error,'gemini').code);
      throw new HavenRequestError(SCORING_PROVIDER_UNAVAILABLE, 503);
    }
    await persistScoring(supabase, review.id, parsed, null, review.scoring_revision || 0);
    return json({ ok: true, ...parsed, revision: review.scoring_revision || 0,
      ...(parsed.state === 'insufficient_evidence' ? { message: scoreFailureCopy(parsed.reason,'social') } : {}) });
  } catch (error) {
    if (error instanceof HavenRequestError && ['ai_paused','ai_daily_budget_exceeded','ai_budget_unavailable'].includes((error as any).code)) {
      (headers as Record<string,string>)['Retry-After']=String(error.retryAfter || 60);
      return json({ok:false,code:(error as any).code,retryAfter:error.retryAfter || 60,error:error.message},error.status);
    }
    if (error instanceof HavenRequestError && error.status === 409) return json({ ok: false, code: 'source_changed', error: error.message }, 409);
    if (started && supabase && review) {
      try { await persistScoring(supabase, review.id, { state: 'failed', reason: 'provider_unavailable' }, null, review.scoring_revision || 0); }
      catch { return json({ ok: false, state: 'failed', error: 'Could not save the reader status. Please try again.' }, 500); }
    }
    const known = error instanceof HavenRequestError || error instanceof ReviewAccessError;
    logEvent('error','score-social.diagnostic_6',requestId);
    return json({ ok: false, state: 'failed', reason: 'provider_unavailable', error: known ? error.message : 'Unable to read your profile. Please try again.' }, known ? error.status : 502);
  } finally { await budget?.settle(); }
}));

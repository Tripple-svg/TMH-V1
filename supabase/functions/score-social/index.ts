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
import { parseScoringResult, persistScoring, cachedScoring } from '../_shared/haven-scoring.ts';

const SOCIAL_SCORING_PROMPT = scoringInstructions('social');

const parseScoreJson = (raw: string) => parseScoringResult(raw, 'social');

async function scoreWithGemini(db:any,budget:AIBudgetReservation,screenshot: string): Promise<{ raw: string; status: number }> {
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
  return { raw: geminiText(payload), status: 200 };
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
    const cached = body.force === true ? null : cachedScoring(review, 'social');
    if (cached) return json({ ok: true, ...cached, revision: review.scoring_revision || 0, cached: true });
    await enforceScoringLimits(supabase, request, key, review.id);
    started = true;
    // The saved private object, not a browser-swapped image, is authoritative.
    const screenshot = await storedReviewScreenshot(supabase, review);
    if (!geminiProcessingEnabled()) throw new HavenRequestError('Image scoring is unavailable. Please continue to chat and describe your profile.', 503);
    budget = await reserveAIBudget(supabase,request,key,'scoring',{reviewId:review.id},[
      aiBudgetPlan('gemini',{prompt:SOCIAL_SCORING_PROMPT,screenshot},4096,2,true),
    ]);

    // Only Gemini has vision. No Groq fallback possible.
    let lastErr: string = '';
    for (let attempt = 0; attempt < 1; attempt++) {
      try {
        const { raw, status } = await scoreWithGemini(supabase,budget,screenshot);
        if (status === 200) {
          const parsed = parseScoreJson(raw);
          if (parsed) {
            await persistScoring(supabase, review.id, parsed, null, review.scoring_revision || 0);
            return json({ ok: true, ...parsed, revision: review.scoring_revision || 0 });
          }
          lastErr = 'Gemini returned unparseable JSON';
          logEvent('warn','score-social.diagnostic_1',requestId);
        } else if (status === 503 || status === 502 || status === 504) {
          lastErr = `Gemini ${status}`;
          logEvent('warn','score-social.diagnostic_2',requestId);
        } else {
          lastErr = `Gemini ${status}: ${'[redacted model output]'}`;
          logEvent('warn','score-social.diagnostic_3',requestId);
          break;
        }
      } catch (err) {
        await recordAIUsage(supabase,'gemini',usageGeminiModel(),{},safeProviderDiagnostic(err,'gemini').code);
        lastErr = err instanceof Error ? err.message : String(err);
        logEvent('warn','score-social.diagnostic_4',requestId);
      }

    }

    logEvent('warn','score-social.diagnostic_5',requestId);
    throw new HavenRequestError('I ran into an unexpected error while reading your profile. Please try again or continue to chat.', 502);
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

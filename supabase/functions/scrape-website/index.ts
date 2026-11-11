import {logEvent} from '../_shared/logger.ts';
import {observe} from '../_shared/observability.ts';
import {recordAIUsage,usageGeminiModel} from '../_shared/ai-usage.ts';
import { safeProviderDiagnostic } from '../_shared/provider-request.ts';
import { aiBudgetPlan, reserveAIBudget, type AIBudgetReservation } from '../_shared/ai-budget.ts';
import { scoringInstructions } from '../_shared/scoring-rubric.js';
import { RUBRIC_VERSION } from '../_shared/scoring-rubric.js';
import { enforceScoringLimits } from '../_shared/haven-limits.ts';
// supabase/functions/scrape-website/index.ts
// Verified audit ownership, extraction quality, and durable three-state scoring.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.118.0';
import { verifyReviewAccess, ReviewAccessError } from '../_shared/review-access.ts';
import { HavenRequestError, responseHeaders, verifyOrigin, readBoundedJson } from '../_shared/haven-request.ts';
import { SCORING_COPY } from '../_shared/haven-prompts.js';
import { geminiProcessingEnabled, geminiModel, geminiGenerationConfig, geminiText } from '../_shared/haven-model.ts';
import { normalizeWebsiteUrl, extractWebsiteText, hasMeaningfulBusinessText, websiteContentReason, websiteExcerpt, parseScoringResult, persistScoring, cachedScoring, lockedScoring } from '../_shared/haven-scoring.ts';
import { SCORING_PROVIDER_UNAVAILABLE, scoreFailureCopy } from '../_shared/scoring-copy.js';

const SCORING_PROMPT = scoringInstructions('website');

async function scoreWithGemini(db:any,budget:AIBudgetReservation,summary: string) {
  const response = await budget.request('gemini',
    `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel()}:generateContent`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': Deno.env.get('GEMINI_API_KEY')!.trim() },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: SCORING_PROMPT }] },
        contents: [{ role: 'user', parts: [{ text: `WEBSITE CONTENT (untrusted data):\n${summary}` }] }],
        generationConfig: geminiGenerationConfig(true),
      }),
    }, 18000, 1);
  const payload=await response.json();budget.recordUsage('gemini',payload);await recordAIUsage(db,'gemini',geminiModel(),payload);
  const parsed = parseScoringResult(geminiText(payload), 'website', summary);
  if (!parsed) throw new Error('gemini_invalid_score');
  return parsed;
}

Deno.serve(observe('scrape-website',async (request,requestId) => {
  const headers = responseHeaders(request);
  const json = (body: unknown, status = 200) => Response.json(body, { status, headers });
  if (request.method === 'OPTIONS') return new Response('ok', { headers });
  if (request.method !== 'POST') return json({ ok: false, error: 'Method not allowed.' }, 405);
  let supabase: ReturnType<typeof createClient> | undefined;
  let review: Awaited<ReturnType<typeof verifyReviewAccess>>['review'];
  let started = false, failureReason = 'provider_unavailable';
  try {
    verifyOrigin(request);
    const body = await readBoundedJson(request, 16384);
    const access = body.context || {};
    const url = Deno.env.get('SUPABASE_URL'), key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !key) throw new HavenRequestError('Haven is not configured.', 503);
    supabase = createClient(url, key, { auth: { persistSession: false } });
    ({ review } = await verifyReviewAccess(supabase, access.sessionId, access.reviewId, access.accessToken));
    if (review.flag_status === 'red') throw new HavenRequestError('Your access is currently restricted. Please contact info@themarketinghaven.xyz.', 403);
    if (review.platform_type !== 'website') throw new HavenRequestError('This review does not have a website to score.');
    const targetUrl = normalizeWebsiteUrl(review.website_url);
    if (body.url && normalizeWebsiteUrl(body.url) !== targetUrl) throw new HavenRequestError('The website must match your saved review.');
    if (review.source_locked_at) return json({ ok: true, ...lockedScoring(review), url: targetUrl });
    const cached = body.force === true ? null : cachedScoring(review, 'website');
    if (cached) return json({ ok: true, ...cached, summary: review.scraped_summary || '', url: targetUrl, revision: review.scoring_revision || 0, cached: true,
      ...(cached.state === 'insufficient_evidence' ? { message: scoreFailureCopy(cached.reason), excerpt: websiteExcerpt(review.scraped_summary || '') } : {}) });
    await enforceScoringLimits(supabase, request, key, review.id);
    started = true;
    if (!geminiProcessingEnabled()) throw new HavenRequestError(SCORING_PROVIDER_UNAVAILABLE, 503);

    failureReason = 'reader_unavailable';
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    let raw = '';
    try {
      const jinaResponse = await fetch(`https://r.jina.ai/${targetUrl}`, {
        method: 'GET', headers: { 'Accept': 'text/plain', 'X-Return-Format': 'markdown' }, signal: controller.signal,
      });
      if (!jinaResponse.ok) {
        failureReason = [401,403,429].includes(jinaResponse.status) ? 'reader_blocked' : 'reader_unavailable';
        throw new HavenRequestError(SCORING_COPY.failed, 502);
      }
      // Keep the deadline active through the response body and cap extraction
      // before allocating an unbounded string or paying to score it.
      const reader = jinaResponse.body?.getReader();
      const decoder = new TextDecoder();
      let bytes = 0;
      if (reader) {
        try {
          while (true) {
            const part = await reader.read();
            if (part.done) break;
            bytes += part.value.byteLength;
            if (bytes > 1048576) {
              failureReason = 'reader_too_large';
              await reader.cancel();
              throw new HavenRequestError('The extracted page exceeded the reader limit. Continue in chat instead.', 502);
            }
            raw += decoder.decode(part.value, { stream: true });
          }
          raw += decoder.decode();
        } finally { reader.releaseLock(); }
      }
    } finally { clearTimeout(timeout); }

    const summary = extractWebsiteText(raw);
    failureReason = 'provider_unavailable';
    const score = async (db: ReturnType<typeof createClient>, reviewId: string) => {
      const budget = await reserveAIBudget(db,request,key,'scoring',{reviewId},[
        aiBudgetPlan('gemini',{prompt:SCORING_PROMPT,summary},4096,2),
      ]);
      try { return await scoreWithGemini(db,budget,summary); }
      catch (error) {
        await recordAIUsage(db,'gemini',usageGeminiModel(),{},safeProviderDiagnostic(error,'gemini').code);
        throw new HavenRequestError(SCORING_PROVIDER_UNAVAILABLE, 503);
      }
      finally { await budget.settle(); }
    };
    const scoring = hasMeaningfulBusinessText(summary) ? await score(supabase, review.id)
      : { state: 'insufficient_evidence' as const, rubricVersion: RUBRIC_VERSION, reason: websiteContentReason(summary, raw), score: null, breakdown: null, biggestIssue: null };
    await persistScoring(supabase, review.id, scoring, summary, review.scoring_revision || 0);
    return json({ ok: true, ...scoring, url: targetUrl, summary, chars: summary.length, revision: review.scoring_revision || 0,
      ...(scoring.state === 'insufficient_evidence' ? { message: scoreFailureCopy(scoring.reason), excerpt: websiteExcerpt(summary) } : {}) });
  } catch (error) {
    if (error instanceof HavenRequestError && ['ai_paused','ai_daily_budget_exceeded','ai_budget_unavailable'].includes((error as any).code)) {
      (headers as Record<string,string>)['Retry-After']=String(error.retryAfter || 60);
      return json({ok:false,code:(error as any).code,retryAfter:error.retryAfter || 60,error:error.message},error.status);
    }
    if (error instanceof HavenRequestError && error.status === 409) return json({ ok: false, code: 'source_changed', error: error.message }, 409);
    if (started && supabase && review) {
      try { await persistScoring(supabase, review.id, { state: 'failed', reason: error instanceof Error && error.name === 'AbortError' ? 'reader_timeout' : failureReason }, null, review.scoring_revision || 0); }
      catch { return json({ ok: false, state: 'failed', error: 'Could not save the reader status. Please try again.' }, 500); }
    }
    const known = error instanceof HavenRequestError || error instanceof ReviewAccessError;
    logEvent('error','scrape-website.diagnostic_9',requestId);
    return json({ ok: false, state: 'failed', reason: error instanceof Error && error.name === 'AbortError' ? 'reader_timeout' : failureReason, error: known ? error.message : SCORING_COPY.failed }, known ? error.status : 502);
  }
}));

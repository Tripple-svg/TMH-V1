import {recordAIUsage,usageGeminiModel} from '../_shared/ai-usage.ts';
import { providerRequest,safeProviderDiagnostic } from '../_shared/provider-request.ts';
import { scoringInstructions } from '../_shared/scoring-rubric.js';
import { RUBRIC_VERSION } from '../_shared/scoring-rubric.js';
import { enforceScoringLimits } from '../_shared/haven-limits.ts';
// supabase/functions/scrape-website/index.ts
// Verified audit ownership, extraction quality, and durable three-state scoring.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { verifyReviewAccess, ReviewAccessError } from '../_shared/review-access.ts';
import { HavenRequestError, responseHeaders, verifyOrigin, readBoundedJson } from '../_shared/haven-request.ts';
import { SCORING_COPY } from '../_shared/haven-prompts.js';
import { geminiProcessingEnabled, geminiModel, geminiGenerationConfig, geminiText } from '../_shared/haven-model.ts';
import { normalizeWebsiteUrl, extractWebsiteText, hasMeaningfulBusinessText, websiteContentReason, parseScoringResult, persistScoring, cachedScoring } from '../_shared/haven-scoring.ts';

const SCORING_PROMPT = scoringInstructions('website');

const parseScoreJson = (raw: string, summary?: string) => parseScoringResult(raw, 'website', summary);

async function scoreWithGemini(db:any,summary: string): Promise<{ raw: string; status: number }> {
  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (!geminiProcessingEnabled()) throw new Error('Gemini is disabled or its API key is missing.');
  if (!apiKey) throw new Error('GEMINI_API_KEY not configured.');

  const response = await providerRequest('gemini',
    `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel()}:generateContent`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey.trim() },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: SCORING_PROMPT }] },
        contents: [{ role: 'user', parts: [{ text: `WEBSITE CONTENT (untrusted data):\n${summary}` }] }],
        generationConfig: geminiGenerationConfig(true),
      }),
    }, 18000, 1);
  const payload=await response.json();await recordAIUsage(db,'gemini',geminiModel(),payload);
  return { raw: geminiText(payload), status: 200 };
}

async function scoreWithGroq(db:any,summary: string): Promise<string> {
  const apiKey = Deno.env.get('GROQ_API_KEY')?.trim();
  if (!apiKey) throw new Error('GROQ_API_KEY not configured.');

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(15000),
    body: JSON.stringify({
      model: Deno.env.get('GROQ_MODEL')?.trim() || 'openai/gpt-oss-120b',
      messages: [
        { role: 'system', content: SCORING_PROMPT },
        { role: 'user', content: `WEBSITE CONTENT:\n\n${summary}` },
      ],
      max_tokens: 1600, reasoning_effort: 'low',
      temperature: 0,
      response_format: { type: 'json_object' },
    }),
  });
  if (!response.ok) throw new Error('groq_http_' + response.status);
  const data = await response.json();await recordAIUsage(db,'groq',Deno.env.get('GROQ_MODEL')?.trim()||'openai/gpt-oss-120b',data);
  if(data.choices?.[0]?.finish_reason && data.choices[0].finish_reason!=='stop') throw new Error('groq_incomplete_response');
  return data.choices?.[0]?.message?.content || '';
}

async function scoreWebsite(db:any,summary: string) {
  for (let attempt = 0; geminiProcessingEnabled() && attempt < 1; attempt++) {
    try {
      const { raw, status } = await scoreWithGemini(db,summary);
      if (status === 200) {
        const parsed = parseScoreJson(raw, summary);
        if (parsed) {
          console.log(`[scoring] Gemini OK on attempt ${attempt + 1} — score ${parsed.score}`);
          return parsed;
        }
        console.warn(`[scoring] Gemini unparseable JSON (attempt ${attempt + 1}):`, '[redacted model output]');
      } else if (status === 503 || status === 502 || status === 504) {
        console.warn(`[scoring] Gemini ${status} on attempt ${attempt + 1}`);
      } else {
        console.warn(`[scoring] Gemini ${status} — not retryable`);
        break;
      }
    } catch (err) {
      await recordAIUsage(db,'gemini',usageGeminiModel(),{},safeProviderDiagnostic(err,'gemini').code);
      console.warn(`[scoring] Gemini threw on attempt ${attempt + 1}:`, err instanceof Error ? err.message : err);
    }

  }

  try {
    const raw = await scoreWithGroq(db,summary);
    const parsed = parseScoreJson(raw, summary);
    if (parsed) {
      console.log(`[scoring] Groq fallback OK — score ${parsed.score}`);
      return parsed;
    }
    console.warn('[scoring] Groq unparseable JSON:', '[redacted model output]');
  } catch (err) {
    await recordAIUsage(db,'groq',Deno.env.get('GROQ_MODEL')?.trim()||'openai/gpt-oss-120b',{},safeProviderDiagnostic(err,'groq').code);
    console.warn('[scoring] Groq fallback failed:', err instanceof Error ? err.message : err);
  }

  return null;
}

Deno.serve(async (request) => {
  const headers = responseHeaders(request);
  const json = (body: unknown, status = 200) => Response.json(body, { status, headers });
  if (request.method === 'OPTIONS') return new Response('ok', { headers });
  if (request.method !== 'POST') return json({ ok: false, error: 'Method not allowed.' }, 405);
  let supabase, review, started = false, failureReason = 'provider_unavailable';
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
    const cached = body.force === true ? null : cachedScoring(review, 'website');
    if (cached) return json({ ok: true, ...cached, summary: review.scraped_summary || '', url: targetUrl, cached: true });
    await enforceScoringLimits(supabase, request, key, review.id);
    started = true;

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
    const scoring = hasMeaningfulBusinessText(summary) ? await scoreWebsite(supabase,summary)
      : { state: 'insufficient_evidence' as const, rubricVersion: RUBRIC_VERSION, reason: websiteContentReason(summary), score: null, breakdown: null, biggestIssue: null };
    if (!scoring) throw new HavenRequestError(SCORING_COPY.failed, 502);
    await persistScoring(supabase, review.id, scoring, summary, review.scoring_revision || 0);
    return json({ ok: true, ...scoring, url: targetUrl, summary, chars: summary.length, revision: review.scoring_revision || 0 });
  } catch (error) {
    if (error instanceof HavenRequestError && error.status === 409) return json({ ok: false, code: 'source_changed', error: error.message }, 409);
    if (started && supabase && review) {
      try { await persistScoring(supabase, review.id, { state: 'failed', reason: error instanceof Error && error.name === 'AbortError' ? 'reader_timeout' : failureReason }, null, review.scoring_revision || 0); }
      catch { return json({ ok: false, state: 'failed', error: 'Could not save the reader status. Please try again.' }, 500); }
    }
    const known = error instanceof HavenRequestError || error instanceof ReviewAccessError;
    console.error('scrape-website request failed', known ? error.status : 502);
    return json({ ok: false, state: 'failed', reason: error instanceof Error && error.name === 'AbortError' ? 'reader_timeout' : failureReason, error: known ? error.message : SCORING_COPY.failed }, known ? error.status : 502);
  }
});

import {logEvent} from '../_shared/logger.ts';
import {observe} from '../_shared/observability.ts';
import { normalizeWebsiteUrl } from '../_shared/haven-scoring.ts';
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.118.0';
import { hashReviewToken, validReviewCredentials, verifyReviewAccess, ReviewAccessError } from '../_shared/review-access.ts';
import { readBoundedJson, HavenRequestError } from '../_shared/haven-request.ts';
import { enforceReviewRequestBudget, reviewAttemptGate, reviewLimitDetails } from '../_shared/review-attempts.ts';
import { verifyTurnstile } from '../_shared/turnstile.ts';
import { decodeScreenshotDataUrl, ScreenshotValidationError } from '../_shared/screenshot-validation.ts';
import {PUBLIC_ORIGINS as ORIGINS} from '../_shared/cors.ts';
import { deletionEmailHash, deletionNetworkHash, deletionReviewDenial, reviewDeletionStatus } from '../_shared/deletion-tombstone.ts';

function headers(origin: string | null) {
  const allowed = origin && ORIGINS.includes(origin);
  return { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Vary': 'Origin',
    'Access-Control-Allow-Origin': allowed ? origin! : ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    'Access-Control-Allow-Methods': 'POST, OPTIONS' };
}
const text = (value: unknown, max = 500) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const boundedInt = (value: unknown, min: number, max: number) => Math.min(max, Math.max(min, Math.trunc(Number(value) || min)));

serve(observe('create-brand-review',async (req,requestId) => {
  const origin = req.headers.get('origin');
  const json = (body: unknown, status = 200, retryAfter = 0) => new Response(JSON.stringify(body), { status, headers:{...headers(origin),...(retryAfter?{'Retry-After':String(retryAfter)}:{})} });
  if (req.method === 'OPTIONS') return new Response('ok', { headers: headers(origin) });
  if (req.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405);
  if (origin && !ORIGINS.includes(origin)) return json({ ok: false, error: 'Origin not allowed' }, 403);
  try {
    const url = Deno.env.get('SUPABASE_URL');
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !key) return json({ ok: false, error: 'Review service is not configured' }, 500);
    const body = await readBoundedJson(req, 7_100_000);
    const { id, sessionId, accessToken } = body;
    const email = text(body.email, 254).toLowerCase();
    if (!validReviewCredentials(sessionId, id, accessToken)) return json({ ok: false, error: 'Invalid review credentials' }, 400);
    if (!text(body.fullName) || !text(body.brandName) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
      || text(body.whatsapp, 40).replace(/\D/g, '').length < 10 || body.agreedToTerms !== true
      || !['website', 'social', 'none'].includes(body.platformType)) {
      return json({ ok: false, error: 'Please complete the required review fields and accept the terms' }, 400);
    }
    const websiteUrl = body.platformType === 'website' ? normalizeWebsiteUrl(body.websiteUrl) : null;
    if (body.platformType === 'social' && !body.screenshotBase64) return json({ ok: false, error: 'Upload a profile screenshot to request a social review.' }, 400);
    let screenshot: Uint8Array | null = null;
    let contentType = '';
    let screenshotPath: string | null = null;
    if (body.platformType === 'social' && body.screenshotBase64) {
      const validated=decodeScreenshotDataUrl(body.screenshotBase64);
      screenshot=validated.bytes;
      contentType=validated.mimeType;
      screenshotPath = `${id}/review.${contentType.split('/')[1]}`;
    }
    const supabase = createClient(url, key, { auth: { persistSession: false } });
    // A response-lost retry can reuse its private capability, never its email alone.
    const { data: existing, error: lookupError } = await supabase.from('brand_reviews').select('id').eq('id', id).maybeSingle();
    if (lookupError) return json({ ok: false, error: 'Unable to check the review' }, 500);
    if (existing) {
      const { review } = await verifyReviewAccess(supabase, sessionId, id, accessToken);
      if (review.screenshot_url !== screenshotPath || review.email !== text(body.email, 254).toLowerCase() || review.platform_type !== body.platformType || (review.website_url || null) !== websiteUrl) {
        return json({ ok: false, error: 'Retry the original submission or contact the team' }, 409);
      }
    } else {
      await enforceReviewRequestBudget(supabase,req,key,'review-submit');
      const [emailHash, networkHash] = await Promise.all([deletionEmailHash(email, key), deletionNetworkHash(req, key)]);
      const deletionDenial = deletionReviewDenial(await reviewDeletionStatus(supabase, email, emailHash, networkHash));
      if (deletionDenial) return json({ ok: false, ...deletionDenial }, 403);
      try {
        await verifyTurnstile(req,body.turnstileToken,'brand_review');
      } catch (error) {
        if (error instanceof HavenRequestError && error.status < 500) await reviewAttemptGate(supabase,req,key,true);
        throw error;
      }
      await reviewAttemptGate(supabase,req,key);
      const firstVisit = Date.parse(body.firstVisitAt);
      const review = {
        id, full_name: text(body.fullName, 150), brand_name: text(body.brandName, 200),
        email, whatsapp: text(body.whatsapp, 40),
        main_goal: text(body.mainGoal), platform_type: body.platformType,
        social_platform: body.platformType === 'social' ? text(body.socialPlatform, 50) : null, social_link: body.platformType === 'social' ? text(body.socialLink, 1000) : null,
        website_url: websiteUrl, screenshot_url: screenshotPath,
        agreed_to_terms: true, utm_source: text(body.utmSource), utm_campaign: text(body.utmCampaign),
        referrer_url: text(body.referrerUrl, 2000), device_type: text(body.deviceType, 50),
        visit_count: boundedInt(body.visitCount, 1, 100000),
        first_visit_at: Number.isFinite(firstVisit) ? new Date(firstVisit).toISOString() : null,
        days_to_convert: boundedInt(body.daysToConvert, 0, 100000), country: text(body.country, 100), city: text(body.city, 100),
      };
      const { data, error } = await supabase.rpc('create_haven_review_after_deletion_check', {
        p_review: review, p_session_id: sessionId, p_token_hash: await hashReviewToken(accessToken),
        p_email_hash: emailHash, p_network_hash: networkHash,
      });
      const concurrentDeletionDenial = deletionReviewDenial(data?.deletionBlock);
      if (concurrentDeletionDenial) return json({ ok: false, ...concurrentDeletionDenial }, 403);
      if (error?.code === '23505') {
        await reviewAttemptGate(supabase,req,key,true);
        return json({ ok: false, error: 'This email already has a review. Contact the team for help.' },409);
      }
      if (error) return json({ ok: false, error: 'Unable to save your review' },500);
    }
    // Commit the record first. A failed upload retries with the same capability/path.
    if (screenshot && screenshotPath) {
      const { error } = await supabase.storage.from('tmh-screenshots').upload(screenshotPath, screenshot, { contentType, upsert: true });
      if (error) return json({ ok: false, error: 'Unable to save your screenshot. Please retry.' }, 500);
      // An administrator may have deleted this review while the upload was in flight.
      // Do not recreate an orphan screenshot or acknowledge a now-deleted review.
      try { await verifyReviewAccess(supabase, sessionId, id, accessToken); }
      catch (error) {
        if (error instanceof ReviewAccessError && error.status === 403) {
          const { error: cleanupError } = await supabase.storage.from('tmh-screenshots').remove([screenshotPath]);
          if (cleanupError) logEvent('error','create-brand-review.diagnostic_1',requestId);
        }
        throw error;
      }
    }
    return json({ ok: true, reviewId: id, sessionId });
  } catch (error) {
    if (error instanceof HavenRequestError && error.status === 429) {
      const limit = reviewLimitDetails(error);
      return json({ok:false,error:error.message,...limit},429,limit.retryAfter);
    }
    if (error instanceof ReviewAccessError || error instanceof HavenRequestError || error instanceof ScreenshotValidationError) return json({ ok: false, error: error.message }, error.status);
    logEvent('error','create-brand-review.diagnostic_2',requestId);
    return json({ ok: false, error: 'Unable to save your review. Please try again.' }, 500);
  }
}));

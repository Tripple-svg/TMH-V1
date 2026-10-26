import { normalizeWebsiteUrl } from '../_shared/haven-scoring.ts';
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { hashReviewToken, validReviewCredentials, verifyReviewAccess, ReviewAccessError } from '../_shared/review-access.ts';
import { readBoundedJson, HavenRequestError } from '../_shared/haven-request.ts';

const ORIGINS = ['https://themarketinghaven.xyz', 'https://www.themarketinghaven.xyz'];
function headers(origin: string | null) {
  const allowed = origin && (ORIGINS.includes(origin) || /^http:\/\/localhost:\d+$/.test(origin));
  return { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Vary': 'Origin',
    'Access-Control-Allow-Origin': allowed ? origin! : ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    'Access-Control-Allow-Methods': 'POST, OPTIONS' };
}
const text = (value: unknown, max = 500) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const boundedInt = (value: unknown, min: number, max: number) => Math.min(max, Math.max(min, Math.trunc(Number(value) || min)));

serve(async (req) => {
  const origin = req.headers.get('origin');
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: headers(origin) });
  if (req.method === 'OPTIONS') return new Response('ok', { headers: headers(origin) });
  if (req.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405);
  if (origin && !ORIGINS.includes(origin) && !/^http:\/\/localhost:\d+$/.test(origin)) return json({ ok: false, error: 'Origin not allowed' }, 403);
  try {
    const url = Deno.env.get('SUPABASE_URL');
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const captchaSecret = Deno.env.get('HCAPTCHA_SECRET');
    if (!url || !key || !captchaSecret) return json({ ok: false, error: 'Review service is not configured' }, 500);
    const body = await readBoundedJson(req, 7_100_000);
    const { id, sessionId, accessToken } = body;
    if (!validReviewCredentials(sessionId, id, accessToken)) return json({ ok: false, error: 'Invalid review credentials' }, 400);
    if (!text(body.fullName) || !text(body.brandName) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text(body.email, 254))
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
      const match = typeof body.screenshotBase64 === 'string' && /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(body.screenshotBase64);
      if (!match) return json({ ok: false, error: 'Use a PNG, JPEG or WebP screenshot' }, 400);
      try { screenshot = Uint8Array.from(atob(match[2]), (c) => c.charCodeAt(0)); }
      catch { return json({ ok: false, error: 'Invalid screenshot' }, 400); }
      if (screenshot.length > 5 * 1024 * 1024) return json({ ok: false, error: 'Screenshot must be smaller than 5 MB' }, 413);
      contentType = match[1];
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
      const token = text(body.hcaptchaToken, 10000);
      if (!token) return json({ ok: false, error: 'Please complete the verification check' }, 400);
      const captcha = await fetch('https://api.hcaptcha.com/siteverify', {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ secret: captchaSecret, response: token,
          sitekey: Deno.env.get('HCAPTCHA_SITE_KEY') || '2506b35e-f496-40aa-a6e4-32cc1eb84e4c' }),
        signal: AbortSignal.timeout(15000),
      });
      const result = await captcha.json();
      if (!captcha.ok || result.success !== true) return json({ ok: false, error: 'Verification failed. Please try again.' }, 403);
      const firstVisit = Date.parse(body.firstVisitAt);
      const review = {
        id, full_name: text(body.fullName, 150), brand_name: text(body.brandName, 200),
        email: text(body.email, 254).toLowerCase(), whatsapp: text(body.whatsapp, 40),
        main_goal: text(body.mainGoal), platform_type: body.platformType,
        social_platform: body.platformType === 'social' ? text(body.socialPlatform, 50) : null, social_link: body.platformType === 'social' ? text(body.socialLink, 1000) : null,
        website_url: websiteUrl, screenshot_url: screenshotPath,
        agreed_to_terms: true, utm_source: text(body.utmSource), utm_campaign: text(body.utmCampaign),
        referrer_url: text(body.referrerUrl, 2000), device_type: text(body.deviceType, 50),
        visit_count: boundedInt(body.visitCount, 1, 100000),
        first_visit_at: Number.isFinite(firstVisit) ? new Date(firstVisit).toISOString() : null,
        days_to_convert: boundedInt(body.daysToConvert, 0, 100000), country: text(body.country, 100), city: text(body.city, 100),
      };
      const { error } = await supabase.rpc('create_haven_review', {
        p_review: review, p_session_id: sessionId, p_token_hash: await hashReviewToken(accessToken),
      });
      if (error) return json({ ok: false, error: error.code === '23505' ? 'This email already has a review. Contact the team for help.' : 'Unable to save your review' }, error.code === '23505' ? 409 : 500);
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
          if (cleanupError) console.error('Deleted review screenshot needs storage cleanup');
        }
        throw error;
      }
    }
    return json({ ok: true, reviewId: id, sessionId });
  } catch (error) {
    if (error instanceof ReviewAccessError || error instanceof HavenRequestError) return json({ ok: false, error: error.message }, error.status);
    console.error('create-brand-review failed');
    return json({ ok: false, error: 'Unable to save your review. Please try again.' }, 500);
  }
});

import { supabase, supabaseAdmin } from './supabase';

const SCREENSHOT_BUCKET = 'tmh-screenshots';

const makeId = () => crypto.randomUUID();

function asNumber(value) {
  const result = Number(value);
  return Number.isFinite(result) ? result : 0;
}

export function calculateLeadTemperature({
  totalExchanges = 0,
  seriousnessSignal = false,
  socialFollowerBand = '',
  websiteScore = 0,
  clickedBookingLink = false,
  clickedPlaybookLink = false,
  daysToConvert = 0,
} = {}) {
  let points = 0;
  const exchanges = asNumber(totalExchanges);
  const score = asNumber(websiteScore);

  if (exchanges >= 8) points += 3;
  else if (exchanges >= 4) points += 2;
  else if (exchanges >= 2) points += 1;
  if (seriousnessSignal) points += 3;
  if (clickedBookingLink) points += 4;
  if (clickedPlaybookLink) points += 1;
  if (['10k+', '50k+', '100k+', 'large'].includes(String(socialFollowerBand).toLowerCase())) points += 1;
  if (score >= 65) points += 1;
  if (asNumber(daysToConvert) <= 2) points += 1;

  if (points >= 7) return 'Hot';
  if (points >= 3) return 'Warm';
  return 'Cold';
}

async function uploadScreenshot(reviewId, base64DataUrl) {
  if (!base64DataUrl || !base64DataUrl.startsWith('data:image/')) return null;
  try {
    const [meta, b64] = base64DataUrl.split(',');
    const mimeType = meta.replace('data:', '').replace(';base64', '');
    const extension = mimeType.split('/')[1] || 'jpg';
    const path = `${reviewId}/${Date.now()}.${extension}`;
    const byteChars = atob(b64);
    const byteArr = new Uint8Array(byteChars.length);
    for (let index = 0; index < byteChars.length; index += 1) byteArr[index] = byteChars.charCodeAt(index);
    const blob = new Blob([byteArr], { type: mimeType });
    const { error } = await supabase.storage.from(SCREENSHOT_BUCKET).upload(path, blob, {
      contentType: mimeType,
      upsert: false,
    });
    if (error) {
      console.warn('Screenshot upload failed:', error);
      return null;
    }
    return path;
  } catch (error) {
    console.warn('Screenshot upload error:', error);
    return null;
  }
}

export async function createBrandReview(payload) {
  try {
    const id = payload.id || makeId();
    const screenshotUrl = await uploadScreenshot(id, payload.screenshotBase64 || null);

    const review = {
      id,
      full_name: payload.fullName || payload.full_name,
      brand_name: payload.brandName || payload.brand_name,
      email: payload.email,
      whatsapp: payload.whatsapp,
      main_goal: payload.mainGoal || payload.main_goal || null,
      platform_type: payload.platformType || payload.platform_type || 'none',
      social_platform: payload.socialPlatform || payload.social_platform || null,
      social_link: payload.socialLink || payload.social_link || payload.socialHandle || null,
      website_url: payload.websiteUrl || payload.website_url || null,
      screenshot_url: screenshotUrl,
      is_returning_user: Boolean(payload.isReturningUser || payload.is_returning_user),
      utm_source: payload.utmSource || payload.utm_source || null,
      utm_campaign: payload.utmCampaign || payload.utm_campaign || null,
      referrer_url: payload.referrerUrl || payload.referrer_url || null,
      device_type: payload.deviceType || payload.device_type || null,
      visit_count: payload.visitCount || payload.visit_count || 1,
      first_visit_at: payload.firstVisitAt || payload.first_visit_at || new Date().toISOString(),
      days_to_convert: payload.daysToConvert ?? payload.days_to_convert ?? 0,
      country: payload.country || null,
      city: payload.city || null,
    };

    const { error } = await supabase.from('brand_reviews').insert(review);
    if (error) throw error;
    return { success: true, reviewId: id };
  } catch (error) {
    console.error('Unable to create brand review:', error);
    return { success: false, reviewId: null, error };
  }
}

export async function updateAssessment(reviewId, {
  havenScore,
  assessmentSummary,
  biggestLeak,
  biggestProblems,
  preCallBriefing,
  leadTemperatureInputs = {},
}) {
  const { error } = await supabase.from('brand_reviews').update({
    haven_score: havenScore ?? null,
    assessment_summary: assessmentSummary ?? null,
    biggest_leak: biggestLeak ?? null,
    biggest_problems: biggestProblems ?? [],
    pre_call_briefing: preCallBriefing ?? null,
    lead_temperature: calculateLeadTemperature({
      ...leadTemperatureInputs,
      websiteScore: leadTemperatureInputs.websiteScore ?? havenScore,
    }),
  }).eq('id', reviewId);

  return error ? { success: false, error } : { success: true };
}

export async function saveHavenSession({
  id, reviewId, scope, serviceId = null, messages = [], currentStep = 'GREETING',
  lastStepReached = currentStep, totalExchanges = 0,
}) {
  const { error } = await supabase.from('haven_sessions').upsert({
    id,
    review_id: reviewId || null,
    scope,
    service_id: serviceId,
    messages,
    current_step: currentStep,
    last_step_reached: lastStepReached,
    total_exchanges: totalExchanges,
  });
  return error ? { success: false, error } : { success: true };
}

export async function updateFollowupStatus(reviewId, {
  followupStatus,
  followupNotes,
  callBookedAt,
  convertedToCall,
  convertedToPurchase,
  dealValue,
}) {
  const update = {
    ...(followupStatus !== undefined && { followup_status: followupStatus }),
    ...(followupNotes !== undefined && { followup_notes: followupNotes }),
    ...(callBookedAt !== undefined && { call_booked_at: callBookedAt }),
    ...(convertedToCall !== undefined && { converted_to_call: convertedToCall }),
    ...(convertedToPurchase !== undefined && { converted_to_purchase: convertedToPurchase }),
    ...(dealValue !== undefined && { deal_value: dealValue || null }),
  };
  const client = supabaseAdmin || supabase;
  const { error } = await client.from('brand_reviews').update(update).eq('id', reviewId);
  return error ? { success: false, error } : { success: true };
}

export async function getScreenshotSignedUrl(storagePath) {
  if (!storagePath) return { success: false, signedUrl: null };
  const client = supabaseAdmin || supabase;
  const { data, error } = await client.storage.from(SCREENSHOT_BUCKET).createSignedUrl(storagePath, 3600);
  return error ? { success: false, signedUrl: null, error } : { success: true, signedUrl: data.signedUrl };
}

export async function getAllReviews() {
  const client = supabaseAdmin || supabase;
  const { data, error } = await client.from('admin_lead_overview').select('*').order('created_at', { ascending: false });
  return error ? { success: false, data: [], error } : { success: true, data: data || [] };
}

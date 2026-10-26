import { supabase } from './supabase';
import { reviewScreenshotError } from './reviewScreenshot';

const SCREENSHOT_BUCKET = 'tmh-screenshots';

const makeId = () => crypto.randomUUID();
const CREATION_TIMEOUT_MS = 30000;
const UUID_PATTERN = /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i;
const pendingCreations = new Map();

function creationCredentials(id, payload) {
  const storageKey = `haven_review_creation_${id}`;
  let credentials = pendingCreations.get(id);
  try {
    if (!credentials) {
      const saved = JSON.parse(sessionStorage.getItem(storageKey) || 'null');
      if (UUID_PATTERN.test(saved?.sessionId || '') && /^[a-f\d]{64}$/i.test(saved?.accessToken || '')) {
        credentials = saved;
      }
    }
  } catch { /* Storage can be unavailable in private browsing. */ }
  if (!credentials) {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    credentials = {
      sessionId: makeId(),
      accessToken: Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join(''),
    };
  }
  if (credentials?.submission) {
    const fields = ['fullName', 'brandName', 'email', 'whatsapp', 'mainGoal', 'platformType', 'socialPlatform', 'socialLink', 'websiteUrl'];
    if (fields.some(field => String(credentials.submission[field] ?? '').trim() !== String(payload[field] ?? '').trim())) {
      const error = new Error('A previous submission is pending with different details. Resume those details or start a new submission; we will not silently reuse the old review.');
      error.code = 'pending_submission_changed';
      throw error;
    }
  }
  // A lost response may hide an already committed review. Retrying its id
  // must use the original details rather than silently creating a new profile.
  const submission = credentials.submission || { ...payload };
  delete submission.hcaptchaToken;
  delete submission.sessionId;
  delete submission.accessToken;
  submission.email = credentials.email ?? submission.email;
  submission.screenshotBase64 ||= credentials.screenshotBase64 || payload.screenshotBase64 || null;
  submission.screenshotFileName ||= credentials.screenshotFileName || payload.screenshotFileName || null;
  credentials = { sessionId: credentials.sessionId, accessToken: credentials.accessToken, submission };
  pendingCreations.set(id, credentials);
  try {
    sessionStorage.setItem(storageKey, JSON.stringify(credentials));
  } catch {
    // Large screenshots can exceed the browser quota. Keep the ownership key
    // so a reload can retry after the user reselects the original image.
    try {
      const { sessionId, accessToken } = credentials;
      sessionStorage.setItem(storageKey, JSON.stringify({ sessionId, accessToken, submission: { ...submission, screenshotBase64: null } }));
    } catch { /* The in-memory copy still supports retries in this tab. */ }
  }
  return credentials;
}

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

export async function createBrandReview(payload) {
  try {
    if (!UUID_PATTERN.test(payload?.id || '')) throw new Error('Invalid review id');
    if (reviewScreenshotError(payload.screenshotBase64)) throw new Error('Invalid screenshot');
    const url = import.meta.env.VITE_SUPABASE_URL;
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
    if (!url || !anonKey) throw new Error('Review service unavailable');
    const credentials = creationCredentials(payload.id, payload);
    const { sessionId, accessToken } = credentials;
    const response = await fetch(`${url}/functions/v1/create-brand-review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${anonKey}`, apikey: anonKey },
      body: JSON.stringify({
        ...credentials.submission,
        hcaptchaToken: payload.hcaptchaToken,
        sessionId, accessToken,
      }),
      signal: AbortSignal.timeout(CREATION_TIMEOUT_MS),
    });
    const result = await response.json();
    if (!response.ok || result?.ok !== true || result.reviewId !== payload.id || result.sessionId !== sessionId) {
      throw new Error('Review was not saved');
    }
    pendingCreations.delete(payload.id);
    try {
      sessionStorage.removeItem(`haven_review_creation_${payload.id}`);
    } catch { /* The saved profile owns the capability after success. */ }
    return { success: true, reviewId: result.reviewId, sessionId, accessToken, submission: credentials.submission };
  } catch (error) {
    return { success: false, reviewId: null, sessionId: null, accessToken: null,
      code: error.code === 'pending_submission_changed' ? error.code : null,
      error: error.code === 'pending_submission_changed' ? error : new Error('Unable to save brand review. Please retry or contact info@themarketinghaven.xyz.') };
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
  const { error } = await supabase.from('brand_reviews').update(update).eq('id', reviewId);
  return error ? { success: false, error } : { success: true };
}

export async function getScreenshotSignedUrl(storagePath) {
  if (!storagePath) return { success: false, signedUrl: null };
  const { data, error } = await supabase.storage.from(SCREENSHOT_BUCKET).createSignedUrl(storagePath, 3600);
  return error ? { success: false, signedUrl: null, error } : { success: true, signedUrl: data.signedUrl };
}

export async function getAllReviews() {
  const { data, error } = await supabase.from('admin_lead_overview').select('*').order('created_at', { ascending: false });
  return error ? { success: false, data: [], error } : { success: true, data: data || [] };
}

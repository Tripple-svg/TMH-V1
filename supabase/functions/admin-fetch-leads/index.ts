// supabase/functions/admin-fetch-leads/index.ts
// Admin-only endpoint. Verifies an Auth JWT and trusted admin role using a
// Supabase secret, then reads brand_reviews + haven_sessions with
// the service_role key (bypasses RLS) and returns leads with
// 1-hour signed screenshot URLs. Transcripts load on demand after admin auth.

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.118.0';
import { geminiModel } from '../_shared/haven-model.ts';
import { requireAdmin, AdminAuthError,readAdminBody } from '../_shared/admin-auth.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

const SCREENSHOT_BUCKET = 'tmh-screenshots';
const SIGNED_URL_TTL = 60 * 60; // 1 hour
const MAX_TRANSCRIPT_MESSAGES = 200;
const MAX_RECORDS = 500;
const MAX_LINKED_SESSIONS = 5000;
const SESSION_FIELDS = 'inquiry_status,inquiry_owner,inquiry_notes,inquiry_next_followup_on,inquiry_revision,inquiry_updated_at,id,review_id,visitor_id,scope,service_id,current_step,last_step_reached,total_exchanges,message_count,created_at,updated_at';
// Keep credentials and future private columns out of the admin payload.
const REVIEW_FIELDS = [
  'id', 'full_name', 'brand_name', 'email', 'whatsapp', 'main_goal',
  'platform_type', 'social_platform', 'social_link', 'website_url', 'screenshot_url',
  'is_returning_user', 'haven_score', 'score_breakdown', 'biggest_leak',
  'biggest_problems', 'assessment_summary', 'pre_call_briefing', 'lead_temperature',
  'utm_source', 'utm_campaign', 'referrer_url', 'device_type', 'visit_count',
  'first_visit_at', 'days_to_convert', 'country', 'city', 'clicked_booking_link',
  'clicked_playbook_link', 'converted_to_call', 'converted_to_purchase', 'deal_value',
  'followup_status', 'followup_notes', 'call_booked_at', 'flag_status', 'flag_reason', 'moderation_strikes',
  'agreed_to_terms', 'agreed_at', 'created_at', 'updated_at',
  'welcome_email_sent', 'welcome_email_id', 'welcome_email_attempted_at', 'welcome_email_last_error',
  'rubric_version', 'score_evidence', 'scoring_revision',
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
    headers: { ...corsHeaders(origin), 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...(status===429?{'Retry-After':'60'}:{}) },
  });
}

// Strip base64 images and other heavyweight fields. Keep only what
// the transcript viewer needs.
function sanitiseMessage(m: unknown) {
  if (!m || typeof m !== 'object') return null;
  const msg = m as Record<string, unknown>;
  return {
    id: typeof msg.id === 'string' ? msg.id : null,
    role: typeof msg.role === 'string' ? msg.role : null,
    content: typeof msg.content === 'string' ? msg.content.slice(0, 8000).replace(/\[\[(?:STEP|LEAD|FLAG|NEED|CHIPS|NAV_CHIPS|DECISION|MEMORY):[\s\S]*?\]\]|\[\[DIAGNOSTIC_QUESTION\]\]/g, '').trim() : '',
    timestamp: typeof msg.timestamp === 'number' || typeof msg.timestamp === 'string' ? msg.timestamp : null,
    hasImage: Boolean(msg.hasImage),
    isChipIntent: Boolean(msg.isChipIntent),
    isSeedGreeting: Boolean(msg.isSeedGreeting),
  };
}

function sessionMetadata(session: Record<string, any>) {
  return {
    id: session.id, review_id: session.review_id || null, visitor_id: session.visitor_id || null,
    scope: session.scope, service_id: session.service_id || null,
    current_step: session.current_step || null, last_step_reached: session.last_step_reached || null,
    total_exchanges: session.total_exchanges || 0, created_at: session.created_at || null,
    updated_at: session.updated_at || null, last_session_update: session.updated_at || null,
    inquiry_status: session.inquiry_status || 'new', inquiry_owner: session.inquiry_owner || '', inquiry_notes: session.inquiry_notes || '',
    inquiry_next_followup_on: session.inquiry_next_followup_on || null, inquiry_revision: session.inquiry_revision || 0, inquiry_updated_at: session.inquiry_updated_at || null,
    message_count: Number.isFinite(Number(session.message_count)) ? Number(session.message_count) : null,
    messages_returned: 0, transcript_loaded: false,
  };
}

async function aiHealth() {
  const geminiKey = Deno.env.get('GEMINI_API_KEY')?.trim();
  const gemini = { configured: Boolean(geminiKey), enabled: Deno.env.get('GEMINI_ENABLED')?.trim().toLowerCase() !== 'false', model: '', status: 'unconfigured', code: '' };
  const groq = { configured: Boolean(Deno.env.get('GROQ_API_KEY')?.trim()), model: Deno.env.get('GROQ_MODEL')?.trim() || 'openai/gpt-oss-120b' };
  const note = 'This checks model metadata, not reply quality, generation quota or billing. A 503 is temporary provider unavailability and does not prove your token budget is exhausted.';
  try { gemini.model = geminiModel(); }
  catch { return { ok: true, gemini: { ...gemini, status: 'invalid configuration', code: 'gemini_model_invalid' }, groq, note }; }
  if (!gemini.configured || !gemini.enabled) {
    return { ok: true, gemini: { ...gemini, status: gemini.configured ? 'disabled' : 'key missing', code: gemini.configured ? 'gemini_disabled' : 'gemini_key_missing' }, groq, note };
  }
  try {
    // Model metadata only: never send a chat, an admin password or customer data.
    // Keep the key in an HTTP header rather than a URL that could enter logs.
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${gemini.model}`, {
      method: 'GET', headers: { 'x-goog-api-key': geminiKey! }, signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) return { ok: true, gemini: { ...gemini, status: 'unavailable', code: `gemini_http_${response.status}` }, groq, note };
    const metadata = await response.json().catch(() => null);
    const accessible = metadata?.name === `models/${gemini.model}` && Array.isArray(metadata?.supportedGenerationMethods) && metadata.supportedGenerationMethods.includes('generateContent');
    return { ok: true, gemini: { ...gemini, status: accessible ? 'model accessible' : 'metadata not confirmed', code: accessible ? '' : 'gemini_metadata_unconfirmed' }, groq, note };
  } catch {
    return { ok: true, gemini: { ...gemini, status: 'check unavailable', code: 'gemini_metadata_unreachable' }, groq, note };
  }
}

serve(async (req) => {
  const origin = req.headers.get('origin');

  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(origin) });
  if (req.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, origin, 405);

  try {
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      console.error('admin-fetch-leads: missing secrets');
      return json({ ok: false, error: 'Server misconfigured' }, origin, 500);
    }

    const body = await readAdminBody(req);

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    if (!await requireAdmin(supabase,req,SERVICE_ROLE_KEY)) {
      return json({ ok: false, error: 'Unauthorised' }, origin, 401);
    }

    if(body.action==='securityAttempts'){
      const {data,error}=await supabase.from('verification_attempts').select('visitor_id,attempts,locked_at,updated_at').not('visitor_id','is',null).not('locked_at','is',null).order('updated_at',{ascending:false}).limit(100);
      return json(error?{ok:false,error:'Verification attempts could not be loaded. Apply the security migration.'}:{ok:true,rows:data},origin,error?503:200);
    }
    if(body.action==='apiUsage'){
      const {data,error}=await supabase.rpc('ai_usage_summary');
      if(error)return json({ok:false,error:'Apply the API usage migration and refresh.'},origin,503);
      return json({ok:true,rows:data,threshold:Number(Deno.env.get('AI_DAILY_TOKEN_ALERT_THRESHOLD'))||800000},origin);
    }
    if (body.action === 'aiHealth') return json(await aiHealth(), origin);

    if (body.action === 'transcript') {
      const sessionId = typeof body.sessionId === 'string' ? body.sessionId.trim() : '';
      if (!sessionId || sessionId.length > 200) return json({ ok: false, error: 'Invalid session ID' }, origin, 400);
      const { data: session, error } = await supabase.from('haven_sessions')
        .select(`${SESSION_FIELDS},messages`).eq('id', sessionId).maybeSingle();
      if (error) return json({ ok: false, error: 'Could not load this transcript. Please retry.' }, origin, 500);
      if (!session) return json({ ok: false, error: 'This conversation is no longer available.' }, origin, 404);
      const raw = Array.isArray(session.messages) ? session.messages : [];
      const messages = raw.slice(-MAX_TRANSCRIPT_MESSAGES).map(sanitiseMessage).filter(Boolean);
      return json({ ok: true, session: {
        ...sessionMetadata(session), messages, message_count: raw.length,
        messages_returned: messages.length, transcript_loaded: true,
      }, transcript_limit: MAX_TRANSCRIPT_MESSAGES }, origin);
    }
    if (body.action !== undefined && body.action !== 'overview') return json({ ok: false, error: 'Invalid action' }, origin, 400);

    const { data: reviews, error: reviewsError } = await supabase
      .from('brand_reviews')
      .select(REVIEW_FIELDS.join(','))
      .order('created_at', { ascending: false })
      .limit(MAX_RECORDS);

    if (reviewsError) {
      console.error('admin-fetch-leads: reviews query failed', reviewsError);
      return json({ ok: false, error: reviewsError.message }, origin, 500);
    }

    // The SDK cannot infer a computed select string; the explicit field allowlist
    // above still controls the actual database projection.
    const rows = (reviews || []) as unknown as Array<Record<string, any> & { id: string; screenshot_url?: string }>;
    const reviewIds = rows.map((r) => r.id).filter(Boolean);

    const sessionsByReviewId: Record<string, any[]> = {};
    let linkedSessionsError: string | null = null;
    let linkedSessionsTruncated = false;
    if (reviewIds.length > 0) {
      for (let offset = 0; offset < MAX_LINKED_SESSIONS; offset += MAX_RECORDS) {
        const { data: sessions, error: sessionsError } = await supabase.from('haven_sessions')
          .select(SESSION_FIELDS).in('review_id', reviewIds).in('scope', ['audit', 'support', 'service'])
          .order('updated_at', { ascending: false }).order('id', { ascending: false })
          .range(offset, offset + MAX_RECORDS - 1);
        if (sessionsError) {
          console.warn('admin-fetch-leads: linked sessions query failed', sessionsError);
          linkedSessionsError = 'Could not load linked conversations. Refresh to retry.';
          break;
        }
        for (const session of sessions || []) {
          if (!session.review_id) continue;
          (sessionsByReviewId[session.review_id] ||= []).push(sessionMetadata(session));
        }
        if ((sessions || []).length < MAX_RECORDS) break;
        if (offset + MAX_RECORDS === MAX_LINKED_SESSIONS) linkedSessionsTruncated = true;
      }
    }

    const screenshotPaths = rows
      .map((r) => r.screenshot_url)
      .filter((p): p is string => typeof p === 'string' && p.length > 0);

    const signedByPath: Record<string, string> = {};
    if (screenshotPaths.length > 0) {
      const { data: signed, error: signedError } = await supabase
        .storage
        .from(SCREENSHOT_BUCKET)
        .createSignedUrls(screenshotPaths, SIGNED_URL_TTL);

      if (signedError) {
        console.warn('admin-fetch-leads: signing failed', signedError);
      } else {
        for (const item of signed || []) {
          if (item?.path && item?.signedUrl && !item.error) {
            signedByPath[item.path] = item.signedUrl;
          }
        }
      }
    }

    const leads = rows.map((r) => ({
      ...Object.fromEntries(REVIEW_FIELDS.filter((field) => field in r).map((field) => [field, r[field]])),
      screenshot_signed_url: r.screenshot_url ? signedByPath[r.screenshot_url] || null : null,
      sessions: sessionsByReviewId[r.id] || [],
      session: (sessionsByReviewId[r.id] || []).find((session) => session.scope === 'audit') || null,
      sessions_error: linkedSessionsError,
    }));

    const fetchStandalone = async (scope: string) => {
      let query=supabase.from('haven_sessions').select(SESSION_FIELDS).eq('scope',scope==='team'?'support':scope);
      if(scope==='team') query=query.eq('service_id','team-inquiry');
      else if(scope==='support') query=query.or('service_id.is.null,service_id.neq.team-inquiry');
      const {data,error}=await query.order('updated_at',{ascending:false}).limit(MAX_RECORDS);
      if(error) console.error('admin-fetch-leads: scoped sessions query failed',scope);
      return {sessions:(data||[]).map(sessionMetadata),error:error?`Could not load ${scope==='team'?'team inquiries':scope+' chats'}. Refresh to retry.`:null};
    };
    const [support,service,team]=await Promise.all([fetchStandalone('support'),fetchStandalone('service'),fetchStandalone('team')]);
    const standalone=[...support.sessions,...service.sessions,...team.sessions];
    const visitorIds = [...new Set(standalone.map((session) => session.visitor_id).filter(Boolean))];
    let visitorsError: string | null = null;
    if (visitorIds.length) {
      const { data: visitors, error } = await supabase.from('haven_chat_visitors')
        .select('id,flag_status,flag_reason,moderation_strikes').in('id', visitorIds);
      if (error) visitorsError = 'Guest flag status could not be loaded. Refresh before moderating these chats.';
      const byId = new Map((visitors || []).map((visitor: any) => [visitor.id, visitor]));
      for (const session of standalone) {
        const visitor: any = byId.get(session.visitor_id);
        const lead = rows.find(row => row.id === session.review_id);
        Object.assign(session, { linked_name: lead?.full_name || null, linked_brand: lead?.brand_name || null, moderation_strikes: visitor?.moderation_strikes || lead?.moderation_strikes || 0, flag_status: visitor?.flag_status || lead?.flag_status || 'white', flag_reason: visitor?.flag_reason || null, flag_error: error ? visitorsError : null });
      }
    }

    const { data: purchaseRows, error: purchaseError } = await supabase
      .from('playbook_purchases')
      .select('id,email,reference,amount,created_at,thankyou_sent,thankyou_sent_at,thankyou_attempted_at,thankyou_last_error,thankyou_email_id')
      .order('created_at', { ascending: false })
      .limit(MAX_RECORDS);

    if (purchaseError) console.error('admin-fetch-leads: purchases query failed', purchaseError);
    const { data: bookings, error: bookingsError } = await supabase.from('strategy_call_bookings')
      .select('id,email,full_name,event_name,start_time,end_time,timezone,status,source,review_id,service_id,confirmation_email_sent,provider_created_at,last_synced_at,created_at')
      .order('start_time', { ascending: false, nullsFirst: false }).limit(MAX_RECORDS);
    const purchases = (purchaseRows || []).map((purchase) => ({
      id: purchase.id, email: purchase.email, reference: purchase.reference,
      amount: purchase.amount, created_at: purchase.created_at, thankyou_sent: purchase.thankyou_sent,
      thankyou_sent_at: purchase.thankyou_sent_at, thankyou_attempted_at: purchase.thankyou_attempted_at,
      thankyou_last_error: purchase.thankyou_last_error, thankyou_email_id: purchase.thankyou_email_id,
    }));

    const [{data:operations,error:operationsError}, followup] = await Promise.all([
      supabase.rpc('haven_operational_stats'),
      // The aggregate is service-only and optional during a staged migration.
      Promise.resolve(supabase.rpc('playbook_followup_stats')).catch(() => ({ data: null, error: true })),
    ]);
    const followupKeys = ['queued', 'due', 'accepted', 'cancelled', 'needsReview'];
    const followupValid = !followup.error && followup.data && followupKeys.every(key => Number.isSafeInteger(followup.data[key]) && followup.data[key] >= 0);
    const followupStats = followupValid ? Object.fromEntries(followupKeys.map(key => [key, followup.data[key]])) : null;
    return json({
      ok: true, leads, count: leads.length, operations:operationsError?null:operations, operations_error:operationsError?'Operational counts are unavailable. Apply the reliability migration and refresh.':null, support_sessions: support.sessions, service_sessions: service.sessions, team_inquiries: team.sessions, team_inquiries_error: team.error,
      followupStats, followup_stats_error: followupStats ? null : 'Purchase follow-up counts are unavailable. Apply the follow-up migration and refresh.',
      purchases, playbook_purchases: purchases, records_limit: MAX_RECORDS, transcript_limit: MAX_TRANSCRIPT_MESSAGES,
      bookings: bookings || [], bookings_error: bookingsError ? 'Could not load bookings. Apply the strategy call bookings migration and refresh.' : null,
      support_sessions_error: support.error, service_sessions_error: service.error,
      linked_sessions_error: linkedSessionsError, linked_sessions_truncated: linkedSessionsTruncated,
      purchases_error: purchaseError ? 'Could not load purchases. Check the purchase migrations and server logs, then refresh.' : null,
    }, origin);
  } catch (err) {
    if(err instanceof AdminAuthError)return json({ok:false,error:err.message},origin,err.status);
    console.error('admin-fetch-leads error:', err);
    return json({ ok: false, error: String(err) }, origin, 500);
  }
});

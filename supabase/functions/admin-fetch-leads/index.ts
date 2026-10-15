// supabase/functions/admin-fetch-leads/index.ts
// Admin-only endpoint. Verifies the admin password against a
// Supabase secret, then reads brand_reviews + haven_sessions with
// the service_role key (bypasses RLS) and returns leads with
// 1-hour signed screenshot URLs. Sessions include the last 60
// messages with image fields stripped.

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const ADMIN_PASSWORD = Deno.env.get('ADMIN_PASSWORD');

const SCREENSHOT_BUCKET = 'tmh-screenshots';
const SIGNED_URL_TTL = 60 * 60; // 1 hour
const MAX_TRANSCRIPT_MESSAGES = 60;

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

// Strip base64 images and other heavyweight fields. Keep only what
// the transcript viewer needs.
function sanitiseMessage(m: unknown) {
  if (!m || typeof m !== 'object') return null;
  const msg = m as Record<string, unknown>;
  return {
    id: typeof msg.id === 'string' ? msg.id : null,
    role: typeof msg.role === 'string' ? msg.role : null,
    content: typeof msg.content === 'string' ? msg.content : '',
    timestamp: typeof msg.timestamp === 'number' ? msg.timestamp : null,
    hasImage: Boolean(msg.hasImage),
    isChipIntent: Boolean(msg.isChipIntent),
    isSeedGreeting: Boolean(msg.isSeedGreeting),
  };
}

serve(async (req) => {
  const origin = req.headers.get('origin');

  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(origin) });
  if (req.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, origin, 405);

  try {
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !ADMIN_PASSWORD) {
      console.error('admin-fetch-leads: missing secrets');
      return json({ ok: false, error: 'Server misconfigured' }, origin, 500);
    }

    const body = await req.json().catch(() => ({}));
    const password = typeof body?.password === 'string' ? body.password : '';

    if (password !== ADMIN_PASSWORD) {
      return json({ ok: false, error: 'Unauthorised' }, origin, 401);
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    const { data: reviews, error: reviewsError } = await supabase
      .from('brand_reviews')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500);

    if (reviewsError) {
      console.error('admin-fetch-leads: reviews query failed', reviewsError);
      return json({ ok: false, error: reviewsError.message }, origin, 500);
    }

    const rows = reviews || [];
    const reviewIds = rows.map((r) => r.id).filter(Boolean);

    let sessionByReviewId: Record<string, unknown> = {};
    if (reviewIds.length > 0) {
      const { data: sessions, error: sessionsError } = await supabase
        .from('haven_sessions')
        .select('review_id, current_step, last_step_reached, total_exchanges, messages, updated_at')
        .in('review_id', reviewIds);

      if (sessionsError) {
        console.warn('admin-fetch-leads: sessions query failed', sessionsError);
      } else {
        for (const s of sessions || []) {
          if (!s.review_id) continue;
          const raw = Array.isArray(s.messages) ? s.messages : [];
          const capped = raw.length > MAX_TRANSCRIPT_MESSAGES
            ? raw.slice(-MAX_TRANSCRIPT_MESSAGES)
            : raw;
          const messages = capped.map(sanitiseMessage).filter(Boolean);

          sessionByReviewId[s.review_id] = {
            current_step: s.current_step || null,
            last_step_reached: s.last_step_reached || null,
            total_exchanges: s.total_exchanges || 0,
            message_count: raw.length,
            messages_returned: messages.length,
            last_session_update: s.updated_at || null,
            messages,
          };
        }
      }
    }

    const screenshotPaths = rows
      .map((r) => r.screenshot_url)
      .filter((p) => typeof p === 'string' && p.length > 0);

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
      ...r,
      screenshot_signed_url: r.screenshot_url ? signedByPath[r.screenshot_url] || null : null,
      session: sessionByReviewId[r.id] || null,
    }));

    const { data: supportSessions, error: supportError } = await supabase
      .from('haven_sessions')
      .select('id, current_step, last_step_reached, total_exchanges, updated_at, messages')
      .eq('scope', 'support')
      .order('updated_at', { ascending: false });

    if (supportError) {
      console.error('admin-fetch-leads: support sessions query failed', supportError);
      return json({ ok: false, error: supportError.message }, origin, 500);
    }

    const support_sessions = (supportSessions || []).map((s) => ({
      id: s.id,
      current_step: s.current_step || null,
      last_step_reached: s.last_step_reached || null,
      total_exchanges: s.total_exchanges || 0,
      last_session_update: s.updated_at || null,
      messages: (Array.isArray(s.messages) ? s.messages : [])
        .slice(-MAX_TRANSCRIPT_MESSAGES).map(sanitiseMessage).filter(Boolean),
    }));

    return json({ ok: true, leads, count: leads.length, support_sessions }, origin);
  } catch (err) {
    console.error('admin-fetch-leads error:', err);
    return json({ ok: false, error: String(err) }, origin, 500);
  }
});
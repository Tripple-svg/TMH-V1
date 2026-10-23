import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { verifyReviewAccess, ReviewAccessError } from '../_shared/review-access.ts';
import { readBoundedJson, HavenRequestError } from '../_shared/haven-request.ts';

const ORIGINS = ['https://themarketinghaven.xyz', 'https://www.themarketinghaven.xyz'];
serve(async (req) => {
  const origin = req.headers.get('origin');
  const allowed = origin && (ORIGINS.includes(origin) || /^http:\/\/localhost:\d+$/.test(origin));
  const headers = { 'Access-Control-Allow-Origin': allowed ? origin! : ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Vary': 'Origin', 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
  if (req.method === 'OPTIONS') return new Response('ok', { headers });
  if (req.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405);
  if (origin && !allowed) return json({ ok: false, error: 'Origin not allowed' }, 403);
  try {
    const url = Deno.env.get('SUPABASE_URL');
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !key) return json({ ok: false, error: 'Server misconfigured' }, 500);
    const body = await readBoundedJson(req, 300000);
    if (!Array.isArray(body.messages)) return json({ ok: false, error: 'Invalid session payload' }, 400);
    const snapshotAt = Date.parse(body.snapshotAt);
    if (!Number.isFinite(snapshotAt) || snapshotAt > Date.now() + 60000) return json({ ok: false, error: 'Invalid snapshot time. Check your device clock.' }, 400);
    const supabase = createClient(url, key, { auth: { persistSession: false } });
    await verifyReviewAccess(supabase, body.sessionId, body.reviewId, body.accessToken);
    const messages = body.messages.slice(-200).filter((m: any) => m && ['user', 'agent', 'assistant'].includes(m.role) && typeof m.content === 'string').map((m: any) => ({
      id: typeof m.id === 'string' ? m.id.slice(0, 100) : null,
      role: m.role === 'assistant' ? 'agent' : m.role, content: m.content.slice(0, 8000),
      timestamp: Number.isFinite(Number(m.timestamp)) ? Number(m.timestamp) : Date.now(),
      hasImage: Boolean(m.hasImage), isChipIntent: Boolean(m.isChipIntent), isSeedGreeting: Boolean(m.isSeedGreeting),
    }));
    // Steps, lead temperature and scoring are written by trusted chat/scoring handlers only.
    const { error } = await supabase.rpc('sync_haven_review', {
      p_session_id: body.sessionId, p_review_id: body.reviewId, p_messages: body.metadataOnly === true ? null : messages, p_snapshot_at: new Date(snapshotAt).toISOString(),
      p_clicked_booking: body.clickedBookingLink === true, p_clicked_playbook: body.clickedPlaybookLink === true,
    });
    if (error) return json({ ok: false, error: 'Unable to save your session. Please retry.' }, 500);
    return json({ ok: true });
  } catch (error) {
    if (error instanceof ReviewAccessError || error instanceof HavenRequestError) return json({ ok: false, error: error.message }, error.status);
    console.error('sync-haven-session failed');
    return json({ ok: false, error: 'Unable to save your session. Please retry.' }, 500);
  }
});

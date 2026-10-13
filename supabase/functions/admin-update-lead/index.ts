// supabase/functions/admin-update-lead/index.ts
// Admin-only endpoint for follow-up edits.
// Whitelists the columns that can be updated.

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const ADMIN_PASSWORD = Deno.env.get('ADMIN_PASSWORD');

const ALLOWED_FOLLOWUP_STATUS = ['pending', 'contacted', 'booked', 'closed', 'lost'];

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

serve(async (req) => {
  const origin = req.headers.get('origin');

  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(origin) });
  if (req.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, origin, 405);

  try {
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !ADMIN_PASSWORD) {
      return json({ ok: false, error: 'Server misconfigured' }, origin, 500);
    }

    const body = await req.json().catch(() => ({}));
    const password = typeof body?.password === 'string' ? body.password : '';
    const reviewId = typeof body?.reviewId === 'string' ? body.reviewId : '';

    if (password !== ADMIN_PASSWORD) {
      return json({ ok: false, error: 'Unauthorised' }, origin, 401);
    }
    if (!reviewId) {
      return json({ ok: false, error: 'Missing reviewId' }, origin, 400);
    }

    // Whitelist-safe update object.
    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (typeof body.followupStatus === 'string') {
      if (!ALLOWED_FOLLOWUP_STATUS.includes(body.followupStatus)) {
        return json({ ok: false, error: 'Invalid followupStatus' }, origin, 400);
      }
      update.followup_status = body.followupStatus;
    }
    if (typeof body.followupNotes === 'string') {
      update.followup_notes = body.followupNotes.slice(0, 4000);
    }
    if (typeof body.convertedToCall === 'boolean') {
      update.converted_to_call = body.convertedToCall;
    }
    if (typeof body.convertedToPurchase === 'boolean') {
      update.converted_to_purchase = body.convertedToPurchase;
    }
    if (body.dealValue === null || typeof body.dealValue === 'number') {
      update.deal_value = body.dealValue;
    }
    if (typeof body.callBookedAt === 'string') {
      update.call_booked_at = body.callBookedAt;
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    const { data, error } = await supabase
      .from('brand_reviews')
      .update(update)
      .eq('id', reviewId)
      .select('id, followup_status, followup_notes, updated_at')
      .maybeSingle();

    if (error) {
      console.error('admin-update-lead failed:', error);
      return json({ ok: false, error: error.message }, origin, 500);
    }
    if (!data) {
      return json({ ok: false, error: 'Review not found' }, origin, 404);
    }

    return json({ ok: true, review: data }, origin);
  } catch (err) {
    console.error('admin-update-lead error:', err);
    return json({ ok: false, error: String(err) }, origin, 500);
  }
});
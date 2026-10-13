import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');

const ALLOWED_ORIGINS = [
  'https://themarketinghaven.xyz',
  'https://www.themarketinghaven.xyz',
  'http://localhost:5173',
];
const FROM_ADDRESS = 'info@themarketinghaven.xyz';

function corsHeaders(origin: string | null) {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };

  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
  }

  return headers;
}

function json(body: unknown, origin: string | null, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
  });
}

async function sendDeletionConfirmation(email: string) {
  try {
    if (!RESEND_API_KEY) {
      console.error('RESEND_API_KEY is missing; deletion confirmation email was not sent');
      return;
    }

    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to: [email],
        subject: 'Your data has been deleted',
        text: 'Your data deletion request has been completed. All records, chat transcripts, screenshots, and personal information associated with your email have been permanently removed.\n\nThe Marketing Haven',
      }),
    });

    if (!resendResponse.ok) {
      const detail = await resendResponse.text().catch(() => '');
      console.error('Resend rejected data deletion confirmation:', resendResponse.status, detail);
    }
  } catch (error) {
    console.error('Could not send data deletion confirmation:', error);
  }
}

serve(async (req) => {
  const origin = req.headers.get('origin');

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }

  if (req.method !== 'POST') {
    return json({ ok: false, error: 'Method not allowed' }, origin, 405);
  }

  try {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      console.error('confirm-data-deletion is missing required Supabase secrets');
      return json({ ok: false, error: 'Unable to complete deletion' }, origin, 500);
    }

    const payload = await req.json().catch(() => null);
    const keys = payload && typeof payload === 'object' && !Array.isArray(payload)
      ? Object.keys(payload)
      : [];
    const token = keys.length === 1 && keys[0] === 'token' && typeof payload.token === 'string'
      ? payload.token.trim()
      : '';

    if (!token) {
      return json({ ok: false, error: 'Invalid token' }, origin);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });
    const { data: request, error: requestError } = await supabase
      .from('data_deletion_requests')
      .select('id, email, expires_at, status')
      .eq('token', token)
      .maybeSingle();

    if (requestError) {
      console.error('Data deletion token lookup failed:', requestError);
      return json({ ok: false, error: 'Unable to complete deletion' }, origin, 500);
    }

    if (!request) {
      return json({ ok: false, error: 'Invalid token' }, origin);
    }

    if (request.status === 'confirmed') {
      return json({ ok: false, error: 'Already used' }, origin);
    }

    if (new Date(request.expires_at).getTime() < Date.now()) {
      const { error: expireError } = await supabase
        .from('data_deletion_requests')
        .update({ status: 'expired' })
        .eq('id', request.id);

      if (expireError) console.error('Could not mark data deletion request expired:', expireError);
      return json({ ok: false, error: 'Link expired' }, origin);
    }

    const { data: reviews, error: reviewsError } = await supabase
      .from('brand_reviews')
      .select('id, screenshot_url')
      .eq('email', request.email);

    if (reviewsError) {
      console.error('Could not load reviews for data deletion:', reviewsError);
      return json({ ok: false, error: 'Unable to complete deletion' }, origin, 500);
    }

    const reviewIds = (reviews || [])
      .map((review) => review.id)
      .filter((id): id is string => typeof id === 'string');
    const screenshotPaths = (reviews || [])
      .map((review) => review.screenshot_url)
      .filter((path): path is string => typeof path === 'string' && path.length > 0);

    for (const reviewId of reviewIds) {
      const { error: sessionError } = await supabase
        .from('haven_sessions')
        .delete()
        .eq('review_id', reviewId);

      if (sessionError) {
        console.error('Could not delete Haven session:', sessionError);
        return json({ ok: false, error: 'Unable to complete deletion' }, origin, 500);
      }
    }

    if (reviewIds.length > 0) {
      const { error: reviewDeleteError } = await supabase
        .from('brand_reviews')
        .delete()
        .eq('email', request.email);

      if (reviewDeleteError) {
        console.error('Could not delete brand reviews:', reviewDeleteError);
        return json({ ok: false, error: 'Unable to complete deletion' }, origin, 500);
      }
    }

    if (screenshotPaths.length > 0) {
      const { error: storageError } = await supabase
        .storage
        .from('tmh-screenshots')
        .remove(screenshotPaths);

      if (storageError) {
        console.error('Could not delete screenshots:', storageError);
        return json({ ok: false, error: 'Unable to complete deletion' }, origin, 500);
      }
    }

    const { error: confirmationError } = await supabase
      .from('data_deletion_requests')
      .update({ status: 'confirmed', confirmed_at: new Date().toISOString() })
      .eq('id', request.id);

    if (confirmationError) {
      console.error('Could not confirm data deletion request:', confirmationError);
      return json({ ok: false, error: 'Unable to complete deletion' }, origin, 500);
    }

    await sendDeletionConfirmation(request.email);
    return json({ ok: true, deleted: reviewIds.length }, origin);
  } catch (error) {
    console.error('confirm-data-deletion failed:', error);
    return json({ ok: false, error: 'Unable to complete deletion' }, origin, 500);
  }
});

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
const SITE_URL = 'https://themarketinghaven.xyz';
const FROM_ADDRESS = 'info@themarketinghaven.xyz';
const EMAIL_PATTERN = /^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?)+$/i;

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

function success(origin: string | null) {
  return json({ ok: true }, origin);
}

function createToken() {
  const suffix = Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');

  return `${crypto.randomUUID()}${suffix}`;
}

function clientIp(req: Request) {
  return req.headers.get('cf-connecting-ip')
    || req.headers.get('x-real-ip')
    || req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || null;
}

serve(async (req) => {
  const origin = req.headers.get('origin');

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }

  if (req.method !== 'POST') {
    return success(origin);
  }

  try {
    const payload = await req.json().catch(() => null);
    const email = typeof payload?.email === 'string' ? payload.email.trim() : '';

    // Invalid requests deliberately receive the same response as valid ones.
    if (!EMAIL_PATTERN.test(email)) {
      return success(origin);
    }

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !RESEND_API_KEY) {
      console.error('request-data-deletion is missing required secrets');
      return success(origin);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });
    const { data: reviews, error: reviewError } = await supabase
      .from('brand_reviews')
      .select('id, email')
      .ilike('email', email)
      .limit(1);

    if (reviewError) {
      console.error('Data deletion email lookup failed:', reviewError);
      return success(origin);
    }

    if (!reviews?.length) {
      return success(origin);
    }

    const storedEmail = typeof reviews[0].email === 'string' ? reviews[0].email : '';
    if (!storedEmail) {
      console.error('Matching brand review has no usable email');
      return success(origin);
    }

    const token = createToken();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const { error: requestError } = await supabase
      .from('data_deletion_requests')
      .insert({
        email: storedEmail,
        token,
        expires_at: expiresAt,
        status: 'pending',
        ip_address: clientIp(req),
      });

    if (requestError) {
      console.error('Could not create data deletion request:', requestError);
      return success(origin);
    }

    const confirmationUrl = `${SITE_URL}/data-deletion/confirm?token=${encodeURIComponent(token)}`;
    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to: [storedEmail],
        subject: 'Confirm your data deletion request',
        text: `We received a request to delete your data from The Marketing Haven. To confirm the request, open this link within 24 hours:\n\n${confirmationUrl}\n\nIf you did not make this request, you can ignore this email.`,
        html: `<p>We received a request to delete your data from The Marketing Haven.</p><p><a href="${confirmationUrl}">Confirm your data deletion request</a></p><p>This link expires in 24 hours. If you did not make this request, you can ignore this email.</p>`,
      }),
    });

    if (!resendResponse.ok) {
      const detail = await resendResponse.text().catch(() => '');
      console.error('Resend rejected data deletion request:', resendResponse.status, detail);
    }
  } catch (error) {
    console.error('request-data-deletion failed:', error);
  }

  return success(origin);
});

import {logEvent} from '../_shared/logger.ts';
import {observe} from '../_shared/observability.ts';
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.118.0';
import { publicRequestLimit } from '../_shared/abuse-limits.ts';
import { HavenRequestError,readBoundedJson } from '../_shared/haven-request.ts';
import {verifyOrigin} from '../_shared/haven-request.ts';
import {privacyEmail} from '../_shared/email-template.js';

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
    headers: { ...corsHeaders(origin), 'Content-Type': 'application/json', 'Cache-Control':'no-store', ...(status===429?{'Retry-After':'600'}:{}) },
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

serve(observe('request-data-deletion',async (req) => {
  const origin = req.headers.get('origin');

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }

  if (req.method !== 'POST') {
    return success(origin);
  }

  try {
    verifyOrigin(req);
    const payload = await readBoundedJson(req,4096);
    const email = typeof payload?.email === 'string' ? payload.email.trim() : '';

    // Invalid requests deliberately receive the same response as valid ones.
    if (!EMAIL_PATTERN.test(email)) {
      return success(origin);
    }

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !RESEND_API_KEY) {
      logEvent('error','request-data-deletion.diagnostic_1');
      return success(origin);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });
    await publicRequestLimit(supabase,req,SUPABASE_SERVICE_ROLE_KEY,'deletion-email');
    const { data: reviews, error: reviewError } = await supabase
      .from('brand_reviews')
      .select('id, email')
      .ilike('email', email.replace(/[\\%_]/g,'\\$&'))
      .limit(1);

    if (reviewError) {
      logEvent('error','request-data-deletion.diagnostic_2');
      return success(origin);
    }

    if (!reviews?.length) {
      return success(origin);
    }

    const storedEmail = typeof reviews[0].email === 'string' ? reviews[0].email : '';
    if (!storedEmail) {
      logEvent('error','request-data-deletion.diagnostic_3');
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
      logEvent('error','request-data-deletion.diagnostic_4');
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
        subject: 'Confirm your saved review deletion request',
        text: `We received a request to remove your matching saved brand review, its linked chat sessions and stored screenshots. Purchase, booking, security and delivery records, and unlinked guest chats, are outside this automated flow. Contact info@themarketinghaven.xyz about other records.\n\nTo confirm the request, open this link within 24 hours:\n\n${confirmationUrl}\n\nIf you did not make this request, ignore this email.`,
        html: privacyEmail({title:'Your review. Your choice.',paragraphs:['We received a request to remove your matching saved brand review, its linked chat sessions and stored screenshots.','Purchase, booking, security and delivery records, and unlinked guest chats, are outside this automated flow. Contact info@themarketinghaven.xyz about other records.','Open the secure page and confirm only if you requested deletion. This link expires in 24 hours. If you did not request this, ignore this email.'],button:{label:'Review deletion request',href:confirmationUrl}}),
      }),
    });

    if (!resendResponse.ok) {
      logEvent('error','request-data-deletion.diagnostic_5');
    }
  } catch (error) {
    if(error instanceof HavenRequestError)return json({ok:false,error:error.message},origin,error.status);
    logEvent('error','request-data-deletion.diagnostic_6');
  }

  return success(origin);
}));

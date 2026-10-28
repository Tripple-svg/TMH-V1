// supabase/functions/send-welcome-email/index.ts
// Triggered by a Supabase Database Webhook on INSERT into brand_reviews.
// Sends one welcome email via Resend. Idempotent.

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.118.0';
import { isInternalRequest } from '../_shared/internal-auth.js';
import { editorialEmail } from '../_shared/email-template.js';
import { deliverEmail, mailConfiguration, MailDeliveryError } from '../_shared/resend-delivery.js';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

const REPLY_TO_ADDRESS = 'info@themarketinghaven.xyz';
const SITE_URL         = 'https://themarketinghaven.xyz';

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

function firstNameOf(fullName: string | null | undefined): string {
  if (!fullName || typeof fullName !== 'string') return 'there';
  const trimmed = fullName.trim();
  if (!trimmed) return 'there';
  return trimmed.split(/\s+/)[0];
}

// Names are escaped by the shared template, never interpolated as HTML.
function buildBodiesV1(firstName: string, brandName: string, platformType: string | null | undefined) {
  const reading = platformType === 'website'
    ? 'Open Haven to see whether your website could be read and scored, then continue the conversation about your brand.'
    : platformType === 'social'
      ? 'Open Haven to see whether the profile screenshot could be read and scored, then continue the conversation about your brand.'
      : 'Haven will ask a few questions about what you are building and help you find a useful first step. You do not need a website to begin.';
  const paragraphs = [`Hi ${firstName},`, `We have received the brand review for ${brandName || 'your brand'}.`, reading,
    'Return on the same browser and device to continue your saved review. If the secure access key is missing, contact info@themarketinghaven.xyz so we can help verify ownership.'];
  return { text: `${paragraphs.join('\n\n')}\n\nContinue the review: ${SITE_URL}/?review=continue\n\nTeam Haven`,
    html: editorialEmail({ version: 'editorial-v1', label: 'YOUR BRAND REVIEW', title: 'Your next step starts here.', paragraphs,
      button: { label: 'Continue the review', href: `${SITE_URL}/?review=continue` } }) };
}

function buildBodies(firstName: string, brandName: string, platformType: string, version: string) {
  if (!['editorial-v2', 'editorial-v3'].includes(version)) return buildBodiesV1(firstName, brandName, platformType);
  const subject = brandName || 'your brand';
  const focus = platformType === 'website'
    ? version === 'editorial-v3'
      ? 'Haven reviews the website text it can read: how clearly the offer is explained, which trust signals are present, the reason to choose your business, and the next step. If there is not enough readable evidence, Haven will explain the limit and help you continue in chat.'
      : 'Your website review starts with three questions: is the offer clear, is there a reason to trust it, and is the next step easy to find? If the reader cannot access enough of the page, Haven will explain the limit and continue from what you share in chat.'
    : platformType === 'social'
      ? 'Your profile screenshot gives Haven a starting point: what people understand from your bio, what your content communicates, and how they can take the next step. The conversation helps put those observations in the context of your business.'
      : 'You do not need a website or social profile to begin. Haven will help you work through what you offer, who it is for, and the first practical step toward reaching them.';
  const paragraphs = ['Hi ' + firstName + ',', 'Your brand review for ' + subject + ' is saved.', focus,
    'If you are already chatting with Haven, keep going there. You do not need to start again from this email.',
    'When you return, bring one question you want to resolve. The useful outcome is a clearer next move for your brand.',
    'The button reopens the review on the browser you used to submit it. Need help on another device? Reply to this email and we will help verify ownership.'];
  return { text: paragraphs.join('\n\n') + '\n\nContinue your review: ' + SITE_URL + '/?review=continue\n\n' + (version === 'editorial-v3' ? 'Your friends over at Team Haven\nBuilding with intention.' : 'Team Haven'),
    html: editorialEmail({ version, label: 'YOUR BRAND REVIEW', title: 'Make the next move clearer.', paragraphs,
      button: { label: 'Continue your review', href: SITE_URL + '/?review=continue' } }) };
}

serve(async (req) => {
  const origin = req.headers.get('origin');

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders(origin) });
  }
  if (req.method !== 'POST') {
    return json({ ok: false, error: 'Method not allowed' }, origin, 405);
  }

  try {
    if (!RESEND_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      console.error('Missing required secrets');
      return json({ ok: false, error: 'Server misconfigured' }, origin, 500);
    }

    if (!isInternalRequest(req, SUPABASE_SERVICE_ROLE_KEY)) return json({ ok: false, error: 'Unauthorised' }, origin, 401);
    const payload = await req.json().catch(() => null);
    const record = payload?.record;

    if (!record || typeof record !== 'object' || !record.id) {
      return json({ ok: false, error: 'No record in payload' }, origin, 400);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });
    const { data: existing, error: lookupError } = await supabase
      .from('brand_reviews')
      .select('id, email, full_name, brand_name, platform_type, welcome_email_sent, welcome_email_id, welcome_template_version')
      .eq('id', record.id)
      .maybeSingle();

    if (lookupError) {
      console.error('Lookup failed:', lookupError);
      return json({ ok: false, error: 'Lookup failed' }, origin, 500);
    }
    if (!existing) {
      return json({ ok: false, error: 'Unknown record' }, origin, 404);
    }
    if (existing.welcome_email_sent === true) {
      return json({ ok: true, skipped: 'already sent' }, origin);
    }

    const firstName = firstNameOf(existing.full_name);
    const brandName = typeof existing.brand_name === 'string' ? existing.brand_name : '';
    const subject   = `Your brand review is underway, ${firstName}`;
    const { text, html } = buildBodies(firstName, brandName, existing.platform_type, existing.welcome_template_version);

    const { data: attempt, error: attemptError } = await supabase.from('brand_reviews')
      .update({ welcome_email_attempted_at: new Date().toISOString(), welcome_email_last_error: null }).eq('id', existing.id).select('id').maybeSingle();
    if (attemptError || !attempt) return json({ ok: false, error: 'Welcome email tracking is unavailable. Apply the email migration.' }, origin, 503);
    let acceptedId = existing.welcome_email_id;
    try {
      if (!acceptedId) acceptedId = await deliverEmail(mailConfiguration(Deno.env), {
        to: [existing.email], reply_to: REPLY_TO_ADDRESS, subject, text, html,
      }, `review-welcome/${existing.id}`);
      const { data: saved, error } = await supabase.from('brand_reviews')
        .update({ welcome_email_sent: true, welcome_email_id: acceptedId, welcome_email_last_error: null }).eq('id', existing.id).select('id').maybeSingle();
      if (error || !saved) throw new MailDeliveryError('welcome_delivery_marker_failed', 'Email was accepted but its saved status needs repair. Retry safely.', 500);
    } catch (error) {
      const code = error instanceof MailDeliveryError ? error.code : 'welcome_delivery_failed';
      await supabase.from('brand_reviews').update({ welcome_email_last_error: code, ...(acceptedId ? { welcome_email_id: acceptedId } : {}) }).eq('id', existing.id).eq('welcome_email_sent', false);
      return json({ ok: false, code, error: 'Welcome email is pending. Review its saved delivery code before retrying.' }, origin, 502);
    }

    return json({ ok: true }, origin);
  } catch {
    console.error('send-welcome-email: request failed');
    return json({ ok: false, error: 'Unable to send the welcome email.' }, origin, 500);
  }
});

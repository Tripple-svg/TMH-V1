// supabase/functions/send-welcome-email/index.ts
// Triggered by a Supabase Database Webhook on INSERT into brand_reviews.
// Sends one welcome email via Resend. Idempotent.

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

const FROM_ADDRESS     = 'The Marketing Haven <info@themarketinghaven.xyz>';
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

// Returns the body copy for each path. Nothing is shared across the three.
function buildBodies(firstName: string, brandName: string, platformType: string | null | undefined) {
  const brand = brandName || 'your brand';

  if (platformType === 'website') {
    const text = `Hi ${firstName},

Thanks for submitting ${brand} — we've got it.

Haven is going through your website right now. Your score and the first read will show up in the drawer on the site.

If you closed the tab, you can pick up right where you left off:

  → Continue the review: ${SITE_URL}

Team Haven`;

    const html = `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#0a0a0a;">
  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#e5e5e5;max-width:560px;margin:0 auto;padding:32px 24px;line-height:1.6;font-size:15px;">
    <p>Hi ${firstName},</p>
    <p>Thanks for submitting <strong>${brand}</strong> — we've got it.</p>
    <p>Haven is going through your <strong>website</strong> right now. Your score and the first read will show up in the drawer on the site.</p>
    <p>If you closed the tab, you can pick up right where you left off:</p>
    <p style="margin:24px 0;">
      <a href="${SITE_URL}" style="color:#60a5fa;text-decoration:none;">→ Continue the review</a>
    </p>
    <p style="color:#a3a3a3;margin-top:32px;">Team Haven</p>
  </div>
</body></html>`;

    return { text, html };
  }

  if (platformType === 'social') {
    const text = `Hi ${firstName},

Thanks for submitting ${brand} — we've got it.

Haven is reading the profile screenshot you shared. Your profile score and the first read will show up in the drawer on the site.

If you closed the tab, you can pick up right where you left off:

  → Continue the review: ${SITE_URL}

Team Haven`;

    const html = `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#0a0a0a;">
  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#e5e5e5;max-width:560px;margin:0 auto;padding:32px 24px;line-height:1.6;font-size:15px;">
    <p>Hi ${firstName},</p>
    <p>Thanks for submitting <strong>${brand}</strong> — we've got it.</p>
    <p>Haven is reading the <strong>profile screenshot</strong> you shared. Your profile score and the first read will show up in the drawer on the site.</p>
    <p>If you closed the tab, you can pick up right where you left off:</p>
    <p style="margin:24px 0;">
      <a href="${SITE_URL}" style="color:#60a5fa;text-decoration:none;">→ Continue the review</a>
    </p>
    <p style="color:#a3a3a3;margin-top:32px;">Team Haven</p>
  </div>
</body></html>`;

    return { text, html };
  }

  // platformType === 'none' (or unknown) — no score path.
  const text = `Hi ${firstName},

Thanks for submitting ${brand} — we've got it.

You told us there's no site or social yet. That's fine — that's what Haven is for. Haven will ask you a few questions to understand what you're building and point you at the right first step.

If you closed the tab:

  → Pick up here: ${SITE_URL}

Team Haven`;

  const html = `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#0a0a0a;">
  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#e5e5e5;max-width:560px;margin:0 auto;padding:32px 24px;line-height:1.6;font-size:15px;">
    <p>Hi ${firstName},</p>
    <p>Thanks for submitting <strong>${brand}</strong> — we've got it.</p>
    <p>You told us there's no site or social yet. That's fine — that's what Haven is for. Haven will ask you a few questions to understand what you're building and point you at the right first step.</p>
    <p>If you closed the tab:</p>
    <p style="margin:24px 0;">
      <a href="${SITE_URL}" style="color:#60a5fa;text-decoration:none;">→ Pick up here</a>
    </p>
    <p style="color:#a3a3a3;margin-top:32px;">Team Haven</p>
  </div>
</body></html>`;

  return { text, html };
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

    const payload = await req.json().catch(() => null);
    const record = payload?.record;

    if (!record || typeof record !== 'object' || !record.id) {
      return json({ ok: false, error: 'No record in payload' }, origin, 400);
    }

    if (record.welcome_email_sent === true) {
      return json({ ok: true, skipped: 'already sent' }, origin);
    }

    const to = typeof record.email === 'string' ? record.email.trim() : '';
    if (!to) {
      return json({ ok: false, error: 'No email on record' }, origin, 400);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });
    const { data: existing, error: lookupError } = await supabase
      .from('brand_reviews')
      .select('id, welcome_email_sent')
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

    const firstName = firstNameOf(record.full_name);
    const brandName = typeof record.brand_name === 'string' ? record.brand_name : '';
    const subject   = `Your brand review is underway, ${firstName}`;
    const { text, html } = buildBodies(firstName, brandName, record.platform_type);

    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to: [to],
        reply_to: REPLY_TO_ADDRESS,
        subject,
        text,
        html,
      }),
    });

    if (!resendRes.ok) {
      const detail = await resendRes.text().catch(() => '');
      console.error('Resend rejected:', resendRes.status, detail);
      return json({ ok: false, error: 'Resend rejected', status: resendRes.status, detail }, origin, 502);
    }

    const { error: updateError } = await supabase
      .from('brand_reviews')
      .update({ welcome_email_sent: true })
      .eq('id', record.id);

    if (updateError) {
      console.error('Flag update failed (email still sent):', updateError);
    }

    return json({ ok: true, sentTo: to }, origin);
  } catch (err) {
    console.error('send-welcome-email error:', err);
    return json({ ok: false, error: String(err) }, origin, 500);
  }
});
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const TEAM_RECIPIENTS = ['francis.teamhaven@gmail.com', 'paschal.tmh@gmail.com'];
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

serve(async (req) => {
  const headers = {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (req.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405);

  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceKey) return json({ ok: false, error: 'Server misconfigured' }, 500);
  // Internal-only sender: admin passwords and public/client tokens cannot send mail.
  if (req.headers.get('authorization') !== `Bearer ${serviceKey}`) {
    return json({ ok: false, error: 'Unauthorised' }, 401);
  }

  try {
    const body = await req.json().catch(() => null);
    if (typeof body?.notificationId !== 'string' || !UUID_PATTERN.test(body.notificationId)) {
      return json({ ok: false, error: 'Invalid notificationId' }, 400);
    }

    const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });
    // Email content comes only from the database snapshot created by the flag trigger.
    const { data: notification, error } = await supabase.from('flag_alert_notifications')
      .select('id, email, status, reason, sent_at').eq('id', body.notificationId).maybeSingle();
    if (error) {
      console.error('send-flag-alert: notification lookup failed');
      return json({ ok: false, error: 'Unable to load flag notification' }, 500);
    }
    if (!notification) return json({ ok: false, error: 'Flag notification not found' }, 404);
    if (notification.sent_at) return json({ ok: true, skipped: 'already sent' });

    const resendKey = Deno.env.get('RESEND_API_KEY');
    if (!resendKey) return json({ ok: false, error: 'Email service is not configured' }, 500);
    try {
      const sent = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendKey}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': `flag-alert/${notification.id}`,
        },
        body: JSON.stringify({
          from: 'The Marketing Haven <info@themarketinghaven.xyz>',
          to: TEAM_RECIPIENTS,
          reply_to: 'info@themarketinghaven.xyz',
          subject: `URGENT: User Flagged - ${notification.status}`,
          text: `User ${notification.email} has been flagged as ${notification.status}. Reason Haven flagged them: ${notification.reason || 'Not provided'}. Please review in the Admin Dashboard.`,
        }),
        signal: AbortSignal.timeout(15000),
      });
      if (!sent.ok) return json({ ok: false, error: 'Flag alert delivery failed. Please retry.' }, 502);
    } catch {
      return json({ ok: false, error: 'Flag alert delivery failed. Please retry.' }, 502);
    }

    const { error: updateError } = await supabase.from('flag_alert_notifications')
      .update({ sent_at: new Date().toISOString() }).eq('id', notification.id).is('sent_at', null);
    if (updateError) {
      console.error('send-flag-alert: delivery marker update failed');
      return json({ ok: false, error: 'Flag alert sent, but delivery could not be recorded. Please retry.' }, 500);
    }
    return json({ ok: true });
  } catch {
    console.error('send-flag-alert: request failed');
    return json({ ok: false, error: 'Unable to send flag alert' }, 500);
  }
});

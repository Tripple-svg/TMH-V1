import { isInternalRequest } from '../_shared/internal-auth.js';
import { editorialEmail } from '../_shared/email-template.js';
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.118.0';
import { drainModerationNotifications } from '../_shared/haven-moderation.ts';

import { deliverFlagNotification, MailDeliveryError } from '../_shared/resend-delivery.js';

const TEAM_RECIPIENTS = ['francis.teamhaven@gmail.com', 'paschal.tmh@gmail.com'];
const SOURCE_LABELS: Record<string, string> = { lead: 'Lead / Brand review', support: 'Support', service: 'Services', admin: 'Admin action', unknown: 'Admin action / legacy record' };
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
  if (!isInternalRequest(req, serviceKey)) {
    return json({ ok: false, error: 'Unauthorised' }, 401);
  }

  try {
    const body = await req.json().catch(() => null);
    const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });
    if (body?.retryPending === true) {
      const result = await drainModerationNotifications(supabase);
      return json({ ok: !result.deliveryPending, ...result }, result.deliveryPending ? 502 : 200);
    }
    if (typeof body?.notificationId !== 'string' || !UUID_PATTERN.test(body.notificationId)) {
      return json({ ok: false, error: 'Invalid notificationId' }, 400);
    }

    // Email content comes only from the database snapshot created by the flag trigger.
    const { data: notification, error } = await supabase.from('flag_alert_notifications')
      .select('id,email,visitor_id,full_name,source,entry_point,session_id,status,reason,sent_at,team_email_id,email_template_version').eq('id', body.notificationId).maybeSingle();
    if (error) {
      console.error('send-flag-alert: notification lookup failed');
      return json({ ok: false, error: 'Unable to load flag notification' }, 500);
    }
    if (!notification) return json({ ok: false, error: 'Flag notification not found' }, 404);
    if (notification.sent_at) return json({ ok: true, skipped: 'already sent' });

    const sourceLabel = notification.email_template_version === 'editorial-v2' && notification.entry_point === 'team_inquiry' ? 'Team inquiry (Talk to Our Team)' : SOURCE_LABELS[notification.source] || 'Admin action / legacy record';
    await deliverFlagNotification(supabase, notification, 'team', {
          to: TEAM_RECIPIENTS,
          reply_to: 'info@themarketinghaven.xyz',
          subject: `URGENT: User Flagged - ${notification.status}`,
          ...(notification.email_template_version === 'legacy' ? {} : { html: editorialEmail({ label: 'PLATFORM SAFETY', title: `User flagged: ${notification.status}`, paragraphs: ['A saved moderation event needs your review. Open the Admin Dashboard to inspect the conversation and manage access.'], details: [
            ['Name', notification.full_name || 'Not recorded (guest if no email)'], ['Email', notification.email || 'Not provided'], ['Status', notification.status], ['Reason', notification.reason || 'Not provided'], ['Source', sourceLabel], ['Session ID', notification.session_id || 'Not recorded'], ['Visitor ID', notification.visitor_id || 'Linked saved review'],
          ], button: { label: 'Review in Admin', href: 'https://themarketinghaven.xyz/admin' } }) }),
          text: `User ${notification.email || `visitor ${notification.visitor_id}`} has been flagged as ${notification.status}. Reason Haven flagged them: ${notification.reason || 'Not provided'}. Please review in the Admin Dashboard.\n\nName: ${notification.full_name || (notification.email ? 'Not recorded' : 'Not provided (guest)')}\nSource: ${sourceLabel}\nSession ID: ${notification.session_id || 'Not recorded'}\nVisitor ID: ${notification.visitor_id || 'Linked saved review'}\nAdmin Dashboard: https://themarketinghaven.xyz/admin`,
    }, Deno.env);
    return json({ ok: true });
  } catch (error) {
    if (error instanceof MailDeliveryError) return json({ ok: false, code: error.code, error: error.message }, error.status);
    console.error('send-flag-alert: request failed');
    return json({ ok: false, error: 'Unable to send flag alert' }, 500);
  }
});

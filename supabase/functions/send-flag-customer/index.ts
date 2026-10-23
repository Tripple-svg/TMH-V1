import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

serve(async (req) => {
  const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
  const json = (body: unknown, status = 200) => Response.json(body, { status, headers });
  if (req.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405);
  const url = Deno.env.get('SUPABASE_URL'), key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) return json({ ok: false, error: 'Server misconfigured' }, 500);
  if (req.headers.get('authorization') !== `Bearer ${key}`) return json({ ok: false, error: 'Unauthorised' }, 401);
  try {
    const body = await req.json().catch(() => null);
    if (typeof body?.notificationId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.notificationId)) return json({ ok: false, error: 'Invalid notificationId' }, 400);
    const supabase = createClient(url, key, { auth: { persistSession: false } });
    const { data: event, error } = await supabase.from('flag_alert_notifications')
      .select('id,email,status,customer_required,customer_sent_at').eq('id', body.notificationId).maybeSingle();
    if (error) return json({ ok: false, error: 'Unable to load notification' }, 500);
    if (!event) return json({ ok: false, error: 'Notification not found' }, 404);
    if (!event.customer_required || event.customer_sent_at) return json({ ok: true, skipped: true });
    if (!['yellow', 'red'].includes(event.status) || typeof event.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(event.email)) return json({ ok: false, error: 'Notification has no valid email recipient' }, 500);
    const resend = Deno.env.get('RESEND_API_KEY');
    if (!resend) return json({ ok: false, error: 'Email service not configured' }, 500);
    const restricted = event.status === 'red';
    const subject = restricted ? 'Your Haven access has been restricted' : 'Warning regarding your usage of Haven.';
    const text = restricted
      ? 'Your access to Haven is currently restricted following a review of your use of the platform. You may not continue chatting while this restriction is active. If you believe this is a mistake, please reply to this email or contact info@themarketinghaven.xyz.\n\nTeam Haven'
      : 'Warning regarding your usage of Haven. Please keep conversations respectful and follow our terms. Your Haven usage has been marked for review; this warning does not automatically restrict your access. For questions, reply to this email or contact info@themarketinghaven.xyz.\n\nTeam Haven';
    const sent = await fetch('https://api.resend.com/emails', {
      method: 'POST', signal: AbortSignal.timeout(15000),
      headers: { Authorization: `Bearer ${resend}`, 'Content-Type': 'application/json', 'Idempotency-Key': `flag-customer/${event.id}` },
      body: JSON.stringify({ from: 'The Marketing Haven <info@themarketinghaven.xyz>', to: [event.email], reply_to: 'info@themarketinghaven.xyz', subject, text }),
      signal: AbortSignal.timeout(15000),
    });
    if (!sent.ok) return json({ ok: false, error: 'Notification delivery failed. Please retry.' }, 502);
    const accepted = await sent.json().catch(() => null);
    if (typeof accepted?.id !== 'string' || !accepted.id) return json({ ok: false, error: 'Notification acceptance could not be confirmed. Please retry.' }, 502);
    const { error: saveError } = await supabase.from('flag_alert_notifications')
      .update({ customer_sent_at: new Date().toISOString() }).eq('id', event.id).is('customer_sent_at', null);
    if (saveError) return json({ ok: false, error: 'Delivery could not be recorded. Please retry.' }, 500);
    return json({ ok: true });
  } catch { return json({ ok: false, error: 'Unable to deliver notification. Please retry.' }, 502); }
});

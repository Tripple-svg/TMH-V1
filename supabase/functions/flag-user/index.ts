import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ORIGINS = ['https://themarketinghaven.xyz', 'https://www.themarketinghaven.xyz', 'http://localhost:5173', 'http://localhost:5175', 'http://localhost:3000'];
const STATUSES = ['white', 'yellow', 'red'];

serve(async (req) => {
  const origin = req.headers.get('origin');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json', 'Cache-Control': 'no-store', Vary: 'Origin',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
  if (origin && ORIGINS.includes(origin)) headers['Access-Control-Allow-Origin'] = origin;
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (req.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405);
  if (origin && !ORIGINS.includes(origin)) return json({ ok: false, error: 'Origin not allowed' }, 403);

  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const adminPassword = Deno.env.get('ADMIN_PASSWORD');
  if (!url || !key) return json({ ok: false, error: 'Server misconfigured' }, 500);
  try {
    const body = await req.json().catch(() => null);
    const authorization = req.headers.get('authorization') || '';
    const supabase = createClient(url, key, { auth: { persistSession: false } });
    let allowed = authorization === `Bearer ${key}`
      || Boolean(adminPassword && typeof body?.password === 'string' && body.password === adminPassword);
    if (!allowed && authorization.startsWith('Bearer ')) {
      // Only server-verified Auth users with an administrator-controlled claim qualify.
      const { data, error } = await supabase.auth.getUser(authorization.slice(7));
      allowed = !error && data?.user?.app_metadata?.role === 'admin';
    }
    if (!allowed) return json({ ok: false, error: 'Unauthorised' }, 401);

    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
    const status = body?.status;
    const reason = body?.reason == null ? null : typeof body.reason === 'string' ? body.reason.trim() || null : undefined;
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ ok: false, error: 'Invalid email' }, 400);
    if (!STATUSES.includes(status)) return json({ ok: false, error: 'Invalid flag status' }, 400);
    if (reason === undefined || (reason && reason.length > 2000)) return json({ ok: false, error: 'Invalid flag reason (maximum 2000 characters)' }, 400);
    if (status === 'yellow' || status === 'red') {
      // Do not save an unnotifiable transition before the outbox migration exists.
      const { error: readinessError } = await supabase.from('flag_alert_notifications').select('id').limit(0);
      if (readinessError) return json({ ok: false, error: 'Apply the flag-alert notifications migration before changing flags.' }, 503);
    }
    const pattern = email.replace(/[\\%_]/g, '\\$&');
    const { data: review, error } = await supabase.from('brand_reviews')
      .update({ flag_status: status, flag_reason: reason })
      .ilike('email', pattern).select('id, flag_status, flag_reason').maybeSingle();
    if (error) {
      console.error('flag-user: flag update failed');
      return json({ ok: false, error: 'Unable to update flag. Ensure the user-flags migration has been applied.' }, 500);
    }
    if (!review) return json({ ok: false, error: 'Review not found' }, 404);

    let alertFailed = false;
    if (status === 'yellow' || status === 'red') {
      // The database trigger creates these snapshots atomically with flag changes.
      // Read pending rows even on unchanged retries so failed alerts are recoverable.
      try {
        const { data: pending, error: pendingError } = await supabase.from('flag_alert_notifications')
          .select('id').eq('review_id', review.id).is('sent_at', null)
          .order('created_at', { ascending: true });
        if (pendingError) throw pendingError;
        for (const notification of pending || []) {
          try {
            const { data, error: alertError } = await supabase.functions.invoke('send-flag-alert', {
              body: { notificationId: notification.id },
            });
            if (alertError || data?.ok !== true) alertFailed = true;
          } catch {
            alertFailed = true;
          }
        }
      } catch {
        alertFailed = true;
      }
    }

    let warningFailed = false;
    if (status === 'yellow') {
      const resendKey = Deno.env.get('RESEND_API_KEY');
      const text = `Hi there,

Warning regarding your usage of Haven.

Please review your use of the platform and follow our terms.${reason ? `\n\nReason: ${reason}` : ''}

If you have any questions, please contact info@themarketinghaven.xyz.

Team Haven`;
      try {
        if (!resendKey) throw new Error('Warning email service is not configured');
        const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
        const fingerprint = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
        const sent = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json',
            'Idempotency-Key': `haven-flag-warning/${review.id}/${fingerprint}`,
          },
          body: JSON.stringify({
            from: 'The Marketing Haven <info@themarketinghaven.xyz>', to: [email], reply_to: 'info@themarketinghaven.xyz',
            subject: 'Warning regarding your usage of Haven.', text,
          }),
          signal: AbortSignal.timeout(15000),
        });
        if (!sent.ok) warningFailed = true;
      } catch {
        warningFailed = true;
      }
    }
    if (alertFailed || warningFailed) {
      const failed = [alertFailed ? 'team flag alert' : null, warningFailed ? 'warning email' : null].filter(Boolean).join(' and ');
      return json({ ok: false, review, error: `Flag saved, but the ${failed} could not be sent. Please retry.` }, 502);
    }
    return json({ ok: true, review });
  } catch {
    console.error('flag-user: request failed');
    return json({ ok: false, error: 'Unable to update flag' }, 500);
  }
});

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.118.0';
import { isInternalRequest } from '../_shared/internal-auth.js';

const SERVICES: Record<string, string> = {
  web: 'Brand & Web Engineering',
  growth: 'Strategic Growth & Consulting',
  content: 'Content & Social Architecture',
};
const ALLOWED_ORIGINS = ['https://themarketinghaven.xyz', 'https://www.themarketinghaven.xyz', 'http://localhost:5173', 'http://localhost:5175'];

serve(async (req) => {
  const origin = req.headers.get('origin');
  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json', Vary: 'Origin',
  };
  if (origin && ALLOWED_ORIGINS.includes(origin)) headers['Access-Control-Allow-Origin'] = origin;
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (req.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405);
  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const resendKey = Deno.env.get('RESEND_API_KEY');
  if (!url || !serviceKey || !resendKey) return json({ ok: false, error: 'Server misconfigured' }, 500);
  // This endpoint is called by the webhook only; browser anon keys cannot send mail.
  if (!isInternalRequest(req, serviceKey)) return json({ ok: false, error: 'Unauthorised' }, 401);
  try {
    const body = await req.json().catch(() => null);
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
    const serviceId = body?.serviceId ?? null;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || (serviceId !== null && !Object.hasOwn(SERVICES, serviceId))) {
      return json({ ok: false, error: 'Invalid email or serviceId' }, 400);
    }
    const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });
    const pattern = email.replace(/[\\%_]/g, '\\$&');
    let intentQuery = supabase.from('booking_intents').select('id, confirmation_sent, service_id').ilike('email', pattern);
    if (body.bookingIntentId) intentQuery = intentQuery.eq('id', body.bookingIntentId);
    const { data: intent, error: intentError } = await intentQuery.order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (intentError) throw intentError;
    let table = 'booking_intents';
    let record: { id: string; confirmation_sent?: boolean; booking_confirmation_sent?: boolean } | null = intent;
    let flag = 'confirmation_sent';
    if (!intent) {
      let reviewQuery = supabase.from('brand_reviews').select('id, booking_confirmation_sent, call_booked_at').ilike('email', pattern);
      if (body.reviewId) reviewQuery = reviewQuery.eq('id', body.reviewId);
      const { data: review, error } = await reviewQuery.maybeSingle();
      if (error) throw error;
      if (!review?.call_booked_at) return json({ ok: false, error: 'No matched booking' }, 404);
      table = 'brand_reviews'; record = review; flag = 'booking_confirmation_sent';
    }
    if (!record) return json({ ok: false, error: 'No matched booking' }, 404);
    if ((flag === 'confirmation_sent' ? record.confirmation_sent : record.booking_confirmation_sent) === true) return json({ ok: true, skipped: 'already sent' });
    // Use the stored intent as the source of truth for the email's service copy.
    const friendly = intent?.service_id ? SERVICES[intent.service_id] : null;
    const text = `Hi there,

We're glad you set up a meeting with us to discuss ${friendly ? `our ${friendly} services` : 'our services'}.

Take this as confirmation of your spot. We're looking forward to seeing you on the date and time you selected on Calendly.

Two quick things to keep this smooth:
— Please join on time. If you can't make it, send us an email at info@themarketinghaven.xyz so we can free the slot for someone else.
— Check your inbox for the Calendly confirmation too — that's the one with the meeting link.

Looking forward to speaking with you.

Team Haven`;
    const sent = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json',
        // Covers concurrent webhook deliveries and retries after a failed flag update.
        'Idempotency-Key': `tmh-booking-confirmation/${table}/${record.id}`,
      },
      body: JSON.stringify({
        from: 'The Marketing Haven <info@themarketinghaven.xyz>', to: [email],
        reply_to: 'info@themarketinghaven.xyz', subject: 'Your strategy call with The Marketing Haven', text,
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!sent.ok) return json({ ok: false, error: 'Email delivery failed' }, 502);
    const { error } = await supabase.from(table).update({ [flag]: true }).eq('id', record.id);
    if (error) throw error;
    return json({ ok: true });
  } catch {
    console.error('send-tmh-booking-confirmation: delivery or flag update failed');
    return json({ ok: false, error: 'Unable to send confirmation' }, 500);
  }
});

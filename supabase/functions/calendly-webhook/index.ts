import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.118.0';
import { saveCalendlyBooking } from '../_shared/calendly-bookings.ts';
import { internalHeaders } from '../_shared/internal-auth.js';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

async function validSignature(raw: string, header: string, secret: string) {
  const parts = header.split(',').map((part) => part.trim().split('='));
  const timestamp = parts.find(([key]) => key === 't')?.[1] || '';
  const signatures = parts.filter(([key]) => key === 'v1').map(([, value]) => value);
  if (!/^\d+$/.test(timestamp) || Math.abs(Date.now() / 1000 - Number(timestamp)) > 180) return false;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  for (const signature of signatures) {
    if (!/^[a-f0-9]{64}$/i.test(signature || '')) continue;
    const bytes = Uint8Array.from(signature.match(/.{2}/g)!, (hex) => parseInt(hex, 16));
    if (await crypto.subtle.verify('HMAC', key, bytes, encoder.encode(`${timestamp}.${raw}`))) return true;
  }
  return false;
}

serve(async (req) => {
  if (req.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405);
  const secret = Deno.env.get('CALENDLY_WEBHOOK_SECRET');
  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!secret || !url || !serviceKey) return json({ ok: false, error: 'Server misconfigured' }, 500);
  try {
    const raw = await req.text();
    if (!await validSignature(raw, req.headers.get('Calendly-Webhook-Signature') || '', secret)) {
      return json({ ok: false, error: 'Invalid signature' }, 401);
    }
    let body;
    try { body = JSON.parse(raw); } catch { return json({ ok: false, error: 'Invalid JSON' }, 400); }
    if (!['invitee.created','invitee.canceled'].includes(body?.event)) return json({ ok: true, ignored: true });
    const payload = body.payload;
    const email = typeof payload?.email === 'string' ? payload.email.trim().toLowerCase() : '';
    const name = typeof payload?.name === 'string' ? payload.name.trim() : null;
    // Accept the requested nested shape and Calendly's current scheduled_event object.
    const scheduled = payload?.scheduled_event || (typeof payload?.event === 'object' ? payload.event : null);
    const startTime = scheduled?.start_time;
    const canceled = body.event === 'invitee.canceled';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || (!canceled && (typeof startTime !== 'string' || !Number.isFinite(Date.parse(startTime))))) {
      return json({ ok: false, error: 'Missing invitee email or event start time' }, 400);
    }
    const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });
    const pattern = email.replace(/[\\%_]/g, '\\$&');
    const { data: review, error: reviewError } = await supabase.from('brand_reviews')
      .select('id, haven_score, biggest_leak, assessment_summary, platform_type, main_goal, booking_confirmation_sent')
      .ilike('email', pattern).maybeSingle();
    if (reviewError) throw reviewError;
    if (review && !canceled) {
      const { data: session, error: sessionError } = await supabase.from('haven_sessions')
        .select('messages').eq('review_id', review.id).eq('scope', 'audit')
        .order('updated_at', { ascending: false }).limit(1).maybeSingle();
      if (sessionError) throw sessionError;
      const messages = (Array.isArray(session?.messages) ? session.messages : []).slice(-5)
        .map((message: { role?: string; content?: string }) => `${message?.role || 'unknown'}: ${typeof message?.content === 'string' ? message.content : ''}`);
      const briefing = [
        `Haven score: ${review.haven_score ?? 'Not scored'}`,
        `Biggest leak: ${review.biggest_leak || 'Not recorded'}`,
        `Assessment summary: ${review.assessment_summary || 'Not recorded'}`,
        `Platform: ${review.platform_type || 'Not recorded'}`,
        `Main goal: ${review.main_goal || 'Not recorded'}`,
        'Last 5 chat messages:', ...messages,
      ].join('\n');
      const { error } = await supabase.from('brand_reviews')
        .update({ call_booked_at: startTime, pre_call_briefing: briefing }).eq('id', review.id);
      if (error) throw error;
    }
    const { data: intent, error: intentError } = await supabase.from('booking_intents')
      .select('id, service_id, confirmation_sent').ilike('email', pattern)
      .order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (intentError) throw intentError;
    const savedBooking = await saveCalendlyBooking(supabase, { ...scheduled, uri: scheduled?.uri || (typeof payload.event === 'string' ? payload.event : null), status: canceled ? 'canceled' : 'active' }, { ...payload, status: canceled ? 'canceled' : 'active' }, review, intent);
    if (canceled) return json({ ok: true, canceled: true });
    if (!review && !intent) {
      console.log('calendly-webhook: no matching review or booking intent');
      return json({ ok: true, matched: false });
    }
    // Reviews without a services intent still receive one generic confirmation.
    const sent = savedBooking?.booking_email_version === 'editorial-v3' ? savedBooking.confirmation_email_sent === true : intent ? intent.confirmation_sent === true : review?.booking_confirmation_sent === true;
    if (!sent) {
      const { data, error } = await supabase.functions.invoke('send-tmh-booking-confirmation', {
        headers: internalHeaders(serviceKey),
        body: {
          email, name, serviceId: intent?.service_id ?? null,
          inviteeUri: payload.uri,
          bookingIntentId: intent?.id ?? null, reviewId: review?.id ?? null,
        },
      });
      if (error || data?.ok !== true) throw new Error('Booking confirmation failed');
    }
    return json({ ok: true, matched: true });
  } catch {
    console.error('calendly-webhook: processing failed; request should be retried');
    return json({ ok: false, error: 'Unable to process booking' }, 500);
  }
});

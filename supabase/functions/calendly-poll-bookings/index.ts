import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.118.0';
import { saveCalendlyBooking,matchCalendlyIntent } from '../_shared/calendly-bookings.ts';
import { internalHeaders } from '../_shared/internal-auth.js';

const LOCAL_ORIGINS = ['http://localhost:5173', 'http://localhost:5175'];
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const HOUR_MS = 60 * 60 * 1000;

class CalendlyApiError extends Error {}

serve(async (req) => {
  const origin = req.headers.get('origin');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json', 'Cache-Control': 'no-store',
    'Access-Control-Allow-Headers': 'content-type, x-internal-poll-key',
    'Access-Control-Allow-Methods': 'POST, OPTIONS', Vary: 'Origin',
  };
  if (origin && LOCAL_ORIGINS.includes(origin)) headers['Access-Control-Allow-Origin'] = origin;
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  const pollSecret = Deno.env.get('INTERNAL_POLL_SECRET');
  if (!pollSecret || req.headers.get('x-internal-poll-key') !== pollSecret) {
    return json({ ok: false, error: 'Unauthorised' }, 401);
  }
  if (req.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405);
  const token = Deno.env.get('CALENDLY_API_TOKEN');
  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!token || !url || !serviceKey) return json({ ok: false }, 500);

  async function calendlyGet(path: string) {
    try {
      const result = await fetch(`https://api.calendly.com${path}`, {
        headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15000),
      });
      if (!result.ok) throw new Error(`HTTP ${result.status}`);
      return await result.json();
    } catch (error) {
      // Do not log tokens, invitee data, or upstream response bodies.
      console.error('calendly-poll-bookings: Calendly API request failed', error instanceof Error ? error.name : 'unknown');
      throw new CalendlyApiError('Calendly API request failed');
    }
  }

  async function listCalendly(path: string, params: URLSearchParams) {
    const collection: Record<string, any>[] = [];
    const seenTokens = new Set<string>();
    while (true) {
      const page = await calendlyGet(`${path}?${params}`);
      if (!Array.isArray(page?.collection)) throw new CalendlyApiError('Invalid Calendly collection');
      collection.push(...page.collection);
      let nextToken = page.pagination?.next_page_token;
      if (!nextToken && page.pagination?.next_page) {
        // Extract only the pagination token; never forward the PAT to a supplied host.
        nextToken = new URL(page.pagination.next_page).searchParams.get('page_token');
        if (!nextToken) throw new CalendlyApiError('Invalid Calendly pagination');
      }
      if (!nextToken) return collection;
      if (typeof nextToken !== 'string' || seenTokens.has(nextToken)) throw new CalendlyApiError('Repeated Calendly pagination');
      seenTokens.add(nextToken);
      params.set('page_token', nextToken);
    }
  }

  try {
    const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });
    const { resource: user } = await calendlyGet('/users/me');
    if (typeof user?.uri !== 'string') throw new CalendlyApiError('Missing Calendly user URI');
    const now = Date.now();
    const events = await listCalendly('/scheduled_events', new URLSearchParams({
      user: user.uri,
      // Keep recent past meetings visible long enough to exhaust the two-hour retry window.
      min_start_time: new Date(now - 3 * HOUR_MS).toISOString(),
      max_start_time: new Date(now + 60 * 24 * 60 * 60 * 1000).toISOString(),
      count: '100',
    }));
    let matched = 0;
    let hadFailure = false;
    let hadApiFailure = false;
    for (const event of events) {
      try {
        // Calendly normally supplies a URI rather than a separate uuid field.
        const uuid = event.uuid || (typeof event.uri === 'string' ? new URL(event.uri).pathname.split('/').filter(Boolean).pop() : null);
        if (typeof uuid !== 'string' || !/^[A-Za-z0-9_-]+$/.test(uuid)) throw new CalendlyApiError('Invalid event UUID');
        const { data: processed, error: processedError } = await supabase.from('calendly_processed_events')
          .select('id').eq('event_uuid', uuid).maybeSingle();
        if (processedError) throw processedError;
        if (typeof event.start_time !== 'string' || !Number.isFinite(Date.parse(event.start_time))) {
          throw new CalendlyApiError('Invalid event start time');
        }
        // Age the booking, not its meeting date: most bookings are for future meetings.
        // Older Calendly responses without created_at fall back to the meeting time.
        const createdAt = typeof event.created_at === 'string' ? Date.parse(event.created_at) : NaN;
        const retryExpired = now - (Number.isFinite(createdAt) ? createdAt : Date.parse(event.start_time)) > 2 * HOUR_MS;
        const invitees = await listCalendly(`/scheduled_events/${encodeURIComponent(uuid)}/invitees`, new URLSearchParams({ count: '100' }));
        let firstEmail: string | null = null;
        let allInviteesComplete = true;
        for (const invitee of invitees) {
          const email = typeof invitee.email === 'string' ? invitee.email.trim().toLowerCase() : '';
          if (!EMAIL_PATTERN.test(email)) throw new CalendlyApiError('Invalid invitee email');
          firstEmail ??= email;
          const name = typeof invitee.name === 'string' ? invitee.name.trim() : null;
          const pattern = email.replace(/[\\%_]/g, '\\$&');
          const { data: review, error: reviewError } = await supabase.from('brand_reviews')
            .select('id, haven_score, biggest_leak, assessment_summary, platform_type, main_goal, pre_call_briefing, booking_confirmation_sent')
            .ilike('email', pattern).maybeSingle();
          if (reviewError) throw reviewError;
          if (review && event.status !== 'canceled' && invitee.status !== 'canceled') {
            const { error } = await supabase.from('brand_reviews').update({ call_booked_at: event.start_time }).eq('id', review.id);
            if (error) throw error;
            if (!review.pre_call_briefing) {
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
              const { error: briefingError } = await supabase.from('brand_reviews')
                .update({ pre_call_briefing: briefing }).eq('id', review.id)
                .or('pre_call_briefing.is.null,pre_call_briefing.eq.');
              if (briefingError) throw briefingError;
            }
          }
          const intent = await matchCalendlyIntent(supabase,invitee);
          // Persist every invitee, including unmatched, processed and canceled
          // bookings. The email retry marker is not the bookings source of truth.
          const savedBooking = await saveCalendlyBooking(supabase, { ...event, uri: event.uri || `https://api.calendly.com/scheduled_events/${uuid}` }, invitee, review, intent);
          if (event.status === 'canceled' || invitee.status === 'canceled' || processed) continue;
          if (review || intent) matched++;
          const modern = savedBooking?.booking_email_version === 'editorial-v3';
          if (modern ? (review || intent) && savedBooking.confirmation_email_sent !== true : intent && intent.confirmation_sent !== true) {
            try {
              const { data, error } = await supabase.functions.invoke('send-tmh-booking-confirmation', {
                headers: internalHeaders(serviceKey),
                body: { email, name, serviceId: intent?.service_id ?? null, bookingIntentId: intent?.id ?? null, reviewId:review?.id ?? null, inviteeUri:invitee.uri },
              });
              if (error || data?.ok !== true) throw new Error('Booking confirmation failed');
            } catch {
              allInviteesComplete = false;
              if (!retryExpired) hadFailure = true;
              console.error('calendly-poll-bookings: booking confirmation failed', retryExpired ? 'retry window expired' : 'will retry');
            }
          } else if (!modern && review && !intent && review.booking_confirmation_sent !== true) {
            // The browser can save its booking intent a few seconds after Calendly.
            // A review match alone must not permanently hide that late intent.
            allInviteesComplete = false;
          }
        }
        // No-match invitees need no email. A group event waits for every matched
        // invitee, unless the booking has exhausted its two-hour retry window.
        if (!processed && (allInviteesComplete || retryExpired)) {
          const { error: insertError } = await supabase.from('calendly_processed_events')
            .insert({ event_uuid: uuid, invitee_email: firstEmail });
          if (insertError && insertError.code !== '23505') throw insertError;
        }
      } catch (error) {
        // One unfinished event must not prevent other bookings from progressing.
        hadFailure = true;
        hadApiFailure ||= error instanceof CalendlyApiError;
        console.error('calendly-poll-bookings: event failed', error instanceof CalendlyApiError ? 'Calendly API' : 'database');
      }
    }
    if (hadFailure) return json({ ok: false }, hadApiFailure ? 502 : 500);
    return json({ ok: true, scanned: events.length, matched });
  } catch (error) {
    console.error('calendly-poll-bookings: polling failed', error instanceof CalendlyApiError ? 'Calendly API' : 'database or confirmation');
    return json({ ok: false }, error instanceof CalendlyApiError ? 502 : 500);
  }
});

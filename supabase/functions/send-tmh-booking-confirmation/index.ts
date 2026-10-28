import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.118.0';
import { isInternalRequest } from '../_shared/internal-auth.js';
import { bookingEmail } from '../_shared/email-template.js';
import { deliverEmail, mailConfiguration, MailDeliveryError } from '../_shared/resend-delivery.js';

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
  if (!url || !serviceKey) return json({ ok: false, error: 'Server misconfigured' }, 500);
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
    let intentQuery = supabase.from('booking_intents').select('id, confirmation_sent, service_id, booking_email_version').ilike('email', pattern);
    if (body.bookingIntentId) intentQuery = intentQuery.eq('id', body.bookingIntentId);
    const { data: intent, error: intentError } = await intentQuery.order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (intentError) throw intentError;
    let table = 'booking_intents';
    let record: { id: string; confirmation_sent?: boolean; booking_confirmation_sent?: boolean; booking_email_version?: string; full_name?: string } | null = intent;
    let name: string | null = null;
    let flag = 'confirmation_sent';
    let bookedService: string | null = null;
    if (!intent) {
      let reviewQuery = supabase.from('brand_reviews').select('id, full_name, booking_confirmation_sent, call_booked_at, booking_email_version').ilike('email', pattern);
      if (body.reviewId) reviewQuery = reviewQuery.eq('id', body.reviewId);
      const { data: review, error } = await reviewQuery.maybeSingle();
      if (error) throw error;
      if (!review?.call_booked_at) return json({ ok: false, error: 'No matched booking' }, 404);
      table = 'brand_reviews'; record = review; flag = 'booking_confirmation_sent';
      name = review.full_name || null;
    }
    // A review name is used only for the linked review flow, never a name supplied
    // by the request body or an unrelated historical review with the same email.
    if (intent && !intent.service_id && typeof body.reviewId === 'string') {
      const { data: linkedReview, error } = await supabase.from('brand_reviews').select('full_name')
        .eq('id', body.reviewId).ilike('email', pattern).maybeSingle();
      if (error) throw error;
      name = linkedReview?.full_name || null;
    }
    // Confirmation is per Calendly invitee for new bookings. An older meeting's
    // review/intent flag must not suppress confirmation of a later appointment.
    if(typeof body.inviteeUri === 'string'){
      if(!/^https:\/\/api\.calendly\.com\/scheduled_events\/[A-Za-z0-9_-]+\/invitees\/[A-Za-z0-9_-]+$/.test(body.inviteeUri))return json({ok:false,error:'Invalid booking identity'},400);
      const {data:booking,error}=await supabase.from('strategy_call_bookings').select('id,full_name,service_id,status,confirmation_email_sent,booking_email_version')
        .eq('invitee_uri',body.inviteeUri).ilike('email',pattern).maybeSingle();
      if(error)throw error;
      if(!booking || !['active','confirmed'].includes(booking.status))return json({ok:false,error:'Active booking not found'},404);
      if(booking.booking_email_version==='editorial-v3'){
        table='strategy_call_bookings';record={id:String(booking.id),booking_confirmation_sent:booking.confirmation_email_sent,booking_email_version:'editorial-v3'};
        flag='confirmation_email_sent';name=booking.full_name||name;bookedService=booking.service_id||null;
      }
    }
    if (!record) return json({ ok: false, error: 'No matched booking' }, 404);
    if ((flag === 'confirmation_sent' ? record.confirmation_sent : record.booking_confirmation_sent) === true) return json({ ok: true, skipped: 'already sent' });
    // Use the stored intent as the source of truth for the email's service copy.
    const friendly = bookedService ? SERVICES[bookedService] : intent?.service_id ? SERVICES[intent.service_id] : null;
    const configuration = mailConfiguration(Deno.env);
    const version = record.booking_email_version === 'editorial-v3' ? 'editorial-v3' : 'legacy-v1';
    const id = `tmh-booking-confirmation/${table}/${record.id}${version === 'editorial-v3' ? '/editorial-v3' : ''}`;
    const proposed = { from:configuration.from,to:[email],reply_to:'info@themarketinghaven.xyz',...bookingEmail({name,service:friendly,version}) };
    const {data:notification,error:prepareError}=await supabase.rpc('prepare_booking_confirmation',{p_id:id,p_payload:proposed});
    if(prepareError || !notification?.payload) throw new MailDeliveryError('booking_email_tracking_unavailable','Apply the booking email migration before retrying.',503);
    let acceptedId = notification.provider_email_id;
    try {
      if(!acceptedId) acceptedId = await deliverEmail({key:configuration.key,from:notification.payload.from},notification.payload,id);
      const {error:acceptanceError}=await supabase.from('booking_confirmation_emails').update({provider_email_id:acceptedId,sent_at:new Date().toISOString(),last_error:null}).eq('id',id);
      if(acceptanceError) throw new MailDeliveryError('booking_email_marker_failed','Provider acceptance needs repair.',503);
    } catch(error) {
      await supabase.from('booking_confirmation_emails').update({last_error:error instanceof MailDeliveryError?error.code:'booking_email_failed',...(acceptedId?{provider_email_id:acceptedId}:{})}).eq('id',id);
      throw error;
    }
    const { error } = await supabase.from(table).update({ [flag]: true }).eq('id', record.id);
    if (error) throw error;
    return json({ ok: true });
  } catch (error) {
    const code = error instanceof MailDeliveryError ? error.code : 'booking_confirmation_failed';
    console.error('send-tmh-booking-confirmation: '+code);
    return json({ ok: false, code, error: error instanceof MailDeliveryError ? error.message : 'Unable to send confirmation' }, error instanceof MailDeliveryError ? error.status : 500);
  }
});

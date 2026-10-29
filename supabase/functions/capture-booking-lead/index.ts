import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { publicRequestLimit } from '../_shared/abuse-limits.ts';
import { HavenRequestError,readBoundedJson } from '../_shared/haven-request.ts';
import { hashReviewToken,verifyReviewAccess,ReviewAccessError } from '../_shared/review-access.ts';

const ALLOWED_ORIGINS = ['https://themarketinghaven.xyz', 'https://www.themarketinghaven.xyz', 'http://localhost:5173', 'http://localhost:5175'];
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

serve(async (req) => {
  const origin = req.headers.get('origin');
  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json', Vary: 'Origin',
  };
  if (origin && ALLOWED_ORIGINS.includes(origin)) headers['Access-Control-Allow-Origin'] = origin;
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers:{...headers,...(status===429?{'Retry-After':'600'}:{})} });
  if (origin && !ALLOWED_ORIGINS.includes(origin)) return json({ ok: false, error: 'Origin not allowed' }, 403);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (req.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405);
  try {
    const body = await readBoundedJson(req,4096);
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
    const serviceId = body?.serviceId ?? null;
    if (email.length > 254 || !EMAIL_PATTERN.test(email)) return json({ ok: false, error: 'Invalid email' }, 400);
    if (serviceId !== null && !['web', 'growth', 'content'].includes(serviceId)) {
      return json({ ok: false, error: 'Invalid serviceId' }, 400);
    }
    const url = Deno.env.get('SUPABASE_URL');
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !key) return json({ ok: false, error: 'Server misconfigured' }, 500);
    const supabase = createClient(url, key, { auth: { persistSession: false } });
    await publicRequestLimit(supabase,req,key,'booking-intent');
    if(!/^[a-f0-9-]{36}$/i.test(body.visitorId||'')||!/^[a-f0-9]{64}$/i.test(body.visitorToken||''))return json({ok:false,error:'Refresh the page to verify your booking access.'},403);
    const verified=body.reviewId?await verifyReviewAccess(supabase,body.sessionId,body.reviewId,body.accessToken):null;
    const source=body.source==='lead'&&verified?'lead':body.source==='team'?'team':'service';
    const {data,error}=await supabase.rpc('reserve_strategy_booking',{p_visitor:body.visitorId,p_hash:await hashReviewToken(body.visitorToken),p_email:email,p_review:verified?.review.id||null,p_service:serviceId,p_source:source});
    if(error?.code==='42501')return json({ok:false,error:'Booking access could not be verified.'},403);
    if(error||!data)throw Error('booking_reservation_unavailable');
    if(data.restricted)return json({ok:false,error:'Your access to Haven is restricted. Contact info@themarketinghaven.xyz.'},403);
    if(data.alreadyBooked)return json({ok:false,code:'already_booked',error:'You already have an upcoming call. Please use your Calendly confirmation to manage it.',startTime:data.startTime},409);
    if(data.pending)return json({ok:false,code:'booking_pending',error:'A booking page was opened recently. Complete that booking or wait up to 30 minutes before opening another.',retryAfter:data.retryAfter},409);
    return json({ ok: true,intentId:data.intentId });
  } catch (error) {
    if(error instanceof HavenRequestError||error instanceof ReviewAccessError)return json({ok:false,error:error.message},error.status);
    console.error('capture-booking-lead: insert failed');
    return json({ ok: false, error: 'Unable to save booking details' }, 500);
  }
});

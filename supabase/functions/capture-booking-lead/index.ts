import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
  if (origin && !ALLOWED_ORIGINS.includes(origin)) return json({ ok: false, error: 'Origin not allowed' }, 403);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (req.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405);
  try {
    const body = await req.json().catch(() => null);
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
    const { error } = await supabase.from('booking_intents').insert({
      email, service_id: serviceId,
      ip_address: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
    });
    if (error) throw error;
    return json({ ok: true });
  } catch {
    console.error('capture-booking-lead: insert failed');
    return json({ ok: false, error: 'Unable to save booking details' }, 500);
  }
});

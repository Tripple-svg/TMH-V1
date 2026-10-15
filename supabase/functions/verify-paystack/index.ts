import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ALLOWED_ORIGINS = [
  'https://themarketinghaven.xyz',
  'https://www.themarketinghaven.xyz',
  'http://localhost:5173',
  'http://localhost:5175',
];

serve(async (req) => {
  const origin = req.headers.get('origin');
  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    Vary: 'Origin',
  };
  if (origin && ALLOWED_ORIGINS.includes(origin)) headers['Access-Control-Allow-Origin'] = origin;
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
  if (origin && !ALLOWED_ORIGINS.includes(origin)) return json({ ok: false, error: 'Origin not allowed' }, 403);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (req.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405);

  try {
    const body = await req.json().catch(() => null);
    const reference = typeof body?.reference === 'string' ? body.reference : '';
    if (!/^UNSEEN_[A-Za-z0-9_-]{1,120}$/.test(reference)) {
      return json({ ok: false, error: 'Invalid payment reference' }, 400);
    }
    const secret = Deno.env.get('PAYSTACK_SECRET_KEY');
    const url = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!secret || !url || !serviceKey) return json({ ok: false, error: 'Server misconfigured' }, 500);

    const verification = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
      headers: { Authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(15000),
    });
    const payment = await verification.json();
    if (!verification.ok || payment?.status !== true || payment?.data?.status !== 'success'
      || payment.data.reference !== reference || payment.data.currency !== 'NGN'
      || ![963900, 10000].includes(payment.data.amount)) {
      return json({ ok: false, error: 'Payment not verified' });
    }
    const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });
    const { data: bucket, error: bucketError } = await supabase.storage.getBucket('playbook-private');
    if (bucketError || !bucket || bucket.public !== false) {
      return json({ ok: false, error: 'Private download unavailable' }, 503);
    }
    const { data, error } = await supabase.storage.from('playbook-private')
      .createSignedUrl('The_Unseen_Playbook.pdf', 3600, { download: 'The_Unseen_Playbook.pdf' });
    if (error || !data?.signedUrl) return json({ ok: false, error: 'Download unavailable' }, 503);
    return json({ ok: true, url: data.signedUrl, expiresIn: 3600 });
  } catch {
    console.error('verify-paystack: verification or signing failed');
    return json({ ok: false, error: 'Payment verification unavailable' }, 502);
  }
});

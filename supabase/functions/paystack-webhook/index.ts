import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const REFERENCE_PATTERN = /^UNSEEN_[A-Za-z0-9_-]{1,120}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Paystack amounts are in kobo: retain the current NGN 100 test checkout.
const PLAYBOOK_AMOUNTS = [10000, 963900];

serve(async (req) => {
  const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
  if (req.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405);
  const secret = Deno.env.get('PAYSTACK_SECRET_KEY');
  if (!secret) return json({ ok: false, error: 'Server misconfigured' }, 500);
  const signature = req.headers.get('x-paystack-signature');
  if (!signature || !/^[a-f\d]{128}$/i.test(signature)) return json({ ok: false, error: 'Unauthorised' }, 401);

  try {
    // Authenticate the exact bytes received before decoding or parsing JSON.
    const rawBody = new Uint8Array(await req.arrayBuffer());
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-512' }, false, ['verify']);
    const signatureBytes = Uint8Array.from(signature.match(/.{2}/g)!, (pair) => Number.parseInt(pair, 16));
    if (!await crypto.subtle.verify('HMAC', key, signatureBytes, rawBody)) return json({ ok: false, error: 'Unauthorised' }, 401);
    let body;
    try {
      body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(rawBody));
    } catch {
      return json({ ok: false, error: 'Invalid payload' }, 400);
    }
    const payment = body?.data;
    const reference = typeof payment?.reference === 'string' ? payment.reference : '';
    if (body?.event !== 'charge.success' || payment?.status !== 'success'
      || !REFERENCE_PATTERN.test(reference) || payment.currency !== 'NGN'
      || !Number.isSafeInteger(payment.amount) || !PLAYBOOK_AMOUNTS.includes(payment.amount)) {
      return json({ ok: true, ignored: true });
    }
    const email = typeof payment?.customer?.email === 'string' ? payment.customer.email.trim().toLowerCase() : '';
    if (!EMAIL_PATTERN.test(email)) return json({ ok: false, error: 'Invalid purchase email' }, 400);
    const url = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !serviceKey) return json({ ok: false, error: 'Server misconfigured' }, 500);
    const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });
    const { error: insertError } = await supabase.from('playbook_purchases').insert({ email, reference, amount: payment.amount });
    // Replays must preserve the original buyer and amount, including during races.
    if (insertError && insertError.code !== '23505') throw insertError;
    const { data: purchase, error: purchaseError } = await supabase.from('playbook_purchases')
      .select('id, email, reference, thankyou_sent').eq('reference', reference).maybeSingle();
    if (purchaseError || !purchase) throw purchaseError || new Error('Purchase unavailable');
    if (purchase.thankyou_sent === true) return json({ ok: true });
    const { data, error } = await supabase.functions.invoke('send-purchase-thankyou', {
      body: { email: purchase.email, reference: purchase.reference },
    });
    // Keep the saved purchase and return an error so Paystack retries delivery.
    if (error || data?.ok !== true) return json({ ok: false, error: 'Purchase email unavailable' }, 502);
    return json({ ok: true });
  } catch {
    console.error('paystack-webhook: purchase processing failed');
    return json({ ok: false, error: 'Unable to process purchase' }, 500);
  }
});

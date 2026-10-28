import { acceptedPaymentAmount } from '../_shared/playbook-recovery.ts';
import { internalHeaders } from '../_shared/internal-auth.js';
import { invocationFailure } from '../_shared/resend-delivery.js';
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.118.0';

const REFERENCE_PATTERN = /^UNSEEN_[A-Za-z0-9_-]{1,120}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Paystack amounts are in kobo. The shared cutoff policy preserves genuine old
// NGN 100 purchases; new checkout charges NGN 9,639.
const PLAYBOOK_AMOUNTS = [10000, 963900];

function followupConsent(metadata: unknown) {
  let value = metadata;
  if (typeof value === 'string' && value.length <= 8192) {
    try { value = JSON.parse(value); } catch { return false; }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const fields = value as Record<string, unknown>;
  return fields.playbook_followup_opt_in === true && fields.playbook_followup_consent_version === '2026-10-27';
}

serve(async (req) => {
  const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
  const failure = (code: string, error: string, status: number) => {
    console.error(`Error in webhook: ${code}`);
    return json({ ok: false, error }, status);
  };
  if (req.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405);
  console.log('Webhook received');
  const secret = Deno.env.get('PAYSTACK_SECRET_KEY');
  if (!secret) return failure('missing_paystack_secret', 'Server misconfigured', 500);
  // A NGN 100 purchase can be live. Environment comes from keys/domain, never price.
  const keyMode = secret.startsWith('sk_live_') ? 'live' : secret.startsWith('sk_test_') ? 'test' : 'unknown';
  const expectedMode = Deno.env.get('PAYSTACK_ENV')?.trim().toLowerCase();
  console.log('Paystack environment', { key_mode: keyMode, expected_mode: expectedMode === 'live' || expectedMode === 'test' ? expectedMode : expectedMode ? 'invalid' : 'not_configured' });
  if (expectedMode && !['live', 'test'].includes(expectedMode)) return failure('invalid_environment_configuration', 'Server misconfigured', 500);
  if (expectedMode && expectedMode !== keyMode) return failure('secret_environment_mismatch', 'Payment environment misconfigured', 500);
  const signature = req.headers.get('x-paystack-signature');
  if (!signature || !/^[a-f\d]{128}$/i.test(signature)) return failure('missing_or_invalid_signature', 'Unauthorised', 401);

  try {
    // Authenticate the exact bytes received before decoding or parsing JSON.
    const rawBody = new Uint8Array(await req.arrayBuffer());
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-512' }, false, ['verify']);
    const signatureBytes = Uint8Array.from(signature.match(/.{2}/g)!, (pair) => Number.parseInt(pair, 16));
    if (!await crypto.subtle.verify('HMAC', key, signatureBytes, rawBody)) return failure('signature_verification_failed', 'Unauthorised', 401);
    console.log('Signature verified');
    let body;
    try {
      body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(rawBody));
    } catch {
      return failure('invalid_signed_payload', 'Invalid payload', 400);
    }
    const payment = body?.data;
    const reference = typeof payment?.reference === 'string' ? payment.reference : '';
    if (body?.event !== 'charge.success' || payment?.status !== 'success'
      || !REFERENCE_PATTERN.test(reference) || payment.currency !== 'NGN'
      || !Number.isSafeInteger(payment.amount) || !PLAYBOOK_AMOUNTS.includes(payment.amount)) {
      return json({ ok: true, ignored: true });
    }
    if (expectedMode && payment.domain !== expectedMode) return failure('signed_payload_environment_mismatch', 'Payment environment mismatch', 400);
    const email = typeof payment?.customer?.email === 'string' ? payment.customer.email.trim().toLowerCase() : '';
    if (!EMAIL_PATTERN.test(email)) return failure('invalid_purchase_email', 'Invalid purchase email', 400);
    const url = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !serviceKey) return failure('missing_database_configuration', 'Server misconfigured', 500);
    const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });
    if (!await acceptedPaymentAmount(supabase, payment.amount, payment.paid_at || payment.paidAt)) return json({ ok: true, ignored: true });
    const paidTimestamp = typeof (payment.paid_at || payment.paidAt) === 'string' ? Date.parse(payment.paid_at || payment.paidAt) : NaN;
    const optedIn = followupConsent(payment.metadata) && Number.isFinite(paidTimestamp);
    const firstName = typeof payment.customer?.first_name === 'string'
      ? payment.customer.first_name.replace(/[\u0000-\u001f\u007f]/g, '').trim().split(/\s+/)[0].slice(0, 60) || null : null;
    console.log('Inserting into playbook_purchases');
    const { error: insertError } = await supabase.from('playbook_purchases').insert({ email, reference, amount: payment.amount,
      buyer_first_name: firstName, paid_at: Number.isFinite(paidTimestamp) ? new Date(paidTimestamp).toISOString() : null,
      followup_opt_in: optedIn, followup_consent_version: optedIn ? '2026-10-27' : null,
    });
    // Replays must preserve the original buyer and amount, including during races.
    if (insertError && insertError.code !== '23505') return failure('purchase_insert_failed', 'Unable to process purchase', 500);
    const { data: purchase, error: purchaseError } = await supabase.from('playbook_purchases')
      .select('id, email, reference, thankyou_sent').eq('reference', reference).maybeSingle();
    if (purchaseError || !purchase) return failure('purchase_lookup_failed', 'Unable to process purchase', 500);
    if (purchase.thankyou_sent === true) return json({ ok: true });
    console.log('Triggering thank you email');
    const { data, error } = await supabase.functions.invoke('send-purchase-thankyou', {
      body: { email: purchase.email, reference: purchase.reference },
      headers: internalHeaders(serviceKey),
    });
    // Keep the saved purchase and return an error so Paystack retries delivery.
    if (error || data?.ok !== true) {
      const diagnostic = await invocationFailure(data, error);
      await supabase.from('playbook_purchases').update({ thankyou_last_error: diagnostic.code }).eq('id', purchase.id).eq('thankyou_sent', false);
      return failure('purchase_email_failed', 'Purchase email unavailable', 502);
    }
    const { data: delivery, error: deliveryError } = await supabase.from('playbook_purchases')
      .select('thankyou_sent').eq('reference', purchase.reference).maybeSingle();
    if (deliveryError || delivery?.thankyou_sent !== true) return failure('delivery_marker_unconfirmed', 'Purchase email status unavailable', 502);
    return json({ ok: true });
  } catch {
    return failure('purchase_processing_failed', 'Unable to process purchase', 500);
  }
});

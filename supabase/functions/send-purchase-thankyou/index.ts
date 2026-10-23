import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const EMAIL_ID_PATTERN = /^[A-Za-z0-9_-]{1,200}$/;

serve(async (req) => {
  const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
  if (req.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405);
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!serviceKey) return json({ ok: false, error: 'Server misconfigured' }, 500);
  if (req.headers.get('Authorization') !== `Bearer ${serviceKey}`) return json({ ok: false, error: 'Unauthorised' }, 401);
  const url = Deno.env.get('SUPABASE_URL');
  if (!url) return json({ ok: false, error: 'Server misconfigured' }, 500);
  let supabase: ReturnType<typeof createClient> | null = null;
  let purchaseId: string | null = null;
  let acceptedEmailId: string | null = null;
  const failure = async (code: string, message: string, status: number) => {
    console.error(`send-purchase-thankyou: ${code}`);
    if (supabase && purchaseId) {
      try {
        // A concurrent successful send must not be overwritten by a failing retry.
        const { error } = await supabase.from('playbook_purchases').update({
          thankyou_last_error: code, ...(acceptedEmailId ? { thankyou_email_id: acceptedEmailId } : {}),
        })
          .eq('id', purchaseId).eq('thankyou_sent', false);
        if (error) console.error('send-purchase-thankyou: diagnostic_update_failed');
      } catch { console.error('send-purchase-thankyou: diagnostic_update_failed'); }
    }
    return json({ ok: false, error: message }, status);
  };

  try {
    const body = await req.json().catch(() => null);
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
    const reference = typeof body?.reference === 'string' ? body.reference : '';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !/^UNSEEN_[A-Za-z0-9_-]{1,120}$/.test(reference)) {
      return json({ ok: false, error: 'Invalid email or reference' }, 400);
    }
    supabase = createClient(url, serviceKey, { auth: { persistSession: false } });
    const { data: purchase, error: purchaseError } = await supabase.from('playbook_purchases')
      .select('id, email, reference, thankyou_sent, thankyou_email_id').eq('reference', reference).maybeSingle();
    if (purchaseError) return failure('purchase_lookup_failed', 'Unable to load purchase', 500);
    if (!purchase || purchase.email.trim().toLowerCase() !== email) return json({ ok: false, error: 'Purchase not found' }, 404);
    if (purchase.thankyou_sent === true) return json({ ok: true, skipped: 'already sent' });
    purchaseId = purchase.id;
    acceptedEmailId = typeof purchase.thankyou_email_id === 'string' && EMAIL_ID_PATTERN.test(purchase.thankyou_email_id) ? purchase.thankyou_email_id : null;
    const { data: attempt, error: attemptError } = await supabase.from('playbook_purchases')
      .update({ thankyou_attempted_at: new Date().toISOString(), thankyou_last_error: null })
      .eq('id', purchase.id).select('id').maybeSingle();
    if (attemptError || !attempt) return failure('delivery_tracking_unavailable', 'Unable to record delivery attempt. Apply the purchase delivery migration and retry.', 500);
    // A prior accepted email may have outlived a failed marker write. Repair its
    // status from the stored acceptance id rather than sending it again.
    if (!acceptedEmailId) {
      const resendKey = Deno.env.get('RESEND_API_KEY');
      if (!resendKey) return failure('missing_resend_key', 'Server misconfigured', 500);
      const text = `Hi there,

Thank you for purchasing The Unseen Playbook. You can download it here: https://themarketinghaven.xyz/#shop

If you have any questions as you read through, reply to this email or reach out to Haven on our website to help guide you for further stuff.

Talk soon,
Team Haven.`;
      const sent = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json',
          // Concurrent attempts and delivery retries share the same provider key.
          'Idempotency-Key': `playbook-purchase-thankyou/${purchase.reference}`,
        },
        body: JSON.stringify({
          from: 'The Marketing Haven <info@themarketinghaven.xyz>', to: [purchase.email],
          reply_to: 'info@themarketinghaven.xyz', subject: 'Your copy of The Unseen Playbook', text,
        }),
        signal: AbortSignal.timeout(15000),
      });
      if (!sent.ok) return failure(`resend_http_${sent.status}`, 'Email delivery failed', 502);
      const accepted = await sent.json().catch(() => null);
      if (typeof accepted?.id !== 'string' || !EMAIL_ID_PATTERN.test(accepted.id)) {
        return failure('invalid_resend_acceptance', 'Email acceptance could not be confirmed', 502);
      }
      acceptedEmailId = accepted.id;
    }
    // The durable flag is written only after Resend accepts the email.
    const { data: delivered, error } = await supabase.from('playbook_purchases').update({
      thankyou_sent: true, thankyou_sent_at: new Date().toISOString(),
      thankyou_last_error: null, thankyou_email_id: acceptedEmailId,
    }).eq('id', purchase.id).select('id').maybeSingle();
    if (error || !delivered) return failure('delivery_marker_update_failed', 'Email was accepted but its saved status could not be confirmed. Retry safely.', 500);
    return json({ ok: true });
  } catch {
    return failure('delivery_processing_failed', 'Unable to send purchase email', 500);
  }
});

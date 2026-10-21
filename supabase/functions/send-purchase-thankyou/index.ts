import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

serve(async (req) => {
  const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
  if (req.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405);
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!serviceKey) return json({ ok: false, error: 'Server misconfigured' }, 500);
  if (req.headers.get('Authorization') !== `Bearer ${serviceKey}`) return json({ ok: false, error: 'Unauthorised' }, 401);
  const url = Deno.env.get('SUPABASE_URL');
  if (!url) return json({ ok: false, error: 'Server misconfigured' }, 500);

  try {
    const body = await req.json().catch(() => null);
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
    const reference = typeof body?.reference === 'string' ? body.reference : '';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !/^UNSEEN_[A-Za-z0-9_-]{1,120}$/.test(reference)) {
      return json({ ok: false, error: 'Invalid email or reference' }, 400);
    }
    const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });
    const { data: purchase, error: purchaseError } = await supabase.from('playbook_purchases')
      .select('id, email, reference, thankyou_sent').eq('reference', reference).maybeSingle();
    if (purchaseError) throw purchaseError;
    if (!purchase || purchase.email.trim().toLowerCase() !== email) return json({ ok: false, error: 'Purchase not found' }, 404);
    if (purchase.thankyou_sent === true) return json({ ok: true, skipped: 'already sent' });
    const resendKey = Deno.env.get('RESEND_API_KEY');
    if (!resendKey) return json({ ok: false, error: 'Server misconfigured' }, 500);
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
    if (!sent.ok) return json({ ok: false, error: 'Email delivery failed' }, 502);
    // The durable flag is written only after Resend accepts the email.
    const { error } = await supabase.from('playbook_purchases').update({ thankyou_sent: true }).eq('id', purchase.id);
    if (error) throw error;
    return json({ ok: true });
  } catch {
    console.error('send-purchase-thankyou: delivery or flag update failed');
    return json({ ok: false, error: 'Unable to send purchase email' }, 500);
  }
});

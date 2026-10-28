import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.118.0';
import { HavenRequestError, responseHeaders, verifyOrigin, readBoundedJson } from '../_shared/haven-request.ts';
import { purchaseDetails, recoveryCode, codeHash, limitRecovery, requestBucket, verifyPurchasePayment } from '../_shared/playbook-recovery.ts';
import { editorialEmail } from '../_shared/email-template.js';
import { deliverEmail, mailConfiguration, MailDeliveryError } from '../_shared/resend-delivery.js';

Deno.serve(async request => {
  const headers = responseHeaders(request);
  const json = (body: unknown, status = 200) => Response.json(body, { status, headers });
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (request.method !== 'POST') return json({ ok: false, error: 'Method not allowed.' }, 405);
  try {
    verifyOrigin(request);
    const body = await readBoundedJson(request, 4096);
    const { reference, email } = purchaseDetails(body);
    const secret = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'), url = Deno.env.get('SUPABASE_URL');
    if (!secret || !url) throw new HavenRequestError('Recovery is not configured.', 503);
    const db = createClient(url, secret, { auth: { persistSession: false } });
    await limitRecovery(db, 'recovery-ip:' + await requestBucket(request, secret), 5, 900);
    await limitRecovery(db, 'recovery-pair:' + await codeHash(reference, email, secret), 3);
    const id = crypto.randomUUID();
    const generic = (challengeId = id) => json({ ok: true, challengeId, expiresIn: 600, resendAfter: 60,
      message: 'If the details match a purchase, a six-digit code will arrive at the checkout email. Check spam too.' });
    if (!await verifyPurchasePayment(db, reference, email)) return generic();
    const code = recoveryCode();
    const { data: reservation, error } = await db.rpc('reserve_playbook_recovery', {
      p_id: id, p_reference: reference, p_email: email, p_code_hash: await codeHash(id, code, secret),
    });
    if (error || !reservation) throw new HavenRequestError('Recovery is temporarily unavailable.', 503);
    if (!reservation.created) return generic(reservation.id);
    const paragraphs = ['Your Playbook access code is ' + code + '.', 'Enter it in the Playbook window you just opened. It expires in 10 minutes and can be used once.',
      'Never share this code. Team Haven will not ask you to read it out or send it in chat. If you did not request it, you can ignore this email.'];
    try {
      const emailId = await deliverEmail(mailConfiguration(Deno.env), { to: [email], reply_to: 'info@themarketinghaven.xyz',
        subject: 'Your Playbook access code', text: paragraphs.join('\n\n'),
        html: editorialEmail({ label: 'SECURE PLAYBOOK ACCESS', title: code, paragraphs: paragraphs.slice(1) }),
      }, 'playbook-recovery/' + id);
      const { data: saved, error: saveError } = await db.from('playbook_recovery_otps')
        .update({ sent_at: new Date().toISOString(), email_id: emailId }).eq('id', id).select('id').single();
      if (saveError || !saved) throw new HavenRequestError('Your code could not be activated. Wait a minute and request a new one.', 503);
    } catch (error) {
      await db.from('playbook_recovery_otps').update({ delivery_error: error instanceof MailDeliveryError ? error.code : 'otp_delivery_failed' }).eq('id', id);
      throw new HavenRequestError('The code could not be sent. Wait a minute and try again.', 503);
    }
    return generic();
  } catch (error) {
    if(error instanceof HavenRequestError && error.status===429)Object.assign(headers,{'Retry-After':String(error.retryAfter||900)});
    return json({ ok: false, error: error instanceof HavenRequestError ? error.message : 'Recovery is temporarily unavailable.' }, error instanceof HavenRequestError ? error.status : 502);
  }
});

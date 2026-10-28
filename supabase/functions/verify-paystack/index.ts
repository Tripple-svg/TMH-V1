import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.118.0';
import { HavenRequestError, responseHeaders, verifyOrigin, readBoundedJson } from '../_shared/haven-request.ts';
import { purchaseDetails, hasDownloadGrant, verifyPurchasePayment, downloadResult, limitRecovery, requestBucket, privateToken, digest, PLAYBOOK_AMOUNT_KOBO } from '../_shared/playbook-recovery.ts';

// Receipt details are identifiers, not authentication. A private proof belongs
// either to a newly generated checkout or to an inbox-verified recovery.
// Every download still requires a fresh successful Paystack payment check.
Deno.serve(async request => {
  const headers = responseHeaders(request);
  const json = (body: unknown, status = 200) => Response.json(body, { status, headers });
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (request.method !== 'POST') return json({ ok: false, error: 'Method not allowed.' }, 405);
  try {
    verifyOrigin(request);
    const body = await readBoundedJson(request, 4096);
    const details = purchaseDetails(body.action === 'prepare-checkout' ? { email: body.email, reference: 'UNSEEN_new' } : body);
    const secret = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'), url = Deno.env.get('SUPABASE_URL');
    if (!secret || !url) throw new HavenRequestError('Purchase access is not configured.', 503);
    const db = createClient(url, secret, { auth: { persistSession: false } });
    await limitRecovery(db, 'download-ip:' + await requestBucket(request, secret), 60);
    if (body.action === 'prepare-checkout') {
      // A client-selected reference could belong to an existing buyer. This
      // capability can unlock only the NEW payment generated here.
      const { email } = details;
      await limitRecovery(db, 'checkout-ip:' + await requestBucket(request, secret), 5);
      const reference = 'UNSEEN_' + crypto.randomUUID();
      const downloadToken = privateToken();
      const { error } = await db.from('playbook_download_grants').insert({
        token_hash: await digest(downloadToken), reference, email,
      });
      if (error) throw new HavenRequestError('Checkout could not be prepared. Please try again.', 503);
      return json({ ok: true, reference, email, downloadToken, amount: PLAYBOOK_AMOUNT_KOBO });
    }
    const { reference, email } = details;
    if (!await hasDownloadGrant(db, reference, email, body.downloadToken)) {
      await limitRecovery(db,'invalid-download-ip:'+await requestBucket(request,secret),5,600);
      return json({ ok: false, code: 'recovery_required', error: 'Confirm your checkout email with a one-time code to access your copy.' }, 403);
    }
    if (!await verifyPurchasePayment(db, reference, email)) return json({ ok: false, code: 'payment_not_verified', error: 'Payment has not been confirmed. If you were charged, keep your receipt and retry shortly. You do not need to pay again.' }, 403);
    return json(await downloadResult(db, reference, secret));
  } catch (error) {
    if(error instanceof HavenRequestError && error.status===429)Object.assign(headers,{'Retry-After':String(error.retryAfter||600)});
    return json({ ok: false, error: error instanceof HavenRequestError ? error.message : 'Purchase verification is temporarily unavailable.' }, error instanceof HavenRequestError ? error.status : 502);
  }
});

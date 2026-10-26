import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.118.0';
import { HavenRequestError, responseHeaders, verifyOrigin, readBoundedJson } from '../_shared/haven-request.ts';
import { codeHash, digest, privateToken, limitRecovery, requestBucket, verifyPurchasePayment, downloadResult } from '../_shared/playbook-recovery.ts';

Deno.serve(async request => {
  const headers = responseHeaders(request);
  const json = (body: unknown, status = 200) => Response.json(body, { status, headers });
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (request.method !== 'POST') return json({ ok: false, error: 'Method not allowed.' }, 405);
  try {
    verifyOrigin(request);
    const body = await readBoundedJson(request, 4096);
    if (typeof body.challengeId !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(body.challengeId) || typeof body.code !== 'string' || !/^\d{6}$/.test(body.code)) throw new HavenRequestError('Enter the six-digit code from your email.');
    const secret = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'), url = Deno.env.get('SUPABASE_URL');
    if (!secret || !url) throw new HavenRequestError('Recovery is not configured.', 503);
    const db = createClient(url, secret, { auth: { persistSession: false } });
    await limitRecovery(db, 'redeem-ip:' + await requestBucket(request, secret), 30);
    const token = privateToken();
    const { data, error } = await db.rpc('redeem_playbook_recovery', {
      p_id: body.challengeId, p_code_hash: await codeHash(body.challengeId, body.code, secret), p_grant_hash: await digest(token),
    });
    if (error) throw new HavenRequestError('Code verification is unavailable.', 503);
    if (!data?.verified) throw new HavenRequestError('This code is incorrect, expired or already used. Request a new code if needed.', 400);
    const access = { ok: true, reference: data.reference, email: data.email, downloadToken: token };
    try {
      if (!await verifyPurchasePayment(db, data.reference, data.email)) throw new HavenRequestError('This payment could not be verified. Contact info@themarketinghaven.xyz.', 403);
      return json({ ...await downloadResult(db, data.reference, secret), ...access });
    } catch (error) {
      if (error instanceof HavenRequestError && error.status === 403) throw error;
      // Inbox proof survives a temporary storage outage. The device can retry
      // verify-paystack with its grant instead of being charged or coded again.
      return json({ ...access, downloadPending: true, message: 'Your email is confirmed. The download is temporarily unavailable; retry opening your copy shortly.' });
    }
  } catch (error) {
    return json({ ok: false, error: error instanceof HavenRequestError ? error.message : 'Recovery is temporarily unavailable.' }, error instanceof HavenRequestError ? error.status : 502);
  }
});

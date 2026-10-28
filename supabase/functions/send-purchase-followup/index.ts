import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.118.0';
import { isInternalRequest } from '../_shared/internal-auth.js';
import { deliverEmail, mailConfiguration, MailDeliveryError } from '../_shared/resend-delivery.js';
import { followupOptOutUrl, purchaseFollowupPayload } from '../_shared/purchase-followup.ts';

// Called by a private scheduled job. A due timestamp is not a promise of exact
// inbox delivery. Existing/opted-out buyers never enter the eligible queue.
serve(async request => {
  const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
  if (request.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405);
  const projectUrl = Deno.env.get('SUPABASE_URL'), serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!projectUrl || !serviceKey) return json({ ok: false, error: 'Server misconfigured' }, 503);
  if (!isInternalRequest(request, serviceKey)) return json({ ok: false, error: 'Unauthorised' }, 401);
  const db = createClient(projectUrl, serviceKey, { auth: { persistSession: false } });
  try {
    const configuration = mailConfiguration(Deno.env);
    const { data: jobs, error } = await db.rpc('claim_playbook_followups', { p_limit: 5 });
    if (error || !Array.isArray(jobs)) return json({ ok: false, error: 'Follow-up queue is unavailable.' }, 503);
    let accepted = 0, pending = 0;
    for (const job of jobs) {
      let emailId = job.provider_email_id || null;
      try {
        if (!emailId) {
          const unsubscribe = await followupOptOutUrl(projectUrl, job.id, job.due_at, Deno.env.get('PURCHASE_FOLLOWUP_UNSUBSCRIBE_SECRET')?.trim() || serviceKey);
          const proposed = { ...purchaseFollowupPayload(job, unsubscribe), from: configuration.from };
          const { data: payload, error: payloadError } = await db.rpc('save_playbook_followup_payload', { p_id: job.id, p_claim_id: job.claim_id, p_payload: proposed });
          if (payloadError) throw new MailDeliveryError('followup_payload_unavailable', 'Saved mail payload unavailable.', 503);
          if (!payload) continue; // Cancelled or completed after the initial claim.
          // Preserve the original sender and full payload if configuration changes.
          emailId = await deliverEmail({ key: configuration.key, from: payload.from }, payload, 'playbook-followup/' + job.id);
        }
        const { data: saved, error: saveError } = await db.rpc('complete_playbook_followup', { p_id: job.id, p_claim_id: job.claim_id, p_email_id: emailId, p_error: null });
        if (saveError || saved !== true) throw new MailDeliveryError('followup_marker_failed', 'Provider acceptance needs repair.', 503);
        accepted++;
      } catch (failure) {
        const code = failure instanceof MailDeliveryError ? failure.code : 'followup_processing_failed';
        // Preserve a provider acceptance ID even when the final marker RPC failed.
        if (emailId) await db.from('playbook_purchase_followups').update({ provider_email_id: emailId, last_error: code }).eq('id', job.id).eq('claim_id', job.claim_id);
        else await db.rpc('complete_playbook_followup', { p_id: job.id, p_claim_id: job.claim_id, p_email_id: null, p_error: code });
        console.error('send-purchase-followup: ' + code);
        pending++;
      }
    }
    return json({ ok: pending === 0, attempted: jobs.length, accepted, pending }, pending ? 502 : 200);
  } catch {
    return json({ ok: false, error: 'Follow-up processing is temporarily unavailable.' }, 503);
  }
});

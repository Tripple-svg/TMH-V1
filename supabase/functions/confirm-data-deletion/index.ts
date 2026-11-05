import {logEvent} from '../_shared/logger.ts';
import {observe} from '../_shared/observability.ts';
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.118.0';
import { publicRequestLimit } from '../_shared/abuse-limits.ts';
import {privacyEmail,emailFooterText} from '../_shared/email-template.js';
import { HavenRequestError, readBoundedJson, responseHeaders, verifyOrigin } from '../_shared/haven-request.ts';

const TOKEN_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[0-9a-f]{32}$/i;

async function sendDeletionConfirmation(email: string,requestId:string) {
  const key = Deno.env.get('RESEND_API_KEY')?.trim();
  if (!key) { logEvent('error','confirm-data-deletion.diagnostic_1',requestId); return; }
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST', signal: AbortSignal.timeout(10000),
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'info@themarketinghaven.xyz', to: [email],
        subject: 'Your saved review deletion is complete',
        html:privacyEmail({title:'Your saved review has been removed.',paragraphs:['Your confirmed request removed matching saved brand reviews, their linked chat sessions and stored screenshots.','Purchase, booking, deletion-request, security and email-delivery records, and unlinked guest chats, are outside this automated flow. Contact info@themarketinghaven.xyz to review remaining records or exercise your privacy rights. We may need to verify ownership and explain any lawful retention reason.']}),
        text: emailFooterText('Your confirmed request removed matching saved brand reviews, their linked chat sessions and stored screenshots.\n\nPurchase, booking, deletion-request, security and email-delivery records, and unlinked guest chats, are outside this automated flow. Contact info@themarketinghaven.xyz to review remaining records or exercise your privacy rights. We may need to verify ownership and explain any lawful retention reason.\n\nYour friends over at Team Haven'),
      }),
    });
    // Provider bodies may contain recipient details. Log only a safe status.
    if (!response.ok) logEvent('error','confirm-data-deletion.email_http_'+response.status,requestId);
    await response.body?.cancel();
  } catch { logEvent('error','confirm-data-deletion.diagnostic_3',requestId); }
}

serve(observe('confirm-data-deletion',async (request,requestId) => {
  const headers: Record<string, string> = responseHeaders(request);
  const json = (body: unknown, status = 200) => Response.json(body, { status, headers });
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (request.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405);
  try {
    verifyOrigin(request);
    const payload = await readBoundedJson(request, 1024);
    const token = Object.keys(payload).length === 1 && typeof payload.token === 'string' ? payload.token.trim() : '';
    if (!TOKEN_PATTERN.test(token)) return json({ ok: false, error: 'Invalid token' }, 400);
    const url = Deno.env.get('SUPABASE_URL'), key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !key) throw new HavenRequestError('Unable to complete deletion. Please try again shortly.', 503);
    const db = createClient(url, key, { auth: { persistSession: false } });
    await publicRequestLimit(db, request, key, 'confirm-deletion', 10, 600);
    // Atomically snapshot cleanup paths and remove reviews/chats. Retry resumes
    // those paths even when the original review row has already been removed.
    const { data: prepared, error } = await db.rpc('prepare_saved_review_deletion', { p_token: token });
    if (error || !prepared) throw new HavenRequestError('Unable to prepare deletion. Please contact the team if this continues.', 503);
    if (prepared.error) return json({ ok: false, error: prepared.error }, 400);
    if (!Array.isArray(prepared.paths) || !Number.isSafeInteger(prepared.deleted) || typeof prepared.requestId !== 'string' || typeof prepared.email !== 'string') {
      throw new HavenRequestError('Unable to complete deletion.', 503);
    }
    if (prepared.paths.length) {
      const { error: cleanupError } = await db.storage.from('tmh-screenshots').remove(prepared.paths);
      if (cleanupError) throw new HavenRequestError('Your saved review records were removed, but screenshot cleanup is still pending. Retry this confirmation to finish, or contact the team.', 503);
    }
    const { data: completed, error: completionError } = await db.rpc('complete_saved_review_deletion', { p_request: prepared.requestId });
    if (completionError) throw new HavenRequestError('Deletion cleanup finished, but confirmation could not be saved. Retry this confirmation.', 503);
    if (completed === true) await sendDeletionConfirmation(prepared.email,requestId);
    return json({ ok: true, deleted: prepared.deleted });
  } catch (error) {
    if (error instanceof HavenRequestError) {
      if (error.status === 429) headers['Retry-After'] = String(error.retryAfter || 600);
      return json({ ok: false, error: error.message }, error.status);
    }
    logEvent('error','confirm-data-deletion.diagnostic_4',requestId);
    return json({ ok: false, error: 'Unable to complete deletion. Please try again or contact the team.' }, 503);
  }
}));

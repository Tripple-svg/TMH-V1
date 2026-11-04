import {logEvent} from '../_shared/logger.ts';
import {observe} from '../_shared/observability.ts';
import { internalHeaders } from '../_shared/internal-auth.js';
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.118.0';

import { invocationFailure } from '../_shared/resend-delivery.js';
import { requireAdmin, AdminAuthError,readAdminBody } from '../_shared/admin-auth.ts';
import { runAdminMutation } from '../_shared/admin-audit.ts';
import { PUBLIC_ORIGINS as ORIGINS } from '../_shared/cors.ts';

const PURCHASE_FIELDS = 'id,email,reference,amount,created_at,thankyou_sent,thankyou_sent_at,thankyou_attempted_at,thankyou_last_error,thankyou_email_id';

serve(observe('admin-retry-purchase-email',async (req) => {
  const origin = req.headers.get('origin');
  const allowed = origin && ORIGINS.includes(origin);
  const headers = {
    'Content-Type': 'application/json', 'Cache-Control': 'no-store', Vary: 'Origin',
    ...(allowed?{'Access-Control-Allow-Origin':origin!}:{}),
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers:{...headers,...(status===429?{'Retry-After':'60'}:{})} });
  if (origin && !allowed) return json({ ok: false, error: 'Origin not allowed' }, 403);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (req.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405);
  try {

    const url = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !serviceKey) return json({ ok: false, error: 'Server misconfigured' }, 500);
    const body = await readAdminBody(req);
    const supabase=createClient(url,serviceKey,{auth:{persistSession:false}}),actor=await requireAdmin(supabase,req,serviceKey);
    if (body?.action === 'checkConfiguration') {
      const { data, error } = await createClient(url, serviceKey, { auth: { persistSession: false } }).functions.invoke('send-purchase-thankyou', {
        body: { action: 'checkConfiguration' }, headers: internalHeaders(serviceKey),
      });
      if (error || data?.ok !== true) return json({ ok: false, ...await invocationFailure(data, error) }, 502);
      return json(data);
    }
    const reference = typeof body?.reference === 'string' ? body.reference.trim() : '';
    if (!/^UNSEEN_[A-Za-z0-9_-]{1,120}$/.test(reference)) return json({ ok: false, error: 'Invalid purchase reference' }, 400);
    const { data: purchase, error } = await supabase.from('playbook_purchases').select(PURCHASE_FIELDS)
      .eq('reference', reference).maybeSingle();
    if (error) return json({ ok: false, error: 'Could not load purchase delivery status. Apply the purchase delivery migration and retry.' }, 500);
    if (!purchase) return json({ ok: false, error: 'Purchase not found' }, 404);
    if (purchase.thankyou_sent === true) return json({ ok: true, skipped: 'already sent', purchase });
    const {error:auditError}=await runAdminMutation(supabase,req,serviceKey,actor,'purchase_email_retry',String(purchase.id));
    if(auditError)return json({ok:false,error:'Could not record the email retry. Please retry.'},503);
    // Only the stored recipient can be used; the browser cannot redirect email.
    const { data, error: sendError } = await supabase.functions.invoke('send-purchase-thankyou', {
      body: { email: purchase.email, reference: purchase.reference },
      headers: internalHeaders(serviceKey),
    });
    const { data: updated, error: updateError } = await supabase.from('playbook_purchases').select(PURCHASE_FIELDS)
      .eq('reference', reference).maybeSingle();
    if (updateError || !updated) return json({ ok: false, error: 'Could not confirm the saved delivery status. Refresh before retrying.' }, 500);
    if (sendError || data?.ok !== true || updated.thankyou_sent !== true) {
      const diagnostic = await invocationFailure(data, sendError);
      if (!updated.thankyou_last_error) {
        await runAdminMutation(supabase,req,serviceKey,actor,'purchase_email_error',String(purchase.id),{code:diagnostic.code});
        updated.thankyou_last_error = diagnostic.code;
      }
      return json({ ok: false, ...diagnostic, purchase: updated }, 502);
    }
    return json({ ok: true, purchase: updated });
  } catch (error) {
    if(error instanceof AdminAuthError)return json({ok:false,error:error.message},error.status);
    logEvent('error','admin-retry-purchase-email.diagnostic_1');
    return json({ ok: false, error: 'Unable to retry the purchase email' }, 500);
  }
}));

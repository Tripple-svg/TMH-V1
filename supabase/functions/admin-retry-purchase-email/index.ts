import { internalHeaders } from '../_shared/internal-auth.js';
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.118.0';

import { invocationFailure } from '../_shared/resend-delivery.js';

const PURCHASE_FIELDS = 'id,email,reference,amount,created_at,thankyou_sent,thankyou_sent_at,thankyou_attempted_at,thankyou_last_error,thankyou_email_id';
const ORIGINS = ['https://themarketinghaven.xyz', 'https://www.themarketinghaven.xyz'];

serve(async (req) => {
  const origin = req.headers.get('origin');
  const allowed = origin && (ORIGINS.includes(origin) || /^http:\/\/localhost:\d+$/.test(origin));
  const headers = {
    'Content-Type': 'application/json', 'Cache-Control': 'no-store', Vary: 'Origin',
    'Access-Control-Allow-Origin': allowed ? origin! : ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (req.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405);
  if (origin && !allowed) return json({ ok: false, error: 'Origin not allowed' }, 403);
  try {
    const password = Deno.env.get('ADMIN_PASSWORD');
    const url = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!password || !url || !serviceKey) return json({ ok: false, error: 'Server misconfigured' }, 500);
    const body = await req.json().catch(() => null);
    if (body?.password !== password) return json({ ok: false, error: 'Unauthorised' }, 401);
    if (body?.action === 'checkConfiguration') {
      const { data, error } = await createClient(url, serviceKey, { auth: { persistSession: false } }).functions.invoke('send-purchase-thankyou', {
        body: { action: 'checkConfiguration' }, headers: internalHeaders(serviceKey),
      });
      if (error || data?.ok !== true) return json({ ok: false, ...await invocationFailure(data, error) }, 502);
      return json(data);
    }
    const reference = typeof body?.reference === 'string' ? body.reference.trim() : '';
    if (!/^UNSEEN_[A-Za-z0-9_-]{1,120}$/.test(reference)) return json({ ok: false, error: 'Invalid purchase reference' }, 400);
    const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });
    const { data: purchase, error } = await supabase.from('playbook_purchases').select(PURCHASE_FIELDS)
      .eq('reference', reference).maybeSingle();
    if (error) return json({ ok: false, error: 'Could not load purchase delivery status. Apply the purchase delivery migration and retry.' }, 500);
    if (!purchase) return json({ ok: false, error: 'Purchase not found' }, 404);
    if (purchase.thankyou_sent === true) return json({ ok: true, skipped: 'already sent', purchase });
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
        await supabase.from('playbook_purchases').update({ thankyou_last_error: diagnostic.code }).eq('id', purchase.id).eq('thankyou_sent', false);
        updated.thankyou_last_error = diagnostic.code;
      }
      return json({ ok: false, ...diagnostic, purchase: updated }, 502);
    }
    return json({ ok: true, purchase: updated });
  } catch {
    console.error('admin-retry-purchase-email: processing_failed');
    return json({ ok: false, error: 'Unable to retry the purchase email' }, 500);
  }
});

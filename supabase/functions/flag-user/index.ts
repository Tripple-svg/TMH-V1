import {logEvent} from '../_shared/logger.ts';
import {observe} from '../_shared/observability.ts';
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.118.0';
import { applyAutomaticFlag, drainModerationNotifications, ModerationError } from '../_shared/haven-moderation.ts';
import { requireAdmin, AdminAuthError,readAdminBody } from '../_shared/admin-auth.ts';
import { runAdminMutation } from '../_shared/admin-audit.ts';
import { PUBLIC_ORIGINS as ORIGINS } from '../_shared/cors.ts';
import { isInternalRequest } from '../_shared/internal-auth.js';

const STATUSES = ['white', 'yellow', 'red'];

serve(observe('flag-user',async (req) => {
  const origin = req.headers.get('origin');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json', 'Cache-Control': 'no-store', Vary: 'Origin',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
  if (origin && ORIGINS.includes(origin)) headers['Access-Control-Allow-Origin'] = origin;
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers:{...headers,...(status===429?{'Retry-After':'60'}:{})} });
  if (origin && !ORIGINS.includes(origin)) return json({ ok: false, error: 'Origin not allowed' }, 403);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (req.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405);

  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) return json({ ok: false, error: 'Server misconfigured' }, 500);
  try {
    const body = await readAdminBody(req);
    const supabase = createClient(url, key, { auth: { persistSession: false } });
    const serviceCaller = isInternalRequest(req,key);
    if(body?.source==='ai'){
      if(!serviceCaller)return json({ok:false,error:'Internal service authentication required'},401);
      if(body.action)return json({ok:false,error:'Invalid automatic moderation action'},400);
    }
    const actor=body?.source==='ai'?null:await requireAdmin(supabase,req,key);

    if (body?.action === 'retryNotifications') {
      const {error}=await runAdminMutation(supabase,req,key,actor!,'moderation_retry','notification_queue');
      if(error)return json({ok:false,error:'Could not record the notification retry.'},503);
      // Drain committed delivery work without changing anyone's access status.
      const delivery = await drainModerationNotifications(supabase);
      return json({ ok: !delivery.deliveryPending, ...delivery,
        ...(delivery.deliveryPending ? { error: `Flag emails are pending (${delivery.deliveryErrors?.join(', ') || 'more queued notifications'}). Review Resend Logs, then retry.` } : {}),
      }, delivery.deliveryPending ? 502 : 200);
    }

    if (body?.source === 'ai') {
      if (!serviceCaller) return json({ ok: false, error: 'Internal service authentication required' }, 401);
      if (body.status && body.status !== 'yellow') return json({ ok: false, error: 'Automatic moderation can only issue a warning' }, 400);
      const result = await applyAutomaticFlag(supabase, {
        reviewId: body.reviewId, visitorId: body.visitorId, sessionId: body.sessionId, eventKey: body.eventKey, reason: body.reason,
      });
      return json({ ok: true, ...result });
    }

    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : null;
    const visitorId = typeof body?.visitorId === "string" ? body.visitorId : null;
    const status = body?.status;
    const reason = body?.reason == null ? null : typeof body.reason === "string" ? body.reason.trim() || null : undefined;
    if (Boolean(email) === Boolean(visitorId)) return json({ ok: false, error: "Provide one email or visitorId" }, 400);
    if (email && (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) return json({ ok: false, error: "Invalid email" }, 400);
    if (visitorId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(visitorId)) return json({ ok: false, error: "Invalid visitorId" }, 400);
    if (body.sessionId != null && (typeof body.sessionId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.sessionId))) return json({ ok: false, error: 'Invalid sessionId' }, 400);
    if (!STATUSES.includes(status)) return json({ ok: false, error: "Invalid flag status" }, 400);
    if (reason === undefined || (reason && reason.length > 2000)) return json({ ok: false, error: "Invalid flag reason (maximum 2000 characters)" }, 400);
    const { data, error } = await runAdminMutation(supabase,req,key,actor!,'moderation_update',visitorId||'selected_review',{
      email,visitor_id:visitorId,status,reason,session_id:body.sessionId||null,
    });
    if (error) {
      const code = error.code === "P0002" ? 404 : error.code === "22023" ? 400 : 503;
      return json({ ok: false, error: code === 404 ? "User not found" : "Unable to update moderation. Apply the moderation migration and retry." }, code);
    }
    if (!data || !STATUSES.includes(data.flagStatus)) return json({ ok: false, error: "Unable to update moderation" }, 500);
    const delivery = await drainModerationNotifications(supabase, { reviewId: data.reviewId, visitorId: data.visitorId });
    const saved = { review: data.review, visitor: data.visitor, flagStatus: data.flagStatus, deliveryPending: delivery.deliveryPending, deliveryErrors: delivery.deliveryErrors || [] };
    if (delivery.deliveryPending) return json({ ok: false, ...saved, error: `Flag saved, but notifications are pending (${delivery.deliveryErrors?.join(', ') || 'delivery diagnostic unavailable'}). Review Resend Logs, then retry.` }, 502);
    return json({ ok: true, ...saved });
  } catch (error) {
    if(error instanceof AdminAuthError)return json({ok:false,error:error.message},error.status);
    if (error instanceof ModerationError) return json({ ok: false, error: error.message }, error.status);
    logEvent('error','flag-user.diagnostic_1');
    return json({ ok: false, error: 'Unable to update flag' }, 500);
  }
}));

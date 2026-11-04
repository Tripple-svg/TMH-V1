import {logEvent} from '../_shared/logger.ts';
import {observe} from '../_shared/observability.ts';
// supabase/functions/admin-update-lead/index.ts
// Admin-only endpoint for follow-up edits and confirmed lead deletion.
// Whitelists the columns that can be updated.

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.118.0';
import { PUBLIC_ORIGINS as ALLOWED_ORIGINS } from '../_shared/cors.ts';
import { internalHeaders } from '../_shared/internal-auth.js';
import { invocationFailure } from '../_shared/resend-delivery.js';
import { requireAdmin, AdminAuthError,readAdminBody } from '../_shared/admin-auth.ts';
import { runAdminMutation } from '../_shared/admin-audit.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

const ALLOWED_FOLLOWUP_STATUS = ['pending', 'contacted', 'booked', 'closed', 'lost'];
const WELCOME_FIELDS = 'id,email,welcome_email_sent,welcome_email_id,welcome_email_attempted_at,welcome_email_last_error';

function corsHeaders(origin: string | null) {
  return {
    ...(origin && ALLOWED_ORIGINS.includes(origin)?{'Access-Control-Allow-Origin':origin}:{}),
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
}

function json(body: unknown, origin: string | null, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...(status===429?{'Retry-After':'60'}:{}) },
  });
}

serve(observe('admin-update-lead',async (req) => {
  const origin = req.headers.get('origin');

  if (origin && !ALLOWED_ORIGINS.includes(origin)) return json({ ok: false, error: 'Origin not allowed' }, origin, 403);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(origin) });
  if (req.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, origin, 405);

  try {
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      return json({ ok: false, error: 'Server misconfigured' }, origin, 500);
    }

    const body = await readAdminBody(req);
        const reviewId = typeof body?.reviewId === 'string' ? body.reviewId : '';

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    const actor=await requireAdmin(supabase,req,SERVICE_ROLE_KEY);
    if(body.action==='unlockVerification'){
      if(typeof body.visitorId!=='string'||!/^[a-f0-9-]{36}$/i.test(body.visitorId))return json({ok:false,error:'Select a saved visitor.'},origin,400);
      const {data,error}=await runAdminMutation(supabase,req,SERVICE_ROLE_KEY,actor,'verification_unlock',body.visitorId);
      return json(error?{ok:false,error:'Verification attempts could not be reset.'}:{ok:true,reset:data?.reset||0},origin,error?503:200);
    }
    if (body.action === 'updateInquiry') {
      const allowed = ['action','sessionId','expectedRevision','status','owner','notes','followupOn'];
      const followup = body.followupOn;
      if (Object.keys(body).some(key => !allowed.includes(key))
        || typeof body.sessionId !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(body.sessionId)
        || !Number.isSafeInteger(body.expectedRevision) || body.expectedRevision<0
        || !['new','reviewing','contacted','booked','closed','lost'].includes(body.status)
        || typeof body.owner !== 'string' || body.owner.length>80 || typeof body.notes !== 'string' || body.notes.length>4000
        || (followup !== null && (typeof followup !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(followup)
          || !Number.isFinite(Date.parse(followup)) || new Date(followup).toISOString().slice(0,10)!==followup))) {
        return json({ ok:false,error:'Check the inquiry status, owner, notes and follow-up date.' },origin,400);
      }
      const {data,error}=await runAdminMutation(supabase,req,SERVICE_ROLE_KEY,actor,'inquiry_update',body.sessionId,{
        revision:body.expectedRevision,status:body.status,owner:body.owner.trim(),notes:body.notes,followup,
      });
      if(error) return json({ok:false,error:error.code==='P0002'?'Team inquiry not found.':'Could not save the inquiry. Check the migration and retry.'},origin,error.code==='P0002'?404:503);
      if(data?.conflict) return json({ok:false,code:'conflict',error:'Another team member updated this inquiry. Your draft is still here. Copy it if needed, then reload the saved details.',session:data.session},origin,409);
      return data?.session ? json({ok:true,session:data.session},origin) : json({ok:false,error:'Inquiry update could not be confirmed.'},origin,503);
    }
    if (!reviewId || reviewId.length > 200) return json({ ok: false, error: 'Missing reviewId' }, origin, 400);

    if (body.action === 'retryWelcome') {
      if (Object.keys(body).some(key => !['action',  'reviewId'].includes(key))) {
        return json({ ok: false, error: 'Select a saved review to retry its email.' }, origin, 400);
      }
      const { data: review, error: readError } = await supabase.from('brand_reviews').select(WELCOME_FIELDS).eq('id', reviewId).maybeSingle();
      if (readError) return json({ ok: false, error: 'Could not load the saved review email status. Check the email migration and retry.' }, origin, 503);
      if (!review) return json({ ok: false, error: 'Review not found' }, origin, 404);
      if (review.welcome_email_sent === true) return json({ ok: true, skipped: 'already accepted', review }, origin);
      const {error:auditError}=await runAdminMutation(supabase,req,SERVICE_ROLE_KEY,actor,'review_email_retry',reviewId);
      if(auditError)return json({ok:false,error:'Could not record the email retry. Please retry.'},origin,503);
      // The sender reloads the stored name, source and email by ID. A browser
      // cannot change the recipient or choose an earlier template on retry.
      const { data: delivery, error: sendError } = await supabase.functions.invoke('send-welcome-email', {
        body: { record: { id: review.id } }, headers: internalHeaders(SERVICE_ROLE_KEY),
      });
      const { data: updated, error: statusError } = await supabase.from('brand_reviews').select(WELCOME_FIELDS).eq('id', reviewId).maybeSingle();
      if (statusError || !updated) return json({ ok: false, error: 'Could not confirm the saved review email status. Refresh before retrying.' }, origin, 503);
      if (sendError || delivery?.ok !== true || updated.welcome_email_sent !== true) {
        const diagnostic = await invocationFailure(delivery, sendError);
        if (!updated.welcome_email_last_error && updated.welcome_email_sent !== true) {
          await runAdminMutation(supabase,req,SERVICE_ROLE_KEY,actor,'review_email_error',reviewId,{code:diagnostic.code});
          updated.welcome_email_last_error = diagnostic.code;
        }
        return json({ ok: false, ...diagnostic, review: updated }, origin, 502);
      }
      return json({ ok: true, review: updated }, origin);
    }

    if (body.action === 'delete') return json({ok:false,error:'Request deletion in Admin Activity. A different admin must approve it.'},origin,409);
    if (body.action !== undefined && body.action !== 'update') {
      return json({ ok: false, error: 'Invalid action' }, origin, 400);
    }

    // Whitelist-safe update object.
    const update: Record<string, unknown> = {};

    if (typeof body.followupStatus === 'string') {
      if (!ALLOWED_FOLLOWUP_STATUS.includes(body.followupStatus)) {
        return json({ ok: false, error: 'Invalid followupStatus' }, origin, 400);
      }
      update.followup_status = body.followupStatus;
    }
    if (typeof body.followupNotes === 'string') {
      update.followup_notes = body.followupNotes.slice(0, 4000);
    }
    if (typeof body.convertedToCall === 'boolean') {
      update.converted_to_call = body.convertedToCall;
    }
    if (typeof body.convertedToPurchase === 'boolean') {
      update.converted_to_purchase = body.convertedToPurchase;
    }
    if (body.dealValue === null || typeof body.dealValue === 'number') {
      update.deal_value = body.dealValue;
    }
    if (typeof body.callBookedAt === 'string') {
      update.call_booked_at = body.callBookedAt;
    }

    const { data, error } = await runAdminMutation(supabase,req,SERVICE_ROLE_KEY,actor,'review_update',reviewId,update);

    if (error) {
      logEvent('error','admin-update-lead.diagnostic_3');
      return json({ ok: false, error: 'Could not save the lead. Please retry.' }, origin, 500);
    }
    if (!data) {
      return json({ ok: false, error: 'Review not found' }, origin, 404);
    }

    return json({ ok: true, review: data }, origin);
  } catch (err) {
    if(err instanceof AdminAuthError)return json({ok:false,error:err.message},origin,err.status);
    logEvent('error','admin-update-lead.diagnostic_4');
    return json({ ok: false, error: 'Could not update the lead. Please retry.' }, origin, 500);
  }
}));

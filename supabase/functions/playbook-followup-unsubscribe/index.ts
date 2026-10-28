import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.118.0';
import { verifyFollowupOptOut } from '../_shared/purchase-followup.ts';
import { escapeHtml } from '../_shared/email-template.js';

serve(async request => {
  const headers = { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'", 'X-Content-Type-Options': 'nosniff' };
  const page = (message: string, status = 200, action?: string) => new Response('<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Playbook email preferences</title><body style="margin:0;padding:40px 20px;background:#f2f1ee;color:#18181b;font:16px/1.7 Arial,sans-serif;"><main style="max-width:520px;margin:auto;"><p style="font-size:12px;letter-spacing:2px;">THE MARKETING HAVEN</p><h1 style="font:normal 30px Georgia,serif;">Playbook check-in</h1><p>' + escapeHtml(message) + '</p>' + (action ? '<form method="post" action="' + escapeHtml(action) + '"><button style="border:0;border-radius:6px;background:#18181b;color:#fff;padding:14px 20px;font:inherit;">Cancel this check-in</button></form>' : '') + '<p style="font-size:12px;">Need help? info@themarketinghaven.xyz</p></main></body></html>', { status, headers });
  if (!['GET', 'POST'].includes(request.method)) return page('Method not allowed.', 405);
  const projectUrl = Deno.env.get('SUPABASE_URL'), serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!projectUrl || !serviceKey) return page('Email preferences are temporarily unavailable. Please contact the team.', 503);
  try {
    if (request.url.length > 2048) return page('This preference link is invalid or expired. Contact the team if you need help.', 400);
    const url = new URL(request.url);
    const id = await verifyFollowupOptOut(url, Deno.env.get('PURCHASE_FOLLOWUP_UNSUBSCRIBE_SECRET')?.trim() || serviceKey);
    if (!id) return page('This preference link is invalid or expired. Contact the team if you need help.', 400);
    // GET is a confirmation page, never a mutation triggered by a mail scanner.
    if (request.method === 'GET') return page('You can cancel the one-time Playbook check-in below. This does not change your purchase access or support messages.', 200, url.pathname + url.search);
    const db = createClient(projectUrl, serviceKey, { auth: { persistSession: false } });
    const { error } = await db.rpc('cancel_playbook_followup', { p_id: id });
    if (error) return page('Your preference could not be saved. Please try again or contact the team.', 503);
    return page('This one-time Playbook check-in has been cancelled. If it was already being sent, delivery may still complete. Your purchase access remains available.');
  } catch {
    return page('Email preferences are temporarily unavailable. Please contact the team.', 503);
  }
});

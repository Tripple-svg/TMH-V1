import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.118.0';
import { handleZohoSupportWebhook } from '../_shared/zoho-support.ts';

serve(async request => {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) return new Response(JSON.stringify({ ok: false, error: 'Server misconfigured' }), {
    status: 503, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
  return await handleZohoSupportWebhook(request, createClient(url, key, { auth: { persistSession: false } }),
    Deno.env.get('ZOHO_WEBHOOK_ENROLLMENT_TOKEN'));
});

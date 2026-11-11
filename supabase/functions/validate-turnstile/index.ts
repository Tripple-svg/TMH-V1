import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.118.0';
import { observe } from '../_shared/observability.ts';
import { readBoundedJson, verifyOrigin, responseHeaders, HavenRequestError } from '../_shared/haven-request.ts';
import { publicRequestLimit } from '../_shared/abuse-limits.ts';
import { TURNSTILE_ACTIONS, verifyTurnstile } from '../_shared/turnstile.ts';

Deno.serve(observe('validate-turnstile',async request => {
  const json = (body: unknown, status = 200, retryAfter?: number) => Response.json(body, {
    status, headers: { ...responseHeaders(request), ...(retryAfter ? { 'Retry-After': String(retryAfter) } : {}) },
  });
  try {
    verifyOrigin(request);
    if (request.method === 'OPTIONS') return new Response(null,{status:204,headers:responseHeaders(request)});
    if (request.method !== 'POST') return json({success:false,error:'Method not allowed'},405);
    const {token, action} = await readBoundedJson(request,4096);
    if (!TURNSTILE_ACTIONS.includes(action)) throw new HavenRequestError('Select a valid verification action.');
    const url = Deno.env.get('SUPABASE_URL'), key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !key) throw new HavenRequestError('Security verification is temporarily unavailable.',503);
    await publicRequestLimit(createClient(url,key,{auth:{persistSession:false}}),request,key,'captcha-validation');
    await verifyTurnstile(request,token,action);
    return json({success:true});
  } catch (error) {
    if (error instanceof HavenRequestError) return json({success:false,error:error.message},error.status,error.retryAfter);
    return json({success:false,error:'Security verification is temporarily unavailable. Please try again.'},503);
  }
}));

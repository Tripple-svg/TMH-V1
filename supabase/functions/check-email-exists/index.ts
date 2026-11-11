import {logEvent} from '../_shared/logger.ts';
import {observe} from '../_shared/observability.ts';
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.118.0';
import { enforceReviewRequestBudget, reviewAttemptGate, reviewLimitDetails } from '../_shared/review-attempts.ts';
import { HavenRequestError,readBoundedJson } from '../_shared/haven-request.ts';
import { deletionEmailHash, deletionNetworkHash, deletionReviewDenial, reviewDeletionStatus } from '../_shared/deletion-tombstone.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

const ALLOWED_ORIGINS = [
  'https://themarketinghaven.xyz',
  'https://www.themarketinghaven.xyz',
  'http://localhost:5173',
  'http://localhost:5175',
];

const EMAIL_PATTERN = /^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?)+$/i;

function corsHeaders(origin: string | null) {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };

  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
  }

  return headers;
}

function response(exists: boolean, origin: string | null, flagStatus?: string, status = 200) {
  return new Response(JSON.stringify({ exists, ...(flagStatus ? { flag_status: flagStatus } : {}) }), {
    status,
    headers: { ...corsHeaders(origin), 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function escapeIlikePattern(value: string) {
  return value.replace(/[\\%_]/g, '\\$&');
}

serve(observe('check-email-exists',async (req,requestId) => {
  const origin = req.headers.get('origin');

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }

  if (req.method !== 'POST') {
    return response(false, origin);
  }

  let includeFlag = false;
  if (origin && !ALLOWED_ORIGINS.includes(origin)) return response(false,origin,undefined,403);
  try {
    const payload = await readBoundedJson(req,4096);
    const email = typeof payload?.email === 'string' ? payload.email.trim() : '';
    includeFlag = payload?.includeFlag === true;
    // Email membership is used by the review form; moderation status requires
    // the private visitor/review capability checked by Haven, never an email lookup.
    if(includeFlag)return response(false,origin,undefined,403);
    if (payload.action === 'review-limit-status' && SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
      const db = createClient(SUPABASE_URL,SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
      await reviewAttemptGate(db,req,SUPABASE_SERVICE_ROLE_KEY);
      return new Response(JSON.stringify({allowed:true}),{headers:{...corsHeaders(origin),'Content-Type':'application/json','Cache-Control':'no-store'}});
    }

    if (!EMAIL_PATTERN.test(email) || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return response(false, origin, undefined, includeFlag ? 400 : 200);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });
    await enforceReviewRequestBudget(supabase,req,SUPABASE_SERVICE_ROLE_KEY,'email-lookup');
    const [emailHash, networkHash] = await Promise.all([
      deletionEmailHash(email, SUPABASE_SERVICE_ROLE_KEY), deletionNetworkHash(req, SUPABASE_SERVICE_ROLE_KEY),
    ]);
    const deletionStatus = await reviewDeletionStatus(supabase, email, emailHash, networkHash);
    const emailDenial = deletionStatus === 'email' && deletionReviewDenial(deletionStatus);
    if (emailDenial) return deletionDenied(origin, emailDenial);

    // ILIKE with escaped wildcards is an exact case-insensitive comparison:
    // lower(email) = lower(trimmed input).
    const { data: reviews, error } = await supabase
      .from('brand_reviews')
      .select(includeFlag ? 'id, flag_status' : 'id')
      .ilike('email', escapeIlikePattern(email))
      .limit(1);

    if (error) {
      logEvent('error','check-email-exists.diagnostic_1',requestId);
      return response(false, origin, undefined, includeFlag ? 503 : 200);
    }

    // The SDK parser cannot infer this conditional projection; the select above
    // still limits the actual response to id and the optional public status.
    const matched = reviews as unknown as Array<{id:string;flag_status?:string}> | null;
    const flagStatus = includeFlag ? matched?.[0]?.flag_status || 'white' : undefined;
    if (reviews?.length) await reviewAttemptGate(supabase,req,SUPABASE_SERVICE_ROLE_KEY,true);
    const networkDenial = !reviews?.length && deletionReviewDenial(deletionStatus);
    if (networkDenial) return deletionDenied(origin, networkDenial);
    return response(Boolean(reviews?.length), origin, flagStatus);
  } catch (error) {
    if(error instanceof HavenRequestError){
      const limit = error.status===429 ? reviewLimitDetails(error) : null;
      return new Response(JSON.stringify({exists:false,error:error.message,...limit}),{status:error.status,headers:{...corsHeaders(origin),'Content-Type':'application/json','Cache-Control':'no-store',...(limit?.retryAfter?{'Retry-After':String(limit.retryAfter)}:{})}});
    }
    logEvent('error','check-email-exists.diagnostic_2',requestId);
    return response(false, origin, undefined, includeFlag ? 503 : 200);
  }
}));

function deletionDenied(origin: string | null, denial: { code: string; error: string }) {
  return Response.json({ exists: false, ...denial }, {
    status: 403, headers: { ...corsHeaders(origin), 'Cache-Control': 'no-store' },
  });
}

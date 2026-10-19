import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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

serve(async (req) => {
  const origin = req.headers.get('origin');

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }

  if (req.method !== 'POST') {
    return response(false, origin);
  }

  let includeFlag = false;
  try {
    const payload = await req.json().catch(() => null);
    const email = typeof payload?.email === 'string' ? payload.email.trim() : '';
    includeFlag = payload?.includeFlag === true;

    if (!EMAIL_PATTERN.test(email) || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return response(false, origin, undefined, includeFlag ? 400 : 200);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    // ILIKE with escaped wildcards is an exact case-insensitive comparison:
    // lower(email) = lower(trimmed input).
    const { data: reviews, error } = await supabase
      .from('brand_reviews')
      .select(includeFlag ? 'id, flag_status' : 'id')
      .ilike('email', escapeIlikePattern(email))
      .limit(1);

    if (error) {
      console.error('check-email-exists lookup failed:', error);
      return response(false, origin, undefined, includeFlag ? 503 : 200);
    }

    const flagStatus = includeFlag ? reviews?.[0]?.flag_status || 'white' : undefined;
    return response(Boolean(reviews?.length), origin, flagStatus);
  } catch (error) {
    console.error('check-email-exists failed:', error);
    return response(false, origin, undefined, includeFlag ? 503 : 200);
  }
});

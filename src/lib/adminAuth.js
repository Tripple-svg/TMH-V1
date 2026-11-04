import { createClient } from '@supabase/supabase-js';
import { readAdminAuthLink } from './adminPassword';

// Supabase may remove callback fragments while initializing. Retain only safe
// status metadata so an expired link cannot be confused with an existing login.
export const initialAdminAuthLink = readAdminAuthLink(typeof window !== 'undefined' ? window.location.href : '');

// Auth owns this session. It is separate from visitor/review/purchase storage.
// No admin password or service-role credential is embedded in the frontend.
export const adminSupabase = createClient(
  import.meta.env.VITE_SUPABASE_URL || 'https://placeholder.supabase.co',
  import.meta.env.VITE_SUPABASE_ANON_KEY || 'placeholder-anon-key',
  { auth: { storageKey:'tmh_admin_auth_v1',storage:typeof window!=='undefined'?window.sessionStorage:undefined,persistSession:true,autoRefreshToken:true,detectSessionInUrl:true },
    global:{fetch:(input,init={})=>fetch(input,{...init,signal:typeof AbortSignal?.timeout==='function'?init.signal&&typeof AbortSignal.any==='function'?AbortSignal.any([init.signal,AbortSignal.timeout(20000)]):AbortSignal.timeout(20000):init.signal})} },
);

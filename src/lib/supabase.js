import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
}

// The regular browser client. Use this for all public visitor interactions.
export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-anon-key',
  // Public visitors use private review/purchase capabilities, not Auth sessions.
  // Never consume an admin invitation fragment or persist it in visitor storage.
  {auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}},
);

export default supabase;

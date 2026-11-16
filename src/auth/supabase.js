// Lazy Supabase client. Reads VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY from .env; without them the app
// runs in "local mode" (accounts and circuits stay in this PC's localStorage).
const env = (typeof import.meta !== 'undefined' && import.meta.env) || {};
const URL = (env.VITE_SUPABASE_URL || '').trim();
const KEY = (env.VITE_SUPABASE_ANON_KEY || '').trim();

export const hasSupabase = () => /^https?:\/\//.test(URL) && KEY.length > 20;

let clientPromise = null;
export function getSupabase() {
  if (!hasSupabase()) return Promise.resolve(null);
  if (!clientPromise) {
    clientPromise = import('@supabase/supabase-js')
      .then(({ createClient }) => createClient(URL, KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } }))
      .catch(() => null);
  }
  return clientPromise;
}

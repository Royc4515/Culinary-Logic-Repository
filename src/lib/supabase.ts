import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        // Same-tab redirect flow. Use the implicit grant so Supabase returns the
        // session token directly in the URL (#access_token=...) on return — the
        // client reads it synchronously with no code-exchange round-trip that can
        // fail. detectSessionInUrl consumes it automatically on load.
        flowType: 'implicit',
        detectSessionInUrl: true,
        persistSession: true,
        autoRefreshToken: true,
      },
    })
  : null;

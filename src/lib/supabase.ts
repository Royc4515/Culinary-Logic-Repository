import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        // The OAuth popup flow in App.tsx hands the session back via the URL
        // hash (#access_token=...). That only exists under the implicit flow;
        // the supabase-js default (PKCE) returns ?code=... instead, which the
        // popup never forwards — leaving the main window stuck on "Connecting".
        flowType: 'implicit',
        // Let the popup's manual hash->postMessage->setSession path be the sole
        // handler so the client doesn't race to consume the hash itself.
        detectSessionInUrl: false,
        persistSession: true,
        autoRefreshToken: true,
      },
    })
  : null;

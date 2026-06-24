import { createClient } from '@supabase/supabase-js';

// These are the project's PUBLIC client credentials (anon key), which Supabase
// is designed to ship in the browser — access is gated by row-level security,
// so committing them is safe. They are hardcoded as the source of truth because
// the Vercel VITE_SUPABASE_ANON_KEY env var had been misconfigured (set to an
// unrelated Google API key), which broke auth with "Invalid API key". An env
// var may still override the URL for non-production environments.
const DEFAULT_SUPABASE_URL = 'https://xsyrpowvawcfqeduhpvv.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhzeXJwb3d2YXdjZnFlZHVocHZ2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgxNzg1MzEsImV4cCI6MjA5Mzc1NDUzMX0.SU0xnNi6FkzYnDZWNthTA3-e_A4aj5f44xSFhvvHGTQ';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL;
const supabaseAnonKey = DEFAULT_SUPABASE_ANON_KEY;

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

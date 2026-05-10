import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { ChefHat } from 'lucide-react';

export default function AuthScreen() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGoogleAuth = async () => {
    if (!supabase) return;
    
    setLoading(true);
    setError(null);

    try {
      // VITE_APP_URL pins the redirect to the canonical deployment URL (e.g. Vercel),
      // preventing proxies / AI Studio tunnels from becoming the OAuth redirect target.
      const appUrl = import.meta.env.VITE_APP_URL;
      let redirectUrl = appUrl ? appUrl.replace(/\/$/, '') + '/' : window.location.origin + '/';
      if (!appUrl && window.location.origin.includes('localhost')) {
         redirectUrl = 'https://ais-dev-gn6pqrdw3kgg5hn4ye6mvn-80745451536.europe-west1.run.app/';
      }

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUrl,
          skipBrowserRedirect: true,
        }
      });
      if (error) throw error;

      if (data?.url) {
        const authWindow = window.open(data.url, 'oauth_popup', 'width=600,height=700');
        if (!authWindow) {
           setError('Please allow popups to sign in with Google.');
           setLoading(false);
        }
      }
    } catch (err: any) {
      setError(err.message || 'Authentication failed');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-stone-50 flex flex-col justify-center items-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden border border-stone-100">
        <div className="p-8">
          <div className="flex flex-col items-center justify-center mb-8">
            <div className="w-16 h-16 bg-[var(--color-accent)] rounded-full flex items-center justify-center text-white mb-4 shadow-lg">
              <ChefHat className="w-8 h-8" />
            </div>
            <h1 className="font-serif text-3xl font-bold tracking-tight uppercase">CLR<span className="text-[var(--color-accent)]">.</span></h1>
            <p className="text-stone-500 text-sm mt-2 font-medium tracking-widest uppercase">Culinary Logic Repository</p>
          </div>

          <div className="space-y-4">
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-600 rounded-lg text-xs font-medium">
                {error}
              </div>
            )}
            
            <button
              onClick={handleGoogleAuth}
              disabled={loading}
              className="w-full py-3 px-4 bg-white border border-stone-200 text-stone-700 text-sm font-bold uppercase tracking-widest rounded-xl hover:bg-stone-50 transition-colors disabled:opacity-50 mt-4 flex items-center justify-center gap-3 shadow-sm"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              {loading ? 'Connecting...' : 'Continue with Google'}
            </button>
          </div>
          
          <div className="mt-8 text-center text-xs text-stone-500 font-medium">
            <p>You must authenticate to access your culinary database.</p>
            <p className="mt-2 text-[10px]">
              Be sure to add <strong className="text-stone-700">{window.location.origin}</strong> to your Google OAuth Authorized Redirect URIs in the Google Cloud Console.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

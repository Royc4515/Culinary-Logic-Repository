import React, { useState, useEffect, useCallback } from 'react';
import { X, Send, Copy, Check, ExternalLink, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  session: any;
  onLinked: () => void;
}

type Step = 'idle' | 'loading' | 'ready' | 'linked' | 'error';

interface LinkData {
  token: string;
  deep_link: string;
  expires_at: string;
}

const BACKEND_URL = (import.meta as any).env?.VITE_BACKEND_URL || '';

export default function TelegramLinkModal({ isOpen, onClose, session, onLinked }: Props) {
  const [step, setStep] = useState<Step>('idle');
  const [linkData, setLinkData] = useState<LinkData | null>(null);
  const [copied, setCopied] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const fetchLink = useCallback(async () => {
    if (!session?.access_token || !BACKEND_URL) return;
    setStep('loading');
    setErrorMsg('');
    try {
      const res = await fetch(`${BACKEND_URL}/api/link/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setLinkData(data);
      setStep('ready');
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to generate link');
      setStep('error');
    }
  }, [session]);

  // Auto-fetch when modal opens
  useEffect(() => {
    if (isOpen && step === 'idle') {
      fetchLink();
    }
    if (!isOpen) {
      setStep('idle');
      setLinkData(null);
      setCopied(false);
      setErrorMsg('');
    }
  }, [isOpen]);

  // Poll telegram_links table to detect when the user has linked
  useEffect(() => {
    if (step !== 'ready' || !supabase || !session) return;

    const interval = setInterval(async () => {
      const { data } = await supabase
        .from('telegram_links')
        .select('telegram_id')
        .eq('user_id', session.user.id)
        .maybeSingle();

      if (data?.telegram_id) {
        setStep('linked');
        clearInterval(interval);
        setTimeout(() => {
          onLinked();
          onClose();
        }, 1500);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [step, session, onLinked, onClose]);

  const manualCommand = linkData ? `/start ${linkData.token}` : '';

  const handleCopy = async () => {
    if (!manualCommand) return;
    await navigator.clipboard.writeText(manualCommand);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl border border-stone-100 overflow-hidden">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1 rounded-full text-stone-400 hover:text-stone-600 hover:bg-stone-100 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="p-8">
          {/* Header */}
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-[#229ED9] rounded-full flex items-center justify-center shrink-0">
              <Send className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="font-serif text-lg font-bold uppercase tracking-tight">Connect Telegram</h2>
              <p className="text-stone-400 text-xs font-medium">Save restaurants straight from a chat</p>
            </div>
          </div>

          {step === 'loading' && (
            <div className="flex flex-col items-center py-8 gap-3 text-stone-400">
              <Loader2 className="w-6 h-6 animate-spin" />
              <p className="text-xs font-medium uppercase tracking-widest">Generating link…</p>
            </div>
          )}

          {step === 'error' && (
            <div className="space-y-4">
              <div className="p-3 bg-red-50 border border-red-200 text-red-600 rounded-lg text-xs font-medium">
                {errorMsg}
              </div>
              <button
                onClick={fetchLink}
                className="w-full py-2.5 bg-stone-800 text-white text-xs font-bold uppercase tracking-widest rounded-xl hover:bg-stone-700 transition-colors"
              >
                Try again
              </button>
            </div>
          )}

          {step === 'linked' && (
            <div className="flex flex-col items-center py-8 gap-3 text-emerald-600">
              <Check className="w-8 h-8" />
              <p className="text-sm font-bold uppercase tracking-widest">Linked!</p>
            </div>
          )}

          {step === 'ready' && linkData && (
            <div className="space-y-5">
              {/* Primary: open in Telegram app */}
              <a
                href={linkData.deep_link}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-center gap-2 w-full py-3 bg-[#229ED9] text-white text-xs font-bold uppercase tracking-widest rounded-xl hover:bg-[#1a8bbf] transition-colors shadow-md"
              >
                <ExternalLink className="w-4 h-4" />
                Open in Telegram
              </a>

              {/* Divider */}
              <div className="flex items-center gap-3 text-stone-300">
                <div className="flex-1 h-px bg-stone-100" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-stone-400">or manually</span>
                <div className="flex-1 h-px bg-stone-100" />
              </div>

              {/* Fallback: copy command */}
              <div>
                <p className="text-xs text-stone-500 mb-2">
                  Open <strong className="text-stone-700">Telegram</strong> → find your bot → paste and send:
                </p>
                <div className="flex items-center gap-2 p-3 bg-stone-50 border border-stone-200 rounded-xl">
                  <code className="flex-1 text-xs font-mono text-stone-700 break-all">{manualCommand}</code>
                  <button
                    onClick={handleCopy}
                    className="shrink-0 p-1.5 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-200 transition-colors"
                    title="Copy command"
                  >
                    {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <p className="text-[10px] text-stone-400 text-center">
                Waiting for confirmation… this page will update automatically.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

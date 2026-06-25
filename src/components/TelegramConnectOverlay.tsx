import React, { useState } from 'react';
import { X, Send, Copy, Check, ExternalLink } from 'lucide-react';

interface Props {
  deepLink: string;
  token: string;
  onClose: () => void;
}

export default function TelegramConnectOverlay({ deepLink, token, onClose }: Props) {
  const [copied, setCopied] = useState(false);
  const command = `/start link_${token}`;

  // Derive the bot username from the deep link so we can also offer Telegram Web
  // (for laptops with no Telegram desktop app installed).
  const botUsername = (deepLink.match(/t\.me\/([^/?]+)/) || [])[1] || '';
  const webLink = botUsername
    ? `https://web.telegram.org/k/#@${botUsername}`
    : 'https://web.telegram.org/';

  // The app deep link only works where the Telegram app is installed. On a
  // laptop it dead-ends, so we lead with Telegram Web there instead.
  const isMobile =
    typeof navigator !== 'undefined' &&
    /Android|iPhone|iPad|iPod|Mobile|Windows Phone|webOS/i.test(navigator.userAgent);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard may be unavailable; the command is still shown to copy manually */
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl border border-stone-100 overflow-hidden">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1 rounded-full text-stone-400 hover:text-stone-600 hover:bg-stone-100 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-[#229ED9] rounded-full flex items-center justify-center shrink-0">
              <Send className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="font-serif text-lg font-bold uppercase tracking-tight">Connect Telegram</h2>
              <p className="text-stone-400 text-xs font-medium">Waiting for confirmation — expires in 5 min</p>
            </div>
          </div>

          {isMobile ? (
            /* Mobile: the app deep link opens Telegram and sends the command. */
            <a
              href={deepLink}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-center gap-2 w-full py-3 bg-[#229ED9] text-white text-xs font-bold uppercase tracking-widest rounded-xl hover:bg-[#1a8bbf] transition-colors shadow-md mb-5"
            >
              <ExternalLink className="w-4 h-4" />
              Open in Telegram
            </a>
          ) : (
            /* Laptop/desktop: lead with Telegram Web (the app link dead-ends with
               no desktop app). Copy the command on click so the user just pastes. */
            <>
              <a
                href={webLink}
                target="_blank"
                rel="noreferrer"
                onClick={handleCopy}
                className="flex items-center justify-center gap-2 w-full py-3 bg-[#229ED9] text-white text-xs font-bold uppercase tracking-widest rounded-xl hover:bg-[#1a8bbf] transition-colors shadow-md mb-2"
              >
                <ExternalLink className="w-4 h-4" />
                Open Telegram Web
              </a>
              <p className="text-[11px] text-stone-400 text-center mb-4 leading-relaxed">
                Opens your bot in Telegram Web and copies the command — just{' '}
                <strong className="text-stone-600">paste it in the chat and send</strong>.
              </p>
              <a
                href={deepLink}
                target="_blank"
                rel="noreferrer"
                className="block text-center text-[10px] font-medium text-stone-400 hover:text-stone-600 underline mb-5"
              >
                Have the Telegram desktop app? Open it instead
              </a>
            </>
          )}

          {/* Divider */}
          <div className="flex items-center gap-3 text-stone-300 mb-5">
            <div className="flex-1 h-px bg-stone-100" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-stone-400">or manually</span>
            <div className="flex-1 h-px bg-stone-100" />
          </div>

          {/* Fallback: copy command */}
          <p className="text-xs text-stone-500 mb-2">
            Open <strong className="text-stone-700">Telegram</strong> → find your bot → paste and send:
          </p>
          <div className="flex items-center gap-2 p-3 bg-stone-50 border border-stone-200 rounded-xl">
            <code className="flex-1 text-xs font-mono text-stone-700 break-all">{command}</code>
            <button
              onClick={handleCopy}
              className="shrink-0 p-1.5 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-200 transition-colors"
              title="Copy command"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>

          <p className="text-[10px] text-stone-400 text-center mt-4">
            This page will update automatically once you confirm in Telegram.
          </p>
        </div>
      </div>
    </div>
  );
}

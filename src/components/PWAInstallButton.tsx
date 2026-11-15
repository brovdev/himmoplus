import { Download, Share, X } from 'lucide-react';
import React, { useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export const PWAInstallButton: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  useEffect(() => {
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    setIsInstalled(isStandalone);

    const ua = window.navigator.userAgent.toLowerCase();
    setIsIOS(/iphone|ipad|ipod/.test(ua));

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (isInstalled) return null;

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setIsInstalled(true);
      setDeferredPrompt(null);
    }
  };

  if (deferredPrompt) {
    return (
      <button
        type="button"
        onClick={handleInstall}
        className="inline-flex items-center gap-2 rounded-lg border border-[#E8EEEB] bg-white px-3 py-1.5 text-xs font-medium text-[#123C32] hover:bg-[#F6F8F7] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
      >
        <Download className="h-3.5 w-3.5 text-[#185C46]" />
        {!compact && <span>Installer l’application</span>}
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className="inline-flex items-center gap-2 rounded-lg border border-[#E8EEEB] bg-white px-3 py-1.5 text-xs font-medium text-[#123C32] hover:bg-[#F6F8F7] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Share className="h-3.5 w-3.5 text-[#185C46]" />
          {!compact && <span>Installer sur iOS</span>}
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-sm rounded-xl border border-[#E8EEEB] bg-white p-6">
              <div className="flex items-center justify-between">
                <h3 className="font-display text-base font-semibold text-[#123C32]">Installer IMMOPAY CI sur iOS</h3>
                <button
                  type="button"
                  onClick={() => setShowIOSGuide(false)}
                  className="rounded-lg p-1 text-[#66736D] hover:bg-[#F6F8F7]"
                  aria-label="Fermer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <ol className="mt-3 space-y-2 text-sm text-[#66736D]">
                <li>1. Appuyez sur l’icône <strong className="text-[#123C32]">Partager</strong> dans Safari.</li>
                <li>2. Faites défiler et choisissez <strong className="text-[#123C32]">Sur l’écran d’accueil</strong>.</li>
              </ol>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="mt-5 w-full rounded-lg bg-[#185C46] px-4 py-2 text-sm font-medium text-white hover:bg-[#123C32] transition-colors"
              >
                Compris
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};

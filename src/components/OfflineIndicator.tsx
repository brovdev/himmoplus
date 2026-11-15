import { WifiOff } from 'lucide-react';
import React, { useEffect, useState } from 'react';

export const OfflineIndicator: React.FC = () => {
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);

  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  if (isOnline) return null;

  return (
    <div
      role="status"
      className="fixed bottom-4 left-4 z-50 flex items-center gap-2 rounded-lg border border-[#E9A23B] bg-[#123C32] px-3.5 py-2 text-xs font-medium text-white shadow-sm"
    >
      <WifiOff className="h-3.5 w-3.5 text-[#F0D99A]" />
      <span>Connexion instable ou hors ligne — Les opérations financières attendent la confirmation du serveur.</span>
    </div>
  );
};

import { WifiOff } from 'lucide-react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

export function OfflineIndicator() {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-zinc-900 text-white text-xs font-medium shadow-lg border border-zinc-700"
    >
      <WifiOff className="w-3.5 h-3.5 text-amber-400 shrink-0" />
      <span>Offline mode — saved chats and cached screens remain accessible</span>
    </div>
  );
}

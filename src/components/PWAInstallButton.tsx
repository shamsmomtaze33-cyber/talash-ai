import { useState } from 'react';
import { CheckCircle2, Download, Share, Smartphone, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  compact?: boolean;
}

export function PWAInstallButton({ compact = false }: PWAInstallButtonProps) {
  const { canInstall, isInstalled, isIOS, installApp } = usePWAInstall();
  const [iosGuideOpen, setIosGuideOpen] = useState(false);

  if (isInstalled) {
    return (
      <div className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700">
        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
        <span>Installed as App</span>
      </div>
    );
  }

  if (canInstall) {
    return (
      <button
        type="button"
        onClick={() => void installApp()}
        className={`inline-flex items-center gap-2 font-semibold text-white bg-zinc-900 hover:bg-zinc-800 rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
          compact ? 'px-3 py-1.5 text-xs' : 'px-4 py-2.5 text-xs shadow-xs'
        }`}
      >
        <Download className="w-3.5 h-3.5 text-[#10a37f]" />
        <span>Install TALASH Ai App</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setIosGuideOpen(true)}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-800 bg-zinc-100 hover:bg-zinc-200 border border-zinc-200 rounded-xl px-3 py-1.5 cursor-pointer transition-colors"
        >
          <Share className="w-3.5 h-3.5 text-[#10a37f] shrink-0" />
          <span>Install on iPhone / iPad</span>
        </button>

        {iosGuideOpen && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"
            onClick={() => setIosGuideOpen(false)}
            role="dialog"
            aria-modal="true"
            aria-label="Install TALASH Ai on iOS"
          >
            <div
              className="w-full max-w-sm bg-white rounded-2xl border border-zinc-200 p-5 shadow-2xl space-y-3 text-left"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-zinc-900">Install TALASH Ai on iOS</h3>
                <button
                  type="button"
                  onClick={() => setIosGuideOpen(false)}
                  aria-label="Close iOS install instructions"
                  className="p-1 text-zinc-400 hover:text-zinc-900 rounded-lg cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <ol className="text-xs text-zinc-600 space-y-2 list-decimal pl-4">
                <li>
                  Tap the <strong>Share</strong> icon in Safari&apos;s toolbar.
                </li>
                <li>
                  Scroll down and tap <strong>Add to Home Screen</strong>.
                </li>
                <li>
                  Tap <strong>Add</strong> to launch TALASH Ai full-screen from your Home Screen.
                </li>
              </ol>
            </div>
          </div>
        )}
      </>
    );
  }

  return (
    <div className="inline-flex items-center gap-1.5 text-[11px] text-zinc-500">
      <Smartphone className="w-3.5 h-3.5 text-[#10a37f] shrink-0" />
      <span>Android Install ready in Chrome Menu &rarr; Install app</span>
    </div>
  );
}

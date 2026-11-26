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
      <div className="inline-flex items-center gap-1.5 text-xs font-medium text-cyan-300">
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
        className={`inline-flex items-center gap-2 font-semibold text-white talash-neon-btn rounded-xl transition-all whitespace-nowrap shrink-0 cursor-pointer ${
          compact ? 'px-3 py-1.5 text-xs' : 'px-4 py-2.5 text-xs'
        }`}
      >
        <Download className="w-3.5 h-3.5 text-cyan-200" />
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
          className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-200 bg-slate-900/80 hover:bg-sky-500/20 border border-sky-500/30 rounded-xl px-3 py-1.5 cursor-pointer transition-colors"
        >
          <Share className="w-3.5 h-3.5 text-sky-400 shrink-0" />
          <span>Install on iPhone / iPad</span>
        </button>

        {iosGuideOpen && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
            onClick={() => setIosGuideOpen(false)}
            role="dialog"
            aria-modal="true"
            aria-label="Install TALASH Ai on iOS"
          >
            <div
              className="w-full max-w-sm talash-glass-card rounded-2xl p-5 space-y-3 text-left text-slate-100"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-white">Install TALASH Ai on iOS</h3>
                <button
                  type="button"
                  onClick={() => setIosGuideOpen(false)}
                  aria-label="Close iOS install instructions"
                  className="p-1 text-slate-400 hover:text-white rounded-lg cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <ol className="text-xs text-slate-300 space-y-2 list-decimal pl-4">
                <li>
                  Tap the <strong className="text-white">Share</strong> icon in Safari&apos;s toolbar.
                </li>
                <li>
                  Scroll down and tap <strong className="text-white">Add to Home Screen</strong>.
                </li>
                <li>
                  Tap <strong className="text-white">Add</strong> to launch TALASH Ai full-screen from your Home Screen.
                </li>
              </ol>
            </div>
          </div>
        )}
      </>
    );
  }

  return (
    <div className="inline-flex items-center gap-1.5 text-[11px] text-slate-400">
      <Smartphone className="w-3.5 h-3.5 text-sky-400 shrink-0" />
      <span>Android Install ready in Chrome Menu &rarr; Install app</span>
    </div>
  );
}

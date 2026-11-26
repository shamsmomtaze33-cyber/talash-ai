import { useEffect, useState } from 'react';
import { Check, Copy, Download, Share2, X } from 'lucide-react';

interface ShareDialogProps {
  isOpen: boolean;
  title: string;
  content: string;
  fullTranscript?: string;
  onClose: () => void;
}

export function ShareDialog({
  isOpen,
  title,
  content,
  fullTranscript,
  onClose,
}: ShareDialogProps) {
  const [copiedMode, setCopiedMode] = useState<'reply' | 'transcript' | null>(null);
  const canSystemShare =
    typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const copyText = async (text: string, mode: 'reply' | 'transcript') => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedMode(mode);
      window.setTimeout(() => setCopiedMode(null), 1800);
    } catch {
      // Ignore clipboard failures
    }
  };

  const handleDownloadMarkdown = () => {
    const body = fullTranscript
      ? `# ${title}\n\n${fullTranscript}`
      : `# ${title}\n\n${content}`;
    const blob = new Blob([body], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `talash-ai-share-${new Date().toISOString().slice(0, 10)}.md`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleSystemShare = async () => {
    if (!canSystemShare) return;
    try {
      await navigator.share({
        title: `TALASH Ai · ${title}`,
        text: content,
      });
    } catch {
      // User dismissed native share sheet
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="share-dialog-title"
    >
      <div
        className="w-full max-w-lg talash-glass-card rounded-2xl overflow-hidden text-slate-100"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-sky-500/20 flex items-center justify-between">
          <div>
            <h2 id="share-dialog-title" className="text-base font-semibold text-white">
              Share TALASH Ai Response
            </h2>
            <p className="text-xs text-slate-400 mt-0.5 truncate max-w-sm">{title}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close share dialog"
            className="p-1.5 text-slate-400 hover:text-white hover:bg-sky-500/15 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="p-4 rounded-xl bg-[#040916]/90 border border-sky-500/25 max-h-52 overflow-y-auto text-xs leading-relaxed text-slate-200 whitespace-pre-wrap">
            {content}
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => void copyText(content, 'reply')}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white talash-neon-btn rounded-xl transition-all whitespace-nowrap cursor-pointer"
            >
              {copiedMode === 'reply' ? (
                <>
                  <Check className="w-3.5 h-3.5 text-cyan-200" />
                  <span>Copied Reply</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy Reply</span>
                </>
              )}
            </button>

            {fullTranscript && (
              <button
                type="button"
                onClick={() => void copyText(fullTranscript, 'transcript')}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-slate-200 bg-slate-900/80 border border-sky-500/30 hover:border-sky-400/60 hover:text-white rounded-xl transition-colors whitespace-nowrap cursor-pointer"
              >
                {copiedMode === 'transcript' ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Copied Full Chat</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy Full Chat</span>
                  </>
                )}
              </button>
            )}

            <button
              type="button"
              onClick={handleDownloadMarkdown}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-slate-200 bg-slate-900/80 border border-sky-500/30 hover:border-sky-400/60 hover:text-white rounded-xl transition-colors whitespace-nowrap cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export .md</span>
            </button>

            {canSystemShare && (
              <button
                type="button"
                onClick={() => void handleSystemShare()}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-slate-200 bg-slate-900/80 border border-sky-500/30 hover:border-sky-400/60 hover:text-white rounded-xl transition-colors whitespace-nowrap cursor-pointer"
              >
                <Share2 className="w-3.5 h-3.5" />
                <span>Share</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

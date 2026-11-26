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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[2px] p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="share-dialog-title"
    >
      <div
        className="w-full max-w-lg bg-white rounded-2xl border border-zinc-200 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-zinc-200 flex items-center justify-between">
          <div>
            <h2 id="share-dialog-title" className="text-base font-semibold text-zinc-900">
              Share TALASH Ai Response
            </h2>
            <p className="text-xs text-zinc-500 mt-0.5 truncate max-w-sm">{title}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close share dialog"
            className="p-1.5 text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="p-4 rounded-xl bg-[#f9f9f9] border border-zinc-200 max-h-52 overflow-y-auto text-xs leading-relaxed text-zinc-700 whitespace-pre-wrap">
            {content}
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => void copyText(content, 'reply')}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-zinc-900 hover:bg-zinc-800 rounded-full transition-colors whitespace-nowrap cursor-pointer"
            >
              {copiedMode === 'reply' ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
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
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-zinc-800 bg-white border border-zinc-200 hover:bg-zinc-50 rounded-full transition-colors whitespace-nowrap cursor-pointer"
              >
                {copiedMode === 'transcript' ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
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
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-zinc-800 bg-white border border-zinc-200 hover:bg-zinc-50 rounded-full transition-colors whitespace-nowrap cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export .md</span>
            </button>

            {canSystemShare && (
              <button
                type="button"
                onClick={() => void handleSystemShare()}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-zinc-800 bg-white border border-zinc-200 hover:bg-zinc-50 rounded-full transition-colors whitespace-nowrap cursor-pointer"
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

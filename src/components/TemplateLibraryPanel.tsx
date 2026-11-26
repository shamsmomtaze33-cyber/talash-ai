import React, { useMemo, useState } from 'react';
import { BookmarkPlus, Check, Play, Search, Trash2, X } from 'lucide-react';
import type {
  GeminiModelId,
  PromptTemplate,
  ResponseFormat,
  TemplateScope,
  ThinkingDepth,
} from '../types';

interface TemplateLibraryPanelProps {
  templates: PromptTemplate[];
  currentPrompt: string;
  currentSystemInstruction: string;
  currentModel: GeminiModelId;
  currentThinkingLevel: ThinkingDepth;
  currentResponseFormat: ResponseFormat;
  isSaveFormOpen: boolean;
  onToggleSaveForm: (open: boolean) => void;
  onSaveTemplate: (input: { name: string; scope: TemplateScope }) => void;
  onApplyTemplate: (template: PromptTemplate, runImmediately: boolean) => void;
  onDeleteTemplate: (id: string) => void;
  onClose?: () => void;
}

function getScopeLabel(scope: TemplateScope): string {
  if (scope === 'system') return 'System Instruction';
  if (scope === 'prompt') return 'Prompt Pattern';
  return 'Full Pattern';
}

export function TemplateLibraryPanel({
  templates,
  currentPrompt,
  currentSystemInstruction,
  currentModel,
  currentThinkingLevel,
  currentResponseFormat,
  isSaveFormOpen,
  onToggleSaveForm,
  onSaveTemplate,
  onApplyTemplate,
  onDeleteTemplate,
  onClose,
}: TemplateLibraryPanelProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [scopeFilter, setScopeFilter] = useState<'all' | TemplateScope>('all');

  // Save form state
  const [templateName, setTemplateName] = useState('');
  const [templateScope, setTemplateScope] = useState<TemplateScope>('full');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [justSavedId, setJustSavedId] = useState<string | null>(null);

  const filteredTemplates = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return templates.filter((tpl) => {
      if (scopeFilter !== 'all' && tpl.scope !== scopeFilter) return false;
      if (!q) return true;
      return (
        tpl.name.toLowerCase().includes(q) ||
        tpl.prompt.toLowerCase().includes(q) ||
        tpl.systemInstruction.toLowerCase().includes(q)
      );
    });
  }, [searchQuery, scopeFilter, templates]);

  const handleSaveSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = templateName.trim();
    if (!trimmedName) {
      setSaveError('Enter a template name.');
      return;
    }
    if (templateScope === 'system' && !currentSystemInstruction.trim()) {
      setSaveError('Add a system instruction in the sidebar before saving a System template.');
      return;
    }
    if (templateScope === 'prompt' && !currentPrompt.trim()) {
      setSaveError('Enter a prompt in the editor before saving a Prompt template.');
      return;
    }
    if (
      templateScope === 'full' &&
      !currentPrompt.trim() &&
      !currentSystemInstruction.trim()
    ) {
      setSaveError('Enter a prompt or system instruction before saving.');
      return;
    }

    onSaveTemplate({ name: trimmedName, scope: templateScope });
    setSaveError(null);
    setTemplateName('');
    setJustSavedId('saved');
    window.setTimeout(() => setJustSavedId(null), 1800);
    onToggleSaveForm(false);
  };

  return (
    <section className="talash-glass-card rounded-2xl overflow-hidden text-slate-100">
      {/* Header */}
      <div className="px-5 py-3.5 border-b border-sky-500/20 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <h2 className="font-semibold text-white text-sm">Template Library</h2>
          <span aria-hidden="true">·</span>
          <span className="tabular-nums">{templates.length} saved</span>
          {justSavedId && (
            <>
              <span aria-hidden="true">·</span>
              <span className="inline-flex items-center gap-1 text-cyan-300 font-medium">
                <Check className="w-3.5 h-3.5" />
                <span>Template saved</span>
              </span>
            </>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setSaveError(null);
              onToggleSaveForm(!isSaveFormOpen);
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white talash-neon-btn rounded-xl transition-all whitespace-nowrap shrink-0 cursor-pointer"
          >
            <BookmarkPlus className="w-3.5 h-3.5" />
            <span>{isSaveFormOpen ? 'Cancel Save' : 'Save Current'}</span>
          </button>

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close Template Library"
              className="p-1.5 text-slate-400 hover:text-white hover:bg-sky-500/15 rounded-md transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Save Current Template Form */}
      {isSaveFormOpen && (
        <form
          onSubmit={handleSaveSubmit}
          className="p-5 bg-[#040916]/85 border-b border-sky-500/20 space-y-4"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label htmlFor="template-name" className="block text-xs font-semibold text-white">
                Template Name
              </label>
              <input
                id="template-name"
                type="text"
                value={templateName}
                onChange={(e) => {
                  setTemplateName(e.target.value);
                  setSaveError(null);
                }}
                placeholder="e.g., Concise Bug Triage, Friendly Explainer"
                className="w-full px-3 py-2 text-xs bg-[#081229] border border-sky-500/30 rounded-xl text-white placeholder:text-slate-500 focus:outline-none focus:border-sky-400"
              />
            </div>

            <div className="space-y-1.5">
              <span className="block text-xs font-semibold text-white">What to Save</span>
              <div className="grid grid-cols-3 gap-1 p-1 bg-[#081229] border border-sky-500/25 rounded-xl">
                {(
                  [
                    { id: 'full', label: 'Full Pattern' },
                    { id: 'system', label: 'System Only' },
                    { id: 'prompt', label: 'Prompt Only' },
                  ] as const
                ).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setTemplateScope(item.id);
                      setSaveError(null);
                    }}
                    className={`px-2 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                      templateScope === item.id
                        ? 'talash-neon-btn text-white'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="text-xs text-slate-400 flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>Captures:</span>
            {templateScope !== 'prompt' && (
              <span className="text-slate-200">
                System instruction ({currentSystemInstruction.trim() ? 'populated' : 'empty'})
              </span>
            )}
            {templateScope !== 'system' && (
              <span className="text-slate-200">
                Prompt ({currentPrompt.trim() ? `${currentPrompt.trim().length} chars` : 'empty'})
              </span>
            )}
            {templateScope === 'full' && (
              <span className="text-sky-300 font-mono">
                {currentModel} · {currentThinkingLevel} · {currentResponseFormat.toUpperCase()}
              </span>
            )}
          </div>

          {saveError && <p className="text-xs font-medium text-red-400">{saveError}</p>}

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => onToggleSaveForm(false)}
              className="px-3.5 py-2 text-xs font-medium text-slate-300 hover:text-white hover:bg-sky-500/15 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-semibold text-white talash-neon-btn rounded-xl transition-all whitespace-nowrap cursor-pointer"
            >
              Save to Library
            </button>
          </div>
        </form>
      )}

      {/* Filter Toolbar */}
      <div className="px-5 py-3 border-b border-sky-500/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-1 p-1 bg-[#040916] border border-sky-500/25 rounded-xl w-fit">
          {(
            [
              { id: 'all', label: 'All' },
              { id: 'full', label: 'Full Pattern' },
              { id: 'system', label: 'System' },
              { id: 'prompt', label: 'Prompt' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setScopeFilter(tab.id)}
              className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                scopeFilter === tab.id
                  ? 'talash-neon-btn text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="relative">
          <Search className="w-3.5 h-3.5 text-sky-400/70 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search templates..."
            className="pl-8 pr-3 py-1.5 text-xs bg-[#040916] border border-sky-500/30 rounded-xl text-white placeholder:text-slate-500 focus:outline-none focus:border-sky-400 w-full sm:w-56"
          />
        </div>
      </div>

      {/* Templates List */}
      {filteredTemplates.length === 0 ? (
        <div className="p-8 text-center space-y-2">
          <p className="text-sm font-medium text-white">No templates match this filter</p>
          <p className="text-xs text-slate-400">
            Save your current prompt or system instruction above, or clear your search filter.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-sky-500/15">
          {filteredTemplates.map((tpl) => (
            <div
              key={tpl.id}
              className="px-5 py-4 flex flex-col sm:flex-row sm:items-start justify-between gap-4 hover:bg-sky-500/5 transition-colors"
            >
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-semibold text-white text-sm">{tpl.name}</span>
                  <span className="text-slate-500" aria-hidden="true">
                    ·
                  </span>
                  <span className="text-sky-400">{getScopeLabel(tpl.scope)}</span>
                  {tpl.scope === 'full' && (
                    <>
                      <span className="text-slate-500" aria-hidden="true">
                        ·
                      </span>
                      <span className="font-mono text-[11px] text-slate-400">{tpl.model}</span>
                    </>
                  )}
                </div>

                {tpl.systemInstruction && (
                  <p className="text-xs text-slate-300 line-clamp-2">
                    <span className="font-medium text-sky-300">System: </span>
                    {tpl.systemInstruction}
                  </p>
                )}

                {tpl.prompt && (
                  <p className="text-xs text-slate-300 line-clamp-2">
                    <span className="font-medium text-sky-300">Prompt: </span>
                    {tpl.prompt}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => onApplyTemplate(tpl, false)}
                  className="px-3 py-1.5 text-xs font-medium text-slate-200 bg-slate-900/80 border border-sky-500/30 hover:border-sky-400 hover:text-white rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                >
                  Apply
                </button>
                {tpl.prompt && (
                  <button
                    type="button"
                    onClick={() => onApplyTemplate(tpl, true)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white talash-neon-btn rounded-xl transition-all whitespace-nowrap cursor-pointer"
                  >
                    <Play className="w-3 h-3 fill-current" />
                    <span>Apply & Run</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onDeleteTemplate(tpl.id)}
                  aria-label={`Delete ${tpl.name}`}
                  className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-950/60 rounded-md transition-colors cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

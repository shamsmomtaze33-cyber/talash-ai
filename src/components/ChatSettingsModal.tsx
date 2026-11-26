import { useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  Check,
  Code2,
  Compass,
  Cpu,
  Database,
  Download,
  Globe,
  History,
  KeyRound,
  Layers,
  LogOut,
  MessageSquare,
  RotateCcw,
  Search,
  ShieldCheck,
  Sliders,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import {
  DEFAULT_CONCISE_SYSTEM_INSTRUCTION,
  MODEL_OPTIONS,
  MODEL_PROFILES,
  TONE_PRESETS,
  type ActiveView,
  type AuthUser,
  type ChatThread,
  type GeminiModelId,
  type GoogleSearchMode,
  type ModelProfileId,
  type RunHistoryEntry,
  type ServerCapabilities,
  type ThinkingDepth,
} from '../types';
import { PWAInstallButton } from './PWAInstallButton';
import { TalashLogoMark } from './TalashLogo';

export type SettingsSection =
  | 'navigation'
  | 'history'
  | 'general'
  | 'model'
  | 'personalization'
  | 'data';

interface ChatSettingsModalProps {
  isOpen: boolean;
  initialSection?: SettingsSection;
  onClose: () => void;
  activeView: ActiveView;
  onNavigateView: (view: ActiveView) => void;
  currentUser: AuthUser | null;
  sessionToken: string | null;
  onOpenAdminDashboard?: () => void;
  onLogout: () => void;
  profileId: ModelProfileId;
  model: GeminiModelId;
  thinkingLevel: ThinkingDepth;
  selectedToneId: string;
  chatSystemInstruction: string;
  showMetrics: boolean;
  googleSearchMode: GoogleSearchMode;
  verifyMode: boolean;
  capabilities: ServerCapabilities | null;
  threads: ChatThread[];
  activeThreadId: string;
  history: RunHistoryEntry[];
  onSelectProfile: (profileId: ModelProfileId) => void;
  onChangeThinking: (depth: ThinkingDepth) => void;
  onSelectTone: (toneId: string) => void;
  onChangeCustomPersona: (instruction: string) => void;
  onToggleMetrics: (show: boolean) => void;
  onChangeGoogleSearchMode: (mode: GoogleSearchMode) => void;
  onToggleVerifyMode: (enabled: boolean) => void;
  onOpenChatThread: (threadId: string) => void;
  onDeleteChatThread: (threadId: string) => void;
  onLoadWorkbenchRun: (entry: RunHistoryEntry) => void;
  onDeleteWorkbenchRun: (id: string) => void;
  onExportActiveChat: () => void;
  onClearAllChats: () => void;
  onClearHistory: () => void;
}

function formatDateTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function ChatSettingsModal({
  isOpen,
  initialSection = 'navigation',
  onClose,
  activeView,
  onNavigateView,
  currentUser,
  sessionToken,
  onOpenAdminDashboard,
  onLogout,
  profileId,
  model,
  thinkingLevel,
  selectedToneId,
  chatSystemInstruction,
  showMetrics,
  googleSearchMode,
  verifyMode,
  capabilities,
  threads,
  activeThreadId,
  history,
  onSelectProfile,
  onChangeThinking,
  onSelectTone,
  onChangeCustomPersona,
  onToggleMetrics,
  onChangeGoogleSearchMode,
  onToggleVerifyMode,
  onOpenChatThread,
  onDeleteChatThread,
  onLoadWorkbenchRun,
  onDeleteWorkbenchRun,
  onExportActiveChat,
  onClearAllChats,
  onClearHistory,
}: ChatSettingsModalProps) {
  const [section, setSection] = useState<SettingsSection>(initialSection);
  const [historySubTab, setHistorySubTab] = useState<'chats' | 'workbench'>('chats');
  const [historySearch, setHistorySearch] = useState('');
  const [passwordPanelOpen, setPasswordPanelOpen] = useState(false);
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwBusy, setPwBusy] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwSuccess, setPwSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setSection(initialSection);
    }
  }, [initialSection, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  const savedChats = useMemo(() => {
    const q = historySearch.trim().toLowerCase();
    return threads
      .filter((t) => t.messages.length > 0 || t.id === activeThreadId)
      .filter((t) => {
        if (!q) return true;
        return (
          t.title.toLowerCase().includes(q) ||
          t.messages.some((m) => m.text.toLowerCase().includes(q))
        );
      })
      .slice(0, 21);
  }, [activeThreadId, historySearch, threads]);

  const previousSavedCount = useMemo(
    () => threads.filter((t) => t.id !== activeThreadId && t.messages.length > 0).length,
    [activeThreadId, threads]
  );

  const filteredWorkbenchHistory = useMemo(() => {
    const q = historySearch.trim().toLowerCase();
    if (!q) return history;
    return history.filter(
      (item) =>
        item.prompt.toLowerCase().includes(q) ||
        item.output.toLowerCase().includes(q) ||
        item.model.toLowerCase().includes(q)
    );
  }, [history, historySearch]);

  if (!isOpen) return null;

  const activeModelOption = MODEL_OPTIONS.find((m) => m.id === model) ?? MODEL_OPTIONS[0];
  const openAiConnected = Boolean(capabilities?.openai?.connected);
  const isSuperAdmin = currentUser?.role === 'super_admin';

  const navItems: Array<{ id: SettingsSection; label: string; icon: typeof Sliders }> = [
    { id: 'navigation', label: 'Menu & Account', icon: Compass },
    { id: 'history', label: 'Chat History', icon: History },
    { id: 'general', label: 'Preferences', icon: Sliders },
    { id: 'model', label: 'AI & Routing', icon: Cpu },
    { id: 'personalization', label: 'Personalization', icon: Sparkles },
    { id: 'data', label: 'Data & App', icon: Database },
  ];

  const workspaceDestinations: Array<{
    id: ActiveView;
    label: string;
    subtitle: string;
    icon: typeof MessageSquare;
  }> = [
    {
      id: 'chat',
      label: 'TALASH Ai Chat',
      subtitle: 'Fast streaming answers in Pashto, Arabic & English',
      icon: MessageSquare,
    },
    {
      id: 'learning',
      label: 'Islamic Learning Center',
      subtitle: 'Authentic Hadiths, Duas, Salah & Quranic guidance in Pashto',
      icon: BookOpen,
    },
    {
      id: 'workbench',
      label: 'Prompt Workbench',
      subtitle: 'Single-prompt testing, templates & SDK snippets',
      icon: Code2,
    },
    {
      id: 'batch',
      label: 'Batch CSV Runner',
      subtitle: 'Compare prompts and models across CSV datasets',
      icon: Layers,
    },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/45 backdrop-blur-[3px] p-3 sm:p-5"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-modal-title"
    >
      <div
        className="w-full max-w-3xl bg-white rounded-3xl border border-zinc-200/90 shadow-[0_24px_70px_rgba(0,0,0,0.18)] overflow-hidden flex flex-col max-h-[88dvh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-5 sm:px-6 py-4 bg-white border-b border-zinc-200/80 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <TalashLogoMark className="w-9 h-9 rounded-xl shrink-0" />
            <div className="min-w-0">
              <h2
                id="settings-modal-title"
                className="text-base font-semibold text-zinc-900 leading-tight"
              >
                TALASH Ai Settings &amp; Menu
              </h2>
              <p className="text-[11px] text-zinc-500 truncate">
                Navigation, Chat History, AI Routing, Account &amp; Owner Controls
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close settings"
            className="w-8 h-8 inline-flex items-center justify-center text-zinc-500 hover:text-zinc-900 bg-zinc-100/80 hover:bg-zinc-200/80 rounded-xl transition-colors cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-col sm:flex-row flex-1 min-h-0">
          {/* Left Navigation Rail */}
          <nav
            aria-label="Settings sections"
            className="sm:w-56 shrink-0 bg-[#f7f7f8] border-b sm:border-b-0 sm:border-r border-zinc-200/80 p-3 flex sm:flex-col gap-1.5 overflow-x-auto"
          >
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = section === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSection(item.id)}
                  className={`flex items-center justify-between gap-2.5 px-3 py-2.5 rounded-xl text-xs transition-all whitespace-nowrap shrink-0 cursor-pointer border ${
                    active
                      ? 'bg-white text-zinc-900 font-semibold border-zinc-200/90 shadow-xs'
                      : 'border-transparent text-zinc-600 font-medium hover:bg-zinc-200/50 hover:text-zinc-900'
                  }`}
                >
                  <span className="inline-flex items-center gap-2.5">
                    <Icon
                      className={`w-4 h-4 shrink-0 ${active ? 'text-[#10a37f]' : 'text-zinc-500'}`}
                    />
                    <span>{item.label}</span>
                  </span>
                  {item.id === 'history' && (
                    <span className="font-mono text-[11px] text-zinc-500 tabular-nums">
                      {previousSavedCount}/20
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* Right Settings Content */}
          <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6 bg-white">
            {section === 'navigation' && (
              <div className="space-y-6">
                {/* Account Card */}
                {currentUser && (
                  <section className="p-4 rounded-2xl border border-zinc-200/90 bg-[#fafafa] space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        {currentUser.avatarUrl ? (
                          <img
                            src={currentUser.avatarUrl}
                            alt={currentUser.name}
                            referrerPolicy="no-referrer"
                            className="w-10 h-10 rounded-full object-cover border border-zinc-200 shrink-0"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-zinc-900 text-white font-semibold text-sm flex items-center justify-center shrink-0">
                            {currentUser.name.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <p className="text-sm font-semibold text-zinc-900 truncate">
                              {currentUser.name}
                            </p>
                            <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200">
                              {currentUser.isImmutableOwner ? 'Owner · Super Admin' : currentUser.role}
                            </span>
                            <span
                              className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-md border ${
                                currentUser.emailVerified
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                  : 'bg-amber-50 text-amber-800 border-amber-200'
                              }`}
                            >
                              {currentUser.emailVerified ? 'Verified' : 'Pending Verification'}
                            </span>
                          </div>
                          <p className="text-xs text-zinc-500 truncate">{currentUser.email}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            setPasswordPanelOpen((prev) => !prev);
                            setPwError(null);
                            setPwSuccess(null);
                          }}
                          className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-zinc-700 hover:text-zinc-900 bg-white hover:bg-zinc-100 border border-zinc-200 rounded-xl whitespace-nowrap shrink-0 cursor-pointer transition-colors"
                        >
                          <KeyRound className="w-3.5 h-3.5" />
                          <span>Password</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            onClose();
                            onLogout();
                          }}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-zinc-700 hover:text-red-700 bg-white hover:bg-red-50 border border-zinc-200 rounded-xl whitespace-nowrap shrink-0 cursor-pointer transition-colors"
                        >
                          <LogOut className="w-3.5 h-3.5" />
                          <span>Sign Out</span>
                        </button>
                      </div>
                    </div>

                    {passwordPanelOpen && (
                      <form
                        onSubmit={async (e) => {
                          e.preventDefault();
                          setPwError(null);
                          setPwSuccess(null);
                          if (newPw.length < 8) {
                            setPwError('New password must be at least 8 characters.');
                            return;
                          }
                          if (newPw !== confirmPw) {
                            setPwError('New passwords do not match.');
                            return;
                          }
                          setPwBusy(true);
                          try {
                            const headers: Record<string, string> = {
                              'Content-Type': 'application/json',
                            };
                            if (sessionToken) headers.Authorization = `Bearer ${sessionToken}`;
                            const res = await fetch('/api/auth/change-password', {
                              method: 'POST',
                              headers,
                              credentials: 'include',
                              body: JSON.stringify({
                                currentPassword: currentPw,
                                newPassword: newPw,
                              }),
                            });
                            const data = await res.json();
                            if (!res.ok) throw new Error(data.error || 'Unable to update password.');
                            setCurrentPw('');
                            setNewPw('');
                            setConfirmPw('');
                            setPwSuccess(data.message || 'Password updated.');
                          } catch (err) {
                            setPwError(err instanceof Error ? err.message : 'Password update failed.');
                          } finally {
                            setPwBusy(false);
                          }
                        }}
                        className="pt-3 border-t border-zinc-200/80 space-y-2.5"
                      >
                        <p className="text-xs font-semibold text-zinc-900">Change Account Password</p>
                        {pwError && (
                          <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-2.5 py-1.5">
                            {pwError}
                          </p>
                        )}
                        {pwSuccess && (
                          <p className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-2.5 py-1.5">
                            {pwSuccess}
                          </p>
                        )}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                          <input
                            type="password"
                            value={currentPw}
                            onChange={(e) => setCurrentPw(e.target.value)}
                            placeholder="Current password"
                            className="px-3 py-2 text-xs bg-white border border-zinc-200 rounded-xl"
                          />
                          <input
                            type="password"
                            required
                            minLength={8}
                            value={newPw}
                            onChange={(e) => setNewPw(e.target.value)}
                            placeholder="New password (8+ chars)"
                            className="px-3 py-2 text-xs bg-white border border-zinc-200 rounded-xl"
                          />
                          <input
                            type="password"
                            required
                            minLength={8}
                            value={confirmPw}
                            onChange={(e) => setConfirmPw(e.target.value)}
                            placeholder="Confirm new password"
                            className="px-3 py-2 text-xs bg-white border border-zinc-200 rounded-xl"
                          />
                        </div>
                        <button
                          type="submit"
                          disabled={pwBusy}
                          className="px-4 py-2 text-xs font-semibold bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl cursor-pointer disabled:opacity-60"
                        >
                          {pwBusy ? 'Updating...' : 'Update Password'}
                        </button>
                      </form>
                    )}
                  </section>
                )}

                {/* Owner Super Admin Control Center Button */}
                {isSuperAdmin && onOpenAdminDashboard && (
                  <section className="p-4 rounded-2xl border border-zinc-900 bg-zinc-900 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-0.5">
                      <div className="inline-flex items-center gap-1.5 text-sm font-semibold">
                        <ShieldCheck className="w-4 h-4 text-[#10a37f]" />
                        <span>Owner &amp; Super Admin Control Center</span>
                      </div>
                      <p className="text-xs text-zinc-300">
                        Manage users, roles, Learning CMS, SEO domain, OAuth callbacks &amp; database backups.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onOpenAdminDashboard();
                      }}
                      className="px-4 py-2 text-xs font-semibold bg-[#10a37f] hover:bg-[#0e8f6e] text-white rounded-xl whitespace-nowrap shrink-0 cursor-pointer transition-colors"
                    >
                      Open Admin Panel
                    </button>
                  </section>
                )}

                {/* Workspace Navigation */}
                <section className="space-y-3">
                  <div>
                    <h3 className="text-sm font-semibold text-zinc-900">TALASH Ai Sections</h3>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      Switch between Chat, Islamic Learning, Prompt Workbench, and Batch CSV.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {workspaceDestinations.map((dest) => {
                      const Icon = dest.icon;
                      const active = activeView === dest.id;
                      return (
                        <button
                          key={dest.id}
                          type="button"
                          onClick={() => {
                            onNavigateView(dest.id);
                            onClose();
                          }}
                          className={`text-left p-3.5 rounded-2xl border transition-all flex items-start gap-3 cursor-pointer ${
                            active
                              ? 'border-zinc-900 bg-zinc-50/90 shadow-2xs'
                              : 'border-zinc-200 hover:border-zinc-400 bg-white'
                          }`}
                        >
                          <div
                            className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                              active ? 'bg-zinc-900 text-[#10a37f]' : 'bg-zinc-100 text-zinc-600'
                            }`}
                          >
                            <Icon className="w-4 h-4" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-zinc-900">{dest.label}</p>
                            <p className="text-[11px] text-zinc-500 leading-snug mt-0.5">
                              {dest.subtitle}
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </section>

                {/* Android / Desktop App Install */}
                <section className="pt-4 border-t border-zinc-200/80 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold text-zinc-900">Install TALASH Ai App</p>
                    <p className="text-[11px] text-zinc-500">
                      Add TALASH Ai to your Android, iOS, or Desktop home screen for offline-ready access.
                    </p>
                  </div>
                  <PWAInstallButton compact />
                </section>
              </div>
            )}

            {section === 'general' && (
              <div className="space-y-6">
                <section className="space-y-3">
                  <div>
                    <h3 className="text-sm font-semibold text-zinc-900">Response Style</h3>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      Control answer structure and depth across all conversations.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 gap-2">
                    {TONE_PRESETS.map((tone) => {
                      const active = selectedToneId === tone.id;
                      return (
                        <button
                          key={tone.id}
                          type="button"
                          onClick={() => onSelectTone(tone.id)}
                          className={`w-full text-left px-4 py-3 rounded-xl border transition-all flex items-center justify-between gap-3 cursor-pointer ${
                            active
                              ? 'border-zinc-900 bg-zinc-50/80'
                              : 'border-zinc-200 hover:border-zinc-300 bg-white'
                          }`}
                        >
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-zinc-900">{tone.label}</p>
                            <p className="text-[11px] text-zinc-500 line-clamp-1 mt-0.5">
                              {tone.instruction}
                            </p>
                          </div>
                          <span
                            className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 transition-colors ${
                              active ? 'bg-zinc-900 text-white' : 'border border-zinc-300 bg-white'
                            }`}
                          >
                            {active && <Check className="w-3 h-3" />}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </section>

                <div className="border-t border-zinc-200/80 pt-5 space-y-5">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Globe className="w-4 h-4 text-[#10a37f] shrink-0" />
                      <p className="text-sm font-medium text-zinc-900">
                        Google Search Grounding
                      </p>
                    </div>
                    <p className="text-xs text-zinc-500">
                      Smart Auto keeps casual/coding chats instant while verifying facts, current events, and Islamic citations live on Google.
                    </p>
                    <div className="grid grid-cols-3 gap-2 pt-1">
                      {(
                        [
                          { id: 'auto', label: 'Smart Auto' },
                          { id: 'always', label: 'Always Search' },
                          { id: 'off', label: 'Off' },
                        ] as const
                      ).map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => onChangeGoogleSearchMode(opt.id)}
                          className={`px-3 py-2 text-xs font-medium rounded-xl border transition-colors cursor-pointer ${
                            googleSearchMode === opt.id
                              ? 'bg-zinc-900 text-white border-zinc-900'
                              : 'bg-white text-zinc-700 border-zinc-200 hover:border-zinc-300'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="border-t border-zinc-100 pt-4 flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-zinc-900">
                        Show token usage details
                      </p>
                      <p className="text-xs text-zinc-500 mt-0.5">
                        Display token counts beside reply timing beneath completed messages.
                      </p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={showMetrics}
                      onClick={() => onToggleMetrics(!showMetrics)}
                      className={`w-11 h-6 rounded-full transition-colors p-0.5 shrink-0 cursor-pointer ${
                        showMetrics ? 'bg-[#10a37f]' : 'bg-zinc-300'
                      }`}
                    >
                      <span
                        className={`block w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${
                          showMetrics ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                </div>
              </div>
            )}

            {section === 'history' && (
              <div className="space-y-4">
                <section className="rounded-2xl border border-zinc-200/85 bg-[#fafafa] p-4 space-y-3.5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold text-zinc-900">Saved History</h3>
                      <p className="text-xs text-zinc-500 mt-0.5 tabular-nums">
                        Up to 20 previous chats stay saved automatically when you start a new chat.
                      </p>
                    </div>

                    <div className="flex items-center gap-1 p-1 bg-zinc-200/70 rounded-xl">
                      <button
                        type="button"
                        onClick={() => setHistorySubTab('chats')}
                        className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                          historySubTab === 'chats'
                            ? 'bg-white text-zinc-900 shadow-xs'
                            : 'text-zinc-600 hover:text-zinc-900'
                        }`}
                      >
                        Chats ({previousSavedCount}/20)
                      </button>
                      <button
                        type="button"
                        onClick={() => setHistorySubTab('workbench')}
                        className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                          historySubTab === 'workbench'
                            ? 'bg-white text-zinc-900 shadow-xs'
                            : 'text-zinc-600 hover:text-zinc-900'
                        }`}
                      >
                        Workbench ({history.length})
                      </button>
                    </div>
                  </div>

                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      value={historySearch}
                      onChange={(e) => setHistorySearch(e.target.value)}
                      placeholder={
                        historySubTab === 'chats'
                          ? 'Search saved chats...'
                          : 'Search workbench runs...'
                      }
                      className="w-full pl-9 pr-3.5 py-2 text-xs bg-white border border-zinc-200 rounded-xl text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:border-zinc-900"
                    />
                  </div>
                </section>

                {historySubTab === 'chats' ? (
                  savedChats.length === 0 ? (
                    <div className="p-8 text-center rounded-2xl border border-zinc-200 bg-[#fafafa] space-y-1.5">
                      <MessageSquare className="w-6 h-6 text-zinc-400 mx-auto" />
                      <p className="text-xs font-semibold text-zinc-800">No saved chats found</p>
                      <p className="text-[11px] text-zinc-500">
                        Start a conversation and tap New Chat—your previous chats remain saved here.
                      </p>
                    </div>
                  ) : (
                    <div className="divide-y divide-zinc-200/70 border border-zinc-200/90 rounded-2xl overflow-hidden bg-white">
                      {savedChats.map((thread) => {
                        const isCurrent = thread.id === activeThreadId;
                        const lastMsg = thread.messages[thread.messages.length - 1];
                        return (
                          <div
                            key={thread.id}
                            className="p-3.5 hover:bg-zinc-50/90 transition-colors flex items-start justify-between gap-3"
                          >
                            <button
                              type="button"
                              onClick={() => {
                                onOpenChatThread(thread.id);
                                onClose();
                              }}
                              className="flex-1 min-w-0 text-left cursor-pointer"
                            >
                              <div className="flex items-center gap-2 text-xs">
                                <span className="font-semibold text-zinc-900 truncate">
                                  {thread.title}
                                </span>
                                {isCurrent && (
                                  <span className="text-[11px] font-medium text-[#10a37f]">
                                    · Current
                                  </span>
                                )}
                              </div>
                              {lastMsg && (
                                <p className="text-xs text-zinc-500 truncate mt-0.5">
                                  {lastMsg.text}
                                </p>
                              )}
                              <p className="text-[11px] text-zinc-400 tabular-nums mt-1">
                                {thread.messages.length}{' '}
                                {thread.messages.length === 1 ? 'message' : 'messages'} ·{' '}
                                {formatDateTime(thread.updatedAt)}
                              </p>
                            </button>

                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                type="button"
                                onClick={() => {
                                  onOpenChatThread(thread.id);
                                  onClose();
                                }}
                                className="px-3 py-1.5 text-[11px] font-medium text-zinc-800 bg-zinc-100 hover:bg-zinc-200 rounded-lg cursor-pointer transition-colors"
                              >
                                Open
                              </button>
                              {threads.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => onDeleteChatThread(thread.id)}
                                  aria-label="Delete saved chat"
                                  className="p-1.5 text-zinc-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors cursor-pointer"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )
                ) : filteredWorkbenchHistory.length === 0 ? (
                  <div className="p-8 text-center rounded-2xl border border-zinc-200 bg-[#fafafa] space-y-1.5">
                    <History className="w-6 h-6 text-zinc-400 mx-auto" />
                    <p className="text-xs font-semibold text-zinc-800">No workbench runs recorded</p>
                    <p className="text-[11px] text-zinc-500">
                      Run a prompt in the Workbench section to inspect and restore it here.
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-zinc-200/70 border border-zinc-200/90 rounded-2xl overflow-hidden bg-white">
                    {filteredWorkbenchHistory.map((entry) => (
                      <div
                        key={entry.id}
                        className="p-3.5 hover:bg-zinc-50/90 transition-colors flex items-start justify-between gap-3"
                      >
                        <button
                          type="button"
                          onClick={() => {
                            onLoadWorkbenchRun(entry);
                            onClose();
                          }}
                          className="flex-1 min-w-0 text-left cursor-pointer"
                        >
                          <p className="text-xs font-semibold text-zinc-900 truncate">
                            {entry.prompt}
                          </p>
                          <p className="text-xs text-zinc-500 truncate mt-0.5">{entry.output}</p>
                          <p className="text-[11px] text-zinc-400 tabular-nums mt-1">
                            {entry.model} · {entry.durationMs} ms · {formatDateTime(entry.timestamp)}
                          </p>
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteWorkbenchRun(entry.id)}
                          aria-label="Delete workbench run"
                          className="p-1.5 text-zinc-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors shrink-0 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {section === 'model' && (
              <div className="space-y-6">
                <section className="space-y-3">
                  <div>
                    <h3 className="text-sm font-semibold text-zinc-900">
                      Intelligent Model Routing
                    </h3>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      Smart Auto selects the fastest accurate model per query, or lock a specific model below.
                    </p>
                  </div>
                  <div className="space-y-2">
                    {MODEL_PROFILES.map((profile) => {
                      const active = profileId === profile.profileId;
                      const isLocked = Boolean(profile.requiresOpenAI && !openAiConnected);
                      return (
                        <button
                          key={profile.profileId}
                          type="button"
                          disabled={isLocked}
                          onClick={() => onSelectProfile(profile.profileId)}
                          className={`w-full text-left px-4 py-3 rounded-xl border transition-all flex items-center justify-between gap-3 ${
                            isLocked
                              ? 'border-zinc-200 bg-zinc-50/60 opacity-60 cursor-not-allowed'
                              : active
                              ? 'border-zinc-900 bg-zinc-50/80 cursor-pointer'
                              : 'border-zinc-200 hover:border-zinc-300 bg-white cursor-pointer'
                          }`}
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-semibold text-zinc-900">
                                {profile.label}
                              </span>
                              <span className="text-[11px] font-mono text-zinc-400">
                                {profile.requiresOpenAI
                                  ? openAiConnected
                                    ? 'gpt-4o / gpt-4o-mini'
                                    : 'Requires OPENAI_API_KEY'
                                  : profile.model}
                              </span>
                            </div>
                            <p className="text-xs text-zinc-500 mt-0.5">{profile.subtitle}</p>
                          </div>
                          <span
                            className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 transition-colors ${
                              active ? 'bg-zinc-900 text-white' : 'border border-zinc-300 bg-white'
                            }`}
                          >
                            {active && <Check className="w-3 h-3" />}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </section>

                <section className="border-t border-zinc-200/80 pt-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-zinc-900">Reasoning Depth</h3>
                    <span className="text-xs font-mono text-zinc-500">
                      {thinkingLevel === 'DEFAULT' ? 'Auto' : thinkingLevel}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {activeModelOption.supportedThinking.map((level) => (
                      <button
                        key={level}
                        type="button"
                        onClick={() => onChangeThinking(level)}
                        className={`px-3.5 py-1.5 text-xs font-medium rounded-xl border transition-colors whitespace-nowrap cursor-pointer ${
                          thinkingLevel === level
                            ? 'bg-zinc-900 text-white border-zinc-900'
                            : 'bg-white text-zinc-600 border-zinc-200 hover:border-zinc-300 hover:text-zinc-900'
                        }`}
                      >
                        {level === 'DEFAULT'
                          ? 'Auto'
                          : level === 'XHIGH'
                          ? 'XHigh'
                          : level.charAt(0) + level.slice(1).toLowerCase()}
                      </button>
                    ))}
                  </div>
                </section>

                {/* Dual-Model Synthesis Toggle */}
                <section className="border-t border-zinc-200/80 pt-5 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-[#10a37f] shrink-0" />
                      <p className="text-sm font-medium text-zinc-900">
                        Multi-Model Cross-Verification
                      </p>
                    </div>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      {openAiConnected
                        ? 'Compares OpenAI GPT and Google Gemini answers before synthesizing one verified reply.'
                        : 'Requires OPENAI_API_KEY in server Secrets to enable OpenAI + Gemini synthesis.'}
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    disabled={!openAiConnected}
                    aria-checked={openAiConnected && verifyMode}
                    onClick={() => onToggleVerifyMode(!verifyMode)}
                    className={`w-11 h-6 rounded-full transition-colors p-0.5 shrink-0 ${
                      !openAiConnected
                        ? 'bg-zinc-200 cursor-not-allowed'
                        : verifyMode
                        ? 'bg-[#10a37f] cursor-pointer'
                        : 'bg-zinc-300 cursor-pointer'
                    }`}
                  >
                    <span
                      className={`block w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${
                        openAiConnected && verifyMode ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </section>

                <section className="border-t border-zinc-200/80 pt-5 space-y-2.5">
                  <div className="flex items-center gap-2">
                    <KeyRound className="w-4 h-4 text-[#10a37f] shrink-0" />
                    <h3 className="text-xs font-semibold text-zinc-900">
                      Connected AI Backends (Server Secrets)
                    </h3>
                  </div>

                  <div className="rounded-2xl border border-zinc-200/85 bg-[#fafafa] p-3.5 space-y-2 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-zinc-900">Google Gemini + Search Grounding</span>
                      <span className="font-mono text-[11px] text-emerald-700 font-semibold">
                        {capabilities?.gemini?.connected ? 'Connected' : 'Check GEMINI_API_KEY'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2 pt-2 border-t border-zinc-200/70">
                      <span className="font-medium text-zinc-900">OpenAI ChatGPT API</span>
                      <span
                        className={`font-mono text-[11px] font-semibold ${
                          openAiConnected ? 'text-emerald-700' : 'text-zinc-500'
                        }`}
                      >
                        {openAiConnected ? 'Connected' : 'Not configured'}
                      </span>
                    </div>
                  </div>
                </section>
              </div>
            )}

            {section === 'personalization' && (
              <section className="space-y-4">
                <div>
                  <h3 className="text-sm font-semibold text-zinc-900">Custom Instructions</h3>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    Define how structured, concise, or detailed TALASH Ai should be in every reply.
                  </p>
                </div>

                <textarea
                  rows={6}
                  value={chatSystemInstruction}
                  onChange={(e) => onChangeCustomPersona(e.target.value)}
                  placeholder="Describe your preferred tone, language, or formatting style..."
                  className="w-full px-3.5 py-3 text-xs leading-relaxed bg-[#fafafa] border border-zinc-200 rounded-xl text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:bg-white focus:border-zinc-900 resize-y"
                />

                <div className="flex items-center justify-between gap-3">
                  <span className="text-[11px] text-zinc-500 tabular-nums">
                    {chatSystemInstruction.length} characters
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      onSelectTone('concise');
                      onChangeCustomPersona(DEFAULT_CONCISE_SYSTEM_INSTRUCTION);
                    }}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-zinc-800 bg-white border border-zinc-200 hover:bg-zinc-100 rounded-xl transition-colors cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Reset to Default</span>
                  </button>
                </div>
              </section>
            )}

            {section === 'data' && (
              <div className="space-y-3">
                <div className="rounded-2xl border border-zinc-200/85 bg-[#fafafa] p-4 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-zinc-900">Install TALASH Ai App</p>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      Install TALASH Ai as an app on Android, iOS, or Desktop.
                    </p>
                  </div>
                  <PWAInstallButton compact />
                </div>

                <div className="rounded-2xl border border-zinc-200/85 bg-[#fafafa] p-4 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-zinc-900">Export active conversation</p>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      Download the current chat thread as a Markdown file.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={onExportActiveChat}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-zinc-800 bg-white border border-zinc-200 hover:bg-zinc-100 rounded-xl whitespace-nowrap shrink-0 cursor-pointer transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Export .md</span>
                  </button>
                </div>

                <div className="rounded-2xl border border-zinc-200/85 bg-[#fafafa] p-4 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-zinc-900">Clear all saved chats</p>
                    <p className="text-xs text-zinc-500 mt-0.5 tabular-nums">
                      Remove {previousSavedCount} previous chat
                      {previousSavedCount === 1 ? '' : 's'} and reset the active session.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={onClearAllChats}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-red-600 bg-white border border-red-200 hover:bg-red-50 rounded-xl whitespace-nowrap shrink-0 cursor-pointer transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete Chats</span>
                  </button>
                </div>

                <div className="rounded-2xl border border-zinc-200/85 bg-[#fafafa] p-4 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-zinc-900">Clear workbench run history</p>
                    <p className="text-xs text-zinc-500 mt-0.5 tabular-nums">
                      {history.length} saved workbench run{history.length === 1 ? '' : 's'} in local
                      storage.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={onClearHistory}
                    disabled={history.length === 0}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-red-600 bg-white border border-red-200 hover:bg-red-50 disabled:opacity-45 disabled:cursor-not-allowed rounded-xl whitespace-nowrap shrink-0 cursor-pointer transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Clear History</span>
                  </button>
                </div>
                <div className="rounded-2xl border border-zinc-200/85 bg-[#fafafa] p-4 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold text-zinc-900">TALASH Ai &middot; v1.0.0</p>
                    <p className="text-[11px] text-zinc-500 mt-0.5">
                      Created by Shams Talash &middot; Package ID: com.shamstalash.talashai
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

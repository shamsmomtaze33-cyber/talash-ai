import { useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  Check,
  Code2,
  Compass,
  Cpu,
  Crown,
  Database,
  Download,
  Globe,
  History,
  Home,
  Image as ImageIcon,
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
      id: 'home',
      label: 'TALASH Ai Home',
      subtitle: 'Command dashboard with 8 smart AI quick launch actions',
      icon: Home,
    },
    {
      id: 'chat',
      label: 'TALASH Ai Chat',
      subtitle: 'Fast streaming answers in Pashto, Arabic & English',
      icon: MessageSquare,
    },
    {
      id: 'image',
      label: 'Image Creation Studio',
      subtitle: 'Generate futuristic AI images with Gemini Image Engine',
      icon: ImageIcon,
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
    {
      id: 'premium',
      label: 'Premium & Plans',
      subtitle: 'Explore Pro capabilities, routing tiers & owner status',
      icon: Crown,
    },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#020614]/80 backdrop-blur-md p-3 sm:p-5"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-modal-title"
    >
      <div
        className="w-full max-w-3xl bg-[#071022] rounded-3xl border border-sky-400/25 shadow-[0_24px_80px_rgba(2,8,24,0.85)] overflow-hidden flex flex-col max-h-[88dvh] text-slate-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-5 sm:px-6 py-4 bg-[#050b19] border-b border-sky-500/20 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <TalashLogoMark className="w-9 h-9 rounded-full shrink-0" />
            <div className="min-w-0">
              <h2
                id="settings-modal-title"
                className="text-base font-semibold text-white leading-tight"
              >
                TALASH <span className="text-cyan-400 italic">Ai</span> Settings &amp; Menu
              </h2>
              <p className="text-[11px] text-slate-400 truncate">
                Navigation, Chat History, AI Routing, Account &amp; Owner Controls
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close settings"
            className="w-9 h-9 inline-flex items-center justify-center text-slate-300 hover:text-white bg-slate-900/90 hover:bg-sky-500/20 border border-sky-500/25 rounded-xl transition-colors cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-col sm:flex-row flex-1 min-h-0">
          {/* Left Navigation Rail */}
          <nav
            aria-label="Settings sections"
            className="sm:w-56 shrink-0 bg-[#050b19] border-b sm:border-b-0 sm:border-r border-sky-500/20 p-3 flex sm:flex-col gap-1.5 overflow-x-auto"
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
                      ? 'bg-sky-500/20 text-white font-semibold border-cyan-400/45 shadow-[0_0_18px_rgba(37,99,235,0.22)]'
                      : 'border-transparent text-slate-400 font-medium hover:bg-slate-900/80 hover:text-white'
                  }`}
                >
                  <span className="inline-flex items-center gap-2.5">
                    <Icon
                      className={`w-4 h-4 shrink-0 ${active ? 'text-cyan-400' : 'text-slate-400'}`}
                    />
                    <span>{item.label}</span>
                  </span>
                  {item.id === 'history' && (
                    <span className="font-mono text-[11px] text-cyan-300 tabular-nums">
                      {previousSavedCount}/20
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* Right Settings Content */}
          <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6 bg-[#071022]">
            {section === 'navigation' && (
              <div className="space-y-6">
                {/* Account Card */}
                {currentUser && (
                  <section className="p-4 rounded-2xl border border-sky-400/25 bg-[#0a152e]/85 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        {currentUser.avatarUrl ? (
                          <img
                            src={currentUser.avatarUrl}
                            alt={currentUser.name}
                            referrerPolicy="no-referrer"
                            className="w-10 h-10 rounded-full object-cover border border-cyan-400/40 shrink-0"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-600 to-cyan-500 text-white font-bold text-sm flex items-center justify-center shrink-0">
                            {currentUser.name.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <p className="text-sm font-semibold text-white truncate">
                              {currentUser.name}
                            </p>
                            <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-md bg-sky-500/20 text-cyan-300 border border-cyan-400/35">
                              {currentUser.isImmutableOwner ? 'Owner · Super Admin' : currentUser.role}
                            </span>
                            <span
                              className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-md border ${
                                currentUser.emailVerified
                                  ? 'bg-emerald-500/15 text-emerald-300 border-emerald-400/35'
                                  : 'bg-amber-500/15 text-amber-300 border-amber-400/35'
                              }`}
                            >
                              {currentUser.emailVerified ? 'Verified' : 'Pending Verification'}
                            </span>
                          </div>
                          <p className="text-xs text-slate-400 truncate">{currentUser.email}</p>
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
                          className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-200 hover:text-white bg-slate-900/90 hover:bg-sky-500/15 border border-sky-400/25 rounded-xl whitespace-nowrap shrink-0 cursor-pointer transition-colors"
                        >
                          <KeyRound className="w-3.5 h-3.5 text-cyan-400" />
                          <span>Password</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            onClose();
                            onLogout();
                          }}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-red-200 hover:text-white bg-red-950/50 hover:bg-red-600/35 border border-red-400/30 rounded-xl whitespace-nowrap shrink-0 cursor-pointer transition-colors"
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
                        className="pt-3 border-t border-sky-500/20 space-y-2.5"
                      >
                        <p className="text-xs font-semibold text-white">Change Account Password</p>
                        {pwError && (
                          <p className="text-xs text-red-200 bg-red-950/60 border border-red-400/35 rounded-lg px-2.5 py-1.5">
                            {pwError}
                          </p>
                        )}
                        {pwSuccess && (
                          <p className="text-xs text-emerald-200 bg-emerald-950/60 border border-emerald-400/35 rounded-lg px-2.5 py-1.5">
                            {pwSuccess}
                          </p>
                        )}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                          <input
                            type="password"
                            value={currentPw}
                            onChange={(e) => setCurrentPw(e.target.value)}
                            placeholder="Current password"
                            className="px-3 py-2 text-xs bg-[#050b19] border border-sky-400/25 rounded-xl text-white placeholder:text-slate-500 focus:outline-none focus:border-cyan-400"
                          />
                          <input
                            type="password"
                            required
                            minLength={8}
                            value={newPw}
                            onChange={(e) => setNewPw(e.target.value)}
                            placeholder="New password (8+ chars)"
                            className="px-3 py-2 text-xs bg-[#050b19] border border-sky-400/25 rounded-xl text-white placeholder:text-slate-500 focus:outline-none focus:border-cyan-400"
                          />
                          <input
                            type="password"
                            required
                            minLength={8}
                            value={confirmPw}
                            onChange={(e) => setConfirmPw(e.target.value)}
                            placeholder="Confirm new password"
                            className="px-3 py-2 text-xs bg-[#050b19] border border-sky-400/25 rounded-xl text-white placeholder:text-slate-500 focus:outline-none focus:border-cyan-400"
                          />
                        </div>
                        <button
                          type="submit"
                          disabled={pwBusy}
                          className="talash-neon-btn px-4 py-2 text-xs font-semibold rounded-xl cursor-pointer disabled:opacity-60"
                        >
                          {pwBusy ? 'Updating...' : 'Update Password'}
                        </button>
                      </form>
                    )}
                  </section>
                )}

                {/* Owner Super Admin Control Center Button */}
                {isSuperAdmin && onOpenAdminDashboard && (
                  <section className="p-4 rounded-2xl border border-cyan-400/35 bg-gradient-to-r from-blue-950/75 via-[#0a1836] to-cyan-950/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-0.5">
                      <div className="inline-flex items-center gap-1.5 text-sm font-semibold text-white">
                        <ShieldCheck className="w-4 h-4 text-cyan-400" />
                        <span>Owner &amp; Super Admin Control Center</span>
                      </div>
                      <p className="text-xs text-slate-300">
                        Manage users, roles, Learning CMS, SEO domain, OAuth callbacks &amp; database backups.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onOpenAdminDashboard();
                      }}
                      className="talash-neon-btn px-4 py-2 text-xs font-semibold rounded-xl whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      Open Admin Panel
                    </button>
                  </section>
                )}

                {/* Workspace Navigation */}
                <section className="space-y-3">
                  <div>
                    <h3 className="text-sm font-semibold text-white">TALASH Ai Sections</h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Switch between Home, Chat, Image Studio, Islamic Learning, Workbench, and Batch CSV.
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
                              ? 'border-cyan-400/60 bg-sky-500/15 shadow-[0_0_20px_rgba(37,99,235,0.2)]'
                              : 'border-sky-400/20 hover:border-cyan-400/45 bg-[#0a152e]/75'
                          }`}
                        >
                          <div
                            className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${
                              active
                                ? 'bg-gradient-to-br from-blue-600 to-cyan-500 text-white border-cyan-300/40'
                                : 'bg-slate-900/90 text-cyan-400 border-sky-500/25'
                            }`}
                          >
                            <Icon className="w-4 h-4" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-white">{dest.label}</p>
                            <p className="text-[11px] text-slate-400 leading-snug mt-0.5">
                              {dest.subtitle}
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </section>

                {/* Android / Desktop App Install */}
                <section className="pt-4 border-t border-sky-500/20 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold text-white">Install TALASH Ai App</p>
                    <p className="text-[11px] text-slate-400">
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
                    <h3 className="text-sm font-semibold text-white">Response Style</h3>
                    <p className="text-xs text-slate-400 mt-0.5">
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
                              ? 'border-cyan-400/55 bg-sky-500/15'
                              : 'border-sky-400/20 hover:border-cyan-400/40 bg-[#0a152e]/75'
                          }`}
                        >
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-white">{tone.label}</p>
                            <p className="text-[11px] text-slate-400 line-clamp-1 mt-0.5">
                              {tone.instruction}
                            </p>
                          </div>
                          <span
                            className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 transition-colors ${
                              active
                                ? 'bg-gradient-to-br from-blue-600 to-cyan-500 text-white'
                                : 'border border-sky-400/35 bg-slate-900'
                            }`}
                          >
                            {active && <Check className="w-3 h-3" />}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </section>

                <div className="border-t border-sky-500/20 pt-5 space-y-5">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Globe className="w-4 h-4 text-cyan-400 shrink-0" />
                      <p className="text-sm font-medium text-white">
                        Google Search Grounding
                      </p>
                    </div>
                    <p className="text-xs text-slate-400">
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
                              ? 'talash-neon-btn border-cyan-400/50'
                              : 'bg-[#0a152e] text-slate-300 border-sky-400/20 hover:border-cyan-400/40'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="border-t border-sky-500/15 pt-4 flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-white">
                        Show token usage details
                      </p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Display token counts beside reply timing beneath completed messages.
                      </p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={showMetrics}
                      onClick={() => onToggleMetrics(!showMetrics)}
                      className={`w-11 h-6 rounded-full transition-colors p-0.5 shrink-0 cursor-pointer ${
                        showMetrics ? 'bg-cyan-500' : 'bg-slate-700'
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
                <section className="rounded-2xl border border-sky-400/25 bg-[#0a152e]/85 p-4 space-y-3.5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold text-white">Saved History</h3>
                      <p className="text-xs text-slate-400 mt-0.5 tabular-nums">
                        Up to 20 previous chats stay saved automatically when you start a new chat.
                      </p>
                    </div>

                    <div className="flex items-center gap-1 p-1 bg-[#050b19] border border-sky-500/20 rounded-xl">
                      <button
                        type="button"
                        onClick={() => setHistorySubTab('chats')}
                        className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                          historySubTab === 'chats'
                            ? 'bg-sky-500/25 text-white border border-cyan-400/40'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        Chats ({previousSavedCount}/20)
                      </button>
                      <button
                        type="button"
                        onClick={() => setHistorySubTab('workbench')}
                        className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                          historySubTab === 'workbench'
                            ? 'bg-sky-500/25 text-white border border-cyan-400/40'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        Workbench ({history.length})
                      </button>
                    </div>
                  </div>

                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      value={historySearch}
                      onChange={(e) => setHistorySearch(e.target.value)}
                      placeholder={
                        historySubTab === 'chats'
                          ? 'Search saved chats...'
                          : 'Search workbench runs...'
                      }
                      className="w-full pl-9 pr-3.5 py-2 text-xs bg-[#050b19] border border-sky-400/25 rounded-xl text-white placeholder:text-slate-500 focus:outline-none focus:border-cyan-400"
                    />
                  </div>
                </section>

                {historySubTab === 'chats' ? (
                  savedChats.length === 0 ? (
                    <div className="p-8 text-center rounded-2xl border border-sky-400/20 bg-[#0a152e]/70 space-y-1.5">
                      <MessageSquare className="w-6 h-6 text-cyan-400 mx-auto" />
                      <p className="text-xs font-semibold text-white">No saved chats found</p>
                      <p className="text-[11px] text-slate-400">
                        Start a conversation and tap New Chat—your previous chats remain saved here.
                      </p>
                    </div>
                  ) : (
                    <div className="divide-y divide-sky-500/15 border border-sky-400/20 rounded-2xl overflow-hidden bg-[#0a152e]/75">
                      {savedChats.map((thread) => {
                        const isCurrent = thread.id === activeThreadId;
                        const lastMsg = thread.messages[thread.messages.length - 1];
                        return (
                          <div
                            key={thread.id}
                            className="p-3.5 hover:bg-sky-500/10 transition-colors flex items-start justify-between gap-3"
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
                                <span className="font-semibold text-white truncate">
                                  {thread.title}
                                </span>
                                {isCurrent && (
                                  <span className="text-[11px] font-medium text-cyan-400">
                                    · Current
                                  </span>
                                )}
                              </div>
                              {lastMsg && (
                                <p className="text-xs text-slate-400 truncate mt-0.5">
                                  {lastMsg.text}
                                </p>
                              )}
                              <p className="text-[11px] text-slate-500 tabular-nums mt-1">
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
                                className="px-3 py-1.5 text-[11px] font-medium text-cyan-200 bg-sky-500/20 hover:bg-sky-500/30 border border-cyan-400/30 rounded-lg cursor-pointer transition-colors"
                              >
                                Open
                              </button>
                              {threads.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => onDeleteChatThread(thread.id)}
                                  aria-label="Delete saved chat"
                                  className="p-1.5 text-slate-400 hover:text-red-300 rounded-lg hover:bg-red-500/15 transition-colors cursor-pointer"
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
                  <div className="p-8 text-center rounded-2xl border border-sky-400/20 bg-[#0a152e]/70 space-y-1.5">
                    <History className="w-6 h-6 text-cyan-400 mx-auto" />
                    <p className="text-xs font-semibold text-white">No workbench runs recorded</p>
                    <p className="text-[11px] text-slate-400">
                      Run a prompt in the Workbench section to inspect and restore it here.
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-sky-500/15 border border-sky-400/20 rounded-2xl overflow-hidden bg-[#0a152e]/75">
                    {filteredWorkbenchHistory.map((entry) => (
                      <div
                        key={entry.id}
                        className="p-3.5 hover:bg-sky-500/10 transition-colors flex items-start justify-between gap-3"
                      >
                        <button
                          type="button"
                          onClick={() => {
                            onLoadWorkbenchRun(entry);
                            onClose();
                          }}
                          className="flex-1 min-w-0 text-left cursor-pointer"
                        >
                          <p className="text-xs font-semibold text-white truncate">
                            {entry.prompt}
                          </p>
                          <p className="text-xs text-slate-400 truncate mt-0.5">{entry.output}</p>
                          <p className="text-[11px] text-slate-500 tabular-nums mt-1">
                            {entry.model} · {entry.durationMs} ms · {formatDateTime(entry.timestamp)}
                          </p>
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteWorkbenchRun(entry.id)}
                          aria-label="Delete workbench run"
                          className="p-1.5 text-slate-400 hover:text-red-300 rounded-lg hover:bg-red-500/15 transition-colors shrink-0 cursor-pointer"
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
                    <h3 className="text-sm font-semibold text-white">
                      Intelligent Model Routing
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
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
                              ? 'border-sky-500/15 bg-[#050b19]/60 opacity-50 cursor-not-allowed'
                              : active
                              ? 'border-cyan-400/55 bg-sky-500/15 cursor-pointer'
                              : 'border-sky-400/20 hover:border-cyan-400/40 bg-[#0a152e]/75 cursor-pointer'
                          }`}
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-semibold text-white">
                                {profile.label}
                              </span>
                              <span className="text-[11px] font-mono text-cyan-300/80">
                                {profile.requiresOpenAI
                                  ? openAiConnected
                                    ? 'gpt-4o / gpt-4o-mini'
                                    : 'Requires OPENAI_API_KEY'
                                  : profile.model}
                              </span>
                            </div>
                            <p className="text-xs text-slate-400 mt-0.5">{profile.subtitle}</p>
                          </div>
                          <span
                            className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 transition-colors ${
                              active
                                ? 'bg-gradient-to-br from-blue-600 to-cyan-500 text-white'
                                : 'border border-sky-400/35 bg-slate-900'
                            }`}
                          >
                            {active && <Check className="w-3 h-3" />}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </section>

                <section className="border-t border-sky-500/20 pt-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-white">Reasoning Depth</h3>
                    <span className="text-xs font-mono text-cyan-300">
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
                            ? 'talash-neon-btn border-cyan-400/50'
                            : 'bg-[#0a152e] text-slate-300 border-sky-400/20 hover:border-cyan-400/40 hover:text-white'
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
                <section className="border-t border-sky-500/20 pt-5 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-cyan-400 shrink-0" />
                      <p className="text-sm font-medium text-white">
                        Multi-Model Cross-Verification
                      </p>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">
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
                        ? 'bg-slate-800 cursor-not-allowed'
                        : verifyMode
                        ? 'bg-cyan-500 cursor-pointer'
                        : 'bg-slate-700 cursor-pointer'
                    }`}
                  >
                    <span
                      className={`block w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${
                        openAiConnected && verifyMode ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </section>

                <section className="border-t border-sky-500/20 pt-5 space-y-2.5">
                  <div className="flex items-center gap-2">
                    <KeyRound className="w-4 h-4 text-cyan-400 shrink-0" />
                    <h3 className="text-xs font-semibold text-white">
                      Connected AI Backends (Server Secrets)
                    </h3>
                  </div>

                  <div className="rounded-2xl border border-sky-400/25 bg-[#0a152e]/85 p-3.5 space-y-2 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-white">Google Gemini + Search Grounding</span>
                      <span className="font-mono text-[11px] text-emerald-300 font-semibold">
                        {capabilities?.gemini?.connected ? 'Connected' : 'Check GEMINI_API_KEY'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2 pt-2 border-t border-sky-500/15">
                      <span className="font-medium text-white">OpenAI ChatGPT API</span>
                      <span
                        className={`font-mono text-[11px] font-semibold ${
                          openAiConnected ? 'text-emerald-300' : 'text-slate-400'
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
                  <h3 className="text-sm font-semibold text-white">Custom Instructions</h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Define how structured, concise, or detailed TALASH Ai should be in every reply.
                  </p>
                </div>

                <textarea
                  rows={6}
                  value={chatSystemInstruction}
                  onChange={(e) => onChangeCustomPersona(e.target.value)}
                  placeholder="Describe your preferred tone, language, or formatting style..."
                  className="w-full px-3.5 py-3 text-xs leading-relaxed bg-[#050b19] border border-sky-400/25 rounded-xl text-white placeholder:text-slate-500 focus:outline-none focus:border-cyan-400 resize-y"
                />

                <div className="flex items-center justify-between gap-3">
                  <span className="text-[11px] text-slate-400 tabular-nums">
                    {chatSystemInstruction.length} characters
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      onSelectTone('concise');
                      onChangeCustomPersona(DEFAULT_CONCISE_SYSTEM_INSTRUCTION);
                    }}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-slate-200 bg-slate-900 border border-sky-400/25 hover:bg-sky-500/15 rounded-xl transition-colors cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Reset to Default</span>
                  </button>
                </div>
              </section>
            )}

            {section === 'data' && (
              <div className="space-y-3">
                <div className="rounded-2xl border border-sky-400/25 bg-[#0a152e]/85 p-4 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-white">Install TALASH Ai App</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Install TALASH Ai as an app on Android, iOS, or Desktop.
                    </p>
                  </div>
                  <PWAInstallButton compact />
                </div>

                <div className="rounded-2xl border border-sky-400/25 bg-[#0a152e]/85 p-4 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-white">Export active conversation</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Download the current chat thread as a Markdown file.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={onExportActiveChat}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-200 bg-slate-900 border border-sky-400/25 hover:bg-sky-500/15 rounded-xl whitespace-nowrap shrink-0 cursor-pointer transition-colors"
                  >
                    <Download className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Export .md</span>
                  </button>
                </div>

                <div className="rounded-2xl border border-sky-400/25 bg-[#0a152e]/85 p-4 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-white">Clear all saved chats</p>
                    <p className="text-xs text-slate-400 mt-0.5 tabular-nums">
                      Remove {previousSavedCount} previous chat
                      {previousSavedCount === 1 ? '' : 's'} and reset the active session.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={onClearAllChats}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-red-200 bg-red-950/50 border border-red-400/30 hover:bg-red-600/30 rounded-xl whitespace-nowrap shrink-0 cursor-pointer transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete Chats</span>
                  </button>
                </div>

                <div className="rounded-2xl border border-sky-400/25 bg-[#0a152e]/85 p-4 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-white">Clear workbench run history</p>
                    <p className="text-xs text-slate-400 mt-0.5 tabular-nums">
                      {history.length} saved workbench run{history.length === 1 ? '' : 's'} in local
                      storage.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={onClearHistory}
                    disabled={history.length === 0}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-red-200 bg-red-950/50 border border-red-400/30 hover:bg-red-600/30 disabled:opacity-45 disabled:cursor-not-allowed rounded-xl whitespace-nowrap shrink-0 cursor-pointer transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Clear History</span>
                  </button>
                </div>
                <div className="rounded-2xl border border-sky-400/25 bg-[#0a152e]/85 p-4 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold text-white">TALASH Ai &middot; v1.0.0</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
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

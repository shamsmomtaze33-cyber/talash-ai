import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  ArrowUp,
  ArrowUpRight,
  BookOpen,
  Bookmark,
  BookmarkPlus,
  Check,
  Code2,
  Copy,
  Crown,
  Download,
  Eraser,
  ExternalLink,
  FileText,
  Globe,
  History,
  Home,
  Image as ImageIcon,
  Languages,
  Layers,
  Lightbulb,
  Loader2,
  MessageSquare,
  Mic,
  MoreVertical,
  PanelLeftClose,
  PanelLeftOpen,
  Paperclip,
  Pencil,
  Play,
  Plus,
  RotateCcw,
  Search,
  Settings,
  Share2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Square,
  SquarePen,
  Trash2,
  Volume2,
  VolumeX,
  Wand2,
  X,
} from 'lucide-react';
import { AdminDashboardModal } from './components/AdminDashboardModal';
import { AuthGateModal } from './components/AuthGateModal';
import { BatchCsvView } from './components/BatchCsvView';
import { ChatSettingsModal, type SettingsSection } from './components/ChatSettingsModal';
import { CodeSnippetPanel } from './components/CodeSnippetPanel';
import { LearningView } from './components/LearningView';
import { MarkdownOutput } from './components/MarkdownOutput';
import { OfflineIndicator } from './components/OfflineIndicator';
import { PWAInstallButton } from './components/PWAInstallButton';
import { ShareDialog } from './components/ShareDialog';
import { SplashScreen } from './components/SplashScreen';
import { NeuralBrainBanner, TalashLogoMark } from './components/TalashLogo';
import { TemplateLibraryPanel } from './components/TemplateLibraryPanel';
import { getUiCopy, isPashtoText } from './utils/language';
import {
  DEFAULT_CONCISE_SYSTEM_INSTRUCTION,
  DEFAULT_TEMPLATES,
  MODEL_OPTIONS,
  MODEL_PROFILES,
  PROMPT_PRESETS,
  TONE_PRESETS,
  type ActiveView,
  type AppLanguage,
  type AuthUser,
  type ChatMessage,
  type ChatModelId,
  type ChatThread,
  type ContinuationInfo,
  type DeliveryMode,
  type GeminiModelId,
  type GeneratedImageEntry,
  type GlobalAppSettings,
  type GoogleSearchMode,
  type GroundingSource,
  type ModelProfileId,
  type PromptPreset,
  type PromptTemplate,
  type ReplyMeta,
  type ResponseFormat,
  type RunHistoryEntry,
  type ServerCapabilities,
  type TemplateScope,
  type ThinkingDepth,
  type UsageMetrics,
} from './types';

const HISTORY_STORAGE_KEY = 'talash_ai_run_history_v1';
const CHAT_THREADS_STORAGE_KEY = 'talash_ai_chat_threads_v1';
const TEMPLATES_STORAGE_KEY = 'talash_ai_template_library_v1';
const WORKBENCH_DRAFT_STORAGE_KEY = 'talash_ai_workbench_draft_v1';
const ACTIVE_VIEW_STORAGE_KEY = 'talash_ai_active_view_v1';
const APP_LANG_STORAGE_KEY = 'talash_ai_lang_v1';
const LEGACY_KEY_PREFIX = ['prompt', 'bench_'].join('');
const INITIAL_PROMPT = 'Explain how AI works in a few words';
const MAX_PREVIOUS_CHATS = 20;

function readStorageWithLegacy(newKey: string, suffix: string): string | null {
  try {
    const existing = localStorage.getItem(newKey);
    if (existing !== null) return existing;
    const legacy = localStorage.getItem(`${LEGACY_KEY_PREFIX}${suffix}`);
    if (legacy !== null) {
      localStorage.setItem(newKey, legacy);
      localStorage.removeItem(`${LEGACY_KEY_PREFIX}${suffix}`);
      return legacy;
    }
    return null;
  } catch {
    return null;
  }
}

const CHAT_STARTERS = [
  {
    title: 'Islamic Knowledge',
    prompt: 'Explain the 5 pillars of Islam with Qur’an and authentic Hadith references',
  },
  {
    title: '100 Hadiths Collection',
    prompt: 'Provide 100 authentic Hadiths with their book references and short lessons',
  },
  {
    title: 'پښتو لارښود',
    prompt: 'د رښتینې توبې شرطونه د قرآن او صحیح سنتو په رڼا کې په پښتو بیان کړه',
  },
];

type WorkbenchTab = 'editor' | 'templates' | 'sdk';

interface WorkbenchDraft {
  prompt: string;
  systemInstruction: string;
  profileId: ModelProfileId;
  model: GeminiModelId;
  thinkingLevel: ThinkingDepth;
  responseFormat: ResponseFormat;
  deliveryMode: DeliveryMode;
  savedAt: string;
}

interface ShareTarget {
  title: string;
  content: string;
  fullTranscript?: string;
}

function formatTimestamp(iso: string): string {
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

function formatShortThreadDate(iso: string): string {
  try {
    const date = new Date(iso);
    const now = new Date();
    if (date.toDateString() === now.toDateString()) {
      return new Intl.DateTimeFormat('en-US', {
        hour: '2-digit',
        minute: '2-digit',
      }).format(date);
    }
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
    }).format(date);
  } catch {
    return '';
  }
}

function formatReplySeconds(durationMs?: number): string {
  if (typeof durationMs !== 'number' || !Number.isFinite(durationMs)) return '1.0s';
  if (durationMs < 1000) return `${Math.max(100, Math.round(durationMs))}ms`;
  const secs = durationMs / 1000;
  return secs < 10 ? `${secs.toFixed(1)}s` : `${Math.round(secs)}s`;
}

function loadSavedHistory(): RunHistoryEntry[] {
  try {
    const raw = readStorageWithLegacy(HISTORY_STORAGE_KEY, 'run_history_v1');
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function createEmptyThread(): ChatThread {
  return {
    id: `thread-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    title: 'New chat',
    updatedAt: new Date().toISOString(),
    messages: [],
  };
}

function loadSavedThreads(): ChatThread[] {
  try {
    const raw = readStorageWithLegacy(CHAT_THREADS_STORAGE_KEY, 'chat_threads_v1');
    if (!raw) return [createEmptyThread()];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed;
    }
    return [createEmptyThread()];
  } catch {
    return [createEmptyThread()];
  }
}

function loadSavedTemplates(): PromptTemplate[] {
  try {
    const raw = readStorageWithLegacy(TEMPLATES_STORAGE_KEY, 'template_library_v1');
    if (!raw) return DEFAULT_TEMPLATES;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed;
    }
    return DEFAULT_TEMPLATES;
  } catch {
    return DEFAULT_TEMPLATES;
  }
}

function loadWorkbenchDraft(): WorkbenchDraft | null {
  try {
    const raw = readStorageWithLegacy(WORKBENCH_DRAFT_STORAGE_KEY, 'workbench_draft_v1');
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<WorkbenchDraft>;
    if (typeof parsed.prompt !== 'string') return null;
    return {
      prompt: parsed.prompt,
      systemInstruction: typeof parsed.systemInstruction === 'string' ? parsed.systemInstruction : '',
      profileId:
        parsed.profileId === 'flash-chat' ||
        parsed.profileId === 'flash-thinking' ||
        parsed.profileId === 'flash-lite'
          ? parsed.profileId
          : 'flash-chat',
      model:
        parsed.model === 'gemini-4-hydrogen' || parsed.model === 'gemini-3.1-flash-lite'
          ? parsed.model
          : 'gemini-4-hydrogen',
      thinkingLevel:
        parsed.thinkingLevel === 'DEFAULT' ||
        parsed.thinkingLevel === 'MINIMAL' ||
        parsed.thinkingLevel === 'LOW' ||
        parsed.thinkingLevel === 'MEDIUM' ||
        parsed.thinkingLevel === 'HIGH' ||
        parsed.thinkingLevel === 'XHIGH'
          ? parsed.thinkingLevel
          : 'MEDIUM',
      responseFormat: parsed.responseFormat === 'json' ? 'json' : 'text',
      deliveryMode: parsed.deliveryMode === 'single' ? 'single' : 'stream',
      savedAt: typeof parsed.savedAt === 'string' ? parsed.savedAt : new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

function loadSavedActiveView(): ActiveView {
  try {
    const raw = readStorageWithLegacy(ACTIVE_VIEW_STORAGE_KEY, 'active_view_v1');
    if (
      raw === 'home' ||
      raw === 'chat' ||
      raw === 'history' ||
      raw === 'settings' ||
      raw === 'premium' ||
      raw === 'learning' ||
      raw === 'image' ||
      raw === 'workbench' ||
      raw === 'batch'
    ) {
      return raw;
    }
    return 'home';
  } catch {
    return 'home';
  }
}

function loadSavedLanguage(): AppLanguage {
  try {
    const raw = localStorage.getItem(APP_LANG_STORAGE_KEY);
    if (raw === 'ps' || raw === 'ar' || raw === 'en') {
      return raw;
    }
    return 'en';
  } catch {
    return 'en';
  }
}

function retainChatHistoryCap(list: ChatThread[], activeId: string): ChatThread[] {
  const active = list.find((t) => t.id === activeId);
  const previous = list
    .filter((t) => t.id !== activeId && t.messages.length > 0)
    .slice(0, MAX_PREVIOUS_CHATS);
  if (active) {
    return [active, ...previous];
  }
  return previous.length > 0 ? previous : [createEmptyThread()];
}

function parseDataUrlImage(dataUrl?: string): { data: string; mimeType: string } | null {
  if (!dataUrl || !dataUrl.startsWith('data:image/')) return null;
  const commaIdx = dataUrl.indexOf(',');
  if (commaIdx === -1) return null;
  const header = dataUrl.slice(5, commaIdx);
  const mimeType = header.split(';')[0] || 'image/png';
  const data = dataUrl.slice(commaIdx + 1);
  if (!data) return null;
  return { data, mimeType };
}

export default function App() {
  const initialDraft = useMemo(() => loadWorkbenchDraft(), []);

  // Auth & Owner Super Admin State (sessionToken stays strictly in React memory + HttpOnly cookie)
  const [authChecking, setAuthChecking] = useState(true);
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [adminDashboardOpen, setAdminDashboardOpen] = useState(false);

  const [appLanguage, setAppLanguage] = useState<AppLanguage>(() => loadSavedLanguage());
  const uiCopy = useMemo(() => getUiCopy(appLanguage), [appLanguage]);

  const [activeView, setActiveView] = useState<ActiveView>(() => {
    if (typeof window !== 'undefined') {
      const qView = new URLSearchParams(window.location.search).get('view');
      if (
        qView === 'home' ||
        qView === 'chat' ||
        qView === 'history' ||
        qView === 'settings' ||
        qView === 'premium' ||
        qView === 'learning' ||
        qView === 'image' ||
        qView === 'workbench' ||
        qView === 'batch'
      ) {
        return qView;
      }
    }
    return loadSavedActiveView();
  });
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileConfigOpen, setMobileConfigOpen] = useState(false);

  // Settings Modal State
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSection, setSettingsSection] = useState<SettingsSection>('navigation');
  const [showMetrics, setShowMetrics] = useState(false);
  const [googleSearchMode, setGoogleSearchMode] = useState<GoogleSearchMode>('auto');
  const [verifyMode, setVerifyMode] = useState(false);
  const [capabilities, setCapabilities] = useState<ServerCapabilities | null>(null);

  // Share Modal State
  const [shareTarget, setShareTarget] = useState<ShareTarget | null>(null);

  // Shared Model & Personality State
  const [profileId, setProfileId] = useState<ModelProfileId>('auto-smart');
  const [chatModel, setChatModel] = useState<ChatModelId>('auto');
  const [model, setModel] = useState<GeminiModelId>('gemini-4-hydrogen');
  const [thinkingLevel, setThinkingLevel] = useState<ThinkingDepth>('DEFAULT');
  const [chatSystemInstruction, setChatSystemInstruction] = useState(
    DEFAULT_CONCISE_SYSTEM_INSTRUCTION
  );
  const [selectedToneId, setSelectedToneId] = useState('concise');

  // Chat State
  const [threads, setThreads] = useState<ChatThread[]>(() => loadSavedThreads());
  const [activeThreadId, setActiveThreadId] = useState<string>(() => {
    const saved = loadSavedThreads();
    return saved[0].id;
  });
  const [threadSearch, setThreadSearch] = useState('');
  const [historySearch, setHistorySearch] = useState('');
  const [historySubTab, setHistorySubTab] = useState<'chats' | 'workbench'>('chats');
  const [chatInput, setChatInput] = useState('');
  const [chatAttachment, setChatAttachment] = useState<{
    dataUrl: string;
    base64: string;
    mimeType: string;
    name: string;
  } | null>(null);
  const [chatDocAttachment, setChatDocAttachment] = useState<{
    name: string;
    content: string;
  } | null>(null);
  const [isChatStreaming, setIsChatStreaming] = useState(false);
  const [streamingElapsedSec, setStreamingElapsedSec] = useState(1);
  const [voiceStatus, setVoiceStatus] = useState<'idle' | 'recording' | 'transcribing'>('idle');
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [chatError, setChatError] = useState<string | null>(null);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingMessageDraft, setEditingMessageDraft] = useState('');
  const [chatOptionsOpen, setChatOptionsOpen] = useState(false);
  const [chatMenuConfirm, setChatMenuConfirm] = useState<'clear' | 'delete' | null>(null);
  const [renameTargetId, setRenameTargetId] = useState<string | null>(null);
  const [renameTitleDraft, setRenameTitleDraft] = useState('');
  const [minSplashDone, setMinSplashDone] = useState(false);
  const [splashFading, setSplashFading] = useState(false);
  const [splashHidden, setSplashHidden] = useState(false);

  // Image Creation Studio State
  const [imagePrompt, setImagePrompt] = useState('');
  const [imageAspectRatio, setImageAspectRatio] = useState<
    '1:1' | '16:9' | '9:16' | '4:3' | '3:4'
  >('1:1');
  const [imageGenerating, setImageGenerating] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [generatedImages, setGeneratedImages] = useState<GeneratedImageEntry[]>([]);

  // Workbench (Single-Prompt) State
  const [workbenchTab, setWorkbenchTab] = useState<WorkbenchTab>('editor');
  const [prompt, setPrompt] = useState(initialDraft?.prompt ?? INITIAL_PROMPT);
  const [systemInstruction, setSystemInstruction] = useState(
    initialDraft?.systemInstruction ?? ''
  );
  const [responseFormat, setResponseFormat] = useState<ResponseFormat>(
    initialDraft?.responseFormat ?? 'text'
  );
  const [deliveryMode, setDeliveryMode] = useState<DeliveryMode>(
    initialDraft?.deliveryMode ?? 'stream'
  );
  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(
    initialDraft?.savedAt ?? null
  );
  const [output, setOutput] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [durationMs, setDurationMs] = useState<number | null>(null);
  const [usage, setUsage] = useState<UsageMetrics | null>(null);
  const [copiedOutput, setCopiedOutput] = useState(false);

  // History & Template Library state
  const [history, setHistory] = useState<RunHistoryEntry[]>(() => loadSavedHistory());
  const [templates, setTemplates] = useState<PromptTemplate[]>(() => loadSavedTemplates());
  const [isSaveTemplateOpen, setIsSaveTemplateOpen] = useState(false);

  const chatAbortRef = useRef<AbortController | null>(null);
  const workbenchAbortRef = useRef<AbortController | null>(null);
  const chatContainerRef = useRef<HTMLDivElement | null>(null);
  const chatScrollEndRef = useRef<HTMLDivElement | null>(null);
  const chatTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const chatOptionsRef = useRef<HTMLDivElement | null>(null);
  const stickToBottomRef = useRef(true);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const micStreamRef = useRef<MediaStream | null>(null);
  const recordingTimerRef = useRef<number | null>(null);
  const voiceCancelledRef = useRef(false);

  const activeThread = useMemo(
    () => threads.find((t) => t.id === activeThreadId) ?? threads[0],
    [activeThreadId, threads]
  );

  const activeModelOption = useMemo(
    () => MODEL_OPTIONS.find((m) => m.id === model) ?? MODEL_OPTIONS[0],
    [model]
  );

  const activeProfile = useMemo(
    () => MODEL_PROFILES.find((p) => p.profileId === profileId) ?? MODEL_PROFILES[0],
    [profileId]
  );

  const filteredThreads = useMemo(() => {
    const q = threadSearch.trim().toLowerCase();
    if (!q) return threads;
    return threads.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        t.messages.some((m) => m.text.toLowerCase().includes(q))
    );
  }, [threadSearch, threads]);

  const savedHistoryThreads = useMemo(() => {
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

  const applyGlobalSettings = useCallback((settings?: GlobalAppSettings) => {
    if (!settings) return;
    if (settings.googleSearchMode) {
      setGoogleSearchMode(settings.googleSearchMode);
    }
    if (settings.defaultModel) {
      const matched = MODEL_PROFILES.find((p) => p.model === settings.defaultModel);
      if (matched) {
        setProfileId(matched.profileId);
        setChatModel(matched.model);
        setModel(matched.workbenchModel);
      }
    }
    if (settings.customSystemInstruction?.trim()) {
      setChatSystemInstruction(settings.customSystemInstruction.trim());
      setSelectedToneId('custom');
    }
  }, []);

  // Branded startup splash screen timing
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setMinSplashDone(true);
    }, 1100);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!authChecking && minSplashDone && !splashHidden) {
      setSplashFading(true);
      const hideTimer = window.setTimeout(() => {
        setSplashHidden(true);
      }, 280);
      return () => window.clearTimeout(hideTimer);
    }
  }, [authChecking, minSplashDone, splashHidden]);

  // Persist appLanguage
  useEffect(() => {
    try {
      localStorage.setItem(APP_LANG_STORAGE_KEY, appLanguage);
    } catch {
      // Ignore storage quota errors
    }
  }, [appLanguage]);

  // Close Chat Options menu on outside click or Escape key
  useEffect(() => {
    if (!chatOptionsOpen) {
      setChatMenuConfirm(null);
      return;
    }
    const handlePointerDown = (e: MouseEvent) => {
      if (chatOptionsRef.current && !chatOptionsRef.current.contains(e.target as Node)) {
        setChatOptionsOpen(false);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setChatOptionsOpen(false);
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [chatOptionsOpen]);

  // Cancel speech synthesis when unmounting
  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  // Verify existing session on startup (with safety timeout so splash never hangs offline)
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 4500);

    fetch('/api/auth/me', { credentials: 'include', signal: controller.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { user?: AuthUser | null; globalSettings?: GlobalAppSettings } | null) => {
        if (!active) return;
        if (data?.user) {
          setCurrentUser(data.user);
        }
        applyGlobalSettings(data?.globalSettings);
      })
      .catch(() => {
        // Require sign-in if auth check fails or times out
      })
      .finally(() => {
        window.clearTimeout(timeoutId);
        if (active) setAuthChecking(false);
      });
    return () => {
      active = false;
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [applyGlobalSettings]);

  const handleAuthenticated = useCallback(
    (payload: { user: AuthUser; sessionToken: string; globalSettings?: GlobalAppSettings }) => {
      setCurrentUser(payload.user);
      setSessionToken(payload.sessionToken);
      applyGlobalSettings(payload.globalSettings);
    },
    [applyGlobalSettings]
  );

  const handleLogout = useCallback(async () => {
    try {
      const headers: Record<string, string> = {};
      if (sessionToken) headers.Authorization = `Bearer ${sessionToken}`;
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers,
        credentials: 'include',
      });
    } catch {
      // Clear local session regardless
    } finally {
      setCurrentUser(null);
      setSessionToken(null);
      setAdminDashboardOpen(false);
      setSettingsOpen(false);
    }
  }, [sessionToken]);

  // Persist history, threads, templates, activeView, and workbench draft
  useEffect(() => {
    try {
      localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history.slice(0, 50)));
    } catch {
      // Ignore storage quota errors
    }
  }, [history]);

  useEffect(() => {
    const capped = retainChatHistoryCap(threads, activeThreadId);
    let sliceCount = capped.length;
    while (sliceCount > 0) {
      try {
        localStorage.setItem(
          CHAT_THREADS_STORAGE_KEY,
          JSON.stringify(capped.slice(0, sliceCount))
        );
        break;
      } catch {
        sliceCount = Math.floor(sliceCount / 2);
      }
    }
  }, [activeThreadId, threads]);

  useEffect(() => {
    try {
      localStorage.setItem(TEMPLATES_STORAGE_KEY, JSON.stringify(templates.slice(0, 60)));
    } catch {
      // Ignore storage quota errors
    }
  }, [templates]);

  useEffect(() => {
    try {
      localStorage.setItem(ACTIVE_VIEW_STORAGE_KEY, activeView);
    } catch {
      // Ignore storage quota errors
    }
  }, [activeView]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const now = new Date().toISOString();
        const draft: WorkbenchDraft = {
          prompt,
          systemInstruction,
          profileId,
          model,
          thinkingLevel,
          responseFormat,
          deliveryMode,
          savedAt: now,
        };
        localStorage.setItem(WORKBENCH_DRAFT_STORAGE_KEY, JSON.stringify(draft));
        setDraftSavedAt(now);
      } catch {
        // Ignore storage quota errors
      }
    }, 150);

    return () => window.clearTimeout(timer);
  }, [prompt, systemInstruction, profileId, model, thinkingLevel, responseFormat, deliveryMode]);

  // Query live backend AI capabilities
  useEffect(() => {
    fetch('/api/capabilities')
      .then((res) => (res.ok ? res.json() : null))
      .then((data: ServerCapabilities | null) => {
        if (data) setCapabilities(data);
      })
      .catch(() => {
        // Ignore transient startup check errors
      });
  }, []);

  const handleChatScroll = useCallback(() => {
    const el = chatContainerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickToBottomRef.current = distanceFromBottom < 110;
  }, []);

  useEffect(() => {
    if (activeView === 'chat' && stickToBottomRef.current) {
      chatScrollEndRef.current?.scrollIntoView({ behavior: 'auto', block: 'end' });
    }
  }, [activeThread?.messages, isChatStreaming, activeView]);

  // Auto-grow bottom chat textarea
  useEffect(() => {
    const el = chatTextareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const nextHeight = chatInput ? Math.min(140, Math.max(44, el.scrollHeight)) : 44;
    el.style.height = `${nextHeight}px`;
  }, [chatInput, activeView]);

  const openSettingsModal = (sec: SettingsSection = 'navigation') => {
    setSettingsSection(sec);
    setSettingsOpen(true);
  };

  const handleSelectProfile = (nextProfileId: ModelProfileId) => {
    const profile = MODEL_PROFILES.find((p) => p.profileId === nextProfileId);
    if (!profile) return;
    if (profile.requiresOpenAI && !capabilities?.openai?.connected) return;
    setProfileId(profile.profileId);
    setChatModel(profile.model);
    setModel(profile.workbenchModel);
    setThinkingLevel(profile.defaultThinking);
  };

  const handleThinkingChange = (nextThinking: ThinkingDepth) => {
    setThinkingLevel(nextThinking);
    if (chatModel === 'auto' && nextThinking === 'DEFAULT') {
      setProfileId('auto-smart');
    } else if (model === 'gemini-4-hydrogen' && (nextThinking === 'HIGH' || nextThinking === 'XHIGH')) {
      setProfileId('flash-thinking');
    } else if (model === 'gemini-4-hydrogen') {
      setProfileId('flash-chat');
    } else {
      setProfileId('flash-lite');
    }
  };

  const handleSelectTone = (toneId: string) => {
    const tone = TONE_PRESETS.find((t) => t.id === toneId);
    if (!tone) return;
    setSelectedToneId(tone.id);
    setChatSystemInstruction(tone.instruction);
  };

  const handleNewChat = () => {
    if (chatAbortRef.current) {
      chatAbortRef.current.abort();
      chatAbortRef.current = null;
    }
    setIsChatStreaming(false);
    setChatError(null);
    setChatAttachment(null);
    setChatDocAttachment(null);
    setChatOptionsOpen(false);
    setActiveView('chat');

    if (activeThread.messages.length === 0) {
      window.setTimeout(() => chatTextareaRef.current?.focus(), 40);
      return;
    }

    const fresh = createEmptyThread();
    setThreads((prev) => retainChatHistoryCap([fresh, ...prev], fresh.id));
    setActiveThreadId(fresh.id);
    window.setTimeout(() => chatTextareaRef.current?.focus(), 40);
  };

  const handleClearActiveConversation = () => {
    if (chatAbortRef.current) {
      chatAbortRef.current.abort();
      chatAbortRef.current = null;
    }
    setIsChatStreaming(false);
    setChatError(null);
    setChatAttachment(null);
    setChatDocAttachment(null);
    setChatOptionsOpen(false);
    setChatMenuConfirm(null);
    const targetId = activeThread.id;
    setThreads((prev) =>
      prev.map((t) =>
        t.id === targetId
          ? {
              ...t,
              title: 'New chat',
              updatedAt: new Date().toISOString(),
              messages: [],
            }
          : t
      )
    );
    window.setTimeout(() => chatTextareaRef.current?.focus(), 40);
  };

  const openRenameDialog = (thread: ChatThread) => {
    setChatOptionsOpen(false);
    setChatMenuConfirm(null);
    setRenameTargetId(thread.id);
    setRenameTitleDraft(thread.title);
  };

  const handleSaveRename = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = renameTitleDraft.trim();
    if (!renameTargetId || !cleaned) return;
    setThreads((prev) =>
      prev.map((t) =>
        t.id === renameTargetId
          ? { ...t, title: cleaned.slice(0, 80), updatedAt: new Date().toISOString() }
          : t
      )
    );
    setRenameTargetId(null);
    setRenameTitleDraft('');
  };

  const handleDeleteThread = (threadId: string) => {
    setChatOptionsOpen(false);
    setChatMenuConfirm(null);
    setThreads((prev) => {
      const remaining = prev.filter((t) => t.id !== threadId);
      if (remaining.length === 0) {
        const fresh = createEmptyThread();
        setActiveThreadId(fresh.id);
        return [fresh];
      }
      if (activeThreadId === threadId) {
        setActiveThreadId(remaining[0].id);
      }
      return remaining;
    });
  };

  const handleClearAllChats = () => {
    if (chatAbortRef.current) {
      chatAbortRef.current.abort();
      chatAbortRef.current = null;
    }
    setIsChatStreaming(false);
    setChatError(null);
    setChatAttachment(null);
    setChatDocAttachment(null);
    setChatOptionsOpen(false);
    setChatMenuConfirm(null);
    const fresh = createEmptyThread();
    setThreads([fresh]);
    setActiveThreadId(fresh.id);
    setSettingsOpen(false);
  };

  const stopChat = () => {
    if (chatAbortRef.current) {
      chatAbortRef.current.abort();
      chatAbortRef.current = null;
    }
    setIsChatStreaming(false);
  };

  const cleanupVoiceResources = useCallback(() => {
    if (recordingTimerRef.current !== null) {
      window.clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((track) => track.stop());
      micStreamRef.current = null;
    }
    mediaRecorderRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      cleanupVoiceResources();
    };
  }, [cleanupVoiceResources]);

  const processImageFile = useCallback((file: File) => {
    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
    const isImageExt = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'heic', 'heif', 'avif'].includes(ext);
    if (!file.type.startsWith('image/') && !isImageExt) {
      setChatError('Only image files (PNG, JPEG, WebP, GIF) can be uploaded as images.');
      return;
    }

    const fallbackRawRead = () => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          const dataUrl = reader.result;
          const base64 = dataUrl.split(',')[1] ?? '';
          const mimeType = file.type.startsWith('image/') ? file.type : 'image/jpeg';
          setChatAttachment({
            dataUrl,
            base64,
            mimeType,
            name: file.name || 'uploaded-image.jpg',
          });
          setChatError(null);
        } else {
          setChatError('Unable to read the selected image. Please try another file.');
        }
      };
      reader.onerror = () => {
        setChatError('Failed to read the image file. Please try again.');
      };
      reader.readAsDataURL(file);
    };

    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const MAX_DIM = 1600;
        const scale = Math.min(1, MAX_DIM / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
        const needsReencode =
          scale < 1 ||
          file.size > 1.2 * 1024 * 1024 ||
          !['image/png', 'image/jpeg', 'image/webp'].includes(file.type);

        if (!needsReencode) {
          URL.revokeObjectURL(objectUrl);
          fallbackRawRead();
          return;
        }

        const targetW = Math.max(1, Math.round(img.naturalWidth * scale));
        const targetH = Math.max(1, Math.round(img.naturalHeight * scale));
        const canvas = document.createElement('canvas');
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          URL.revokeObjectURL(objectUrl);
          fallbackRawRead();
          return;
        }
        ctx.drawImage(img, 0, 0, targetW, targetH);
        const compressedUrl = canvas.toDataURL('image/jpeg', 0.86);
        const compressedBase64 = compressedUrl.split(',')[1] ?? '';
        URL.revokeObjectURL(objectUrl);

        if (!compressedBase64) {
          fallbackRawRead();
          return;
        }
        setChatAttachment({
          dataUrl: compressedUrl,
          base64: compressedBase64,
          mimeType: 'image/jpeg',
          name: file.name || 'uploaded-image.jpg',
        });
        setChatError(null);
      } catch {
        URL.revokeObjectURL(objectUrl);
        fallbackRawRead();
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      fallbackRawRead();
    };
    img.src = objectUrl;
  }, []);

  const processAnyAttachment = useCallback(
    async (file: File) => {
      const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
      const isImage =
        file.type.startsWith('image/') ||
        ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'heic', 'heif', 'avif'].includes(ext);

      if (isImage) {
        processImageFile(file);
        return;
      }

      const textExts = [
        'txt',
        'md',
        'json',
        'csv',
        'ts',
        'tsx',
        'js',
        'jsx',
        'py',
        'html',
        'css',
        'xml',
        'yaml',
        'yml',
        'log',
        'sql',
      ];
      if (file.type.startsWith('text/') || textExts.includes(ext)) {
        if (file.size > 250 * 1024) {
          setChatError('Text/code file is larger than 250 KB. Please attach a smaller snippet or paste relevant lines.');
          return;
        }
        try {
          const textContent = await file.text();
          setChatDocAttachment({
            name: file.name,
            content: textContent.slice(0, 18000),
          });
          setChatError(null);
        } catch {
          setChatError('Unable to read the selected file.');
        }
        return;
      }

      setChatError('Supported attachments: Images (PNG/JPG/WebP/GIF) and text/code/CSV/Markdown files.');
    },
    [processImageFile]
  );

  const handleChatFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      void processAnyAttachment(file);
    }
    e.target.value = '';
  };

  const handleComposerPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = Array.from(e.clipboardData?.items ?? []);
    const imageItem = items.find((item) => item.type.startsWith('image/'));
    if (imageItem) {
      const file = imageItem.getAsFile();
      if (file) {
        e.preventDefault();
        processImageFile(file);
      }
    }
  };

  const handleComposerDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer?.files?.[0];
    if (file) {
      void processAnyAttachment(file);
    }
  };

  const streamAssistantTurn = useCallback(
    async (params: {
      targetThreadId: string;
      assistantMessageId: string;
      promptText: string;
      imagePayload: { data: string; mimeType: string } | null;
      priorMessages: ChatMessage[];
      continuationRange?: {
        startIndex: number;
        totalTarget: number | null;
      } | null;
      originalPrompt?: string;
    }) => {
      if (chatAbortRef.current) {
        chatAbortRef.current.abort();
      }
      const controller = new AbortController();
      chatAbortRef.current = controller;

      setChatError(null);
      setIsChatStreaming(true);
      setStreamingElapsedSec(1);
      stickToBottomRef.current = true;

      const startedAt = performance.now();
      const elapsedInterval = window.setInterval(() => {
        const secs = Math.max(1, Math.floor((performance.now() - startedAt) / 1000) + 1);
        setStreamingElapsedSec(secs);
      }, 1000);

      try {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (sessionToken) {
          headers.Authorization = `Bearer ${sessionToken}`;
        }
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers,
          credentials: 'include',
          signal: controller.signal,
          body: JSON.stringify({
            message: params.promptText,
            image: params.imagePayload,
            history: params.priorMessages.map((m) => ({ role: m.role, text: m.text })),
            model: chatModel,
            thinkingLevel,
            systemInstruction: chatSystemInstruction,
            googleSearch: googleSearchMode,
            verifyMode,
            continuationRange: params.continuationRange ?? null,
          }),
        });

        if (!res.ok || !res.body) {
          let errText = `Request failed with status ${res.status}`;
          try {
            const errJson = await res.json();
            if (errJson?.error) errText = errJson.error;
          } catch {
            // Keep default HTTP message
          }
          throw new Error(errText);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let accumulated = '';
        let finalUsage: UsageMetrics | undefined;
        let finalSources: GroundingSource[] | undefined;
        let finalSearched = false;
        let finalContinuation: ContinuationInfo | undefined;
        let finalMeta: ReplyMeta | undefined;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const events = buffer.split('\n\n');
          buffer = events.pop() ?? '';

          for (const rawEvent of events) {
            const lines = rawEvent.split('\n');
            for (const line of lines) {
              if (!line.startsWith('data: ')) continue;
              const jsonStr = line.slice(6).trim();
              if (!jsonStr) continue;

              const parsed = JSON.parse(jsonStr) as {
                type: 'chunk' | 'done' | 'error';
                text?: string;
                durationMs?: number;
                searched?: boolean;
                usage?: UsageMetrics;
                sources?: GroundingSource[];
                continuation?: ContinuationInfo;
                meta?: ReplyMeta;
                error?: string;
              };

              if (parsed.type === 'error') {
                throw new Error(parsed.error || 'Chat streaming failed.');
              }

              if (parsed.type === 'chunk' && parsed.text) {
                accumulated += parsed.text;
                setThreads((prev) =>
                  prev.map((t) =>
                    t.id === params.targetThreadId
                      ? {
                          ...t,
                          messages: t.messages.map((m) =>
                            m.id === params.assistantMessageId ? { ...m, text: accumulated } : m
                          ),
                        }
                      : t
                  )
                );
              }

              if (parsed.type === 'done') {
                finalUsage = parsed.usage;
                if (typeof parsed.searched === 'boolean') {
                  finalSearched = parsed.searched;
                }
                if (Array.isArray(parsed.sources) && parsed.sources.length > 0) {
                  finalSources = parsed.sources;
                }
                if (parsed.continuation) {
                  finalContinuation = {
                    ...parsed.continuation,
                    originalPrompt: params.originalPrompt ?? params.promptText,
                  };
                }
                if (parsed.meta) {
                  finalMeta = parsed.meta;
                }
              }
            }
          }
        }

        const totalElapsed = Math.round(performance.now() - startedAt);
        setThreads((prev) =>
          prev.map((t) =>
            t.id === params.targetThreadId
              ? {
                  ...t,
                  updatedAt: new Date().toISOString(),
                  messages: t.messages.map((m) =>
                    m.id === params.assistantMessageId
                      ? {
                          ...m,
                          text: accumulated,
                          durationMs: totalElapsed,
                          searched: finalSearched,
                          usage: finalUsage,
                          sources: finalSources,
                          continuation: finalContinuation,
                          meta: finalMeta,
                        }
                      : m
                  ),
                }
              : t
          )
        );
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          setThreads((prev) =>
            prev.map((t) =>
              t.id === params.targetThreadId
                ? {
                    ...t,
                    messages: t.messages.filter(
                      (m) => !(m.id === params.assistantMessageId && m.text.trim() === '')
                    ),
                  }
                : t
            )
          );
          return;
        }
        const message = err instanceof Error ? err.message : 'Unable to send message.';
        setChatError(message);
        setThreads((prev) =>
          prev.map((t) =>
            t.id === params.targetThreadId
              ? {
                  ...t,
                  messages: t.messages.filter(
                    (m) => !(m.id === params.assistantMessageId && m.text.trim() === '')
                  ),
                }
              : t
          )
        );
      } finally {
        window.clearInterval(elapsedInterval);
        if (chatAbortRef.current === controller) {
          chatAbortRef.current = null;
        }
        setIsChatStreaming(false);
      }
    },
    [chatModel, chatSystemInstruction, googleSearchMode, sessionToken, thinkingLevel, verifyMode]
  );

  const sendChatMessage = useCallback(
    async (
      overrideText?: string,
      options?: {
        keepAttachment?: boolean;
        continuationRange?: { startIndex: number; totalTarget: number | null };
        originalPrompt?: string;
      }
    ) => {
      const text = (overrideText ?? chatInput).trim();
      const attachment = overrideText && !options?.keepAttachment ? null : chatAttachment;
      const docAttachment = overrideText && !options?.keepAttachment ? null : chatDocAttachment;
      if ((!text && !attachment && !docAttachment) || isChatStreaming) return;

      // Ensure user transitions into active Chat screen when submitting from Home or elsewhere
      setActiveView('chat');

      const targetThreadId = activeThread.id;
      const priorMessages = activeThread.messages;
      const displayText =
        text ||
        (docAttachment
          ? `Analyze attached file: ${docAttachment.name}`
          : 'Please examine this image and explain what you observe.');

      const apiPromptText = docAttachment
        ? `${displayText}\n\n[Attached File: ${docAttachment.name}]\n\`\`\`\n${docAttachment.content}\n\`\`\``
        : displayText;

      const userMessage: ChatMessage = {
        id: `msg-${Date.now()}-u`,
        role: 'user',
        text: displayText,
        imageUrl: attachment?.dataUrl,
        imageName: attachment?.name,
        attachmentName: docAttachment?.name,
        timestamp: new Date().toISOString(),
      };

      const assistantMessageId = `msg-${Date.now()}-m`;
      const assistantPlaceholder: ChatMessage = {
        id: assistantMessageId,
        role: 'model',
        text: '',
        timestamp: new Date().toISOString(),
        model: chatModel,
        thinkingLevel,
      };

      if (!overrideText) {
        setChatInput('');
      }
      if (!overrideText || options?.keepAttachment) {
        setChatAttachment(null);
        setChatDocAttachment(null);
      }

      stickToBottomRef.current = true;
      setThreads((prev) =>
        prev.map((t) => {
          if (t.id !== targetThreadId) return t;
          const isFirstUserMsg = t.messages.length === 0;
          return {
            ...t,
            title: isFirstUserMsg
              ? displayText.slice(0, 46) + (displayText.length > 46 ? '...' : '')
              : t.title,
            updatedAt: new Date().toISOString(),
            messages: [...t.messages, userMessage, assistantPlaceholder],
          };
        })
      );

      await streamAssistantTurn({
        targetThreadId,
        assistantMessageId,
        promptText: apiPromptText,
        imagePayload: attachment
          ? { data: attachment.base64, mimeType: attachment.mimeType }
          : null,
        priorMessages,
        continuationRange: options?.continuationRange ?? null,
        originalPrompt: options?.originalPrompt ?? displayText,
      });
    },
    [
      activeThread,
      chatAttachment,
      chatDocAttachment,
      chatInput,
      chatModel,
      isChatStreaming,
      streamAssistantTurn,
      thinkingLevel,
    ]
  );

  const handleSaveEditMessage = useCallback(
    async (userMessageId: string) => {
      const cleaned = editingMessageDraft.trim();
      if (!cleaned || isChatStreaming) return;

      const userIndex = activeThread.messages.findIndex((m) => m.id === userMessageId);
      if (userIndex === -1) return;

      const targetUserMsg = activeThread.messages[userIndex];
      const priorMessages = activeThread.messages.slice(0, userIndex);
      const imagePayload = parseDataUrlImage(targetUserMsg.imageUrl);
      const newAssistantId = `msg-${Date.now()}-m`;

      const updatedUserMsg: ChatMessage = {
        ...targetUserMsg,
        text: cleaned,
        timestamp: new Date().toISOString(),
      };

      const freshPlaceholder: ChatMessage = {
        id: newAssistantId,
        role: 'model',
        text: '',
        timestamp: new Date().toISOString(),
        model: chatModel,
        thinkingLevel,
      };

      setEditingMessageId(null);
      setEditingMessageDraft('');

      const targetThreadId = activeThread.id;
      setThreads((prev) =>
        prev.map((t) => {
          if (t.id !== targetThreadId) return t;
          return {
            ...t,
            title:
              userIndex === 0
                ? cleaned.slice(0, 46) + (cleaned.length > 46 ? '...' : '')
                : t.title,
            updatedAt: new Date().toISOString(),
            messages: [...t.messages.slice(0, userIndex), updatedUserMsg, freshPlaceholder],
          };
        })
      );

      await streamAssistantTurn({
        targetThreadId,
        assistantMessageId: newAssistantId,
        promptText: cleaned,
        imagePayload,
        priorMessages,
      });
    },
    [activeThread, chatModel, editingMessageDraft, isChatStreaming, streamAssistantTurn, thinkingLevel]
  );

  const handleContinueMessage = useCallback(
    async (msg: ChatMessage) => {
      if (isChatStreaming || !msg.continuation?.hasMore) return;
      const { nextStart, totalTarget, originalPrompt } = msg.continuation;
      const continuePrompt = totalTarget
        ? `Continue from item ${nextStart} of ${totalTarget} for "${originalPrompt || activeThread.title}" without repeating any previous items.`
        : `Continue from part/section ${nextStart} for "${originalPrompt || activeThread.title}" without repeating any previous content.`;

      await sendChatMessage(continuePrompt, {
        continuationRange: { startIndex: nextStart, totalTarget },
        originalPrompt: originalPrompt || activeThread.title,
      });
    },
    [activeThread.title, isChatStreaming, sendChatMessage]
  );

  const startVoiceRecording = useCallback(async () => {
    if (isChatStreaming || voiceStatus !== 'idle') return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setChatError('Voice recording is not supported in this browser.');
      return;
    }

    setChatError(null);
    voiceCancelledRef.current = false;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;

      const preferredTypes = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/mp4',
        'audio/ogg;codecs=opus',
      ];
      const chosenMime = preferredTypes.find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = chosenMime
        ? new MediaRecorder(stream, { mimeType: chosenMime })
        : new MediaRecorder(stream);

      audioChunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        const mimeType = recorder.mimeType || chosenMime || 'audio/webm';
        const chunks = audioChunksRef.current;
        audioChunksRef.current = [];
        cleanupVoiceResources();

        if (voiceCancelledRef.current) {
          setVoiceStatus('idle');
          setRecordingSeconds(0);
          return;
        }

        const audioBlob = new Blob(chunks, { type: mimeType });
        if (audioBlob.size < 400) {
          setVoiceStatus('idle');
          setRecordingSeconds(0);
          setChatError('Recording was too short. Tap the microphone and speak your question clearly.');
          return;
        }

        setVoiceStatus('transcribing');
        try {
          const base64Audio = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
              if (typeof reader.result === 'string') {
                resolve(reader.result.split(',')[1] ?? '');
              } else {
                reject(new Error('Failed to encode audio recording.'));
              }
            };
            reader.onerror = () => reject(new Error('Failed to read recorded audio.'));
            reader.readAsDataURL(audioBlob);
          });

          const headers: Record<string, string> = { 'Content-Type': 'application/json' };
          if (sessionToken) {
            headers.Authorization = `Bearer ${sessionToken}`;
          }
          const res = await fetch('/api/transcribe', {
            method: 'POST',
            headers,
            credentials: 'include',
            body: JSON.stringify({
              audioData: base64Audio,
              mimeType,
            }),
          });
          const data = await res.json();
          if (!res.ok) {
            throw new Error(data.error || 'Voice transcription failed.');
          }

          const transcript = typeof data.text === 'string' ? data.text.trim() : '';
          if (!transcript) {
            setChatError('No clear speech was detected. Please try recording again.');
            return;
          }

          setVoiceStatus('idle');
          setRecordingSeconds(0);
          await sendChatMessage(transcript, { keepAttachment: true });
          return;
        } catch (err) {
          setChatError(err instanceof Error ? err.message : 'Unable to transcribe voice recording.');
        } finally {
          setVoiceStatus('idle');
          setRecordingSeconds(0);
        }
      };

      mediaRecorderRef.current = recorder;
      recorder.start(250);
      setRecordingSeconds(0);
      setVoiceStatus('recording');
      recordingTimerRef.current = window.setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);
    } catch {
      cleanupVoiceResources();
      setVoiceStatus('idle');
      setChatError(
        'Microphone access was denied or unavailable. Allow microphone permission to ask questions by voice.'
      );
    }
  }, [cleanupVoiceResources, isChatStreaming, sendChatMessage, sessionToken, voiceStatus]);

  const stopVoiceRecording = useCallback(
    (cancel = false) => {
      voiceCancelledRef.current = cancel;
      if (recordingTimerRef.current !== null) {
        window.clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }
      const recorder = mediaRecorderRef.current;
      if (recorder && recorder.state !== 'inactive') {
        recorder.stop();
      } else {
        cleanupVoiceResources();
        setVoiceStatus('idle');
        setRecordingSeconds(0);
      }
    },
    [cleanupVoiceResources]
  );

  const handleRegenerateMessage = useCallback(
    async (assistantMessageId: string) => {
      if (isChatStreaming) return;
      const msgIndex = activeThread.messages.findIndex((m) => m.id === assistantMessageId);
      if (msgIndex === -1) return;

      let userIndex = -1;
      for (let i = msgIndex - 1; i >= 0; i -= 1) {
        if (activeThread.messages[i].role === 'user') {
          userIndex = i;
          break;
        }
      }
      if (userIndex === -1) return;

      const targetUserMsg = activeThread.messages[userIndex];
      const priorMessages = activeThread.messages.slice(0, userIndex);
      const imagePayload = parseDataUrlImage(targetUserMsg.imageUrl);
      const newAssistantId = `msg-${Date.now()}-m`;

      const freshPlaceholder: ChatMessage = {
        id: newAssistantId,
        role: 'model',
        text: '',
        timestamp: new Date().toISOString(),
        model: chatModel,
        thinkingLevel,
      };

      const targetThreadId = activeThread.id;
      setThreads((prev) =>
        prev.map((t) => {
          if (t.id !== targetThreadId) return t;
          return {
            ...t,
            updatedAt: new Date().toISOString(),
            messages: [...t.messages.slice(0, userIndex + 1), freshPlaceholder],
          };
        })
      );

      await streamAssistantTurn({
        targetThreadId,
        assistantMessageId: newAssistantId,
        promptText: targetUserMsg.text,
        imagePayload,
        priorMessages,
      });
    },
    [activeThread, chatModel, isChatStreaming, streamAssistantTurn, thinkingLevel]
  );

  const handleToggleSpeak = (msgId: string, text: string) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    if (speakingMessageId === msgId) {
      window.speechSynthesis.cancel();
      setSpeakingMessageId(null);
      return;
    }
    window.speechSynthesis.cancel();
    const cleaned = text.replace(/[#*`>_~\[\]()]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!cleaned) return;
    const utterance = new SpeechSynthesisUtterance(cleaned.slice(0, 3500));
    utterance.lang = isPashtoText(cleaned) ? 'ps-AF' : 'en-US';
    utterance.onend = () => setSpeakingMessageId(null);
    utterance.onerror = () => setSpeakingMessageId(null);
    setSpeakingMessageId(msgId);
    window.speechSynthesis.speak(utterance);
  };

  const handleChatKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!isChatStreaming && (chatInput.trim() || chatAttachment || chatDocAttachment)) {
        void sendChatMessage();
      }
    }
  };

  const handleCopyMessage = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedMessageId(id);
      window.setTimeout(() => setCopiedMessageId(null), 1800);
    } catch {
      // Ignore clipboard failures
    }
  };

  const buildThreadTranscript = useCallback((thread: ChatThread): string => {
    return thread.messages
      .map((m) => `**${m.role === 'user' ? 'You' : 'TALASH Ai'}**\n\n${m.text}`)
      .join('\n\n---\n\n');
  }, []);

  const handleOpenShareChatMessage = (msg: ChatMessage) => {
    setShareTarget({
      title: activeThread.title || 'TALASH Ai Conversation',
      content: msg.text,
      fullTranscript: buildThreadTranscript(activeThread),
    });
  };

  const handleExportActiveChat = () => {
    const transcript = buildThreadTranscript(activeThread);
    const body = `# ${activeThread.title}\n\n${transcript || '_Empty conversation_'}`;
    const blob = new Blob([body], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `talash-ai-chat-${new Date().toISOString().slice(0, 10)}.md`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Image Creation Studio API Request
  const handleGenerateImage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleaned = imagePrompt.trim();
    if (!cleaned || imageGenerating) return;
    setImageGenerating(true);
    setImageError(null);

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (sessionToken) headers.Authorization = `Bearer ${sessionToken}`;
      const res = await fetch('/api/generate-image', {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({
          prompt: cleaned,
          aspectRatio: imageAspectRatio,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Image generation failed.');
      }
      const nextEntry: GeneratedImageEntry = {
        id: `img-${Date.now()}`,
        prompt: cleaned,
        aspectRatio: data.aspectRatio || imageAspectRatio,
        imageDataUrl: data.imageDataUrl,
        createdAt: new Date().toISOString(),
        durationMs: data.durationMs || 0,
      };
      setGeneratedImages((prev) => [nextEntry, ...prev].slice(0, 8));
    } catch (err) {
      setImageError(err instanceof Error ? err.message : 'Unable to generate image.');
    } finally {
      setImageGenerating(false);
    }
  };

  // Single-prompt Workbench execution
  const stopGeneration = useCallback(() => {
    if (workbenchAbortRef.current) {
      workbenchAbortRef.current.abort();
      workbenchAbortRef.current = null;
    }
    setIsRunning(false);
  }, []);

  const executePrompt = useCallback(
    async (overrides?: {
      prompt?: string;
      systemInstruction?: string;
      model?: GeminiModelId;
      thinkingLevel?: ThinkingDepth;
      responseFormat?: ResponseFormat;
      deliveryMode?: DeliveryMode;
    }) => {
      const targetPrompt = (overrides?.prompt ?? prompt).trim();
      if (!targetPrompt) {
        setErrorMessage('Enter a prompt before running.');
        return;
      }

      if (workbenchAbortRef.current) {
        workbenchAbortRef.current.abort();
      }

      const controller = new AbortController();
      workbenchAbortRef.current = controller;

      const targetModel = overrides?.model ?? model;
      const targetSystem = overrides?.systemInstruction ?? systemInstruction;
      const targetThinking = overrides?.thinkingLevel ?? thinkingLevel;
      const targetFormat = overrides?.responseFormat ?? responseFormat;
      const targetDelivery = overrides?.deliveryMode ?? deliveryMode;

      setIsRunning(true);
      setErrorMessage(null);
      setOutput('');
      setDurationMs(null);
      setUsage(null);
      setWorkbenchTab('editor');

      const startedAt = performance.now();

      try {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (sessionToken) {
          headers.Authorization = `Bearer ${sessionToken}`;
        }
        const res = await fetch('/api/generate', {
          method: 'POST',
          headers,
          credentials: 'include',
          signal: controller.signal,
          body: JSON.stringify({
            prompt: targetPrompt,
            systemInstruction: targetSystem,
            model: targetModel,
            thinkingLevel: targetThinking,
            responseFormat: targetFormat,
            stream: targetDelivery === 'stream',
          }),
        });

        if (targetDelivery === 'single') {
          const data = await res.json();
          if (!res.ok) {
            throw new Error(data.error || `Request failed with status ${res.status}`);
          }

          const finalOutput = typeof data.text === 'string' ? data.text : '';
          const elapsed =
            typeof data.durationMs === 'number'
              ? data.durationMs
              : Math.round(performance.now() - startedAt);
          const finalUsage: UsageMetrics = data.usage ?? {
            promptTokens: null,
            outputTokens: null,
            thinkingTokens: null,
            totalTokens: null,
          };

          setOutput(finalOutput);
          setDurationMs(elapsed);
          setUsage(finalUsage);

          setHistory((prev) => [
            {
              id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
              timestamp: new Date().toISOString(),
              prompt: targetPrompt,
              systemInstruction: targetSystem,
              model: targetModel,
              thinkingLevel: targetThinking,
              responseFormat: targetFormat,
              deliveryMode: targetDelivery,
              output: finalOutput,
              durationMs: elapsed,
              usage: finalUsage,
            },
            ...prev,
          ]);
          return;
        }

        if (!res.ok || !res.body) {
          let errText = `Request failed with status ${res.status}`;
          try {
            const errJson = await res.json();
            if (errJson?.error) errText = errJson.error;
          } catch {
            // Keep default HTTP error message
          }
          throw new Error(errText);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let accumulatedText = '';
        let finalElapsed: number | null = null;
        let finalUsage: UsageMetrics = {
          promptTokens: null,
          outputTokens: null,
          thinkingTokens: null,
          totalTokens: null,
        };

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const events = buffer.split('\n\n');
          buffer = events.pop() ?? '';

          for (const rawEvent of events) {
            const lines = rawEvent.split('\n');
            for (const line of lines) {
              if (!line.startsWith('data: ')) continue;
              const jsonStr = line.slice(6).trim();
              if (!jsonStr) continue;

              const parsed = JSON.parse(jsonStr) as {
                type: 'chunk' | 'done' | 'error';
                text?: string;
                durationMs?: number;
                usage?: UsageMetrics;
                error?: string;
              };

              if (parsed.type === 'error') {
                throw new Error(parsed.error || 'Streaming generation failed.');
              }

              if (parsed.type === 'chunk' && parsed.text) {
                accumulatedText += parsed.text;
                setOutput(accumulatedText);
              }

              if (parsed.type === 'done') {
                finalElapsed = parsed.durationMs ?? Math.round(performance.now() - startedAt);
                if (parsed.usage) {
                  finalUsage = parsed.usage;
                }
              }
            }
          }
        }

        const elapsed = finalElapsed ?? Math.round(performance.now() - startedAt);
        setDurationMs(elapsed);
        setUsage(finalUsage);

        if (accumulatedText.length > 0) {
          setHistory((prev) => [
            {
              id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
              timestamp: new Date().toISOString(),
              prompt: targetPrompt,
              systemInstruction: targetSystem,
              model: targetModel,
              thinkingLevel: targetThinking,
              responseFormat: targetFormat,
              deliveryMode: targetDelivery,
              output: accumulatedText,
              durationMs: elapsed,
              usage: finalUsage,
            },
            ...prev,
          ]);
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          return;
        }
        const message = err instanceof Error ? err.message : 'Unable to reach generation endpoint.';
        setErrorMessage(message);
      } finally {
        if (workbenchAbortRef.current === controller) {
          workbenchAbortRef.current = null;
        }
        setIsRunning(false);
      }
    },
    [deliveryMode, model, prompt, responseFormat, sessionToken, systemInstruction, thinkingLevel]
  );

  const handleLoadPreset = (preset: PromptPreset) => {
    setPrompt(preset.prompt);
    setSystemInstruction(preset.systemInstruction);
    setModel(preset.model);
    setThinkingLevel(preset.thinkingLevel);
    setResponseFormat(preset.responseFormat);
    setProfileId(preset.model === 'gemini-3.1-flash-lite' ? 'flash-lite' : 'flash-chat');
    setActiveView('workbench');
    setWorkbenchTab('editor');
    setMobileConfigOpen(false);
    void executePrompt({
      prompt: preset.prompt,
      systemInstruction: preset.systemInstruction,
      model: preset.model,
      thinkingLevel: preset.thinkingLevel,
      responseFormat: preset.responseFormat,
      deliveryMode,
    });
  };

  const handleLoadHistoryItem = (entry: RunHistoryEntry) => {
    setPrompt(entry.prompt);
    setSystemInstruction(entry.systemInstruction);
    setModel(entry.model);
    setThinkingLevel(entry.thinkingLevel);
    setResponseFormat(entry.responseFormat);
    setDeliveryMode(entry.deliveryMode);
    setOutput(entry.output);
    setDurationMs(entry.durationMs);
    setUsage(entry.usage);
    setErrorMessage(null);
    setActiveView('workbench');
    setWorkbenchTab('editor');
  };

  const handleSaveTemplate = (input: { name: string; scope: TemplateScope }) => {
    const nextTemplate: PromptTemplate = {
      id: `tpl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: input.name,
      scope: input.scope,
      prompt: input.scope === 'system' ? '' : prompt.trim(),
      systemInstruction: input.scope === 'prompt' ? '' : systemInstruction.trim(),
      model,
      thinkingLevel,
      responseFormat,
      updatedAt: new Date().toISOString(),
    };
    setTemplates((prev) => [nextTemplate, ...prev]);
  };

  const handleApplyTemplate = (tpl: PromptTemplate, runImmediately: boolean) => {
    let nextPrompt = prompt;
    let nextSystem = systemInstruction;
    let nextModel = model;
    let nextThinking = thinkingLevel;
    let nextFormat = responseFormat;

    if (tpl.scope === 'system') {
      nextSystem = tpl.systemInstruction;
      setSystemInstruction(tpl.systemInstruction);
    } else if (tpl.scope === 'prompt') {
      nextPrompt = tpl.prompt;
      setPrompt(tpl.prompt);
    } else {
      nextPrompt = tpl.prompt;
      nextSystem = tpl.systemInstruction;
      nextModel = tpl.model;
      nextThinking = tpl.thinkingLevel;
      nextFormat = tpl.responseFormat;
      setPrompt(tpl.prompt);
      setSystemInstruction(tpl.systemInstruction);
      setModel(tpl.model);
      setThinkingLevel(tpl.thinkingLevel);
      setResponseFormat(tpl.responseFormat);
      setProfileId(
        tpl.model === 'gemini-3.1-flash-lite'
          ? 'flash-lite'
          : tpl.thinkingLevel === 'XHIGH'
          ? 'flash-thinking'
          : 'flash-chat'
      );
    }

    setMobileConfigOpen(false);
    setWorkbenchTab('editor');
    if (runImmediately && nextPrompt.trim()) {
      void executePrompt({
        prompt: nextPrompt,
        systemInstruction: nextSystem,
        model: nextModel,
        thinkingLevel: nextThinking,
        responseFormat: nextFormat,
        deliveryMode,
      });
    }
  };

  const handleDeleteTemplate = (id: string) => {
    setTemplates((prev) => prev.filter((item) => item.id !== id));
  };

  const handleDeleteHistoryItem = (id: string) => {
    setHistory((prev) => prev.filter((item) => item.id !== id));
  };

  const handleClearHistory = () => {
    setHistory([]);
  };

  const handleCopyOutput = async () => {
    if (!output) return;
    try {
      await navigator.clipboard.writeText(output);
      setCopiedOutput(true);
      window.setTimeout(() => setCopiedOutput(false), 1800);
    } catch {
      // Ignore clipboard failures
    }
  };

  const handleResetWorkbench = () => {
    stopGeneration();
    setPrompt(INITIAL_PROMPT);
    setSystemInstruction('');
    setProfileId('flash-lite');
    setModel('gemini-3.1-flash-lite');
    setThinkingLevel('MINIMAL');
    setResponseFormat('text');
    setOutput('');
    setDurationMs(null);
    setUsage(null);
    setErrorMessage(null);
    try {
      localStorage.removeItem(WORKBENCH_DRAFT_STORAGE_KEY);
      setDraftSavedAt(null);
    } catch {
      // Ignore storage errors
    }
  };

  const handlePromptKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      if (!isRunning) {
        void executePrompt();
      }
    }
  };

  const wordCount = useMemo(() => {
    const trimmed = prompt.trim();
    return trimmed ? trimmed.split(/\s+/).length : 0;
  }, [prompt]);

  const previousSavedCount = useMemo(
    () => threads.filter((t) => t.id !== activeThreadId && t.messages.length > 0).length,
    [activeThreadId, threads]
  );

  // Quick Home Feature Cards (8 real actions)
  const openQuickPromptInChat = (seedText: string, enableSearch = false) => {
    if (enableSearch) {
      setGoogleSearchMode('always');
    }
    setActiveView('chat');
    setChatInput(seedText);
    window.setTimeout(() => {
      chatTextareaRef.current?.focus();
    }, 60);
  };

  const homeFeatureCards = [
    {
      id: 'ask',
      title: uiCopy.askAnything,
      subtitle: 'Instant answers & guidance',
      icon: MessageSquare,
      iconColor: 'text-cyan-400',
      onClick: () => {
        setActiveView('chat');
        window.setTimeout(() => chatTextareaRef.current?.focus(), 60);
      },
    },
    {
      id: 'ideas',
      title: uiCopy.getIdeas,
      subtitle: 'Brainstorm creative concepts',
      icon: Lightbulb,
      iconColor: 'text-amber-300',
      onClick: () =>
        openQuickPromptInChat('Give me 5 innovative project or business ideas for: '),
    },
    {
      id: 'write',
      title: uiCopy.writeContent,
      subtitle: 'Essays, emails & scripts',
      icon: Pencil,
      iconColor: 'text-sky-400',
      onClick: () =>
        openQuickPromptInChat('Write a polished, well-structured article or email about: '),
    },
    {
      id: 'learn',
      title: uiCopy.learnSomething,
      subtitle: 'Islamic Learning & Lessons',
      icon: BookOpen,
      iconColor: 'text-blue-400',
      onClick: () => setActiveView('learning'),
    },
    {
      id: 'translate',
      title: uiCopy.translate,
      subtitle: 'Pashto, Arabic & English',
      icon: Languages,
      iconColor: 'text-cyan-300',
      onClick: () =>
        openQuickPromptInChat('Translate clearly between Pashto, Arabic, and English:\n'),
    },
    {
      id: 'research',
      title: uiCopy.research,
      subtitle: 'Live Google Search verified',
      icon: Globe,
      iconColor: 'text-emerald-400',
      onClick: () =>
        openQuickPromptInChat('Research with verified sources and explain: ', true),
    },
    {
      id: 'coding',
      title: uiCopy.codingAssistant,
      subtitle: 'Debug, refactor & build code',
      icon: Code2,
      iconColor: 'text-indigo-300',
      onClick: () =>
        openQuickPromptInChat('Help me write or debug clean production code for: '),
    },
    {
      id: 'image',
      title: uiCopy.imageCreation,
      subtitle: 'Generate futuristic AI art',
      icon: Wand2,
      iconColor: 'text-sky-300',
      onClick: () => setActiveView('image'),
    },
  ];

  // Shared Futuristically Styled Message Composer
  const renderMessageComposer = (mode: 'home' | 'chat') => (
    <div
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleComposerDrop}
      className={`${
        mode === 'chat'
          ? 'px-2.5 sm:px-5 py-2.5 bg-[#040916]/90 backdrop-blur-xl border-t border-sky-500/25 shrink-0'
          : 'w-full'
      }`}
    >
      <div className="max-w-[960px] w-full mx-auto space-y-1.5">
        {chatError && (
          <div className="px-3 py-2 rounded-xl bg-red-950/75 border border-red-400/35 text-red-100 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
              <p className="text-xs leading-snug text-red-200 truncate">{chatError}</p>
            </div>
            <button
              type="button"
              onClick={() => setChatError(null)}
              aria-label="Dismiss error"
              className="p-1 text-red-300 hover:text-white rounded-lg shrink-0 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        <div className="talash-glass-card rounded-[22px] px-2.5 sm:px-3.5 py-2 focus-within:border-cyan-400/65 focus-within:shadow-[0_0_24px_rgba(37,99,235,0.28)] transition-all">
          {(chatAttachment || chatDocAttachment) && (
            <div className="mb-2 pb-2 border-b border-sky-500/20 flex flex-wrap items-center justify-between gap-2.5">
              <div className="flex items-center gap-2.5 min-w-0">
                {chatAttachment ? (
                  <>
                    <img
                      src={chatAttachment.dataUrl}
                      alt={chatAttachment.name}
                      referrerPolicy="no-referrer"
                      className="w-10 h-10 rounded-lg object-cover border border-cyan-400/35 shrink-0"
                    />
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-white truncate">
                        {chatAttachment.name}
                      </p>
                      <p className="text-[10px] text-cyan-400">Image ready to send</p>
                    </div>
                  </>
                ) : (
                  docAttachmentBlock(chatDocAttachment!)
                )}
              </div>
              <button
                type="button"
                onClick={() => {
                  setChatAttachment(null);
                  setChatDocAttachment(null);
                }}
                aria-label="Remove attachment"
                className="p-1.5 text-slate-400 hover:text-white hover:bg-sky-500/15 rounded-lg cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {voiceStatus !== 'idle' && (
            <div className="mb-2 px-3 py-1.5 rounded-xl bg-[#050c1e] border border-sky-400/30 flex items-center justify-between gap-2">
              {voiceStatus === 'recording' ? (
                <>
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse shrink-0" />
                    <span className="text-xs font-semibold text-white">Recording</span>
                    <span className="font-mono text-xs text-cyan-300 tabular-nums">
                      {Math.floor(recordingSeconds / 60)}:
                      {String(recordingSeconds % 60).padStart(2, '0')}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => stopVoiceRecording(true)}
                      className="px-2.5 py-1 text-xs font-medium text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => stopVoiceRecording(false)}
                      className="talash-neon-btn inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg whitespace-nowrap cursor-pointer"
                    >
                      <Check className="w-3 h-3" />
                      <span>Send</span>
                    </button>
                  </div>
                </>
              ) : (
                <div className="flex items-center gap-2 text-xs text-cyan-200">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-400 shrink-0" />
                  <span>Converting voice to text...</span>
                </div>
              )}
            </div>
          )}

          <div className="flex items-end gap-2">
            <input
              id="talash-chat-file-upload"
              type="file"
              accept="image/*,.png,.jpg,.jpeg,.webp,.gif,.heic,.heif,.txt,.md,.json,.csv,.ts,.tsx,.js,.jsx,.py,.html,.css,.xml,.yaml,.yml,.log,.sql"
              onChange={handleChatFileUpload}
              className="sr-only"
            />
            <label
              htmlFor="talash-chat-file-upload"
              title="Attach image or file"
              aria-label="Attach image or file"
              className="inline-flex items-center justify-center w-10 h-10 text-slate-300 hover:text-cyan-300 bg-[#050c1e]/90 hover:bg-sky-500/15 border border-sky-400/25 rounded-xl transition-colors shrink-0 cursor-pointer"
            >
              <Paperclip className="w-4 h-4" />
            </label>

            <textarea
              ref={mode === activeView || (mode === 'home' && activeView === 'home') ? chatTextareaRef : undefined}
              rows={1}
              dir={isPashtoText(chatInput) ? 'rtl' : 'ltr'}
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={handleChatKeyDown}
              onPaste={handleComposerPaste}
              placeholder={
                mode === 'home' ? uiCopy.typeMessage : uiCopy.askAnythingPlaceholder
              }
              className={`flex-1 min-w-0 min-h-[44px] max-h-[140px] px-1.5 py-2.5 text-[15px] leading-snug text-white placeholder:text-slate-400 bg-transparent focus:outline-none resize-none ${
                isPashtoText(chatInput) ? 'text-right' : 'text-left'
              }`}
            />

            <button
              type="button"
              disabled={isChatStreaming || voiceStatus === 'transcribing'}
              onClick={() => {
                if (voiceStatus === 'recording') {
                  stopVoiceRecording(false);
                } else {
                  void startVoiceRecording();
                }
              }}
              aria-label={voiceStatus === 'recording' ? 'Stop voice recording' : 'Voice input'}
              title={voiceStatus === 'recording' ? 'Stop voice recording' : 'Ask by voice'}
              className={`inline-flex items-center justify-center w-10 h-10 border rounded-xl transition-colors shrink-0 cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed ${
                voiceStatus === 'recording'
                  ? 'bg-red-500/20 border-red-400/50 text-red-300 hover:bg-red-500/30'
                  : 'text-slate-300 hover:text-cyan-300 bg-[#050c1e]/90 hover:bg-sky-500/15 border-sky-400/25'
              }`}
            >
              {voiceStatus === 'recording' ? (
                <Square className="w-3.5 h-3.5 fill-current" />
              ) : (
                <Mic className="w-4 h-4" />
              )}
            </button>

            {isChatStreaming ? (
              <button
                type="button"
                onClick={stopChat}
                aria-label="Stop generating"
                className="w-10 h-10 rounded-full bg-red-600/85 hover:bg-red-500 text-white flex items-center justify-center shadow-[0_0_16px_rgba(239,68,68,0.4)] transition-colors shrink-0 cursor-pointer"
              >
                <Square className="w-4 h-4 fill-current" />
              </button>
            ) : (
              <button
                type="button"
                disabled={
                  voiceStatus !== 'idle' ||
                  (!chatInput.trim() && !chatAttachment && !chatDocAttachment)
                }
                onClick={() => void sendChatMessage()}
                aria-label="Send message"
                className="talash-neon-btn w-10 h-10 rounded-full disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center shrink-0 cursor-pointer"
              >
                <ArrowUp className="w-[18px] h-[18px]" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  function docAttachmentBlock(doc: { name: string; content: string }) {
    return (
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="w-9 h-9 rounded-lg bg-sky-500/20 border border-cyan-400/35 text-cyan-300 flex items-center justify-center shrink-0">
          <FileText className="w-4 h-4" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-medium text-white truncate">{doc.name}</p>
          <p className="text-[10px] text-cyan-400">
            Document attached ({doc.content.length} chars)
          </p>
        </div>
      </div>
    );
  }

  const showSplashOverlay = authChecking || !splashHidden;

  if (authChecking) {
    return <SplashScreen fadingOut={splashFading} />;
  }

  const hasAuthLinkAction =
    typeof window !== 'undefined' &&
    (new URLSearchParams(window.location.search).has('verify_email') ||
      new URLSearchParams(window.location.search).has('reset_password'));

  if (!currentUser || hasAuthLinkAction) {
    return (
      <>
        <AuthGateModal onAuthenticated={handleAuthenticated} />
        {showSplashOverlay && <SplashScreen fadingOut={splashFading} />}
      </>
    );
  }

  const bottomNavItems: Array<{
    id: ActiveView;
    label: string;
    icon: typeof Home;
    matches?: ActiveView[];
  }> = [
    { id: 'home', label: uiCopy.navHome, icon: Home, matches: ['home', 'learning', 'image', 'workbench', 'batch'] },
    { id: 'chat', label: uiCopy.navChat, icon: MessageSquare, matches: ['chat'] },
    { id: 'history', label: uiCopy.navHistory, icon: History, matches: ['history'] },
    { id: 'settings', label: uiCopy.navSettings, icon: Settings, matches: ['settings'] },
    { id: 'premium', label: uiCopy.navPremium, icon: Crown, matches: ['premium'] },
  ];

  const isBottomNavTabActive = (item: (typeof bottomNavItems)[number]) =>
    item.matches ? item.matches.includes(activeView) : activeView === item.id;

  return (
    <div
      className={`${
        activeView === 'chat' ? 'h-[100dvh] overflow-hidden' : 'min-h-[100dvh]'
      } flex flex-col talash-cosmic-bg text-slate-100`}
    >
      {/* FUTURISTIC SINGLE-ROW TOP HEADER */}
      <header className="sticky top-0 z-30 h-[62px] bg-[#040916]/90 backdrop-blur-xl border-b border-sky-500/25 shadow-[0_6px_28px_rgba(2,8,24,0.65)] px-3 sm:px-5 lg:px-6 flex items-center justify-between gap-2 sm:gap-4 shrink-0">
        {/* Left: Futuristic Robot-Helmet Logo + TALASH Ai Brand + Tagline */}
        <button
          type="button"
          onClick={() => setActiveView('home')}
          className="inline-flex items-center gap-2.5 sm:gap-3 min-w-0 cursor-pointer rounded-xl py-0.5 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400"
        >
          <TalashLogoMark className="w-10 h-10 shrink-0 rounded-full" />
          <div className="min-w-0">
            <span className="font-display text-[17px] sm:text-[20px] font-bold tracking-tight text-white whitespace-nowrap block leading-tight">
              TALASH <span className="text-cyan-400 italic">Ai</span>
            </span>
            <span className="hidden min-[380px]:block text-[10.5px] sm:text-[11px] text-slate-400 truncate leading-tight">
              {uiCopy.subtitle}
            </span>
          </div>
        </button>

        {/* Right: Glowing Blue New Chat Pill + Vertical Ellipsis Menu */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <div ref={chatOptionsRef} className="relative flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={handleNewChat}
              title={uiCopy.newChat}
              className="talash-neon-btn inline-flex items-center gap-1.5 px-3 sm:px-4 min-h-[40px] text-xs sm:text-[13px] font-semibold rounded-xl whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400"
            >
              <SquarePen className="w-3.5 h-3.5 shrink-0" />
              <span>{uiCopy.newChat}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setChatMenuConfirm(null);
                setChatOptionsOpen((prev) => !prev);
              }}
              aria-haspopup="menu"
              aria-expanded={chatOptionsOpen}
              aria-label="Chat Options"
              title="Chat Options"
              className={`inline-flex items-center justify-center w-10 h-10 text-xs font-semibold rounded-xl border transition-colors shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400 ${
                chatOptionsOpen
                  ? 'bg-sky-500/25 text-white border-cyan-400/55 shadow-[0_0_16px_rgba(34,211,238,0.28)]'
                  : 'bg-[#081229] text-slate-200 hover:text-white border-sky-400/25 hover:border-cyan-400/50'
              }`}
            >
              <MoreVertical className="w-4 h-4 shrink-0" />
            </button>

            {chatOptionsOpen && (
              <div
                role="menu"
                aria-label="Chat Options Menu"
                className="absolute right-0 top-[calc(100%+8px)] w-64 bg-[#071127]/95 backdrop-blur-xl border border-sky-400/35 rounded-2xl shadow-[0_22px_55px_rgba(2,8,24,0.88)] p-1.5 z-50 origin-top-right animate-talash-dropdown"
              >
                <div className="px-3 py-2 border-b border-sky-500/20 mb-1">
                  <p className="text-[11px] font-medium text-cyan-400">Active Conversation</p>
                  <p className="text-xs font-semibold text-white truncate mt-0.5">
                    {activeThread.title}
                  </p>
                </div>

                <button
                  type="button"
                  role="menuitem"
                  onClick={handleNewChat}
                  className="w-full flex items-center gap-2.5 px-3 min-h-[42px] text-xs font-medium text-slate-200 hover:bg-sky-500/15 hover:text-white rounded-xl transition-colors text-left cursor-pointer"
                >
                  <Plus className="w-4 h-4 text-cyan-400 shrink-0" />
                  <span>{uiCopy.newChat}</span>
                </button>

                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setChatOptionsOpen(false);
                    setActiveView('history');
                  }}
                  className="w-full flex items-center justify-between gap-2 px-3 min-h-[42px] text-xs font-medium text-slate-200 hover:bg-sky-500/15 hover:text-white rounded-xl transition-colors text-left cursor-pointer"
                >
                  <span className="inline-flex items-center gap-2.5">
                    <History className="w-4 h-4 text-sky-400 shrink-0" />
                    <span>{uiCopy.chatHistory}</span>
                  </span>
                  <span className="font-mono text-[11px] text-cyan-300 tabular-nums">
                    {previousSavedCount}/20
                  </span>
                </button>

                <button
                  type="button"
                  role="menuitem"
                  onClick={() => openRenameDialog(activeThread)}
                  className="w-full flex items-center gap-2.5 px-3 min-h-[42px] text-xs font-medium text-slate-200 hover:bg-sky-500/15 hover:text-white rounded-xl transition-colors text-left cursor-pointer"
                >
                  <Pencil className="w-4 h-4 text-sky-400 shrink-0" />
                  <span>{uiCopy.renameChat}</span>
                </button>

                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setChatOptionsOpen(false);
                    openSettingsModal('navigation');
                  }}
                  className="w-full flex items-center gap-2.5 px-3 min-h-[42px] text-xs font-medium text-slate-200 hover:bg-sky-500/15 hover:text-white rounded-xl transition-colors text-left cursor-pointer"
                >
                  <Settings className="w-4 h-4 text-sky-400 shrink-0" />
                  <span>Quick Settings Drawer</span>
                </button>

                <div className="my-1 border-t border-sky-500/20" />

                {chatMenuConfirm === 'clear' ? (
                  <div className="flex items-center gap-1.5 px-2 py-1.5 bg-amber-950/60 border border-amber-400/30 rounded-xl">
                    <button
                      type="button"
                      onClick={handleClearActiveConversation}
                      className="flex-1 px-2.5 py-1.5 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-500 rounded-lg cursor-pointer transition-colors"
                    >
                      Confirm Clear
                    </button>
                    <button
                      type="button"
                      onClick={() => setChatMenuConfirm(null)}
                      className="px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    role="menuitem"
                    disabled={activeThread.messages.length === 0}
                    onClick={() => setChatMenuConfirm('clear')}
                    className="w-full flex items-center gap-2.5 px-3 min-h-[42px] text-xs font-medium text-slate-200 hover:bg-sky-500/15 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl transition-colors text-left cursor-pointer"
                  >
                    <Eraser className="w-4 h-4 text-slate-400 shrink-0" />
                    <span>{uiCopy.clearConversation}</span>
                  </button>
                )}

                {chatMenuConfirm === 'delete' ? (
                  <div className="flex items-center gap-1.5 px-2 py-1.5 bg-red-950/65 border border-red-400/30 rounded-xl mt-1">
                    <button
                      type="button"
                      onClick={() => handleDeleteThread(activeThread.id)}
                      className="flex-1 px-2.5 py-1.5 text-xs font-semibold text-white bg-red-600 hover:bg-red-500 rounded-lg cursor-pointer transition-colors"
                    >
                      Confirm Delete
                    </button>
                    <button
                      type="button"
                      onClick={() => setChatMenuConfirm(null)}
                      className="px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => setChatMenuConfirm('delete')}
                    className="w-full flex items-center gap-2.5 px-3 min-h-[42px] text-xs font-medium text-red-300 hover:bg-red-500/15 rounded-xl transition-colors text-left cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4 shrink-0" />
                    <span>{uiCopy.deleteChat}</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ==================== 1. HOME SCREEN ==================== */}
      {activeView === 'home' && (
        <main className="flex-1 w-full max-w-[1040px] mx-auto px-3 sm:px-6 py-4 sm:py-6 flex flex-col justify-between gap-5">
          <div className="space-y-5">
            {/* Greeting Welcome Glass Card (Exact reference direction) */}
            <section className="talash-glass-card rounded-3xl p-4 sm:p-6 flex items-center gap-3.5 sm:gap-5 relative overflow-hidden">
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -right-10 -top-12 w-44 h-44 rounded-full bg-cyan-500/10 blur-2xl"
              />
              <TalashLogoMark className="w-14 h-14 sm:w-16 sm:h-16 rounded-full shrink-0" />
              <div
                dir={appLanguage === 'en' ? 'ltr' : 'rtl'}
                className={`min-w-0 flex-1 space-y-1 ${appLanguage === 'en' ? 'text-left' : 'text-right'}`}
              >
                <h1 className="font-display text-base sm:text-xl font-bold text-white leading-snug">
                  {uiCopy.hello}{' '}
                  <span className="text-cyan-400">{uiCopy.iAm}</span>
                </h1>
                <p className="text-sm sm:text-base text-slate-200 leading-snug">
                  {uiCopy.howHelp}
                </p>
              </div>
            </section>

            {/* 8 Interactive Feature Cards */}
            <section className="space-y-2.5">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
                {homeFeatureCards.map((card) => {
                  const Icon = card.icon;
                  return (
                    <button
                      key={card.id}
                      type="button"
                      onClick={card.onClick}
                      className="talash-glass-card talash-glass-card-hover rounded-2xl p-3.5 sm:p-4 text-left flex items-center sm:flex-col sm:items-start gap-3 cursor-pointer"
                    >
                      <div className="w-10 h-10 rounded-xl bg-[#050c1e] border border-sky-400/30 flex items-center justify-center shrink-0 shadow-[0_0_16px_rgba(37,99,235,0.2)]">
                        <Icon className={`w-5 h-5 ${card.iconColor}`} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs sm:text-sm font-semibold text-white truncate">
                          {card.title}
                        </p>
                        <p className="text-[11px] text-slate-400 truncate mt-0.5 hidden sm:block">
                          {card.subtitle}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Quick Pro Tools + Language Switcher Row */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setActiveView('workbench')}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-200 bg-[#081229]/90 hover:bg-sky-500/20 border border-sky-400/25 rounded-xl cursor-pointer transition-colors"
                  >
                    <Code2 className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Prompt Workbench</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveView('batch')}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-200 bg-[#081229]/90 hover:bg-sky-500/20 border border-sky-400/25 rounded-xl cursor-pointer transition-colors"
                  >
                    <Layers className="w-3.5 h-3.5 text-sky-400" />
                    <span>Batch CSV</span>
                  </button>
                  {currentUser.role === 'super_admin' && (
                    <button
                      type="button"
                      onClick={() => setAdminDashboardOpen(true)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-cyan-200 bg-sky-500/20 hover:bg-sky-500/30 border border-cyan-400/40 rounded-xl cursor-pointer transition-colors"
                    >
                      <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
                      <span>Owner Admin</span>
                    </button>
                  )}
                </div>

                {/* Compact Language Quick Switcher */}
                <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-[#050c1e]/90 border border-sky-400/25">
                  {(
                    [
                      { id: 'en', label: 'EN' },
                      { id: 'ps', label: 'پښتو' },
                      { id: 'ar', label: 'العربية' },
                    ] as const
                  ).map((lang) => (
                    <button
                      key={lang.id}
                      type="button"
                      onClick={() => setAppLanguage(lang.id)}
                      className={`px-2.5 py-1 text-[11px] font-semibold rounded-lg transition-colors cursor-pointer ${
                        appLanguage === lang.id
                          ? 'talash-neon-btn'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {lang.label}
                    </button>
                  ))}
                </div>
              </div>
            </section>

            {/* Glowing Neural Brain Centerpiece */}
            <NeuralBrainBanner tagline={uiCopy.smarterFasterBetter} />
          </div>

          {/* Bottom Message Input Bar directly integrated above Bottom Nav */}
          <div className="pt-1">{renderMessageComposer('home')}</div>
        </main>
      )}

      {/* ==================== 2. CHAT WORKSPACE ==================== */}
      {activeView === 'chat' && (
        <div className="flex-1 min-h-0 flex flex-row overflow-hidden w-full relative">
          {/* Desktop Left Conversation History Sidebar */}
          <aside
            aria-label="Chat history sidebar"
            className={`hidden ${
              sidebarOpen ? 'lg:flex lg:w-[276px]' : 'lg:hidden'
            } flex-col h-full min-h-0 shrink-0 bg-[#050b19]/95 backdrop-blur-xl border-r border-sky-500/25 overflow-hidden`}
          >
            <div className="p-3 space-y-2.5 border-b border-sky-500/20 shrink-0">
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={handleNewChat}
                  className="talash-neon-btn flex-1 inline-flex items-center justify-between px-3 min-h-[40px] text-xs font-semibold rounded-xl cursor-pointer"
                >
                  <span className="inline-flex items-center gap-2">
                    <SquarePen className="w-3.5 h-3.5" />
                    <span>{uiCopy.newChat}</span>
                  </span>
                  <Plus className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setSidebarOpen(false)}
                  aria-label="Hide sidebar"
                  className="w-10 h-10 inline-flex items-center justify-center text-slate-400 hover:text-white hover:bg-sky-500/15 border border-sky-500/20 rounded-xl transition-colors cursor-pointer shrink-0"
                >
                  <PanelLeftClose className="w-4 h-4" />
                </button>
              </div>

              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={threadSearch}
                  onChange={(e) => setThreadSearch(e.target.value)}
                  placeholder="Search chats..."
                  className="w-full pl-8 pr-3 min-h-[36px] text-xs bg-[#081229] border border-sky-400/25 rounded-xl text-white placeholder:text-slate-500 focus:outline-none focus:border-cyan-400 transition-colors"
                />
              </div>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-2.5 py-2.5 space-y-1">
              <div className="px-2 py-1 flex items-center justify-between text-[11px] font-semibold text-cyan-400/90 tabular-nums">
                <span>Saved Conversations</span>
                <span>{filteredThreads.length}</span>
              </div>

              {filteredThreads.length === 0 ? (
                <div className="px-3 py-6 text-center text-xs text-slate-400">
                  No matching chats found.
                </div>
              ) : (
                filteredThreads.map((thread) => {
                  const isActive = thread.id === activeThread.id;
                  const shortDate = formatShortThreadDate(thread.updatedAt);
                  return (
                    <div
                      key={thread.id}
                      className={`group flex items-center justify-between gap-2 px-2.5 py-2 rounded-xl transition-colors border ${
                        isActive
                          ? 'bg-sky-500/20 border-cyan-400/45 text-white shadow-[0_0_16px_rgba(37,99,235,0.2)]'
                          : 'border-transparent text-slate-300 hover:bg-sky-500/10 hover:text-white'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setActiveThreadId(thread.id);
                          setChatError(null);
                        }}
                        className="flex-1 flex items-start gap-2.5 text-left min-w-0 cursor-pointer py-0.5"
                      >
                        <MessageSquare
                          className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${
                            isActive ? 'text-cyan-400' : 'text-slate-500'
                          }`}
                        />
                        <div className="min-w-0 flex-1">
                          <span
                            className={`block text-[13px] truncate ${
                              isActive ? 'font-semibold text-white' : 'font-medium text-slate-200'
                            }`}
                          >
                            {thread.title}
                          </span>
                          <span className="block text-[11px] text-slate-400 tabular-nums mt-0.5 truncate">
                            {thread.messages.length}{' '}
                            {thread.messages.length === 1 ? 'msg' : 'msgs'}
                            {shortDate ? ` · ${shortDate}` : ''}
                          </span>
                        </div>
                      </button>

                      <div className="flex items-center gap-0.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => openRenameDialog(thread)}
                          aria-label="Rename conversation"
                          title="Rename chat"
                          className="w-7 h-7 inline-flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-sky-500/20 lg:opacity-0 lg:group-hover:opacity-100 focus:opacity-100 transition-opacity cursor-pointer shrink-0"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        {threads.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleDeleteThread(thread.id)}
                            aria-label="Delete conversation"
                            title="Delete chat"
                            className="w-7 h-7 inline-flex items-center justify-center rounded-lg text-slate-400 hover:text-red-300 hover:bg-red-500/20 lg:opacity-0 lg:group-hover:opacity-100 focus:opacity-100 transition-opacity cursor-pointer shrink-0"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="p-3 border-t border-sky-500/20 shrink-0 space-y-2">
              <button
                type="button"
                onClick={() => setActiveView('learning')}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl bg-[#081229] border border-sky-400/25 hover:border-cyan-400/50 transition-all text-left cursor-pointer"
              >
                <BookOpen className="w-4 h-4 text-cyan-400 shrink-0" />
                <span className="text-xs font-semibold text-white truncate">
                  Islamic Learning Center
                </span>
              </button>

              <button
                type="button"
                onClick={() => setActiveView('image')}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl bg-[#081229] border border-sky-400/25 hover:border-cyan-400/50 transition-all text-left cursor-pointer"
              >
                <Wand2 className="w-4 h-4 text-sky-400 shrink-0" />
                <span className="text-xs font-semibold text-white truncate">
                  Image Creation Studio
                </span>
              </button>
            </div>
          </aside>

          {/* Main Conversational Canvas */}
          <main className="flex-1 min-w-0 min-h-0 flex flex-col h-full relative overflow-hidden">
            {!sidebarOpen && (
              <button
                type="button"
                onClick={() => setSidebarOpen(true)}
                aria-label="Show sidebar"
                title="Show chat history sidebar"
                className="hidden lg:inline-flex items-center justify-center w-9 h-9 rounded-xl bg-[#071127]/90 border border-sky-400/30 text-cyan-300 hover:text-white shadow-lg absolute top-3 left-3 z-20 cursor-pointer"
              >
                <PanelLeftOpen className="w-4 h-4" />
              </button>
            )}

            {/* Scrollable Message Stream */}
            <div
              ref={chatContainerRef}
              onScroll={handleChatScroll}
              className="flex-1 min-h-0 overflow-y-auto overscroll-contain"
            >
              {activeThread.messages.length === 0 ? (
                <div className="max-w-[920px] w-full min-h-full mx-auto px-3 sm:px-6 py-6 sm:py-10 flex flex-col items-center justify-center text-center space-y-6">
                  <div className="space-y-3 max-w-xl">
                    <div className="mx-auto flex items-center justify-center">
                      <TalashLogoMark className="w-16 h-16 rounded-full" />
                    </div>
                    <h1 className="font-display text-xl sm:text-3xl font-bold text-white tracking-tight text-balance">
                      TALASH <span className="text-cyan-400 italic">Ai</span> — What would you like to find?
                    </h1>
                    <p className="text-xs sm:text-sm leading-relaxed text-slate-300">
                      Fast streaming answers in Pashto, Arabic, and English—with authentic Islamic references, code assistance, and live Google Search verification.
                    </p>
                  </div>

                  {/* Quick Navigation Actions */}
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    <button
                      type="button"
                      onClick={() => setActiveView('learning')}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#081229] hover:bg-sky-500/20 border border-sky-400/30 rounded-xl cursor-pointer transition-colors"
                    >
                      <BookOpen className="w-3.5 h-3.5 text-cyan-400" />
                      <span>Islamic Learning</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveView('image')}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#081229] hover:bg-sky-500/20 border border-sky-400/30 rounded-xl cursor-pointer transition-colors"
                    >
                      <Wand2 className="w-3.5 h-3.5 text-sky-400" />
                      <span>Image Studio</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => openSettingsModal('model')}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#081229] hover:bg-sky-500/20 border border-sky-400/30 rounded-xl cursor-pointer transition-colors"
                    >
                      <Globe className="w-3.5 h-3.5 text-emerald-400" />
                      <span>{activeProfile.label}</span>
                    </button>
                  </div>

                  <div className="w-full grid grid-cols-1 sm:grid-cols-3 gap-3 text-left">
                    {CHAT_STARTERS.map((starter) => {
                      const starterPashto = isPashtoText(starter.prompt);
                      return (
                        <button
                          key={starter.prompt}
                          type="button"
                          onClick={() => void sendChatMessage(starter.prompt)}
                          dir={starterPashto ? 'rtl' : 'ltr'}
                          className={`talash-glass-card talash-glass-card-hover p-4 rounded-2xl flex flex-col justify-between gap-3 cursor-pointer ${
                            starterPashto ? 'text-right' : 'text-left'
                          }`}
                        >
                          <div className="space-y-1">
                            <p className="text-xs font-semibold text-cyan-300">{starter.title}</p>
                            <p className="text-xs text-slate-300 leading-relaxed line-clamp-3">
                              {starter.prompt}
                            </p>
                          </div>
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-cyan-400">
                            <span>Ask TALASH Ai</span>
                            <ArrowUpRight className="w-3 h-3" />
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="w-full max-w-[960px] mx-auto px-2.5 sm:px-5 py-4 space-y-4">
                  {activeThread.messages.map((msg) => {
                    const isUser = msg.role === 'user';
                    const isPashto = isPashtoText(msg.text);

                    if (isUser) {
                      const isEditing = editingMessageId === msg.id;
                      return (
                        <div
                          key={msg.id}
                          className={`flex w-full ${isPashto ? 'justify-start' : 'justify-end'}`}
                        >
                          <div
                            dir={isPashto ? 'rtl' : 'ltr'}
                            className={`max-w-[90%] sm:max-w-[78%] rounded-2xl px-4 py-3 bg-gradient-to-br from-[#1d4ed8] via-[#2563eb] to-[#0284c7] text-white border border-cyan-300/35 shadow-[0_8px_24px_rgba(37,99,235,0.32)] space-y-2 ${
                              isPashto ? 'text-right' : 'text-left'
                            }`}
                          >
                            {msg.imageUrl && (
                              <img
                                src={msg.imageUrl}
                                alt={msg.imageName || 'Uploaded image'}
                                referrerPolicy="no-referrer"
                                className="max-h-52 rounded-xl object-contain border border-white/25"
                              />
                            )}
                            {msg.attachmentName && (
                              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-950/40 border border-cyan-300/30 text-[11px] text-cyan-100">
                                <FileText className="w-3.5 h-3.5 text-cyan-300 shrink-0" />
                                <span className="truncate max-w-[200px]">{msg.attachmentName}</span>
                              </div>
                            )}

                            {isEditing ? (
                              <div className="space-y-2 min-w-[240px]">
                                <textarea
                                  rows={3}
                                  value={editingMessageDraft}
                                  onChange={(e) => setEditingMessageDraft(e.target.value)}
                                  className="w-full px-3 py-2 text-sm bg-slate-950/60 border border-cyan-300/50 rounded-xl text-white focus:outline-none"
                                />
                                <div className="flex items-center justify-end gap-2">
                                  <button
                                    type="button"
                                    onClick={() => setEditingMessageId(null)}
                                    className="px-2.5 py-1 text-xs font-medium text-slate-200 hover:text-white rounded-lg cursor-pointer"
                                  >
                                    Cancel
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => void handleSaveEditMessage(msg.id)}
                                    className="px-3 py-1 text-xs font-semibold bg-white text-blue-900 rounded-lg cursor-pointer"
                                  >
                                    Save &amp; Resend
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <>
                                <p className="text-[15.5px] leading-relaxed whitespace-pre-wrap">
                                  {msg.text}
                                </p>
                                <div
                                  dir="ltr"
                                  className="flex items-center justify-between gap-3 pt-1 text-[10.5px] text-sky-100/80"
                                >
                                  <span className="tabular-nums">{formatTimestamp(msg.timestamp)}</span>
                                  {!isChatStreaming && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setEditingMessageId(msg.id);
                                        setEditingMessageDraft(msg.text);
                                      }}
                                      className="inline-flex items-center gap-1 hover:text-white cursor-pointer"
                                      title="Edit message"
                                    >
                                      <Pencil className="w-3 h-3" />
                                      <span>Edit</span>
                                    </button>
                                  )}
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    }

                    const domainLabel =
                      msg.meta?.domain === 'islamic'
                        ? 'Islamic'
                        : msg.meta?.domain === 'coding'
                        ? 'Coding'
                        : msg.meta?.domain === 'translation'
                        ? 'Translation'
                        : msg.meta?.domain === 'research'
                        ? 'Research'
                        : null;

                    return (
                      <div key={msg.id} className="w-full">
                        <div className="talash-glass-card rounded-2xl overflow-hidden">
                          {/* AI Header + Helmet Avatar + Metadata */}
                          <div
                            dir="ltr"
                            className="px-3.5 sm:px-5 py-2.5 bg-[#050c1e]/85 border-b border-sky-500/20 flex flex-wrap items-center justify-between gap-2 text-left"
                          >
                            <div className="flex flex-wrap items-center gap-2 min-w-0">
                              <TalashLogoMark className="w-6 h-6 rounded-full shrink-0" />
                              <span className="text-[13.5px] font-bold text-white tracking-tight whitespace-nowrap">
                                TALASH <span className="text-cyan-400 italic">Ai</span>
                              </span>

                              <span className="h-3 w-px bg-sky-500/30 shrink-0" aria-hidden="true" />

                              {msg.durationMs !== undefined ? (
                                <div className="inline-flex items-center gap-1.5 text-xs text-slate-400 tabular-nums whitespace-nowrap">
                                  {msg.searched ? (
                                    <>
                                      <Globe className="w-3 h-3 text-cyan-400 shrink-0" />
                                      <span className="font-medium text-cyan-300">Searched</span>
                                    </>
                                  ) : (
                                    <Sparkles className="w-3 h-3 text-cyan-400 shrink-0" />
                                  )}
                                  <span>{formatReplySeconds(msg.durationMs)}</span>
                                  {domainLabel && (
                                    <>
                                      <span aria-hidden="true">·</span>
                                      <span className="text-sky-300">{domainLabel}</span>
                                    </>
                                  )}
                                  {msg.meta?.multiModelSynthesized && (
                                    <>
                                      <span aria-hidden="true">·</span>
                                      <span className="inline-flex items-center gap-1 text-emerald-300 font-medium">
                                        <ShieldCheck className="w-3 h-3" />
                                        <span>Verified</span>
                                      </span>
                                    </>
                                  )}
                                </div>
                              ) : (
                                <div className="inline-flex items-center gap-1.5 text-xs text-cyan-300 tabular-nums whitespace-nowrap">
                                  <Loader2 className="w-3 h-3 animate-spin text-cyan-400 shrink-0" />
                                  <span>{msg.text ? 'Streaming' : 'Thinking'}</span>
                                  <span className="font-medium text-white">
                                    {streamingElapsedSec}s
                                  </span>
                                </div>
                              )}
                            </div>

                            <span className="text-[10.5px] text-slate-500 tabular-nums">
                              {formatTimestamp(msg.timestamp)}
                            </span>
                          </div>

                          {/* Response Body */}
                          <div
                            dir={isPashto ? 'rtl' : 'ltr'}
                            className={`px-3.5 sm:px-6 py-4.5 ${
                              isPashto ? 'text-right' : 'text-left'
                            }`}
                          >
                            {msg.text ? (
                              <MarkdownOutput content={msg.text} dir={isPashto ? 'rtl' : 'ltr'} />
                            ) : (
                              <div className="space-y-2.5 py-1">
                                <div className="h-3.5 w-3/4 bg-sky-500/15 rounded animate-pulse" />
                                <div className="h-3.5 w-1/2 bg-sky-500/15 rounded animate-pulse" />
                              </div>
                            )}
                          </div>

                          {/* Continuation Progress & Button */}
                          {msg.continuation && msg.durationMs !== undefined && (
                            <div
                              dir="ltr"
                              className="mx-3.5 sm:mx-6 mb-3 p-3 rounded-xl bg-[#050c1e]/90 border border-sky-400/25 flex flex-wrap items-center justify-between gap-3"
                            >
                              <div className="space-y-1 min-w-0 flex-1">
                                <div className="flex items-center justify-between gap-2 text-xs">
                                  <span className="font-semibold text-white">
                                    {msg.continuation.totalTarget
                                      ? `Completed ${msg.continuation.completedCount} of ${msg.continuation.totalTarget}`
                                      : `Completed ${msg.continuation.completedCount} items`}
                                  </span>
                                  {msg.continuation.totalTarget && (
                                    <span className="font-mono text-[11px] text-cyan-300 tabular-nums">
                                      {Math.min(
                                        100,
                                        Math.round(
                                          (msg.continuation.completedCount /
                                            msg.continuation.totalTarget) *
                                            100
                                        )
                                      )}
                                      %
                                    </span>
                                  )}
                                </div>
                                {msg.continuation.totalTarget && (
                                  <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
                                    <div
                                      className="h-full bg-gradient-to-r from-blue-500 to-cyan-400 rounded-full transition-all"
                                      style={{
                                        width: `${Math.min(
                                          100,
                                          Math.round(
                                            (msg.continuation.completedCount /
                                              msg.continuation.totalTarget) *
                                              100
                                          )
                                        )}%`,
                                      }}
                                    />
                                  </div>
                                )}
                              </div>

                              {msg.continuation.hasMore && (
                                <button
                                  type="button"
                                  disabled={isChatStreaming}
                                  onClick={() => void handleContinueMessage(msg)}
                                  className="talash-neon-btn inline-flex items-center gap-1.5 px-3.5 min-h-[38px] text-xs font-semibold disabled:opacity-45 disabled:cursor-not-allowed rounded-xl whitespace-nowrap shrink-0 cursor-pointer"
                                >
                                  <span>Continue from #{msg.continuation.nextStart}</span>
                                  <ArrowRight className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          )}

                          {/* Grounded Google Sources */}
                          {msg.sources && msg.sources.length > 0 && (
                            <div
                              dir="ltr"
                              className="mx-3.5 sm:mx-6 py-2.5 border-t border-sky-500/20 space-y-1.5"
                            >
                              <div className="flex items-center gap-1.5 text-[11px] font-medium text-cyan-400">
                                <Globe className="w-3 h-3" />
                                <span>Google Sources</span>
                              </div>
                              <div className="flex flex-wrap gap-x-3 gap-y-1">
                                {msg.sources.slice(0, 6).map((src) => (
                                  <a
                                    key={src.uri}
                                    href={src.uri}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-300 hover:text-cyan-300 hover:underline max-w-[220px] truncate"
                                  >
                                    <span className="truncate">{src.title}</span>
                                    <ExternalLink className="w-2.5 h-2.5 shrink-0 opacity-70" />
                                  </a>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Action Bar: Copy, Listen, Share, Retry */}
                          {msg.text && msg.durationMs !== undefined && (
                            <div
                              dir="ltr"
                              className="px-3 sm:px-5 py-1.5 bg-[#050c1e]/80 border-t border-sky-500/20 flex flex-wrap items-center justify-between gap-2"
                            >
                              <div className="flex flex-wrap items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => void handleCopyMessage(msg.id, msg.text)}
                                  className="inline-flex items-center gap-1.5 px-2.5 min-h-[36px] text-xs font-medium text-slate-300 hover:text-white hover:bg-sky-500/15 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                                >
                                  {copiedMessageId === msg.id ? (
                                    <>
                                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                                      <span className="text-emerald-300">Copied</span>
                                    </>
                                  ) : (
                                    <>
                                      <Copy className="w-3.5 h-3.5" />
                                      <span>Copy</span>
                                    </>
                                  )}
                                </button>

                                <button
                                  type="button"
                                  onClick={() => handleToggleSpeak(msg.id, msg.text)}
                                  className="inline-flex items-center gap-1.5 px-2.5 min-h-[36px] text-xs font-medium text-slate-300 hover:text-white hover:bg-sky-500/15 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                                >
                                  {speakingMessageId === msg.id ? (
                                    <>
                                      <VolumeX className="w-3.5 h-3.5 text-cyan-400" />
                                      <span className="text-cyan-300">Stop</span>
                                    </>
                                  ) : (
                                    <>
                                      <Volume2 className="w-3.5 h-3.5" />
                                      <span>Listen</span>
                                    </>
                                  )}
                                </button>

                                <button
                                  type="button"
                                  onClick={() => handleOpenShareChatMessage(msg)}
                                  className="inline-flex items-center gap-1.5 px-2.5 min-h-[36px] text-xs font-medium text-slate-300 hover:text-white hover:bg-sky-500/15 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                                >
                                  <Share2 className="w-3.5 h-3.5" />
                                  <span>Share</span>
                                </button>

                                <button
                                  type="button"
                                  disabled={isChatStreaming}
                                  onClick={() => void handleRegenerateMessage(msg.id)}
                                  className="inline-flex items-center gap-1.5 px-2.5 min-h-[36px] text-xs font-medium text-slate-300 hover:text-white hover:bg-sky-500/15 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                                >
                                  <RotateCcw className="w-3.5 h-3.5" />
                                  <span>Retry</span>
                                </button>
                              </div>

                              {showMetrics &&
                                msg.usage?.totalTokens !== null &&
                                msg.usage?.totalTokens !== undefined && (
                                  <div className="text-[11px] text-cyan-300/80 tabular-nums">
                                    {msg.usage.totalTokens} tokens
                                  </div>
                                )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  <div ref={chatScrollEndRef} />
                </div>
              )}
            </div>

            {renderMessageComposer('chat')}
          </main>
        </div>
      )}

      {/* ==================== 3. HISTORY SCREEN ==================== */}
      {activeView === 'history' && (
        <main className="flex-1 w-full max-w-[960px] mx-auto px-3 sm:px-6 py-5 sm:py-7 space-y-5">
          <div className="talash-glass-card rounded-3xl p-4 sm:p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h1 className="font-display text-lg sm:text-xl font-bold text-white">
                  {uiCopy.chatHistory}
                </h1>
                <p className="text-xs text-slate-400 mt-0.5 tabular-nums">
                  Up to 20 previous chats stay saved automatically when you start a new chat.
                </p>
              </div>

              <div className="flex items-center gap-1 p-1 bg-[#050c1e] border border-sky-400/25 rounded-xl">
                <button
                  type="button"
                  onClick={() => setHistorySubTab('chats')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                    historySubTab === 'chats'
                      ? 'talash-neon-btn'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Chats ({previousSavedCount}/20)
                </button>
                <button
                  type="button"
                  onClick={() => setHistorySubTab('workbench')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                    historySubTab === 'workbench'
                      ? 'talash-neon-btn'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Workbench ({history.length})
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={historySearch}
                  onChange={(e) => setHistorySearch(e.target.value)}
                  placeholder={
                    historySubTab === 'chats'
                      ? 'Search saved chats...'
                      : 'Search workbench runs...'
                  }
                  className="w-full pl-10 pr-3.5 py-2.5 text-xs bg-[#050c1e] border border-sky-400/25 rounded-xl text-white placeholder:text-slate-500 focus:outline-none focus:border-cyan-400"
                />
              </div>

              {previousSavedCount > 0 && historySubTab === 'chats' && (
                <button
                  type="button"
                  onClick={handleClearAllChats}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-semibold text-red-200 bg-red-950/60 hover:bg-red-600/35 border border-red-400/30 rounded-xl cursor-pointer transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Clear All</span>
                </button>
              )}
            </div>
          </div>

          {historySubTab === 'chats' ? (
            savedHistoryThreads.length === 0 ? (
              <div className="talash-glass-card rounded-3xl p-10 text-center space-y-3">
                <MessageSquare className="w-8 h-8 text-cyan-400 mx-auto" />
                <p className="text-sm font-semibold text-white">No saved chats yet</p>
                <p className="text-xs text-slate-400">
                  Start a conversation and tap New Chat—all previous chats appear here automatically.
                </p>
                <button
                  type="button"
                  onClick={handleNewChat}
                  className="talash-neon-btn px-4 py-2 text-xs font-semibold rounded-xl cursor-pointer"
                >
                  Start New Chat
                </button>
              </div>
            ) : (
              <div className="space-y-2.5">
                {savedHistoryThreads.map((thread) => {
                  const isCurrent = thread.id === activeThreadId;
                  const lastMsg = thread.messages[thread.messages.length - 1];
                  return (
                    <div
                      key={thread.id}
                      className="talash-glass-card talash-glass-card-hover rounded-2xl p-4 flex items-center justify-between gap-3"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setActiveThreadId(thread.id);
                          setActiveView('chat');
                          setChatError(null);
                        }}
                        className="flex-1 min-w-0 text-left cursor-pointer"
                      >
                        <div className="flex items-center gap-2 text-xs sm:text-sm">
                          <span className="font-semibold text-white truncate">{thread.title}</span>
                          {isCurrent && (
                            <span className="px-2 py-0.5 text-[10px] font-semibold uppercase rounded-md bg-sky-500/20 text-cyan-300 border border-cyan-400/35">
                              Active
                            </span>
                          )}
                        </div>
                        {lastMsg && (
                          <p className="text-xs text-slate-400 truncate mt-1">{lastMsg.text}</p>
                        )}
                        <p className="text-[11px] text-slate-500 tabular-nums mt-1">
                          {thread.messages.length}{' '}
                          {thread.messages.length === 1 ? 'message' : 'messages'} ·{' '}
                          {formatTimestamp(thread.updatedAt)}
                        </p>
                      </button>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => openRenameDialog(thread)}
                          aria-label="Rename chat"
                          className="p-2 text-slate-400 hover:text-white bg-[#050c1e] border border-sky-400/20 rounded-xl cursor-pointer"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setActiveThreadId(thread.id);
                            setActiveView('chat');
                          }}
                          className="talash-neon-btn px-3 py-2 text-xs font-semibold rounded-xl cursor-pointer"
                        >
                          Open
                        </button>
                        {threads.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleDeleteThread(thread.id)}
                            aria-label="Delete saved chat"
                            className="p-2 text-slate-400 hover:text-red-300 bg-[#050c1e] border border-sky-400/20 hover:border-red-400/40 rounded-xl cursor-pointer"
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
            <div className="talash-glass-card rounded-3xl p-10 text-center space-y-2">
              <History className="w-8 h-8 text-cyan-400 mx-auto" />
              <p className="text-sm font-semibold text-white">No workbench runs recorded</p>
              <p className="text-xs text-slate-400">
                Execute a prompt inside Prompt Workbench to save runs here.
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {filteredWorkbenchHistory.map((entry) => (
                <div
                  key={entry.id}
                  className="talash-glass-card rounded-2xl p-4 flex items-center justify-between gap-3"
                >
                  <button
                    type="button"
                    onClick={() => handleLoadHistoryItem(entry)}
                    className="flex-1 min-w-0 text-left cursor-pointer"
                  >
                    <p className="text-xs sm:text-sm font-semibold text-white truncate">
                      {entry.prompt}
                    </p>
                    <p className="text-xs text-slate-400 truncate mt-1">{entry.output}</p>
                    <p className="text-[11px] text-slate-500 tabular-nums mt-1">
                      {entry.model} · {entry.durationMs} ms · {formatTimestamp(entry.timestamp)}
                    </p>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteHistoryItem(entry.id)}
                    aria-label="Delete workbench run"
                    className="p-2 text-slate-400 hover:text-red-300 bg-[#050c1e] border border-sky-400/20 rounded-xl cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </main>
      )}

      {/* ==================== 4. SETTINGS SCREEN ==================== */}
      {activeView === 'settings' && (
        <main className="flex-1 w-full max-w-[960px] mx-auto px-3 sm:px-6 py-5 sm:py-7 space-y-5">
          {/* Profile Card */}
          <section className="talash-glass-card rounded-3xl p-4 sm:p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3.5 min-w-0">
                {currentUser.avatarUrl ? (
                  <img
                    src={currentUser.avatarUrl}
                    alt={currentUser.name}
                    referrerPolicy="no-referrer"
                    className="w-12 h-12 rounded-full object-cover border border-cyan-400/40 shrink-0"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-600 to-cyan-500 text-white font-bold text-base flex items-center justify-center shrink-0">
                    {currentUser.name.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="text-base font-bold text-white truncate">{currentUser.name}</h1>
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
                  <p className="text-xs text-slate-400 truncate mt-0.5">{currentUser.email}</p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => openSettingsModal('navigation')}
                  className="px-3.5 py-2 text-xs font-semibold text-white bg-[#050c1e] hover:bg-sky-500/20 border border-sky-400/25 rounded-xl cursor-pointer"
                >
                  Password &amp; Menu
                </button>
                <button
                  type="button"
                  onClick={() => void handleLogout()}
                  className="px-3.5 py-2 text-xs font-semibold text-red-200 bg-red-950/55 hover:bg-red-600/35 border border-red-400/30 rounded-xl cursor-pointer"
                >
                  Sign Out
                </button>
              </div>
            </div>

            {currentUser.role === 'super_admin' && (
              <div className="pt-3 border-t border-sky-500/20 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-xs text-cyan-300">
                  <ShieldCheck className="w-4 h-4 shrink-0" />
                  <span>Super Admin Owner Control Center is active for {currentUser.email}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setAdminDashboardOpen(true)}
                  className="talash-neon-btn px-4 py-2 text-xs font-semibold rounded-xl cursor-pointer"
                >
                  Open Owner Admin Panel
                </button>
              </div>
            )}
          </section>

          {/* Language & AI Model Controls */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <section className="talash-glass-card rounded-3xl p-4 sm:p-5 space-y-4">
              <div>
                <h2 className="text-sm font-bold text-white">App Language</h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Switch interface &amp; greeting language across English, Pashto, and Arabic.
                </p>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    { id: 'en', label: 'English' },
                    { id: 'ps', label: 'پښتو' },
                    { id: 'ar', label: 'العربية' },
                  ] as const
                ).map((lang) => (
                  <button
                    key={lang.id}
                    type="button"
                    onClick={() => setAppLanguage(lang.id)}
                    className={`py-2.5 text-xs font-semibold rounded-xl border transition-colors cursor-pointer ${
                      appLanguage === lang.id
                        ? 'talash-neon-btn border-cyan-400/50'
                        : 'bg-[#050c1e] text-slate-300 border-sky-400/20 hover:border-cyan-400/40'
                    }`}
                  >
                    {lang.label}
                  </button>
                ))}
              </div>

              <div className="pt-3 border-t border-sky-500/20 space-y-2">
                <h3 className="text-xs font-semibold text-white">Google Search Grounding</h3>
                <div className="grid grid-cols-3 gap-2">
                  {(
                    [
                      { id: 'auto', label: 'Smart Auto' },
                      { id: 'always', label: 'Always' },
                      { id: 'off', label: 'Off' },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setGoogleSearchMode(opt.id)}
                      className={`py-2 text-xs font-semibold rounded-xl border cursor-pointer ${
                        googleSearchMode === opt.id
                          ? 'talash-neon-btn border-cyan-400/50'
                          : 'bg-[#050c1e] text-slate-300 border-sky-400/20'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-3 border-t border-sky-500/20 flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold text-white">Show token metrics</p>
                  <p className="text-[11px] text-slate-400">Display token counts under replies</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={showMetrics}
                  onClick={() => setShowMetrics((v) => !v)}
                  className={`w-11 h-6 rounded-full p-0.5 transition-colors cursor-pointer ${
                    showMetrics ? 'bg-cyan-500' : 'bg-slate-700'
                  }`}
                >
                  <span
                    className={`block w-5 h-5 rounded-full bg-white transition-transform ${
                      showMetrics ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </section>

            <section className="talash-glass-card rounded-3xl p-4 sm:p-5 space-y-3">
              <div>
                <h2 className="text-sm font-bold text-white">Intelligent AI Routing</h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Choose Smart Auto or lock a specific model &amp; reasoning depth.
                </p>
              </div>
              <div className="space-y-2">
                {MODEL_PROFILES.map((profile) => {
                  const active = profileId === profile.profileId;
                  const locked = Boolean(profile.requiresOpenAI && !capabilities?.openai?.connected);
                  return (
                    <button
                      key={profile.profileId}
                      type="button"
                      disabled={locked}
                      onClick={() => handleSelectProfile(profile.profileId)}
                      className={`w-full text-left px-3.5 py-2.5 rounded-xl border flex items-center justify-between gap-3 transition-all ${
                        locked
                          ? 'border-sky-500/15 bg-[#050c1e]/60 opacity-45 cursor-not-allowed'
                          : active
                          ? 'border-cyan-400/55 bg-sky-500/15 cursor-pointer'
                          : 'border-sky-400/20 bg-[#050c1e]/85 hover:border-cyan-400/40 cursor-pointer'
                      }`}
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-white">{profile.label}</p>
                        <p className="text-[11px] text-slate-400 truncate">{profile.subtitle}</p>
                      </div>
                      <span
                        className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 ${
                          active
                            ? 'bg-gradient-to-br from-blue-600 to-cyan-500 text-white'
                            : 'border border-sky-400/35'
                        }`}
                      >
                        {active && <Check className="w-2.5 h-2.5" />}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          </div>

          {/* Data, App Install & Workspace Tools */}
          <section className="talash-glass-card rounded-3xl p-4 sm:p-5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-bold text-white">App Install, Tools &amp; Backup</p>
                <p className="text-xs text-slate-400">
                  Created by Shams Talash &middot; com.shamstalash.talashai
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <PWAInstallButton compact />
                <button
                  type="button"
                  onClick={handleExportActiveChat}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#050c1e] hover:bg-sky-500/20 border border-sky-400/25 rounded-xl cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Export Chat .md</span>
                </button>
                <button
                  type="button"
                  onClick={() => openSettingsModal('personalization')}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#050c1e] hover:bg-sky-500/20 border border-sky-400/25 rounded-xl cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Custom Persona</span>
                </button>
              </div>
            </div>
          </section>
        </main>
      )}

      {/* ==================== 5. PREMIUM SCREEN ==================== */}
      {activeView === 'premium' && (
        <main className="flex-1 w-full max-w-[1040px] mx-auto px-3 sm:px-6 py-5 sm:py-8 space-y-6">
          <section className="talash-glass-card rounded-3xl p-5 sm:p-8 text-center space-y-3 relative overflow-hidden">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute left-1/2 -top-16 -translate-x-1/2 w-80 h-32 rounded-full bg-cyan-500/15 blur-3xl"
            />
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-sky-500/20 border border-cyan-400/35 text-xs font-semibold text-cyan-300">
              <Crown className="w-3.5 h-3.5" />
              <span>TALASH Ai Intelligence Suite</span>
            </div>
            <h1 className="font-display text-2xl sm:text-3xl font-bold text-white">
              Unlock Full Futuristic AI Power
            </h1>
            <p className="text-xs sm:text-sm text-slate-300 max-w-2xl mx-auto leading-relaxed">
              Experience ultra-fast Pashto, Arabic &amp; English intelligence, live Google Search verification, Gemini Image Studio, Islamic Learning Database, Prompt Workbench, and Batch CSV comparisons.
            </p>
          </section>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <article className="talash-glass-card rounded-3xl p-5 flex flex-col justify-between gap-5">
              <div className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Core Access
                </p>
                <h2 className="text-xl font-bold text-white">TALASH Standard</h2>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Everyday conversational AI, Pashto Islamic Learning Center, and local chat history.
                </p>
                <ul className="space-y-2 text-xs text-slate-300 pt-2 border-t border-sky-500/20">
                  <li className="flex items-center gap-2">
                    <Check className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                    <span>Smart Auto AI Routing</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                    <span>Pashto, Arabic &amp; English RTL/LTR</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                    <span>57 Authentic Islamic Learning Topics</span>
                  </li>
                </ul>
              </div>
              <button
                type="button"
                onClick={() => setActiveView('chat')}
                className="w-full py-2.5 text-xs font-semibold text-white bg-[#050c1e] hover:bg-sky-500/20 border border-sky-400/35 rounded-xl cursor-pointer transition-colors"
              >
                Open TALASH Chat
              </button>
            </article>

            <article className="talash-glass-card rounded-3xl p-5 border-cyan-400/55 shadow-[0_0_32px_rgba(37,99,235,0.28)] flex flex-col justify-between gap-5">
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-cyan-400">
                    Active Workspace
                  </p>
                  <span className="px-2 py-0.5 text-[10px] font-bold uppercase rounded-md bg-cyan-500/20 text-cyan-300 border border-cyan-400/40">
                    Connected
                  </span>
                </div>
                <h2 className="text-xl font-bold text-white">TALASH Ai Pro Studio</h2>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Full creative and analytical tools powered by Gemini + Live Google Search Grounding.
                </p>
                <ul className="space-y-2 text-xs text-slate-200 pt-2 border-t border-sky-500/20">
                  <li className="flex items-center gap-2">
                    <Check className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                    <span>Gemini Image Creation Studio</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                    <span>Live Google Search Verification</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                    <span>Prompt Workbench &amp; Batch CSV Runner</span>
                  </li>
                </ul>
              </div>
              <button
                type="button"
                onClick={() => setActiveView('image')}
                className="talash-neon-btn w-full py-2.5 text-xs font-semibold rounded-xl cursor-pointer"
              >
                Launch Image Studio
              </button>
            </article>

            <article className="talash-glass-card rounded-3xl p-5 flex flex-col justify-between gap-5">
              <div className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-sky-300">
                  Platform Ownership
                </p>
                <h2 className="text-xl font-bold text-white">Owner &amp; Enterprise</h2>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Dedicated governance, SQLite database backup, Learning CMS, and multi-model verification.
                </p>
                <ul className="space-y-2 text-xs text-slate-300 pt-2 border-t border-sky-500/20">
                  <li className="flex items-center gap-2">
                    <Check className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                    <span>
                      Gemini Engine:{' '}
                      {capabilities?.gemini?.connected ? 'Connected' : 'Configure key'}
                    </span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                    <span>
                      OpenAI Synthesis:{' '}
                      {capabilities?.openai?.connected ? 'Connected' : 'Optional'}
                    </span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                    <span>Android APK &amp; PWA Ready</span>
                  </li>
                </ul>
              </div>
              {currentUser.role === 'super_admin' ? (
                <button
                  type="button"
                  onClick={() => setAdminDashboardOpen(true)}
                  className="w-full py-2.5 text-xs font-semibold text-cyan-200 bg-sky-500/20 hover:bg-sky-500/30 border border-cyan-400/40 rounded-xl cursor-pointer transition-colors"
                >
                  Open Owner Control Center
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setActiveView('workbench')}
                  className="w-full py-2.5 text-xs font-semibold text-white bg-[#050c1e] hover:bg-sky-500/20 border border-sky-400/35 rounded-xl cursor-pointer transition-colors"
                >
                  Open Prompt Workbench
                </button>
              )}
            </article>
          </div>
        </main>
      )}

      {/* ==================== 6. IMAGE CREATION STUDIO ==================== */}
      {activeView === 'image' && (
        <main className="flex-1 w-full max-w-[1040px] mx-auto px-3 sm:px-6 py-5 sm:py-7 space-y-6">
          <section className="talash-glass-card rounded-3xl p-4 sm:p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-sky-500/20 border border-cyan-400/40 text-cyan-400 flex items-center justify-center shrink-0">
                  <Wand2 className="w-5 h-5" />
                </div>
                <div>
                  <h1 className="font-display text-lg sm:text-xl font-bold text-white">
                    TALASH <span className="text-cyan-400 italic">Ai</span> Image Creation Studio
                  </h1>
                  <p className="text-xs text-slate-400">
                    Describe any scene, logo, futuristic artwork, or concept and generate high-resolution images.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveView('home')}
                className="px-3.5 py-2 text-xs font-semibold text-slate-200 bg-[#050c1e] hover:bg-sky-500/20 border border-sky-400/25 rounded-xl cursor-pointer"
              >
                Back Home
              </button>
            </div>

            {imageError && (
              <div className="p-3 rounded-xl bg-red-950/65 border border-red-400/35 text-xs text-red-200 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                <span>{imageError}</span>
              </div>
            )}

            <form onSubmit={handleGenerateImage} className="space-y-3">
              <textarea
                rows={3}
                value={imagePrompt}
                onChange={(e) => setImagePrompt(e.target.value)}
                placeholder="Example: A futuristic neon blue holographic mosque courtyard at twilight with starry cosmic sky, crisp 3D architectural render..."
                className="w-full px-4 py-3 text-sm bg-[#050c1e] border border-sky-400/30 rounded-2xl text-white placeholder:text-slate-500 focus:outline-none focus:border-cyan-400 resize-y"
              />

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs text-slate-400 mr-1">Aspect Ratio:</span>
                  {(['1:1', '16:9', '9:16', '4:3', '3:4'] as const).map((ratio) => (
                    <button
                      key={ratio}
                      type="button"
                      onClick={() => setImageAspectRatio(ratio)}
                      className={`px-2.5 py-1 text-xs font-semibold rounded-lg border cursor-pointer ${
                        imageAspectRatio === ratio
                          ? 'talash-neon-btn border-cyan-400/50'
                          : 'bg-[#050c1e] text-slate-300 border-sky-400/20 hover:border-cyan-400/40'
                      }`}
                    >
                      {ratio}
                    </button>
                  ))}
                </div>

                <button
                  type="submit"
                  disabled={imageGenerating || !imagePrompt.trim()}
                  className="talash-neon-btn inline-flex items-center gap-2 px-5 py-2.5 text-xs sm:text-sm font-semibold rounded-xl cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed"
                >
                  {imageGenerating ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Generating Image...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      <span>Generate Image</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </section>

          {generatedImages.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {generatedImages.map((img) => (
                <article
                  key={img.id}
                  className="talash-glass-card rounded-2xl overflow-hidden flex flex-col"
                >
                  <div className="bg-[#050b19] flex items-center justify-center p-2">
                    <img
                      src={img.imageDataUrl}
                      alt={img.prompt}
                      className="w-full max-h-[380px] object-contain rounded-xl"
                    />
                  </div>
                  <div className="p-4 space-y-3">
                    <p className="text-xs text-slate-200 line-clamp-2">{img.prompt}</p>
                    <div className="flex items-center justify-between gap-2 pt-2 border-t border-sky-500/20">
                      <span className="text-[11px] font-mono text-cyan-300">
                        {img.aspectRatio} · {formatReplySeconds(img.durationMs)}
                      </span>
                      <div className="flex items-center gap-2">
                        <a
                          href={img.imageDataUrl}
                          download={`talash-ai-${img.id}.png`}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-sky-500/20 hover:bg-sky-500/30 border border-cyan-400/35 rounded-lg"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>Download</span>
                        </a>
                        <button
                          type="button"
                          onClick={() =>
                            setGeneratedImages((prev) => prev.filter((item) => item.id !== img.id))
                          }
                          aria-label="Remove generated image"
                          className="p-1.5 text-slate-400 hover:text-red-300 rounded-lg cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="talash-glass-card rounded-3xl p-10 text-center space-y-2">
              <ImageIcon className="w-8 h-8 text-cyan-400 mx-auto" />
              <p className="text-sm font-semibold text-white">Ready to Create</p>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                Enter an image prompt above and click Generate Image to create custom artwork powered by TALASH Ai.
              </p>
            </div>
          )}
        </main>
      )}

      {/* ==================== 7. PASHTO ISLAMIC LEARNING CENTER ==================== */}
      {activeView === 'learning' && (
        <LearningView
          onAskInChat={(question) => {
            setActiveView('chat');
            void sendChatMessage(question);
          }}
        />
      )}

      {/* ==================== 8. PROMPT WORKBENCH ==================== */}
      {activeView === 'workbench' && (
        <div className="flex-1 flex flex-col lg:flex-row max-w-[1440px] w-full mx-auto">
          <div className="lg:hidden px-4 py-2.5 bg-[#050b19] border-b border-sky-500/20 flex items-center justify-between">
            <span className="text-xs font-medium text-slate-300">
              {activeProfile.label} ·{' '}
              {thinkingLevel === 'DEFAULT' ? 'Auto Thinking' : `${thinkingLevel} Thinking`}
            </span>
            <button
              type="button"
              onClick={() => setMobileConfigOpen((prev) => !prev)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-[#0a152e] border border-sky-400/25 rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-cyan-400" />
              <span>{mobileConfigOpen ? 'Hide Settings' : 'Parameters'}</span>
            </button>
          </div>

          {/* Workbench Config Sidebar */}
          <aside
            className={`${
              mobileConfigOpen ? 'block' : 'hidden'
            } lg:block w-full lg:w-[280px] shrink-0 bg-[#050b19]/95 border-b lg:border-b-0 lg:border-r border-sky-500/20 p-5 space-y-6`}
          >
            <section className="space-y-2.5">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-semibold text-white">Model Profile</h2>
                <span className="font-mono text-[11px] text-cyan-300">{model}</span>
              </div>
              <div className="space-y-1.5">
                {MODEL_PROFILES.filter((p) => !p.requiresOpenAI).map((profile) => (
                  <button
                    key={profile.profileId}
                    type="button"
                    onClick={() => handleSelectProfile(profile.profileId)}
                    className={`w-full text-left px-3 py-2 rounded-xl border text-xs transition-colors cursor-pointer ${
                      profileId === profile.profileId
                        ? 'bg-sky-500/20 border-cyan-400/55 text-white font-semibold'
                        : 'bg-[#081229] border-sky-400/20 text-slate-300 hover:border-cyan-400/40'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span>{profile.label}</span>
                      <span className="font-mono text-[11px] text-cyan-300">
                        {profile.defaultThinking}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </section>

            <div className="border-t border-sky-500/20" />

            <section className="space-y-2">
              <h2 className="text-xs font-semibold text-white">Delivery Mode</h2>
              <div className="grid grid-cols-2 gap-1 p-1 bg-[#081229] border border-sky-400/20 rounded-xl">
                <button
                  type="button"
                  onClick={() => setDeliveryMode('stream')}
                  className={`px-2.5 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                    deliveryMode === 'stream'
                      ? 'talash-neon-btn'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Stream SSE
                </button>
                <button
                  type="button"
                  onClick={() => setDeliveryMode('single')}
                  className={`px-2.5 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                    deliveryMode === 'single'
                      ? 'talash-neon-btn'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Single Turn
                </button>
              </div>
            </section>

            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-semibold text-white">Thinking Depth</h2>
                <span className="text-[11px] text-cyan-300">
                  {thinkingLevel === 'DEFAULT' ? 'Auto' : thinkingLevel}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {activeModelOption.supportedThinking.map((level) => (
                  <button
                    key={level}
                    type="button"
                    onClick={() => handleThinkingChange(level)}
                    className={`px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap cursor-pointer ${
                      thinkingLevel === level
                        ? 'talash-neon-btn border-cyan-400/50'
                        : 'bg-[#081229] text-slate-300 border-sky-400/20 hover:border-cyan-400/40'
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

            <section className="space-y-2">
              <h2 className="text-xs font-semibold text-white">Output Format</h2>
              <div className="grid grid-cols-2 gap-1 p-1 bg-[#081229] border border-sky-400/20 rounded-xl">
                <button
                  type="button"
                  onClick={() => setResponseFormat('text')}
                  className={`px-2.5 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                    responseFormat === 'text'
                      ? 'talash-neon-btn'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Plain Text
                </button>
                <button
                  type="button"
                  onClick={() => setResponseFormat('json')}
                  className={`px-2.5 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                    responseFormat === 'json'
                      ? 'talash-neon-btn'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  JSON Schema
                </button>
              </div>
            </section>

            <div className="border-t border-sky-500/20" />

            <section className="space-y-2">
              <label htmlFor="system-instruction" className="block text-xs font-semibold text-white">
                System Instruction
              </label>
              <textarea
                id="system-instruction"
                rows={3}
                value={systemInstruction}
                onChange={(e) => setSystemInstruction(e.target.value)}
                placeholder="Optional guidance on tone, role, or constraints..."
                className="w-full px-3 py-2 text-xs leading-relaxed bg-[#081229] border border-sky-400/25 rounded-xl text-white placeholder:text-slate-500 focus:outline-none focus:border-cyan-400 resize-y"
              />
            </section>

            <div className="border-t border-sky-500/20" />

            <section className="space-y-2">
              <h2 className="text-xs font-semibold text-white">Quick Presets</h2>
              <div className="space-y-1">
                {PROMPT_PRESETS.map((preset) => {
                  const isActive = prompt.trim() === preset.prompt;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => handleLoadPreset(preset)}
                      className={`w-full text-left px-3 py-2 rounded-xl text-xs transition-colors flex items-center justify-between gap-2 cursor-pointer ${
                        isActive
                          ? 'bg-sky-500/20 text-cyan-200 font-medium border border-cyan-400/40'
                          : 'text-slate-300 hover:bg-sky-500/10 hover:text-white'
                      }`}
                    >
                      <span className="truncate">{preset.title}</span>
                      <ArrowUpRight className="w-3.5 h-3.5 shrink-0 opacity-70" />
                    </button>
                  );
                })}
              </div>
            </section>
          </aside>

          {/* Workbench Main Stage */}
          <main className="flex-1 min-w-0 p-4 sm:p-6 lg:p-8 space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h1 className="font-display text-2xl font-bold text-white">Prompt Workbench</h1>
                <p className="text-sm text-slate-400 mt-0.5">
                  Test single-turn prompts, manage reusable templates, and export SDK snippets.
                </p>
              </div>

              <div className="flex items-center gap-1 p-1 bg-[#081229] border border-sky-400/25 rounded-xl">
                <button
                  type="button"
                  onClick={() => setWorkbenchTab('editor')}
                  className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                    workbenchTab === 'editor'
                      ? 'talash-neon-btn'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Editor &amp; Output
                </button>
                <button
                  type="button"
                  onClick={() => setWorkbenchTab('templates')}
                  className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                    workbenchTab === 'templates'
                      ? 'talash-neon-btn'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Bookmark className="w-3.5 h-3.5" />
                  <span>Templates ({templates.length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setWorkbenchTab('sdk')}
                  className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                    workbenchTab === 'sdk'
                      ? 'talash-neon-btn'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Code2 className="w-3.5 h-3.5" />
                  <span>SDK Code</span>
                </button>
              </div>
            </div>

            {workbenchTab === 'editor' && (
              <div className="space-y-6">
                <section className="talash-glass-card rounded-2xl overflow-hidden">
                  <div className="px-5 py-3 border-b border-sky-500/20 flex flex-wrap items-center justify-between gap-4">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                      <label htmlFor="prompt-input" className="font-semibold text-white text-sm">
                        Prompt
                      </label>
                      <span aria-hidden="true">·</span>
                      <span className="tabular-nums">{wordCount} words</span>
                      <span aria-hidden="true">·</span>
                      <span className="tabular-nums">{prompt.length} chars</span>
                      {draftSavedAt && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="text-cyan-400">Draft saved</span>
                        </>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          setWorkbenchTab('templates');
                          setIsSaveTemplateOpen(true);
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-white hover:bg-sky-500/15 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        <BookmarkPlus className="w-3.5 h-3.5 text-cyan-400" />
                        <span>Save Template</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleResetWorkbench}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-white hover:bg-sky-500/15 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Reset</span>
                      </button>
                    </div>
                  </div>

                  <div className="p-5">
                    <textarea
                      id="prompt-input"
                      rows={4}
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      onKeyDown={handlePromptKeyDown}
                      placeholder="Enter a prompt for TALASH Ai..."
                      className="w-full text-[15px] leading-relaxed text-white placeholder:text-slate-500 bg-transparent focus:outline-none resize-y"
                    />

                    <div className="mt-4 pt-3.5 border-t border-sky-500/20 flex flex-wrap items-center justify-between gap-4">
                      <div className="flex items-center gap-2 text-xs text-slate-400">
                        <span>Press</span>
                        <kbd className="px-1.5 py-0.5 text-[11px] font-mono bg-[#050c1e] border border-sky-400/25 rounded text-cyan-300">
                          Ctrl/Cmd + Enter
                        </kbd>
                        <span>to execute</span>
                      </div>

                      <button
                        type="button"
                        disabled={isRunning || prompt.trim().length === 0}
                        onClick={() => void executePrompt()}
                        className="talash-neon-btn inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold disabled:opacity-45 disabled:cursor-not-allowed rounded-full whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        {isRunning ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            <span>Generating...</span>
                          </>
                        ) : (
                          <>
                            <Play className="w-3 h-3 fill-current" />
                            <span>Generate</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </section>

                <section className="talash-glass-card rounded-2xl overflow-hidden">
                  <div className="px-5 py-3 border-b border-sky-500/20 flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-2 text-xs text-slate-400 min-w-0">
                      <h2 className="font-semibold text-white text-sm shrink-0">
                        TALASH <span className="text-cyan-400 italic">Ai</span>
                      </h2>
                      <span aria-hidden="true">·</span>
                      <span>{deliveryMode === 'stream' ? 'Streaming' : 'Single turn'}</span>
                    </div>

                    {output && (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={handleCopyOutput}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:text-white hover:bg-sky-500/15 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          {copiedOutput ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                              <span className="text-emerald-300">Copied</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5" />
                              <span>Copy</span>
                            </>
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            setShareTarget({
                              title: prompt.trim().slice(0, 60) || 'Workbench Response',
                              content: output,
                            })
                          }
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:text-white hover:bg-sky-500/15 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          <Share2 className="w-3.5 h-3.5" />
                          <span>Share</span>
                        </button>

                        <button
                          type="button"
                          disabled={isRunning}
                          onClick={() => void executePrompt()}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:text-white hover:bg-sky-500/15 disabled:opacity-45 disabled:cursor-not-allowed rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>Retry</span>
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="p-5 min-h-[180px]">
                    {errorMessage ? (
                      <div className="p-4 rounded-xl bg-red-950/60 border border-red-400/35 text-red-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="flex items-start gap-3">
                          <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                          <div className="space-y-1">
                            <p className="text-sm font-semibold">Generation Error</p>
                            <p className="text-xs leading-relaxed text-red-200">{errorMessage}</p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => void executePrompt()}
                          className="px-3.5 py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-500 rounded-full whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          Retry Request
                        </button>
                      </div>
                    ) : isRunning && !output ? (
                      <div className="space-y-3 py-2" aria-live="polite">
                        <div className="flex items-center gap-2 text-xs text-cyan-300">
                          <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />
                          <span>Waiting for TALASH Ai...</span>
                        </div>
                        <div className="space-y-2 pt-1">
                          <div className="h-3.5 w-3/4 bg-sky-500/15 rounded animate-pulse" />
                          <div className="h-3.5 w-1/2 bg-sky-500/15 rounded animate-pulse" />
                        </div>
                      </div>
                    ) : output ? (
                      <div aria-live="polite">
                        <MarkdownOutput content={output} isJson={responseFormat === 'json'} />
                        {isRunning && (
                          <div className="mt-3 inline-flex items-center gap-2 text-xs text-cyan-300">
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-400" />
                            <span>Streaming response...</span>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="py-8 text-center space-y-2">
                        <p className="text-sm font-medium text-white">Ready to generate</p>
                        <p className="text-xs text-slate-400 max-w-md mx-auto">
                          Edit the prompt above or pick a preset from the sidebar, then click Generate to inspect the live response.
                        </p>
                      </div>
                    )}
                  </div>

                  {durationMs !== null && !errorMessage && (
                    <div className="px-5 py-3 bg-[#050c1e]/85 border-t border-sky-500/20 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-slate-300 tabular-nums">
                      <div>
                        <span className="text-slate-400 mr-1.5">Latency</span>
                        <span className="font-mono font-medium text-cyan-300">{durationMs} ms</span>
                      </div>
                      {usage?.promptTokens !== null && usage?.promptTokens !== undefined && (
                        <div>
                          <span className="text-slate-400 mr-1.5">Input tokens</span>
                          <span className="font-mono font-medium text-white">
                            {usage.promptTokens}
                          </span>
                        </div>
                      )}
                      {usage?.outputTokens !== null && usage?.outputTokens !== undefined && (
                        <div>
                          <span className="text-slate-400 mr-1.5">Output tokens</span>
                          <span className="font-mono font-medium text-white">
                            {usage.outputTokens}
                          </span>
                        </div>
                      )}
                      {usage?.thinkingTokens !== null &&
                        usage?.thinkingTokens !== undefined &&
                        usage.thinkingTokens > 0 && (
                          <div>
                            <span className="text-slate-400 mr-1.5">Thinking tokens</span>
                            <span className="font-mono font-medium text-white">
                              {usage.thinkingTokens}
                            </span>
                          </div>
                        )}
                      {usage?.totalTokens !== null && usage?.totalTokens !== undefined && (
                        <div>
                          <span className="text-slate-400 mr-1.5">Total tokens</span>
                          <span className="font-mono font-medium text-cyan-300">
                            {usage.totalTokens}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </section>
              </div>
            )}

            {workbenchTab === 'templates' && (
              <TemplateLibraryPanel
                templates={templates}
                currentPrompt={prompt}
                currentSystemInstruction={systemInstruction}
                currentModel={model}
                currentThinkingLevel={thinkingLevel}
                currentResponseFormat={responseFormat}
                isSaveFormOpen={isSaveTemplateOpen}
                onToggleSaveForm={setIsSaveTemplateOpen}
                onSaveTemplate={handleSaveTemplate}
                onApplyTemplate={handleApplyTemplate}
                onDeleteTemplate={handleDeleteTemplate}
              />
            )}

            {workbenchTab === 'sdk' && (
              <div className="space-y-4">
                <CodeSnippetPanel
                  prompt={prompt}
                  systemInstruction={systemInstruction}
                  model={model}
                  thinkingLevel={thinkingLevel}
                  responseFormat={responseFormat}
                  deliveryMode={deliveryMode}
                  mode="generate"
                />
              </div>
            )}
          </main>
        </div>
      )}

      {/* ==================== 9. BATCH CSV RUNNER VIEW ==================== */}
      {activeView === 'batch' && <BatchCsvView sessionToken={sessionToken} />}

      {/* ==================== FIXED BOTTOM NAVIGATION BAR (5 TABS) ==================== */}
      <nav
        aria-label="Primary bottom navigation"
        className={`${
          activeView === 'chat' ? 'shrink-0' : 'sticky bottom-0 z-30 shrink-0'
        } bg-[#040916]/95 backdrop-blur-xl border-t border-sky-500/25 shadow-[0_-8px_30px_rgba(2,8,24,0.75)] px-2 pb-[env(safe-area-inset-bottom)]`}
      >
        <div className="max-w-[760px] mx-auto grid grid-cols-5 h-[62px]">
          {bottomNavItems.map((item) => {
            const Icon = item.icon;
            const active = isBottomNavTabActive(item);
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveView(item.id)}
                className={`relative flex flex-col items-center justify-center gap-1 min-h-[48px] transition-colors cursor-pointer ${
                  active ? 'text-cyan-400' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {active && (
                  <span
                    aria-hidden="true"
                    className="absolute top-0 w-10 h-0.5 rounded-full bg-gradient-to-r from-blue-500 via-cyan-400 to-blue-500 shadow-[0_0_12px_rgba(56,189,248,0.85)]"
                  />
                )}
                <Icon
                  className={`w-[19px] h-[19px] ${
                    active ? 'drop-shadow-[0_0_8px_rgba(56,189,248,0.7)]' : ''
                  }`}
                />
                <span className="text-[11px] font-semibold tracking-tight leading-none">
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Settings & Navigation Drawer */}
      <ChatSettingsModal
        isOpen={settingsOpen}
        initialSection={settingsSection}
        onClose={() => setSettingsOpen(false)}
        activeView={activeView}
        onNavigateView={(nextView) => setActiveView(nextView)}
        currentUser={currentUser}
        sessionToken={sessionToken}
        onOpenAdminDashboard={
          currentUser.role === 'super_admin' ? () => setAdminDashboardOpen(true) : undefined
        }
        onLogout={() => void handleLogout()}
        profileId={profileId}
        model={model}
        thinkingLevel={thinkingLevel}
        selectedToneId={selectedToneId}
        chatSystemInstruction={chatSystemInstruction}
        showMetrics={showMetrics}
        googleSearchMode={googleSearchMode}
        verifyMode={verifyMode}
        capabilities={capabilities}
        threads={threads}
        activeThreadId={activeThread.id}
        history={history}
        onSelectProfile={handleSelectProfile}
        onChangeThinking={handleThinkingChange}
        onSelectTone={handleSelectTone}
        onChangeCustomPersona={(next) => {
          setSelectedToneId('custom');
          setChatSystemInstruction(next);
        }}
        onToggleMetrics={setShowMetrics}
        onChangeGoogleSearchMode={setGoogleSearchMode}
        onToggleVerifyMode={setVerifyMode}
        onOpenChatThread={(threadId) => {
          setActiveThreadId(threadId);
          setActiveView('chat');
          setChatError(null);
        }}
        onDeleteChatThread={handleDeleteThread}
        onLoadWorkbenchRun={handleLoadHistoryItem}
        onDeleteWorkbenchRun={handleDeleteHistoryItem}
        onExportActiveChat={handleExportActiveChat}
        onClearAllChats={handleClearAllChats}
        onClearHistory={handleClearHistory}
      />

      {/* Owner Super Admin Control Center */}
      {currentUser.role === 'super_admin' && (
        <AdminDashboardModal
          isOpen={adminDashboardOpen}
          onClose={() => setAdminDashboardOpen(false)}
          sessionToken={sessionToken}
          currentUser={currentUser}
          onGlobalSettingsUpdated={applyGlobalSettings}
        />
      )}

      {/* Rename Chat Dialog */}
      {renameTargetId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#020614]/80 backdrop-blur-md p-4"
          onClick={() => setRenameTargetId(null)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="rename-chat-title"
        >
          <form
            onSubmit={handleSaveRename}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm bg-[#071022] rounded-2xl border border-sky-400/30 shadow-[0_24px_75px_rgba(2,8,24,0.88)] p-5 space-y-4 animate-talash-dropdown"
          >
            <div className="flex items-center justify-between gap-2">
              <h2 id="rename-chat-title" className="text-base font-semibold text-white">
                Rename Chat
              </h2>
              <button
                type="button"
                onClick={() => setRenameTargetId(null)}
                aria-label="Close rename dialog"
                className="p-1.5 text-slate-400 hover:text-white hover:bg-sky-500/20 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <input
              type="text"
              autoFocus
              maxLength={80}
              required
              value={renameTitleDraft}
              onChange={(e) => setRenameTitleDraft(e.target.value)}
              placeholder="Enter chat title..."
              className="w-full px-3.5 py-2.5 text-sm bg-[#050b19] border border-sky-400/30 rounded-xl text-white placeholder:text-slate-500 focus:outline-none focus:border-cyan-400"
            />

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setRenameTargetId(null)}
                className="px-4 py-2 text-xs font-medium text-slate-300 hover:text-white hover:bg-slate-800 rounded-xl cursor-pointer transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!renameTitleDraft.trim()}
                className="talash-neon-btn px-4 py-2 text-xs font-semibold disabled:opacity-45 rounded-xl cursor-pointer"
              >
                Save Title
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Share Dialog */}
      <ShareDialog
        isOpen={shareTarget !== null}
        title={shareTarget?.title ?? 'TALASH Ai'}
        content={shareTarget?.content ?? ''}
        fullTranscript={shareTarget?.fullTranscript}
        onClose={() => setShareTarget(null)}
      />

      <OfflineIndicator />
      {showSplashOverlay && <SplashScreen fadingOut={splashFading} />}
    </div>
  );
}

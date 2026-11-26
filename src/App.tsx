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
  ExternalLink,
  Globe,
  History,
  Image as ImageIcon,
  Layers,
  Loader2,
  MessageSquare,
  Mic,
  PanelLeftClose,
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
import { ShareDialog } from './components/ShareDialog';
import { TalashLogoMark } from './components/TalashLogo';
import { TemplateLibraryPanel } from './components/TemplateLibraryPanel';
import { isPashtoText } from './utils/language';
import {
  DEFAULT_CONCISE_SYSTEM_INSTRUCTION,
  DEFAULT_TEMPLATES,
  MODEL_OPTIONS,
  MODEL_PROFILES,
  PROMPT_PRESETS,
  TONE_PRESETS,
  type ActiveView,
  type AuthUser,
  type ChatMessage,
  type ChatModelId,
  type ChatThread,
  type ContinuationInfo,
  type DeliveryMode,
  type GeminiModelId,
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

const HISTORY_STORAGE_KEY = 'promptbench_run_history_v1';
const CHAT_THREADS_STORAGE_KEY = 'promptbench_chat_threads_v1';
const TEMPLATES_STORAGE_KEY = 'promptbench_template_library_v1';
const WORKBENCH_DRAFT_STORAGE_KEY = 'promptbench_workbench_draft_v1';
const ACTIVE_VIEW_STORAGE_KEY = 'promptbench_active_view_v1';
const INITIAL_PROMPT = 'Explain how AI works in a few words';
const MAX_PREVIOUS_CHATS = 20;

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
    const raw = localStorage.getItem(HISTORY_STORAGE_KEY);
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
    const raw = localStorage.getItem(CHAT_THREADS_STORAGE_KEY);
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
    const raw = localStorage.getItem(TEMPLATES_STORAGE_KEY);
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
    const raw = localStorage.getItem(WORKBENCH_DRAFT_STORAGE_KEY);
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
    const raw = localStorage.getItem(ACTIVE_VIEW_STORAGE_KEY);
    if (
      raw === 'chat' ||
      raw === 'learning' ||
      raw === 'workbench' ||
      raw === 'batch'
    ) {
      return raw;
    }
    if (raw === 'media') {
      return 'learning';
    }
    return 'chat';
  } catch {
    return 'chat';
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

  const [activeView, setActiveView] = useState<ActiveView>(() => {
    if (typeof window !== 'undefined') {
      const qView = new URLSearchParams(window.location.search).get('view');
      if (qView === 'learning' || qView === 'chat' || qView === 'workbench' || qView === 'batch') {
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

  // Shared Model & Personality State (Smart Auto default for instant speed + deep accuracy)
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
  const [chatInput, setChatInput] = useState('');
  const [chatAttachment, setChatAttachment] = useState<{
    dataUrl: string;
    base64: string;
    mimeType: string;
    name: string;
  } | null>(null);
  const [isChatStreaming, setIsChatStreaming] = useState(false);
  const [streamingElapsedSec, setStreamingElapsedSec] = useState(1);
  const [voiceStatus, setVoiceStatus] = useState<'idle' | 'recording' | 'transcribing'>('idle');
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [chatError, setChatError] = useState<string | null>(null);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);

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

  // Verify existing session on startup
  useEffect(() => {
    let active = true;
    fetch('/api/auth/me', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { user?: AuthUser | null; globalSettings?: GlobalAppSettings } | null) => {
        if (!active) return;
        if (data?.user) {
          setCurrentUser(data.user);
        }
        applyGlobalSettings(data?.globalSettings);
      })
      .catch(() => {
        // Require sign-in if auth check fails
      })
      .finally(() => {
        if (active) setAuthChecking(false);
      });
    return () => {
      active = false;
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

  // Query live backend AI capabilities (Gemini, Google Search, OpenAI)
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

  // Auto-grow bottom chat textarea comfortably up to max 148px
  useEffect(() => {
    const el = chatTextareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const nextHeight = chatInput ? Math.min(148, Math.max(48, el.scrollHeight)) : 48;
    el.style.height = `${nextHeight}px`;
  }, [chatInput, activeView]);

  const openSettings = (sec: SettingsSection = 'navigation') => {
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
    setActiveView('chat');

    // If current chat is already empty, reuse it without adding duplicate empty rows
    if (activeThread.messages.length === 0) {
      return;
    }

    const fresh = createEmptyThread();
    setThreads((prev) => retainChatHistoryCap([fresh, ...prev], fresh.id));
    setActiveThreadId(fresh.id);
  };

  const handleDeleteThread = (threadId: string) => {
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
      setChatError('Only image files (PNG, JPEG, WebP, GIF) can be uploaded.');
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

  const handleChatImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    processImageFile(file);
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
      processImageFile(file);
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
                // Stream progressively word-by-word with zero artificial delay
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
      if ((!text && !attachment) || isChatStreaming) return;

      const targetThreadId = activeThread.id;
      const priorMessages = activeThread.messages;
      const displayText = text || 'Please take a look at this image and tell me what you notice.';

      const userMessage: ChatMessage = {
        id: `msg-${Date.now()}-u`,
        role: 'user',
        text: displayText,
        imageUrl: attachment?.dataUrl,
        imageName: attachment?.name,
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
        promptText: displayText,
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
      chatInput,
      chatModel,
      isChatStreaming,
      streamAssistantTurn,
      thinkingLevel,
    ]
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

  const stopVoiceRecording = useCallback((cancel = false) => {
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
  }, [cleanupVoiceResources]);

  const handleRegenerateMessage = useCallback(
    async (assistantMessageId: string) => {
      if (isChatStreaming) return;
      const msgIndex = activeThread.messages.findIndex((m) => m.id === assistantMessageId);
      if (msgIndex === -1) return;

      // Locate the nearest preceding user prompt
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

  const handleChatKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!isChatStreaming && (chatInput.trim() || chatAttachment)) {
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

  const toneLabel =
    selectedToneId === 'concise'
      ? 'Concise'
      : selectedToneId === 'balanced'
      ? 'Balanced'
      : selectedToneId === 'detailed'
      ? 'Detailed'
      : 'Custom';

  const previousSavedCount = useMemo(
    () => threads.filter((t) => t.id !== activeThreadId && t.messages.length > 0).length,
    [activeThreadId, threads]
  );

  if (authChecking) {
    return (
      <div className="min-h-[100dvh] w-full bg-[#f8f9fb] flex flex-col items-center justify-center gap-4 p-6">
        <TalashLogoMark className="w-16 h-16 rounded-2xl shadow-md" />
        <div className="text-center space-y-1">
          <h1 className="font-display text-2xl font-bold tracking-tight text-zinc-900">
            TALASH Ai
          </h1>
          <div className="inline-flex items-center gap-2 text-xs text-zinc-500">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-[#10a37f]" />
            <span>Initializing workspace...</span>
          </div>
        </div>
      </div>
    );
  }

  const hasAuthLinkAction =
    typeof window !== 'undefined' &&
    (new URLSearchParams(window.location.search).has('verify_email') ||
      new URLSearchParams(window.location.search).has('reset_password'));

  if (!currentUser || hasAuthLinkAction) {
    return <AuthGateModal onAuthenticated={handleAuthenticated} />;
  }

  return (
    <div
      className={`${
        activeView === 'chat' ? 'h-[100dvh] overflow-hidden' : 'min-h-[100dvh]'
      } flex flex-col bg-white text-zinc-900`}
    >
      {/* ONE SINGLE TOP NAVIGATION HEADER BAR:
          (1) Settings Icon  (2) Larger TALASH AI Logo & Name  (3) Chat  (4) New Chat */}
      <header className="sticky top-0 z-30 h-[60px] bg-white/95 backdrop-blur-md border-b border-zinc-200/85 shadow-[0_1px_4px_rgba(15,23,42,0.04)] px-3 sm:px-5 lg:px-6 flex items-center justify-between gap-2 sm:gap-4 shrink-0">
        {/* Left: (1) Settings Icon + (2) Larger TALASH AI Logo & Name */}
        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
          <button
            type="button"
            onClick={() => openSettings('navigation')}
            aria-label="Open Settings & Menu"
            title="Settings, Learning & History"
            className="inline-flex items-center justify-center w-10 h-10 text-zinc-700 hover:text-zinc-900 bg-zinc-100/90 hover:bg-zinc-200/80 border border-zinc-200/90 rounded-xl transition-colors shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900"
          >
            <Settings className="w-[18px] h-[18px]" />
          </button>

          <button
            type="button"
            onClick={() => setActiveView('chat')}
            className="inline-flex items-center gap-2.5 min-w-0 cursor-pointer rounded-xl py-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900"
          >
            <TalashLogoMark className="w-9 h-9 sm:w-10 sm:h-10 shrink-0 shadow-xs rounded-[11px]" />
            <span className="font-display text-[17px] sm:text-[19px] font-bold tracking-tight text-zinc-900 whitespace-nowrap truncate">
              TALASH Ai
            </span>
          </button>
        </div>

        {/* Right: (3) Chat + (4) New Chat */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setActiveView('chat')}
            className={`inline-flex items-center gap-1.5 px-3 sm:px-3.5 min-h-[38px] text-xs sm:text-[13px] font-semibold rounded-xl border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeView === 'chat'
                ? 'bg-zinc-100 text-zinc-900 border-zinc-300/90'
                : 'bg-white text-zinc-600 border-zinc-200/80 hover:bg-zinc-50 hover:text-zinc-900'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5 text-[#10a37f]" />
            <span>Chat</span>
          </button>

          <button
            type="button"
            onClick={handleNewChat}
            title="Start a new chat"
            className="inline-flex items-center gap-1.5 px-3 sm:px-4 min-h-[38px] text-xs sm:text-[13px] font-semibold text-white bg-zinc-900 hover:bg-zinc-800 rounded-xl shadow-xs transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <SquarePen className="w-3.5 h-3.5 text-[#10a37f]" />
            <span>New Chat</span>
          </button>
        </div>
      </header>

      {/* CHAT WORKSPACE (Locked 100dvh viewport with comfortable permanently fixed bottom composer) */}
      {activeView === 'chat' && (
        <div className="flex-1 min-h-0 flex flex-row overflow-hidden w-full relative">
          {/* Desktop Left Conversation History Sidebar */}
          <aside
            aria-label="Chat history sidebar"
            className={`hidden ${
              sidebarOpen ? 'lg:flex lg:w-[272px]' : 'lg:hidden'
            } flex-col h-full min-h-0 shrink-0 bg-[#f7f8fa] border-r border-zinc-200/85 overflow-hidden`}
          >
            <div className="p-3 space-y-2.5 border-b border-zinc-200/70 shrink-0 bg-[#f7f8fa]">
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={handleNewChat}
                  className="flex-1 inline-flex items-center justify-between px-3 min-h-[40px] text-xs font-semibold text-zinc-900 bg-white hover:bg-zinc-100 border border-zinc-200/90 rounded-xl shadow-2xs transition-colors cursor-pointer"
                >
                  <span className="inline-flex items-center gap-2">
                    <SquarePen className="w-3.5 h-3.5 text-[#10a37f]" />
                    <span>New Chat</span>
                  </span>
                  <Plus className="w-3.5 h-3.5 text-zinc-400" />
                </button>
                <button
                  type="button"
                  onClick={() => setSidebarOpen(false)}
                  aria-label="Hide sidebar"
                  className="w-10 h-10 inline-flex items-center justify-center text-zinc-500 hover:text-zinc-900 hover:bg-zinc-200/70 rounded-xl transition-colors cursor-pointer shrink-0"
                >
                  <PanelLeftClose className="w-4 h-4" />
                </button>
              </div>

              <div className="relative">
                <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={threadSearch}
                  onChange={(e) => setThreadSearch(e.target.value)}
                  placeholder="Search chats..."
                  className="w-full pl-8 pr-3 min-h-[36px] text-xs bg-white border border-zinc-200/90 rounded-xl text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:border-zinc-900 transition-colors"
                />
              </div>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-2.5 py-2.5 space-y-1">
              <div className="px-2 py-1 flex items-center justify-between text-[11px] font-semibold text-zinc-500 tabular-nums">
                <span>Saved Conversations</span>
                <span>{filteredThreads.length}</span>
              </div>

              {filteredThreads.length === 0 ? (
                <div className="px-3 py-6 text-center text-xs text-zinc-500">
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
                          ? 'bg-white border-zinc-200/90 text-zinc-900 shadow-2xs'
                          : 'border-transparent text-zinc-700 hover:bg-zinc-200/50'
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
                            isActive ? 'text-[#10a37f]' : 'text-zinc-400'
                          }`}
                        />
                        <div className="min-w-0 flex-1">
                          <span
                            className={`block text-[13px] truncate ${
                              isActive ? 'font-semibold text-zinc-900' : 'font-medium text-zinc-800'
                            }`}
                          >
                            {thread.title}
                          </span>
                          <span className="block text-[11px] text-zinc-400 tabular-nums mt-0.5 truncate">
                            {thread.messages.length}{' '}
                            {thread.messages.length === 1 ? 'msg' : 'msgs'}
                            {shortDate ? ` · ${shortDate}` : ''}
                          </span>
                        </div>
                      </button>

                      {threads.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleDeleteThread(thread.id)}
                          aria-label="Delete conversation"
                          className="w-8 h-8 inline-flex items-center justify-center rounded-lg text-zinc-400 hover:text-red-600 hover:bg-red-50 lg:opacity-0 lg:group-hover:opacity-100 focus:opacity-100 transition-opacity cursor-pointer shrink-0"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            <div className="p-3 border-t border-zinc-200/80 shrink-0 bg-[#f7f8fa] space-y-2">
              <button
                type="button"
                onClick={() => setActiveView('learning')}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl bg-white border border-zinc-200/90 hover:border-zinc-400 transition-all text-left cursor-pointer"
              >
                <BookOpen className="w-4 h-4 text-[#10a37f] shrink-0" />
                <span className="text-xs font-semibold text-zinc-900 truncate">
                  Islamic Learning Center
                </span>
              </button>

              <button
                type="button"
                onClick={() => openSettings('history')}
                className="w-full flex items-center justify-between gap-2.5 px-3 py-2 rounded-xl bg-white border border-zinc-200/90 hover:border-zinc-400 transition-all text-left cursor-pointer"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <History className="w-4 h-4 text-[#10a37f] shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-zinc-900 truncate">
                      History &amp; Settings
                    </p>
                    <p className="text-[11px] text-zinc-500 truncate tabular-nums">
                      {previousSavedCount}/20 saved · {activeProfile.label}
                    </p>
                  </div>
                </div>
              </button>
            </div>
          </aside>

          {/* Main Conversational Canvas (Zero secondary top bar) */}
          <main className="flex-1 min-w-0 min-h-0 flex flex-col h-full bg-[#f8f9fb] relative overflow-hidden">
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
                      <TalashLogoMark className="w-14 h-14 rounded-2xl shadow-sm" />
                    </div>
                    <h1 className="text-xl sm:text-3xl font-bold text-zinc-900 tracking-tight text-balance">
                      TALASH Ai — What would you like to find?
                    </h1>
                    <p className="text-xs sm:text-sm leading-relaxed text-zinc-500">
                      Fast streaming answers in Pashto, Arabic, and English—with authentic Islamic references, large collection support, and live Google Search verification.
                    </p>
                  </div>

                  {/* Quick Navigation Actions inside empty chat (keeps header strictly 4 items) */}
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    <button
                      type="button"
                      onClick={() => setActiveView('learning')}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-zinc-800 bg-white hover:bg-zinc-50 border border-zinc-200/90 rounded-xl shadow-2xs cursor-pointer transition-colors"
                    >
                      <BookOpen className="w-3.5 h-3.5 text-[#10a37f]" />
                      <span>Islamic Learning</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => openSettings('history')}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-zinc-800 bg-white hover:bg-zinc-50 border border-zinc-200/90 rounded-xl shadow-2xs cursor-pointer transition-colors"
                    >
                      <History className="w-3.5 h-3.5 text-[#10a37f]" />
                      <span>History ({previousSavedCount}/20)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => openSettings('model')}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-zinc-800 bg-white hover:bg-zinc-50 border border-zinc-200/90 rounded-xl shadow-2xs cursor-pointer transition-colors"
                    >
                      <Globe className="w-3.5 h-3.5 text-[#10a37f]" />
                      <span>{activeProfile.label}</span>
                    </button>
                    {currentUser.role === 'super_admin' && (
                      <button
                        type="button"
                        onClick={() => setAdminDashboardOpen(true)}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-zinc-900 hover:bg-zinc-800 rounded-xl shadow-2xs cursor-pointer transition-colors"
                      >
                        <ShieldCheck className="w-3.5 h-3.5 text-[#10a37f]" />
                        <span>Owner Admin</span>
                      </button>
                    )}
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
                          className={`p-4 bg-white border border-zinc-200/90 hover:border-zinc-900 shadow-[0_1px_4px_rgba(0,0,0,0.02)] hover:shadow-[0_6px_18px_rgba(0,0,0,0.05)] rounded-2xl transition-all flex flex-col justify-between gap-3 cursor-pointer ${
                            starterPashto ? 'text-right' : 'text-left'
                          }`}
                        >
                          <div className="space-y-1">
                            <p className="text-xs font-semibold text-zinc-900">{starter.title}</p>
                            <p className="text-xs text-zinc-500 leading-relaxed line-clamp-3">
                              {starter.prompt}
                            </p>
                          </div>
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-zinc-700">
                            <span>Ask TALASH Ai</span>
                            <ArrowUpRight className="w-3 h-3" />
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="w-full max-w-[1040px] mx-auto px-2 sm:px-5 py-3.5 sm:py-5 space-y-4">
                  {activeThread.messages.map((msg) => {
                    const isUser = msg.role === 'user';
                    const isPashto = isPashtoText(msg.text);

                    if (isUser) {
                      return (
                        <div
                          key={msg.id}
                          className={`flex w-full ${isPashto ? 'justify-end' : 'justify-start'}`}
                        >
                          <div
                            dir={isPashto ? 'rtl' : 'ltr'}
                            className={`max-w-[92%] sm:max-w-[80%] rounded-2xl px-4 py-3 bg-zinc-900 text-white shadow-[0_2px_10px_rgba(0,0,0,0.08)] space-y-2 ${
                              isPashto ? 'text-right' : 'text-left'
                            }`}
                          >
                            {msg.imageUrl && (
                              <img
                                src={msg.imageUrl}
                                alt={msg.imageName || 'Uploaded image'}
                                referrerPolicy="no-referrer"
                                className="max-h-52 rounded-xl object-contain border border-zinc-700"
                              />
                            )}
                            <p className="text-[16px] leading-relaxed whitespace-pre-wrap">
                              {msg.text}
                            </p>
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
                        <div className="w-full bg-white border border-zinc-200/95 rounded-2xl shadow-[0_2px_12px_rgba(15,23,42,0.035)] overflow-hidden">
                          {/* Left-anchored TALASH AI Header + Searched & Timing Metadata */}
                          <div
                            dir="ltr"
                            className="px-3.5 sm:px-5 py-2.5 bg-[#fafafa] border-b border-zinc-200/75 flex flex-wrap items-center justify-between gap-2 text-left"
                          >
                            <div className="flex flex-wrap items-center gap-2 min-w-0">
                              <span className="text-[13.5px] font-bold text-zinc-900 tracking-tight whitespace-nowrap">
                                TALASH Ai
                              </span>

                              <span className="h-3 w-px bg-zinc-300 shrink-0" aria-hidden="true" />

                              {msg.durationMs !== undefined ? (
                                <div className="inline-flex items-center gap-1 text-xs text-zinc-500 tabular-nums whitespace-nowrap">
                                  {msg.searched ? (
                                    <>
                                      <Globe className="w-3 h-3 text-[#10a37f] shrink-0" />
                                      <span className="font-medium text-zinc-700">Searched</span>
                                    </>
                                  ) : (
                                    <Sparkles className="w-3 h-3 text-[#10a37f] shrink-0" />
                                  )}
                                  <span className="text-zinc-500">
                                    {formatReplySeconds(msg.durationMs)}
                                  </span>
                                  {domainLabel && (
                                    <>
                                      <span aria-hidden="true">·</span>
                                      <span className="text-zinc-500">{domainLabel}</span>
                                    </>
                                  )}
                                  {msg.meta?.multiModelSynthesized && (
                                    <>
                                      <span aria-hidden="true">·</span>
                                      <span className="inline-flex items-center gap-1 text-emerald-700 font-medium">
                                        <ShieldCheck className="w-3 h-3" />
                                        <span>Verified</span>
                                      </span>
                                    </>
                                  )}
                                </div>
                              ) : (
                                <div className="inline-flex items-center gap-1 text-xs text-zinc-500 tabular-nums whitespace-nowrap">
                                  <Loader2 className="w-3 h-3 animate-spin text-[#10a37f] shrink-0" />
                                  <span>{msg.text ? 'Streaming' : 'Thinking'}</span>
                                  <span className="font-medium text-zinc-700">
                                    {streamingElapsedSec}s
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Wide Edge-to-Edge Response Body with RTL/LTR Typography */}
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
                                <div className="h-3.5 w-3/4 bg-zinc-100 rounded animate-pulse" />
                                <div className="h-3.5 w-1/2 bg-zinc-100 rounded animate-pulse" />
                              </div>
                            )}
                          </div>

                          {/* Large Request Progress & Continue Button */}
                          {msg.continuation && msg.durationMs !== undefined && (
                            <div
                              dir="ltr"
                              className="mx-3.5 sm:mx-6 mb-3 p-3 rounded-xl bg-[#fafafa] border border-zinc-200/85 flex flex-wrap items-center justify-between gap-3"
                            >
                              <div className="space-y-1 min-w-0 flex-1">
                                <div className="flex items-center justify-between gap-2 text-xs">
                                  <span className="font-semibold text-zinc-900">
                                    {msg.continuation.totalTarget
                                      ? `Completed ${msg.continuation.completedCount} of ${msg.continuation.totalTarget}`
                                      : `Completed ${msg.continuation.completedCount} items`}
                                  </span>
                                  {msg.continuation.totalTarget && (
                                    <span className="font-mono text-[11px] text-zinc-500 tabular-nums">
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
                                  <div className="w-full h-1.5 rounded-full bg-zinc-200 overflow-hidden">
                                    <div
                                      className="h-full bg-[#10a37f] rounded-full transition-all"
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
                                  className="inline-flex items-center gap-1.5 px-3.5 min-h-[38px] text-xs font-semibold text-white bg-zinc-900 hover:bg-zinc-800 disabled:opacity-45 disabled:cursor-not-allowed rounded-xl shadow-xs transition-colors whitespace-nowrap shrink-0 cursor-pointer"
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
                              className="mx-3.5 sm:mx-6 py-2.5 border-t border-zinc-100 space-y-1.5"
                            >
                              <div className="flex items-center gap-1.5 text-[11px] font-medium text-zinc-500">
                                <Globe className="w-3 h-3 text-[#10a37f]" />
                                <span>Google Sources</span>
                              </div>
                              <div className="flex flex-wrap gap-x-3 gap-y-1">
                                {msg.sources.slice(0, 6).map((src) => (
                                  <a
                                    key={src.uri}
                                    href={src.uri}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 text-[11px] font-medium text-zinc-700 hover:text-[#10a37f] hover:underline max-w-[220px] truncate"
                                  >
                                    <span className="truncate">{src.title}</span>
                                    <ExternalLink className="w-2.5 h-2.5 shrink-0 opacity-70" />
                                  </a>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Action Bar: Copy, Share, Retry */}
                          {msg.text && msg.durationMs !== undefined && (
                            <div
                              dir="ltr"
                              className="px-3 sm:px-5 py-1.5 bg-[#fafafa]/80 border-t border-zinc-200/65 flex flex-wrap items-center justify-between gap-2"
                            >
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => void handleCopyMessage(msg.id, msg.text)}
                                  className="inline-flex items-center gap-1.5 px-2.5 min-h-[36px] text-xs font-medium text-zinc-600 hover:text-zinc-900 hover:bg-zinc-200/60 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                                >
                                  {copiedMessageId === msg.id ? (
                                    <>
                                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                                      <span className="text-emerald-700">Copied</span>
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
                                  onClick={() => handleOpenShareChatMessage(msg)}
                                  className="inline-flex items-center gap-1.5 px-2.5 min-h-[36px] text-xs font-medium text-zinc-600 hover:text-zinc-900 hover:bg-zinc-200/60 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                                >
                                  <Share2 className="w-3.5 h-3.5" />
                                  <span>Share</span>
                                </button>

                                <button
                                  type="button"
                                  disabled={isChatStreaming}
                                  onClick={() => void handleRegenerateMessage(msg.id)}
                                  className="inline-flex items-center gap-1.5 px-2.5 min-h-[36px] text-xs font-medium text-zinc-600 hover:text-zinc-900 hover:bg-zinc-200/60 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                                >
                                  <RotateCcw className="w-3.5 h-3.5" />
                                  <span>Retry</span>
                                </button>
                              </div>

                              {showMetrics &&
                                msg.usage?.totalTokens !== null &&
                                msg.usage?.totalTokens !== undefined && (
                                  <div className="text-[11px] text-zinc-400 tabular-nums">
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

            {/* Comfortable Permanently Fixed Bottom Input Box (stays visible above Android keyboard) */}
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleComposerDrop}
              className="px-2 sm:px-5 pb-[max(0.65rem,env(safe-area-inset-bottom))] pt-2 bg-[#f8f9fb] border-t border-zinc-200/75 shrink-0"
            >
              <div className="max-w-[1040px] w-full mx-auto space-y-1.5">
                {chatError && (
                  <div className="px-3 py-2 rounded-xl bg-red-50 border border-red-200 text-red-900 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                      <p className="text-xs leading-snug text-red-800 truncate">{chatError}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setChatError(null)}
                      aria-label="Dismiss error"
                      className="p-1 text-red-500 hover:text-red-800 rounded-lg shrink-0 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                <div className="bg-white border border-zinc-200/95 rounded-[22px] px-2.5 sm:px-3.5 py-2 shadow-[0_3px_14px_rgba(15,23,42,0.06)] focus-within:border-zinc-400 transition-all">
                  {chatAttachment && (
                    <div className="mb-2 pb-2 border-b border-zinc-100 flex items-center justify-between gap-2.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <img
                          src={chatAttachment.dataUrl}
                          alt={chatAttachment.name}
                          referrerPolicy="no-referrer"
                          className="w-10 h-10 rounded-lg object-cover border border-zinc-200 shrink-0"
                        />
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-zinc-800 truncate">
                            {chatAttachment.name}
                          </p>
                          <p className="text-[10px] text-[#10a37f]">Ready to send</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setChatAttachment(null)}
                        aria-label="Remove uploaded image"
                        className="p-1 text-zinc-400 hover:text-zinc-800 hover:bg-zinc-100 rounded-lg cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}

                  {voiceStatus !== 'idle' && (
                    <div className="mb-2 px-2.5 py-1.5 rounded-xl bg-[#f7f7f8] border border-zinc-200/80 flex items-center justify-between gap-2">
                      {voiceStatus === 'recording' ? (
                        <>
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse shrink-0" />
                            <span className="text-xs font-semibold text-zinc-900">
                              Recording
                            </span>
                            <span className="font-mono text-xs text-zinc-500 tabular-nums">
                              {Math.floor(recordingSeconds / 60)}:
                              {String(recordingSeconds % 60).padStart(2, '0')}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => stopVoiceRecording(true)}
                              className="px-2.5 py-1 text-xs font-medium text-zinc-600 hover:text-zinc-900 hover:bg-zinc-200/70 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={() => stopVoiceRecording(false)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-white bg-zinc-900 hover:bg-zinc-800 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                            >
                              <Check className="w-3 h-3" />
                              <span>Send</span>
                            </button>
                          </div>
                        </>
                      ) : (
                        <div className="flex items-center gap-2 text-xs text-zinc-700">
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-[#10a37f] shrink-0" />
                          <span>Converting voice to text...</span>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="flex items-end gap-2">
                    <input
                      id="chat-image-upload"
                      type="file"
                      accept="image/*,.png,.jpg,.jpeg,.webp,.gif,.heic,.heif"
                      onChange={handleChatImageUpload}
                      className="sr-only"
                    />
                    <label
                      htmlFor="chat-image-upload"
                      title="Upload Image"
                      aria-label="Upload Image"
                      className="inline-flex items-center justify-center gap-1.5 h-10 px-2.5 sm:px-3 text-xs font-medium text-zinc-700 hover:text-zinc-900 bg-[#f7f7f8] hover:bg-zinc-200/75 border border-zinc-200/80 rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <ImageIcon className="w-4 h-4 shrink-0" />
                      <span className="hidden sm:inline">Upload Image</span>
                    </label>

                    <textarea
                      ref={chatTextareaRef}
                      rows={2}
                      dir={isPashtoText(chatInput) ? 'rtl' : 'ltr'}
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      onKeyDown={handleChatKeyDown}
                      onPaste={handleComposerPaste}
                      placeholder="Ask TALASH Ai anything..."
                      className={`flex-1 min-w-0 min-h-[48px] max-h-[148px] px-1.5 py-2 text-[15.5px] leading-snug text-zinc-900 placeholder:text-zinc-400 bg-transparent focus:outline-none resize-none ${
                        isPashtoText(chatInput) ? 'text-right' : 'text-left'
                      }`}
                    />

                    {/* Icon-only Voice Recorder button */}
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
                      aria-label={voiceStatus === 'recording' ? 'Stop voice recording' : 'Ask by voice'}
                      title={voiceStatus === 'recording' ? 'Stop voice recording' : 'Ask by voice'}
                      className={`inline-flex items-center justify-center w-10 h-10 border rounded-xl transition-colors shrink-0 cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed ${
                        voiceStatus === 'recording'
                          ? 'bg-red-50 border-red-200 text-red-600 hover:bg-red-100'
                          : 'text-zinc-700 hover:text-zinc-900 bg-[#f7f7f8] hover:bg-zinc-200/75 border-zinc-200/80'
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
                        className="w-10 h-10 rounded-full bg-zinc-900 hover:bg-zinc-800 text-white flex items-center justify-center shadow-xs transition-colors shrink-0 cursor-pointer"
                      >
                        <Square className="w-4 h-4 fill-current" />
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={
                          voiceStatus !== 'idle' || (!chatInput.trim() && !chatAttachment)
                        }
                        onClick={() => void sendChatMessage()}
                        aria-label="Send message"
                        className="w-10 h-10 rounded-full bg-zinc-900 hover:bg-zinc-800 disabled:bg-zinc-200 disabled:text-zinc-400 disabled:cursor-not-allowed text-white flex items-center justify-center shadow-xs transition-all shrink-0 cursor-pointer"
                      >
                        <ArrowUp className="w-[18px] h-[18px]" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </main>
        </div>
      )}

      {/* PASHTO ISLAMIC LEARNING CENTER */}
      {activeView === 'learning' && (
        <LearningView
          onAskInChat={(question) => {
            setActiveView('chat');
            void sendChatMessage(question);
          }}
        />
      )}

      {/* ORGANIZED WORKBENCH VIEW */}
      {activeView === 'workbench' && (
        <div className="flex-1 flex flex-col lg:flex-row max-w-[1440px] w-full mx-auto bg-white">
          <div className="lg:hidden px-4 py-2.5 bg-[#f9f9f9] border-b border-zinc-200 flex items-center justify-between">
            <span className="text-xs font-medium text-zinc-600">
              {activeProfile.label} ·{' '}
              {thinkingLevel === 'DEFAULT' ? 'Auto Thinking' : `${thinkingLevel} Thinking`}
            </span>
            <button
              type="button"
              onClick={() => setMobileConfigOpen((prev) => !prev)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-zinc-700 bg-white border border-zinc-200 hover:bg-zinc-100 rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>{mobileConfigOpen ? 'Hide Settings' : 'Parameters'}</span>
            </button>
          </div>

          {/* Workbench Config Sidebar */}
          <aside
            className={`${
              mobileConfigOpen ? 'block' : 'hidden'
            } lg:block w-full lg:w-[280px] shrink-0 bg-[#f9f9f9] border-b lg:border-b-0 lg:border-r border-zinc-200/80 p-5 space-y-6`}
          >
            <section className="space-y-2.5">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-semibold text-zinc-900">Model Profile</h2>
                <span className="font-mono text-[11px] text-zinc-500">{model}</span>
              </div>
              <div className="space-y-1.5">
                {MODEL_PROFILES.filter((p) => !p.requiresOpenAI).map((profile) => (
                  <button
                    key={profile.profileId}
                    type="button"
                    onClick={() => handleSelectProfile(profile.profileId)}
                    className={`w-full text-left px-3 py-2 rounded-xl border text-xs transition-colors cursor-pointer ${
                      profileId === profile.profileId
                        ? 'bg-white border-zinc-900 text-zinc-900 font-semibold shadow-xs'
                        : 'bg-white border-zinc-200 text-zinc-700 hover:border-zinc-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span>{profile.label}</span>
                      <span className="font-mono text-[11px] text-zinc-500">
                        {profile.defaultThinking}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </section>

            <div className="border-t border-zinc-200/70" />

            <section className="space-y-2">
              <h2 className="text-xs font-semibold text-zinc-900">Delivery Mode</h2>
              <div className="grid grid-cols-2 gap-1 p-1 bg-zinc-200/70 rounded-xl">
                <button
                  type="button"
                  onClick={() => setDeliveryMode('stream')}
                  className={`px-2.5 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                    deliveryMode === 'stream'
                      ? 'bg-white text-zinc-900 shadow-xs'
                      : 'text-zinc-600 hover:text-zinc-900'
                  }`}
                >
                  Stream SSE
                </button>
                <button
                  type="button"
                  onClick={() => setDeliveryMode('single')}
                  className={`px-2.5 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                    deliveryMode === 'single'
                      ? 'bg-white text-zinc-900 shadow-xs'
                      : 'text-zinc-600 hover:text-zinc-900'
                  }`}
                >
                  Single Turn
                </button>
              </div>
            </section>

            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-semibold text-zinc-900">Thinking Depth</h2>
                <span className="text-[11px] text-zinc-500">
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

            <section className="space-y-2">
              <h2 className="text-xs font-semibold text-zinc-900">Output Format</h2>
              <div className="grid grid-cols-2 gap-1 p-1 bg-zinc-200/70 rounded-xl">
                <button
                  type="button"
                  onClick={() => setResponseFormat('text')}
                  className={`px-2.5 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                    responseFormat === 'text'
                      ? 'bg-white text-zinc-900 shadow-xs'
                      : 'text-zinc-600 hover:text-zinc-900'
                  }`}
                >
                  Plain Text
                </button>
                <button
                  type="button"
                  onClick={() => setResponseFormat('json')}
                  className={`px-2.5 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                    responseFormat === 'json'
                      ? 'bg-white text-zinc-900 shadow-xs'
                      : 'text-zinc-600 hover:text-zinc-900'
                  }`}
                >
                  JSON Schema
                </button>
              </div>
            </section>

            <div className="border-t border-zinc-200/70" />

            <section className="space-y-2">
              <label htmlFor="system-instruction" className="block text-xs font-semibold text-zinc-900">
                System Instruction
              </label>
              <textarea
                id="system-instruction"
                rows={3}
                value={systemInstruction}
                onChange={(e) => setSystemInstruction(e.target.value)}
                placeholder="Optional guidance on tone, role, or constraints..."
                className="w-full px-3 py-2 text-xs leading-relaxed bg-white border border-zinc-200 rounded-xl text-zinc-800 placeholder:text-zinc-400 focus:outline-none focus:border-zinc-900 resize-y"
              />
            </section>

            <div className="border-t border-zinc-200/70" />

            <section className="space-y-2">
              <h2 className="text-xs font-semibold text-zinc-900">Quick Presets</h2>
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
                          ? 'bg-zinc-200/80 text-zinc-900 font-medium'
                          : 'text-zinc-600 hover:bg-zinc-200/45 hover:text-zinc-900'
                      }`}
                    >
                      <span className="truncate">{preset.title}</span>
                      <ArrowUpRight className="w-3.5 h-3.5 shrink-0 opacity-60" />
                    </button>
                  );
                })}
              </div>
            </section>
          </aside>

          {/* Workbench Main Stage */}
          <main className="flex-1 min-w-0 p-6 lg:p-8 space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h1 className="text-2xl font-bold text-zinc-900">Prompt Workbench</h1>
                <p className="text-sm text-zinc-500 mt-0.5">
                  Test single-turn prompts, manage reusable templates, and export SDK snippets.
                </p>
              </div>

              <div className="flex items-center gap-1 p-1 bg-zinc-100 rounded-xl">
                <button
                  type="button"
                  onClick={() => setWorkbenchTab('editor')}
                  className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                    workbenchTab === 'editor'
                      ? 'bg-white text-zinc-900 shadow-xs'
                      : 'text-zinc-600 hover:text-zinc-900'
                  }`}
                >
                  Editor & Output
                </button>
                <button
                  type="button"
                  onClick={() => setWorkbenchTab('templates')}
                  className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                    workbenchTab === 'templates'
                      ? 'bg-white text-zinc-900 shadow-xs'
                      : 'text-zinc-600 hover:text-zinc-900'
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
                      ? 'bg-white text-zinc-900 shadow-xs'
                      : 'text-zinc-600 hover:text-zinc-900'
                  }`}
                >
                  <Code2 className="w-3.5 h-3.5" />
                  <span>SDK Code</span>
                </button>
              </div>
            </div>

            {workbenchTab === 'editor' && (
              <div className="space-y-6">
                <section className="bg-white border border-zinc-200 rounded-2xl overflow-hidden">
                  <div className="px-5 py-3 border-b border-zinc-100 flex flex-wrap items-center justify-between gap-4">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                      <label htmlFor="prompt-input" className="font-semibold text-zinc-900 text-sm">
                        Prompt
                      </label>
                      <span aria-hidden="true">·</span>
                      <span className="tabular-nums">{wordCount} words</span>
                      <span aria-hidden="true">·</span>
                      <span className="tabular-nums">{prompt.length} chars</span>
                      {draftSavedAt && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="text-zinc-400">Draft saved</span>
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
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:text-zinc-900 hover:bg-zinc-100 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        <BookmarkPlus className="w-3.5 h-3.5" />
                        <span>Save Template</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleResetWorkbench}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
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
                      className="w-full text-[15px] leading-relaxed text-zinc-900 placeholder:text-zinc-400 bg-transparent focus:outline-none resize-y"
                    />

                    <div className="mt-4 pt-3.5 border-t border-zinc-100 flex flex-wrap items-center justify-between gap-4">
                      <div className="flex items-center gap-2 text-xs text-zinc-500">
                        <span>Press</span>
                        <kbd className="px-1.5 py-0.5 text-[11px] font-mono bg-zinc-100 border border-zinc-200 rounded text-zinc-700">
                          Ctrl/Cmd + Enter
                        </kbd>
                        <span>to execute</span>
                      </div>

                      <button
                        type="button"
                        disabled={isRunning || prompt.trim().length === 0}
                        onClick={() => void executePrompt()}
                        className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-zinc-900 hover:bg-zinc-800 disabled:opacity-45 disabled:cursor-not-allowed rounded-full transition-colors whitespace-nowrap shrink-0 cursor-pointer"
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

                <section className="bg-white border border-zinc-200 rounded-2xl overflow-hidden">
                  <div className="px-5 py-3 border-b border-zinc-100 flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-2 text-xs text-zinc-500 min-w-0">
                      <h2 className="font-semibold text-zinc-900 text-sm shrink-0">TALASH Ai</h2>
                      <span aria-hidden="true">·</span>
                      <span>{deliveryMode === 'stream' ? 'Streaming' : 'Single turn'}</span>
                    </div>

                    {output && (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={handleCopyOutput}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          {copiedOutput ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-emerald-600" />
                              <span className="text-emerald-700">Copied</span>
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
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          <Share2 className="w-3.5 h-3.5" />
                          <span>Share</span>
                        </button>

                        <button
                          type="button"
                          disabled={isRunning}
                          onClick={() => void executePrompt()}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 disabled:opacity-45 disabled:cursor-not-allowed rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>Retry</span>
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="p-5 min-h-[180px]">
                    {errorMessage ? (
                      <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-900 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="flex items-start gap-3">
                          <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                          <div className="space-y-1">
                            <p className="text-sm font-semibold">Generation Error</p>
                            <p className="text-xs leading-relaxed text-red-800">{errorMessage}</p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => void executePrompt()}
                          className="px-3.5 py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-full whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          Retry Request
                        </button>
                      </div>
                    ) : isRunning && !output ? (
                      <div className="space-y-3 py-2" aria-live="polite">
                        <div className="flex items-center gap-2 text-xs text-zinc-500">
                          <Loader2 className="w-4 h-4 animate-spin text-zinc-700" />
                          <span>Waiting for TALASH Ai...</span>
                        </div>
                        <div className="space-y-2 pt-1">
                          <div className="h-3.5 w-3/4 bg-zinc-100 rounded animate-pulse" />
                          <div className="h-3.5 w-1/2 bg-zinc-100 rounded animate-pulse" />
                        </div>
                      </div>
                    ) : output ? (
                      <div aria-live="polite">
                        <MarkdownOutput content={output} isJson={responseFormat === 'json'} />
                        {isRunning && (
                          <div className="mt-3 inline-flex items-center gap-2 text-xs text-zinc-500">
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-zinc-700" />
                            <span>Streaming response...</span>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="py-8 text-center space-y-2">
                        <p className="text-sm font-medium text-zinc-700">Ready to generate</p>
                        <p className="text-xs text-zinc-500 max-w-md mx-auto">
                          Edit the prompt above or pick a preset from the sidebar, then click Generate to inspect the live response.
                        </p>
                      </div>
                    )}
                  </div>

                  {durationMs !== null && !errorMessage && (
                    <div className="px-5 py-3 bg-[#f9f9f9] border-t border-zinc-100 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-zinc-600 tabular-nums">
                      <div>
                        <span className="text-zinc-400 mr-1.5">Latency</span>
                        <span className="font-mono font-medium text-zinc-800">{durationMs} ms</span>
                      </div>
                      {usage?.promptTokens !== null && usage?.promptTokens !== undefined && (
                        <div>
                          <span className="text-zinc-400 mr-1.5">Input tokens</span>
                          <span className="font-mono font-medium text-zinc-800">
                            {usage.promptTokens}
                          </span>
                        </div>
                      )}
                      {usage?.outputTokens !== null && usage?.outputTokens !== undefined && (
                        <div>
                          <span className="text-zinc-400 mr-1.5">Output tokens</span>
                          <span className="font-mono font-medium text-zinc-800">
                            {usage.outputTokens}
                          </span>
                        </div>
                      )}
                      {usage?.thinkingTokens !== null &&
                        usage?.thinkingTokens !== undefined &&
                        usage.thinkingTokens > 0 && (
                          <div>
                            <span className="text-zinc-400 mr-1.5">Thinking tokens</span>
                            <span className="font-mono font-medium text-zinc-800">
                              {usage.thinkingTokens}
                            </span>
                          </div>
                        )}
                      {usage?.totalTokens !== null && usage?.totalTokens !== undefined && (
                        <div>
                          <span className="text-zinc-400 mr-1.5">Total tokens</span>
                          <span className="font-mono font-medium text-zinc-800">
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

      {/* BATCH CSV RUNNER VIEW */}
      {activeView === 'batch' && <BatchCsvView sessionToken={sessionToken} />}

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

      {/* Share Dialog */}
      <ShareDialog
        isOpen={shareTarget !== null}
        title={shareTarget?.title ?? 'TALASH Ai'}
        content={shareTarget?.content ?? ''}
        fullTranscript={shareTarget?.fullTranscript}
        onClose={() => setShareTarget(null)}
      />

      <OfflineIndicator />
    </div>
  );
}

export type GeminiModelId = 'gemini-4-hydrogen' | 'gemini-3.1-flash-lite';
export type ChatModelId = 'auto' | GeminiModelId | 'openai-gpt';

export type ModelProfileId =
  | 'auto-smart'
  | 'flash-chat'
  | 'flash-thinking'
  | 'flash-lite'
  | 'openai-gpt';

export type ThinkingDepth = 'DEFAULT' | 'MINIMAL' | 'LOW' | 'MEDIUM' | 'HIGH' | 'XHIGH';

export type ResponseFormat = 'text' | 'json';

export type DeliveryMode = 'stream' | 'single';

export type ActiveView = 'chat' | 'learning' | 'workbench' | 'batch';

export type GoogleSearchMode = 'auto' | 'always' | 'off';

export interface ServerCapabilities {
  gemini: {
    connected: boolean;
    models: string[];
  };
  openai: {
    connected: boolean;
    models: string[];
    envVar: string;
  };
  googleSearchGrounding: boolean;
}

export type UserRole = 'super_admin' | 'admin' | 'user';
export type UserStatus = 'active' | 'suspended';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  role: UserRole;
  isImmutableOwner: boolean;
  emailVerified: boolean;
  providers: string[];
  status: UserStatus;
  createdAt: string;
  lastLoginAt: string;
}

export interface GlobalAppSettings {
  appName: string;
  ownerEmail: string;
  defaultModel: ChatModelId;
  googleSearchMode: GoogleSearchMode;
  allowNewRegistrations: boolean;
  googleOAuthEnabled: boolean;
  facebookOAuthEnabled: boolean;
  siteDomain: string;
  googleSiteVerification: string;
  customSystemInstruction: string;
}

export interface OAuthProvidersStatus {
  appName: string;
  ownerEmail: string;
  emailPasswordEnabled: boolean;
  emailDelivery: {
    configured: boolean;
    provider: 'smtp' | 'resend' | null;
  };
  google: {
    configured: boolean;
    enabled: boolean;
    redirectUri: string;
  };
  facebook: {
    configured: boolean;
    enabled: boolean;
    redirectUri: string;
  };
  ownerAccess: {
    claimed: boolean;
    envKeyConfigured: boolean;
  };
}

export interface ModelOption {
  id: GeminiModelId;
  label: string;
  summary: string;
  supportedThinking: ThinkingDepth[];
}

export interface ModelProfile {
  profileId: ModelProfileId;
  model: ChatModelId;
  workbenchModel: GeminiModelId;
  label: string;
  subtitle: string;
  defaultThinking: ThinkingDepth;
  requiresOpenAI?: boolean;
}

export const MODEL_OPTIONS: ModelOption[] = [
  {
    id: 'gemini-4-hydrogen',
    label: 'Talash Pro',
    summary: 'Balanced speed, deep Islamic & academic reasoning, and Google Search verification.',
    supportedThinking: ['DEFAULT', 'LOW', 'MEDIUM', 'HIGH', 'XHIGH'],
  },
  {
    id: 'gemini-3.1-flash-lite',
    label: 'Fast Lite',
    summary: 'Ultra-low latency for snappy Q&A, translations, and quick drafts.',
    supportedThinking: ['DEFAULT', 'MINIMAL', 'LOW', 'MEDIUM', 'HIGH'],
  },
];

export const MODEL_PROFILES: ModelProfile[] = [
  {
    profileId: 'auto-smart',
    model: 'auto',
    workbenchModel: 'gemini-4-hydrogen',
    label: 'Smart Auto',
    subtitle: 'Instant speed on simple questions; deep verification on Islamic, coding & research queries.',
    defaultThinking: 'DEFAULT',
  },
  {
    profileId: 'flash-chat',
    model: 'gemini-4-hydrogen',
    workbenchModel: 'gemini-4-hydrogen',
    label: 'Talash Pro',
    subtitle: 'High-accuracy reasoning and Google Search grounding across all topics.',
    defaultThinking: 'MEDIUM',
  },
  {
    profileId: 'flash-thinking',
    model: 'gemini-4-hydrogen',
    workbenchModel: 'gemini-4-hydrogen',
    label: 'Deep Research',
    subtitle: 'Maximum multi-step reasoning depth for complex analysis and Fiqh research.',
    defaultThinking: 'HIGH',
  },
  {
    profileId: 'flash-lite',
    model: 'gemini-3.1-flash-lite',
    workbenchModel: 'gemini-3.1-flash-lite',
    label: 'Fast Lite',
    subtitle: 'Maximum speed for everyday questions, summaries, and quick lookups.',
    defaultThinking: 'MINIMAL',
  },
  {
    profileId: 'openai-gpt',
    model: 'openai-gpt',
    workbenchModel: 'gemini-4-hydrogen',
    label: 'OpenAI GPT',
    subtitle: 'Live OpenAI ChatGPT routing when OPENAI_API_KEY is configured in Secrets.',
    defaultThinking: 'DEFAULT',
    requiresOpenAI: true,
  },
];

export interface TonePreset {
  id: string;
  label: string;
  instruction: string;
}

export const DEFAULT_CONCISE_SYSTEM_INSTRUCTION =
  'Give clear, accurate, well-structured answers with headings or tables when helpful. Prioritize verified Qur’an, authentic Sunnah, and reliable facts, avoid fluff, reply in the user’s language, and end with one tailored next-step suggestion.';

export const TONE_PRESETS: TonePreset[] = [
  {
    id: 'concise',
    label: 'Smart & Structured',
    instruction: DEFAULT_CONCISE_SYSTEM_INSTRUCTION,
  },
  {
    id: 'balanced',
    label: 'Concise & Direct',
    instruction:
      'Give crisp, direct answers focused strictly on what matters most, with verified sources and a tailored next step.',
  },
  {
    id: 'detailed',
    label: 'Comprehensive Research',
    instruction:
      'Provide thorough, step-by-step explanations with scholarly references, tables, and practical examples without filler.',
  },
];

export interface PromptPreset {
  id: string;
  title: string;
  prompt: string;
  systemInstruction: string;
  model: GeminiModelId;
  thinkingLevel: ThinkingDepth;
  responseFormat: ResponseFormat;
}

export const PROMPT_PRESETS: PromptPreset[] = [
  {
    id: 'explain-ai',
    title: 'Explain AI briefly',
    prompt: 'Explain how AI works in a few words',
    systemInstruction: '',
    model: 'gemini-4-hydrogen',
    thinkingLevel: 'LOW',
    responseFormat: 'text',
  },
  {
    id: 'architecture-brief',
    title: 'Transformer overview',
    prompt: 'Summarize how attention mechanisms work in transformers using three crisp bullet points.',
    systemInstruction: 'You are a concise computer science lecturer. Be precise and avoid jargon.',
    model: 'gemini-4-hydrogen',
    thinkingLevel: 'MEDIUM',
    responseFormat: 'text',
  },
  {
    id: 'json-extraction',
    title: 'Structured JSON output',
    prompt: 'Return a JSON object describing 3 core milestones in artificial intelligence history with year, title, and impact.',
    systemInstruction: 'Return valid JSON only with a top-level "milestones" array.',
    model: 'gemini-4-hydrogen',
    thinkingLevel: 'LOW',
    responseFormat: 'json',
  },
  {
    id: 'code-review',
    title: 'Explain async iterator',
    prompt: 'Explain when to choose streaming responses over single-shot generateContent in a web backend.',
    systemInstruction: 'Keep the answer practical for TypeScript backend engineers.',
    model: 'gemini-3.1-flash-lite',
    thinkingLevel: 'DEFAULT',
    responseFormat: 'text',
  },
];

export interface UsageMetrics {
  promptTokens: number | null;
  outputTokens: number | null;
  thinkingTokens: number | null;
  totalTokens: number | null;
}

export interface RunHistoryEntry {
  id: string;
  timestamp: string;
  prompt: string;
  systemInstruction: string;
  model: GeminiModelId;
  thinkingLevel: ThinkingDepth;
  responseFormat: ResponseFormat;
  deliveryMode: DeliveryMode;
  output: string;
  durationMs: number;
  usage: UsageMetrics;
}

export interface GroundingSource {
  title: string;
  uri: string;
}

export interface ContinuationInfo {
  totalTarget: number | null;
  completedCount: number;
  nextStart: number;
  hasMore: boolean;
  duplicateWarnings?: number;
  originalPrompt?: string;
}

export interface ReplyMeta {
  domain?: string;
  routedModel?: string;
  verified?: boolean;
  multiModelSynthesized?: boolean;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  imageUrl?: string;
  imageName?: string;
  timestamp: string;
  model?: ChatModelId;
  thinkingLevel?: ThinkingDepth;
  durationMs?: number;
  searched?: boolean;
  usage?: UsageMetrics;
  sources?: GroundingSource[];
  continuation?: ContinuationInfo;
  meta?: ReplyMeta;
}

export interface ChatThread {
  id: string;
  title: string;
  updatedAt: string;
  messages: ChatMessage[];
}

export type TemplateScope = 'full' | 'system' | 'prompt';

export interface PromptTemplate {
  id: string;
  name: string;
  scope: TemplateScope;
  prompt: string;
  systemInstruction: string;
  model: GeminiModelId;
  thinkingLevel: ThinkingDepth;
  responseFormat: ResponseFormat;
  isBuiltIn?: boolean;
  updatedAt: string;
}

export const DEFAULT_TEMPLATES: PromptTemplate[] = [
  {
    id: 'tpl-explain-ai',
    name: 'Brief Concept Explainer',
    scope: 'full',
    prompt: 'Explain how AI works in a few words',
    systemInstruction:
      'Give crystal-clear, memorable explanations using everyday language in 1–2 sentences.',
    model: 'gemini-4-hydrogen',
    thinkingLevel: 'LOW',
    responseFormat: 'text',
    isBuiltIn: true,
    updatedAt: '2026-11-24T10:00:00.000Z',
  },
  {
    id: 'tpl-sys-code-reviewer',
    name: 'Senior Code Reviewer',
    scope: 'system',
    prompt: '',
    systemInstruction:
      'You are a pragmatic senior software engineer. Review inputs for correctness, edge cases, performance bottlenecks, and maintainability. Prioritize concrete fixes over generic advice.',
    model: 'gemini-4-hydrogen',
    thinkingLevel: 'HIGH',
    responseFormat: 'text',
    isBuiltIn: true,
    updatedAt: '2026-11-24T10:00:00.000Z',
  },
  {
    id: 'tpl-sys-json-strict',
    name: 'Strict JSON Extractor',
    scope: 'system',
    prompt: '',
    systemInstruction:
      'Extract key entities and facts from the prompt and return valid, well-structured JSON with snake_case keys and no extra prose.',
    model: 'gemini-4-hydrogen',
    thinkingLevel: 'LOW',
    responseFormat: 'json',
    isBuiltIn: true,
    updatedAt: '2026-11-24T10:00:00.000Z',
  },
  {
    id: 'tpl-prompt-tradeoffs',
    name: 'Decision Matrix & Trade-offs',
    scope: 'prompt',
    prompt:
      'Compare the options below across speed, complexity, and maintenance cost:\n\n1. Option A: [describe]\n2. Option B: [describe]\n\nEnd with a clear recommendation.',
    systemInstruction: '',
    model: 'gemini-4-hydrogen',
    thinkingLevel: 'MEDIUM',
    responseFormat: 'text',
    isBuiltIn: true,
    updatedAt: '2026-11-24T10:00:00.000Z',
  },
];

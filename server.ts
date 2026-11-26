import 'dotenv/config';
import express, { type NextFunction, type Request, type Response } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, ThinkingLevel, type Content, type GenerateContentConfig } from '@google/genai';
import {
  buildCoreSystemInstruction,
  classifyQuery,
  computeContinuationMetadata,
  detectLanguageHint,
  detectLargeRequest,
  evaluateSafetyPolicy,
  extractPreviousItemTitlesFromHistory,
  getServerCapabilities,
  routeGeminiExecution,
} from './src/server/aiEngine.js';
import {
  changeUserPassword,
  claimOwnerPasskey,
  consumeOAuthState,
  consumeOAuthTicket,
  createAdminRecoveryTokenForUser,
  createOAuthState,
  createOAuthTicket,
  createUserSession,
  deleteUserAccount,
  EmailNotVerifiedError,
  getGlobalAppSettings,
  getUserBySessionToken,
  hasOwnerClaimedCredential,
  initAuthDb,
  isOwnerEnvKeyConfigured,
  issueEmailVerificationForAddress,
  issuePasswordResetForAddress,
  listAllUsers,
  loginWithEmailPassword,
  OFFICIAL_APP_NAME,
  OFFICIAL_OWNER_EMAIL,
  registerEmailUser,
  resetPasswordWithTokenOrCode,
  revokeSessionToken,
  rotateOwnerPasskey,
  updateGlobalAppSettings,
  updateUserRoleOrStatus,
  upsertOAuthUser,
  verifyEmailByTokenOrCode,
  verifyOwnerPasskey,
  type AuthUser,
} from './src/server/authDb.js';
import {
  getEmailDeliveryStatus,
  sendPasswordResetEmail,
  sendVerificationEmail,
} from './src/server/mailer.js';
import {
  deleteLearningCategory,
  deleteLearningTopic,
  exportLearningDatabase,
  getCategoriesWithCounts,
  getLearningStats,
  getLearningTopicById,
  initLearningDb,
  queryLearningTopics,
  upsertLearningCategory,
  upsertLearningTopic,
} from './src/server/learningDb.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SESSION_COOKIE_NAME = 'talash_session';

interface AuthenticatedRequest extends Request {
  authUser?: AuthUser | null;
  authToken?: string | null;
}

function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  if (!cookieHeader) return {};
  const result: Record<string, string> = {};
  for (const part of cookieHeader.split(';')) {
    const eqIdx = part.indexOf('=');
    if (eqIdx <= 0) continue;
    const key = part.slice(0, eqIdx).trim();
    const val = part.slice(eqIdx + 1).trim();
    if (!key) continue;
    try {
      result[key] = decodeURIComponent(val);
    } catch {
      result[key] = val;
    }
  }
  return result;
}

function extractSessionToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    if (token) return token;
  }
  const cookies = parseCookies(req.headers.cookie);
  return cookies[SESSION_COOKIE_NAME] || null;
}

function setSessionCookie(res: Response, sessionToken: string): void {
  const cookieAttrs = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(sessionToken)}`,
    'Path=/',
    'HttpOnly',
    'Secure',
    'SameSite=None',
    'Partitioned',
    `Max-Age=${60 * 60 * 24 * 30}`,
  ];
  res.append('Set-Cookie', cookieAttrs.join('; '));
}

function clearSessionCookie(res: Response): void {
  const cookieAttrs = [
    `${SESSION_COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'Secure',
    'SameSite=None',
    'Partitioned',
    'Max-Age=0',
  ];
  res.append('Set-Cookie', cookieAttrs.join('; '));
}

function resolveAppOrigin(req: Request): string {
  const envUrl = process.env.APP_URL?.trim();
  if (envUrl) {
    return envUrl.replace(/\/+$/, '');
  }
  const customDomain = process.env.CUSTOM_DOMAIN?.trim();
  if (customDomain) {
    const clean = customDomain.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
    return `https://${clean}`;
  }
  const protoHeader = (req.headers['x-forwarded-proto'] as string | undefined)?.split(',')[0]?.trim();
  const hostHeader = (req.headers['x-forwarded-host'] as string | undefined)?.split(',')[0]?.trim() || req.get('host');
  const proto = protoHeader || req.protocol || 'https';
  if (hostHeader) {
    return `${proto}://${hostHeader}`.replace(/\/+$/, '');
  }
  return `http://localhost:${process.env.PORT || 3000}`;
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderOAuthCallbackHtml(payload: {
  ok: boolean;
  provider: 'google' | 'facebook';
  ticket?: string;
  error?: string;
}): string {
  const messageJson = JSON.stringify(
    payload.ok
      ? { type: 'OAUTH_AUTH_SUCCESS', provider: payload.provider, ticket: payload.ticket }
      : { type: 'OAUTH_AUTH_ERROR', provider: payload.provider, error: payload.error || 'Authentication failed.' }
  ).replace(/</g, '\\u003c');

  const heading = payload.ok ? 'Signed in to TALASH Ai' : 'Sign-in could not be completed';
  const detail = payload.ok
    ? 'Authentication succeeded. Returning you to TALASH Ai...'
    : escapeHtml(payload.error || 'Authentication failed.');

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${heading} — TALASH Ai</title>
    <style>
      body { font-family: system-ui, -apple-system, sans-serif; background: #f8fafc; color: #0f172a; display: flex; min-height: 100vh; align-items: center; justify-content: center; margin: 0; padding: 24px; }
      .card { background: #fff; border: 1px solid #e2e8f0; border-radius: 18px; padding: 28px; max-width: 420px; width: 100%; text-align: center; box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08); }
      h1 { font-size: 18px; margin: 0 0 8px; }
      p { font-size: 14px; color: #475569; margin: 0 0 18px; line-height: 1.5; }
      button { background: #18181b; color: #fff; border: 0; border-radius: 10px; padding: 10px 18px; font-size: 13px; font-weight: 600; cursor: pointer; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>${heading}</h1>
      <p>${detail}</p>
      <button type="button" onclick="window.close()">Close Window</button>
    </div>
    <script>
      (function () {
        var data = ${messageJson};
        try {
          if (window.opener && !window.opener.closed) {
            window.opener.postMessage(data, '*');
          }
        } catch (e) {}
        if (data.type === 'OAUTH_AUTH_SUCCESS') {
          setTimeout(function () { window.close(); }, 350);
        }
      })();
    </script>
  </body>
</html>`;
}

function attachAuthContext(req: AuthenticatedRequest, _res: Response, next: NextFunction): void {
  const token = extractSessionToken(req);
  req.authToken = token;
  req.authUser = token ? getUserBySessionToken(token) : null;
  next();
}

function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  if (!req.authUser) {
    res.status(401).json({
      error: 'Authentication required. Please sign in to TALASH Ai.',
    });
    return;
  }
  if (req.authUser.status === 'suspended' && !req.authUser.isImmutableOwner) {
    res.status(403).json({
      error: 'Your account has been suspended by an administrator.',
    });
    return;
  }
  next();
}

function requireSuperAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  if (!req.authUser) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }
  if (req.authUser.role !== 'super_admin') {
    res.status(403).json({
      error: `Super Admin access is restricted to ${OFFICIAL_OWNER_EMAIL}.`,
    });
    return;
  }
  next();
}

const ALLOWED_MODELS = new Set([
  'auto',
  'gemini-4-hydrogen',
  'gemini-3.1-flash-lite',
  'openai-gpt',
]);

const THINKING_LEVEL_MAP: Record<string, ThinkingLevel> = {
  MINIMAL: ThinkingLevel.MINIMAL,
  LOW: ThinkingLevel.LOW,
  MEDIUM: ThinkingLevel.MEDIUM,
  HIGH: ThinkingLevel.HIGH,
  XHIGH: ThinkingLevel.XHIGH,
};

let cachedGeminiClient: GoogleGenAI | null = null;
let cachedApiKey: string | undefined;

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured in the server environment.');
  }
  if (!cachedGeminiClient || cachedApiKey !== apiKey) {
    cachedGeminiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
    cachedApiKey = apiKey;
  }
  return cachedGeminiClient;
}

export interface GroundingSourcePayload {
  title: string;
  uri: string;
}

function getAlternateGeminiModel(model: string): 'gemini-4-hydrogen' | 'gemini-3.1-flash-lite' {
  return model === 'gemini-4-hydrogen' ? 'gemini-3.1-flash-lite' : 'gemini-4-hydrogen';
}

function sleepWithAbort(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function buildConfig(params: {
  model: string;
  systemInstruction?: string;
  thinkingLevel?: string;
  responseFormat?: string;
  googleSearch?: boolean;
  maxOutputTokens?: number;
  abortSignal?: AbortSignal;
}): GenerateContentConfig {
  const config: GenerateContentConfig = {};

  if (params.abortSignal) {
    config.abortSignal = params.abortSignal;
  }

  if (params.systemInstruction && params.systemInstruction.trim().length > 0) {
    config.systemInstruction = params.systemInstruction.trim();
  }

  if (params.maxOutputTokens && params.maxOutputTokens > 0) {
    config.maxOutputTokens = params.maxOutputTokens;
  }

  if (params.responseFormat === 'json') {
    config.responseMimeType = 'application/json';
  } else if (params.googleSearch) {
    config.tools = [{ googleSearch: {} }];
  }

  if (params.thinkingLevel && params.thinkingLevel !== 'DEFAULT') {
    const mapped = THINKING_LEVEL_MAP[params.thinkingLevel];
    if (mapped) {
      const isHydrogen = params.model === 'gemini-4-hydrogen';
      const isFlashLite = params.model === 'gemini-3.1-flash-lite';
      if (isHydrogen && mapped !== ThinkingLevel.MINIMAL) {
        config.thinkingConfig = { thinkingLevel: mapped };
      } else if (isFlashLite && mapped !== ThinkingLevel.XHIGH) {
        config.thinkingConfig = { thinkingLevel: mapped };
      }
    }
  }

  return config;
}

function collectGroundingSources(
  candidates:
    | Array<{
        finishReason?: string;
        groundingMetadata?: {
          groundingChunks?: Array<{
            web?: { uri?: string; title?: string };
          }>;
        };
      }>
    | undefined,
  seen: Map<string, GroundingSourcePayload>
): string | undefined {
  let finishReason: string | undefined;
  if (!Array.isArray(candidates)) return undefined;
  for (const candidate of candidates) {
    if (candidate?.finishReason) {
      finishReason = candidate.finishReason;
    }
    const chunks = candidate?.groundingMetadata?.groundingChunks;
    if (!Array.isArray(chunks)) continue;
    for (const chunk of chunks) {
      const uri = chunk?.web?.uri?.trim();
      if (!uri || seen.has(uri)) continue;
      let fallbackTitle = uri;
      try {
        fallbackTitle = new URL(uri).hostname.replace(/^www\./, '');
      } catch {
        // Keep raw URI fallback
      }
      const title = chunk?.web?.title?.trim() || fallbackTitle;
      seen.set(uri, { title, uri });
    }
  }
  return finishReason;
}

function normalizeRawHistory(rawHistory: unknown): Array<{ role: 'user' | 'model'; text: string }> {
  if (!Array.isArray(rawHistory)) return [];

  const cleaned: Array<{ role: 'user' | 'model'; text: string }> = [];

  for (const item of rawHistory) {
    if (!item || typeof item !== 'object') continue;
    const record = item as { role?: unknown; text?: unknown };
    const role = record.role === 'user' || record.role === 'model' ? record.role : null;
    const text = typeof record.text === 'string' ? record.text.trim() : '';
    if (!role || !text) continue;

    if (cleaned.length === 0 && role !== 'user') continue;

    const prev = cleaned[cleaned.length - 1];
    if (prev && prev.role === role) {
      prev.text = `${prev.text}\n\n${text}`;
    } else {
      cleaned.push({ role, text });
    }
  }

  if (cleaned.length > 0 && cleaned[cleaned.length - 1].role === 'user') {
    cleaned.pop();
  }

  const SAFETY_MAX_CHARS = 500000;
  const sliced = [...cleaned];
  let totalChars = sliced.reduce((sum, item) => sum + item.text.length, 0);
  while (sliced.length > 2 && totalChars > SAFETY_MAX_CHARS) {
    const removed = sliced.shift();
    if (removed) totalChars -= removed.text.length;
  }

  while (sliced.length > 0 && sliced[0].role !== 'user') {
    sliced.shift();
  }

  return sliced;
}

function toGeminiHistory(entries: Array<{ role: 'user' | 'model'; text: string }>): Content[] {
  return entries.map((entry) => ({
    role: entry.role,
    parts: [{ text: entry.text }],
  }));
}

async function streamOpenAIChat(params: {
  apiKey: string;
  model: string;
  systemInstruction: string;
  history: Array<{ role: 'user' | 'model'; text: string }>;
  userPrompt: string;
  image?: { data: string; mimeType: string } | null;
  signal: AbortSignal;
  onChunk: (text: string) => void;
}): Promise<{ fullText: string; finishReason?: string }> {
  const messages: Array<{
    role: 'system' | 'user' | 'assistant';
    content:
      | string
      | Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }>;
  }> = [{ role: 'system', content: params.systemInstruction }];

  for (const h of params.history) {
    messages.push({
      role: h.role === 'model' ? 'assistant' : 'user',
      content: h.text,
    });
  }

  if (params.image) {
    messages.push({
      role: 'user',
      content: [
        { type: 'text', text: params.userPrompt },
        {
          type: 'image_url',
          image_url: {
            url: `data:${params.image.mimeType};base64,${params.image.data}`,
          },
        },
      ],
    });
  } else {
    messages.push({ role: 'user', content: params.userPrompt });
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${params.apiKey}`,
    },
    signal: params.signal,
    body: JSON.stringify({
      model: params.model,
      messages,
      stream: true,
    }),
  });

  if (!response.ok || !response.body) {
    const errBody = await response.text().catch(() => '');
    const err = new Error(`OpenAI API error (${response.status}): ${errBody || response.statusText}`) as Error & {
      status?: number;
    };
    err.status = response.status;
    throw err;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';
  let finishReason: string | undefined;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line.startsWith('data: ')) continue;
      const payload = line.slice(6).trim();
      if (payload === '[DONE]') break;
      try {
        const parsed = JSON.parse(payload) as {
          choices?: Array<{
            delta?: { content?: string };
            finish_reason?: string | null;
          }>;
        };
        const choice = parsed.choices?.[0];
        if (choice?.finish_reason) {
          finishReason = choice.finish_reason === 'length' ? 'MAX_TOKENS' : choice.finish_reason;
        }
        const deltaText = choice?.delta?.content;
        if (deltaText) {
          fullText += deltaText;
          params.onChunk(deltaText);
        }
      } catch {
        // Ignore malformed SSE fragment
      }
    }
  }

  return { fullText, finishReason };
}

async function fetchOpenAIDraft(params: {
  apiKey: string;
  systemInstruction: string;
  userPrompt: string;
  signal: AbortSignal;
}): Promise<string | null> {
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${params.apiKey}`,
      },
      signal: params.signal,
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: params.systemInstruction },
          { role: 'user', content: params.userPrompt },
        ],
        max_tokens: 900,
      }),
    });
    if (!response.ok) return null;
    const json = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    return json.choices?.[0]?.message?.content?.trim() || null;
  } catch {
    return null;
  }
}

function extractErrorDetails(err: unknown): {
  status: number;
  message: string;
  retryable: boolean;
} {
  if (err && typeof err === 'object') {
    const anyErr = err as { status?: number; message?: string };
    const message = anyErr.message || 'Unknown AI API error';

    if (
      anyErr.status === 403 ||
      message.includes('PERMISSION_DENIED') ||
      message.includes('API_KEY_INVALID')
    ) {
      return {
        status: anyErr.status || 403,
        message: 'API key validation failed. Verify GEMINI_API_KEY in Settings > Secrets.',
        retryable: false,
      };
    }

    if (anyErr.status === 429 || message.includes('RESOURCE_EXHAUSTED')) {
      return {
        status: 429,
        message: 'Temporary high demand while contacting the model. Please retry.',
        retryable: true,
      };
    }

    if (
      anyErr.status === 500 ||
      anyErr.status === 502 ||
      anyErr.status === 503 ||
      anyErr.status === 504 ||
      message.includes('UNAVAILABLE') ||
      message.includes('ECONNRESET') ||
      message.includes('ETIMEDOUT') ||
      message.includes('fetch failed')
    ) {
      return {
        status: anyErr.status || 503,
        message: `Temporary upstream issue: ${message}`,
        retryable: true,
      };
    }

    if (anyErr.status === 404 || message.includes('NOT_FOUND')) {
      return {
        status: 404,
        message: `Model not found or unavailable: ${message}`,
        retryable: false,
      };
    }

    if (anyErr.status && anyErr.status >= 400 && anyErr.status < 600) {
      return { status: anyErr.status, message, retryable: false };
    }

    return { status: 500, message, retryable: false };
  }

  return {
    status: 500,
    message: 'Unexpected server error while calling AI API.',
    retryable: false,
  };
}

async function startServer() {
  initLearningDb();
  initAuthDb();

  const app = express();
  const port = Number(process.env.PORT) || 3000;

  app.set('trust proxy', true);
  app.use(express.json({ limit: '50mb' }));
  app.use(attachAuthContext);

  // ============================================================================
  // SEO & Public Website Endpoints
  // ============================================================================
  app.get('/robots.txt', (req, res) => {
    const settings = getGlobalAppSettings();
    const origin = settings.siteDomain
      ? `https://${settings.siteDomain.replace(/^https?:\/\//i, '').replace(/\/+$/, '')}`
      : resolveAppOrigin(req);
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.send(
      [
        'User-agent: *',
        'Allow: /',
        'Disallow: /api/',
        '',
        `Sitemap: ${origin}/sitemap.xml`,
      ].join('\n')
    );
  });

  app.get('/sitemap.xml', (req, res) => {
    const settings = getGlobalAppSettings();
    const origin = settings.siteDomain
      ? `https://${settings.siteDomain.replace(/^https?:\/\//i, '').replace(/\/+$/, '')}`
      : resolveAppOrigin(req);
    const lastmod = new Date().toISOString().slice(0, 10);
    const urls = [
      { loc: `${origin}/`, changefreq: 'daily', priority: '1.0' },
      { loc: `${origin}/?view=learning`, changefreq: 'weekly', priority: '0.9' },
    ];
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (u) => `  <url>
    <loc>${escapeHtml(u.loc)}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`
  )
  .join('\n')}
</urlset>`;
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.send(xml);
  });

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, appName: OFFICIAL_APP_NAME, capabilities: getServerCapabilities() });
  });

  app.get('/api/capabilities', (_req, res) => {
    res.json(getServerCapabilities());
  });

  // ============================================================================
  // Authentication, Real OAuth (Google & Facebook) & Immutable Owner Routes
  // ============================================================================
  app.get('/api/auth/me', (req: AuthenticatedRequest, res) => {
    const globalSettings = getGlobalAppSettings();
    res.json({
      user: req.authUser ?? null,
      globalSettings,
    });
  });

  app.get('/api/auth/providers', (req, res) => {
    const origin = resolveAppOrigin(req);
    const settings = getGlobalAppSettings();
    const googleConfigured = Boolean(
      process.env.GOOGLE_CLIENT_ID?.trim() && process.env.GOOGLE_CLIENT_SECRET?.trim()
    );
    const facebookConfigured = Boolean(
      process.env.FACEBOOK_APP_ID?.trim() && process.env.FACEBOOK_APP_SECRET?.trim()
    );

    res.json({
      appName: OFFICIAL_APP_NAME,
      ownerEmail: OFFICIAL_OWNER_EMAIL,
      emailPasswordEnabled: true,
      emailDelivery: getEmailDeliveryStatus(),
      google: {
        configured: googleConfigured,
        enabled: googleConfigured && settings.googleOAuthEnabled,
        redirectUri: `${origin}/api/auth/google/callback`,
      },
      facebook: {
        configured: facebookConfigured,
        enabled: facebookConfigured && settings.facebookOAuthEnabled,
        redirectUri: `${origin}/api/auth/facebook/callback`,
      },
      ownerAccess: {
        claimed: hasOwnerClaimedCredential(),
        envKeyConfigured: isOwnerEnvKeyConfigured(),
      },
    });
  });

  // ============================================================================
  // Email + Password Registration, Login, Email Verification & Password Recovery
  // ============================================================================
  app.post('/api/auth/register', async (req, res) => {
    const { name, email, password } = req.body ?? {};
    if (typeof name !== 'string' || typeof email !== 'string' || typeof password !== 'string') {
      res.status(400).json({ error: 'Name, email, and password are required.' });
      return;
    }

    try {
      const { user, verificationToken, verificationCode } = registerEmailUser({
        name,
        email,
        password,
      });

      const mailStatus = getEmailDeliveryStatus();
      let mailSent = false;

      if (verificationToken && verificationCode && mailStatus.configured) {
        const origin = resolveAppOrigin(req);
        const verifyUrl = `${origin}/?verify_email=${encodeURIComponent(verificationToken)}`;
        const delivery = await sendVerificationEmail({
          to: user.email,
          name: user.name,
          verifyUrl,
          code: verificationCode,
        });
        mailSent = delivery.sent;
      }

      // If real email delivery is configured and user still needs email verification, wait until verified
      if (mailStatus.configured && !user.emailVerified) {
        res.status(201).json({
          requiresVerification: true,
          mailSent,
          email: user.email,
          message:
            'Account created! We sent a verification link and code to your email address. Please verify your email before signing in.',
        });
        return;
      }

      // If owner bootstrapped or email delivery isn't configured yet, sign user in cleanly
      const { sessionToken } = createUserSession(user.id, req.headers['user-agent']);
      setSessionCookie(res, sessionToken);
      res.status(201).json({
        requiresVerification: false,
        mailSent,
        user,
        sessionToken,
        globalSettings: getGlobalAppSettings(),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to register account.';
      const status = msg.includes('already exists') ? 409 : 400;
      res.status(status).json({ error: msg });
    }
  });

  app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body ?? {};
    if (typeof email !== 'string' || typeof password !== 'string') {
      res.status(400).json({ error: 'Email and password are required.' });
      return;
    }

    const mailStatus = getEmailDeliveryStatus();

    try {
      const user = loginWithEmailPassword({
        email,
        password,
        requireVerifiedEmail: mailStatus.configured,
      });
      const { sessionToken } = createUserSession(user.id, req.headers['user-agent']);
      setSessionCookie(res, sessionToken);
      res.json({
        user,
        sessionToken,
        globalSettings: getGlobalAppSettings(),
      });
    } catch (err) {
      if (err instanceof EmailNotVerifiedError) {
        res.status(403).json({
          error: err.message,
          code: 'EMAIL_NOT_VERIFIED',
          email: err.email,
        });
        return;
      }
      res.status(401).json({
        error: err instanceof Error ? err.message : 'Invalid email or password.',
      });
    }
  });

  app.post('/api/auth/verify-email', (req, res) => {
    const { token, email, code } = req.body ?? {};
    try {
      const user = verifyEmailByTokenOrCode({
        token: typeof token === 'string' ? token : undefined,
        email: typeof email === 'string' ? email : undefined,
        code: typeof code === 'string' ? code : undefined,
      });
      const { sessionToken } = createUserSession(user.id, req.headers['user-agent']);
      setSessionCookie(res, sessionToken);
      res.json({
        ok: true,
        user,
        sessionToken,
        globalSettings: getGlobalAppSettings(),
      });
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : 'Unable to verify email address.',
      });
    }
  });

  app.post('/api/auth/resend-verification', async (req, res) => {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim() : '';
    if (!email) {
      res.status(400).json({ error: 'Email address is required.' });
      return;
    }

    const mailStatus = getEmailDeliveryStatus();
    if (!mailStatus.configured) {
      res.status(503).json({
        error:
          'Transactional email delivery (SMTP_* or RESEND_API_KEY) is not configured yet on the server.',
      });
      return;
    }

    try {
      const issued = issueEmailVerificationForAddress(email);
      if (issued) {
        const origin = resolveAppOrigin(req);
        const verifyUrl = `${origin}/?verify_email=${encodeURIComponent(issued.token)}`;
        await sendVerificationEmail({
          to: issued.user.email,
          name: issued.user.name,
          verifyUrl,
          code: issued.code,
        });
      }

      // Generic non-enumerating confirmation
      res.json({
        ok: true,
        message:
          'If an unverified account matches that email, a fresh verification link has been sent.',
      });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Unable to send verification email.',
      });
    }
  });

  app.post('/api/auth/forgot-password', async (req, res) => {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim() : '';
    if (!email) {
      res.status(400).json({ error: 'Email address is required.' });
      return;
    }

    const mailStatus = getEmailDeliveryStatus();
    if (!mailStatus.configured) {
      res.status(503).json({
        error:
          'Email recovery cannot send emails yet because SMTP_* or RESEND_API_KEY is not configured. Ask the Super Admin to generate a recovery link or configure email delivery.',
      });
      return;
    }

    try {
      const issued = issuePasswordResetForAddress(email);
      if (issued) {
        const origin = resolveAppOrigin(req);
        const resetUrl = `${origin}/?reset_password=${encodeURIComponent(issued.token)}`;
        await sendPasswordResetEmail({
          to: issued.user.email,
          name: issued.user.name,
          resetUrl,
          code: issued.code,
        });
      }

      // Generic response prevents account enumeration
      res.json({
        ok: true,
        message:
          'If an account exists for that email address, a password recovery link and code have been sent.',
      });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Unable to send password recovery email.',
      });
    }
  });

  app.post('/api/auth/reset-password', (req, res) => {
    const { token, email, code, newPassword } = req.body ?? {};
    if (typeof newPassword !== 'string') {
      res.status(400).json({ error: 'New password is required.' });
      return;
    }
    try {
      resetPasswordWithTokenOrCode({
        token: typeof token === 'string' ? token : undefined,
        email: typeof email === 'string' ? email : undefined,
        code: typeof code === 'string' ? code : undefined,
        newPassword,
      });
      res.json({
        ok: true,
        message: 'Your password has been updated. Please sign in with your new password.',
      });
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : 'Unable to reset password.',
      });
    }
  });

  app.post('/api/auth/change-password', requireAuth, (req: AuthenticatedRequest, res) => {
    const { currentPassword = '', newPassword } = req.body ?? {};
    if (typeof newPassword !== 'string') {
      res.status(400).json({ error: 'New password is required.' });
      return;
    }
    try {
      changeUserPassword({
        userId: req.authUser!.id,
        currentPassword: typeof currentPassword === 'string' ? currentPassword : '',
        newPassword,
      });
      res.json({ ok: true, message: 'Password updated successfully.' });
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : 'Unable to update password.',
      });
    }
  });

  app.get('/api/auth/google/url', (req, res) => {
    const settings = getGlobalAppSettings();
    const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
    if (!clientId || !clientSecret || !settings.googleOAuthEnabled) {
      res.status(503).json({
        error:
          'Google Sign-In is temporarily disabled until valid OAuth credentials are provided, tested, and enabled.',
      });
      return;
    }

    const origin = resolveAppOrigin(req);
    const redirectUri = `${origin}/api/auth/google/callback`;
    const state = createOAuthState('google');
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', 'openid email profile');
    url.searchParams.set('state', state);
    url.searchParams.set('prompt', 'select_account');

    res.json({ url: url.toString(), redirectUri });
  });

  app.get(['/api/auth/google/callback', '/api/auth/google/callback/'], async (req, res) => {
    const settings = getGlobalAppSettings();
    const clientId = process.env.GOOGLE_CLIENT_ID?.trim() || '';
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim() || '';
    if (!clientId || !clientSecret || !settings.googleOAuthEnabled) {
      res.status(503).send(
        renderOAuthCallbackHtml({
          ok: false,
          provider: 'google',
          error: 'Google Sign-In is currently disabled.',
        })
      );
      return;
    }

    const code = typeof req.query.code === 'string' ? req.query.code : '';
    const state = typeof req.query.state === 'string' ? req.query.state : '';
    const oauthErr = typeof req.query.error === 'string' ? req.query.error : '';

    if (oauthErr) {
      res
        .status(400)
        .send(renderOAuthCallbackHtml({ ok: false, provider: 'google', error: `Google sign-in cancelled: ${oauthErr}` }));
      return;
    }

    if (!code || !consumeOAuthState(state, 'google')) {
      res
        .status(400)
        .send(renderOAuthCallbackHtml({ ok: false, provider: 'google', error: 'Invalid or expired Google OAuth state.' }));
      return;
    }

    const redirectUri = `${resolveAppOrigin(req)}/api/auth/google/callback`;

    try {
      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
        }),
      });
      const tokenData = (await tokenRes.json()) as { access_token?: string; error_description?: string };
      if (!tokenRes.ok || !tokenData.access_token) {
        throw new Error(tokenData.error_description || 'Google token exchange failed.');
      }

      const profileRes = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      const profile = (await profileRes.json()) as {
        email?: string;
        name?: string;
        picture?: string;
      };
      if (!profileRes.ok || !profile.email) {
        throw new Error('Google account did not return an email address.');
      }

      const user = upsertOAuthUser({
        email: profile.email,
        name: profile.name || profile.email.split('@')[0],
        avatarUrl: profile.picture || null,
        provider: 'google',
      });
      const { sessionToken } = createUserSession(user.id, req.headers['user-agent']);
      const ticket = createOAuthTicket(sessionToken);
      setSessionCookie(res, sessionToken);
      res.send(renderOAuthCallbackHtml({ ok: true, provider: 'google', ticket }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Google sign-in failed.';
      res.status(400).send(renderOAuthCallbackHtml({ ok: false, provider: 'google', error: msg }));
    }
  });

  app.get('/api/auth/facebook/url', (req, res) => {
    const settings = getGlobalAppSettings();
    const appId = process.env.FACEBOOK_APP_ID?.trim();
    const appSecret = process.env.FACEBOOK_APP_SECRET?.trim();
    if (!appId || !appSecret || !settings.facebookOAuthEnabled) {
      res.status(503).json({
        error:
          'Facebook Login is temporarily disabled until valid OAuth credentials are provided, tested, and enabled.',
      });
      return;
    }

    const origin = resolveAppOrigin(req);
    const redirectUri = `${origin}/api/auth/facebook/callback`;
    const state = createOAuthState('facebook');
    const url = new URL('https://www.facebook.com/v20.0/dialog/oauth');
    url.searchParams.set('client_id', appId);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('state', state);
    url.searchParams.set('scope', 'email,public_profile');

    res.json({ url: url.toString(), redirectUri });
  });

  app.get(['/api/auth/facebook/callback', '/api/auth/facebook/callback/'], async (req, res) => {
    const settings = getGlobalAppSettings();
    const appId = process.env.FACEBOOK_APP_ID?.trim() || '';
    const appSecret = process.env.FACEBOOK_APP_SECRET?.trim() || '';
    if (!appId || !appSecret || !settings.facebookOAuthEnabled) {
      res.status(503).send(
        renderOAuthCallbackHtml({
          ok: false,
          provider: 'facebook',
          error: 'Facebook Login is currently disabled.',
        })
      );
      return;
    }

    const code = typeof req.query.code === 'string' ? req.query.code : '';
    const state = typeof req.query.state === 'string' ? req.query.state : '';
    const oauthErr = typeof req.query.error_message === 'string'
      ? req.query.error_message
      : typeof req.query.error === 'string'
      ? req.query.error
      : '';

    if (oauthErr) {
      res
        .status(400)
        .send(renderOAuthCallbackHtml({ ok: false, provider: 'facebook', error: `Facebook sign-in cancelled: ${oauthErr}` }));
      return;
    }

    if (!code || !consumeOAuthState(state, 'facebook')) {
      res
        .status(400)
        .send(renderOAuthCallbackHtml({ ok: false, provider: 'facebook', error: 'Invalid or expired Facebook OAuth state.' }));
      return;
    }

    const redirectUri = `${resolveAppOrigin(req)}/api/auth/facebook/callback`;

    try {
      const tokenUrl = new URL('https://graph.facebook.com/v20.0/oauth/access_token');
      tokenUrl.searchParams.set('client_id', appId);
      tokenUrl.searchParams.set('redirect_uri', redirectUri);
      tokenUrl.searchParams.set('client_secret', appSecret);
      tokenUrl.searchParams.set('code', code);

      const tokenRes = await fetch(tokenUrl.toString());
      const tokenData = (await tokenRes.json()) as {
        access_token?: string;
        error?: { message?: string };
      };
      if (!tokenRes.ok || !tokenData.access_token) {
        throw new Error(tokenData.error?.message || 'Facebook token exchange failed.');
      }

      const meUrl = new URL('https://graph.facebook.com/v20.0/me');
      meUrl.searchParams.set('fields', 'id,name,email,picture.type(large)');
      meUrl.searchParams.set('access_token', tokenData.access_token);

      const meRes = await fetch(meUrl.toString());
      const me = (await meRes.json()) as {
        id?: string;
        name?: string;
        email?: string;
        picture?: { data?: { url?: string } };
      };

      if (!meRes.ok || !me.email) {
        throw new Error(
          'Facebook did not return an email address. Grant email permission in Facebook Login or continue with Google.'
        );
      }

      const user = upsertOAuthUser({
        email: me.email,
        name: me.name || me.email.split('@')[0],
        avatarUrl: me.picture?.data?.url || null,
        provider: 'facebook',
      });
      const { sessionToken } = createUserSession(user.id, req.headers['user-agent']);
      const ticket = createOAuthTicket(sessionToken);
      setSessionCookie(res, sessionToken);
      res.send(renderOAuthCallbackHtml({ ok: true, provider: 'facebook', ticket }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Facebook sign-in failed.';
      res.status(400).send(renderOAuthCallbackHtml({ ok: false, provider: 'facebook', error: msg }));
    }
  });

  app.post('/api/auth/exchange', (req, res) => {
    const ticket = typeof req.body?.ticket === 'string' ? req.body.ticket.trim() : '';
    const redeemed = consumeOAuthTicket(ticket);
    if (!redeemed) {
      res.status(400).json({ error: 'Invalid or expired sign-in ticket.' });
      return;
    }
    setSessionCookie(res, redeemed.sessionToken);
    res.json({
      user: redeemed.user,
      sessionToken: redeemed.sessionToken,
      globalSettings: getGlobalAppSettings(),
    });
  });

  app.post('/api/auth/owner-claim', (req, res) => {
    const { email, passkey } = req.body ?? {};
    if (typeof email !== 'string' || email.trim().toLowerCase() !== OFFICIAL_OWNER_EMAIL) {
      res.status(403).json({
        error: `Owner claim is restricted strictly to ${OFFICIAL_OWNER_EMAIL}.`,
      });
      return;
    }
    if (typeof passkey !== 'string') {
      res.status(400).json({ error: 'Passkey is required.' });
      return;
    }
    try {
      const user = claimOwnerPasskey(passkey);
      const { sessionToken } = createUserSession(user.id, req.headers['user-agent']);
      setSessionCookie(res, sessionToken);
      res.json({
        user,
        sessionToken,
        globalSettings: getGlobalAppSettings(),
      });
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : 'Unable to claim owner account.',
      });
    }
  });

  app.post('/api/auth/owner-login', (req, res) => {
    const { email, passkey } = req.body ?? {};
    if (typeof email !== 'string' || typeof passkey !== 'string') {
      res.status(400).json({ error: 'Owner email and passkey are required.' });
      return;
    }
    try {
      const user = verifyOwnerPasskey(email, passkey);
      const { sessionToken } = createUserSession(user.id, req.headers['user-agent']);
      setSessionCookie(res, sessionToken);
      res.json({
        user,
        sessionToken,
        globalSettings: getGlobalAppSettings(),
      });
    } catch (err) {
      res.status(401).json({
        error: err instanceof Error ? err.message : 'Owner authentication failed.',
      });
    }
  });

  app.post('/api/auth/logout', (req: AuthenticatedRequest, res) => {
    if (req.authToken) {
      revokeSessionToken(req.authToken);
    }
    clearSessionCookie(res);
    res.json({ ok: true });
  });

  // ============================================================================
  // Super Admin Control Center Endpoints (Owner-Only)
  // ============================================================================
  app.get('/api/admin/overview', requireAuth, requireSuperAdmin, (req, res) => {
    const users = listAllUsers();
    const learning = getLearningStats();
    const settings = getGlobalAppSettings();
    const origin = resolveAppOrigin(req);
    const mailDelivery = getEmailDeliveryStatus();

    res.json({
      appName: OFFICIAL_APP_NAME,
      ownerEmail: OFFICIAL_OWNER_EMAIL,
      stats: {
        totalUsers: users.length,
        activeUsers: users.filter((u) => u.status === 'active').length,
        suspendedUsers: users.filter((u) => u.status === 'suspended').length,
        adminCount: users.filter((u) => u.role === 'super_admin' || u.role === 'admin').length,
        learningCategories: learning.totalCategories,
        learningTopics: learning.totalItems,
      },
      secretsStatus: {
        geminiConfigured: Boolean(process.env.GEMINI_API_KEY?.trim()),
        openaiConfigured: Boolean(process.env.OPENAI_API_KEY?.trim()),
        emailDeliveryConfigured: mailDelivery.configured,
        emailDeliveryProvider: mailDelivery.provider,
        googleOAuthConfigured: Boolean(
          process.env.GOOGLE_CLIENT_ID?.trim() && process.env.GOOGLE_CLIENT_SECRET?.trim()
        ),
        facebookOAuthConfigured: Boolean(
          process.env.FACEBOOK_APP_ID?.trim() && process.env.FACEBOOK_APP_SECRET?.trim()
        ),
        ownerEnvKeyConfigured: isOwnerEnvKeyConfigured(),
        ownerPasskeyClaimed: hasOwnerClaimedCredential(),
      },
      callbacks: {
        origin,
        googleRedirectUri: `${origin}/api/auth/google/callback`,
        facebookRedirectUri: `${origin}/api/auth/facebook/callback`,
      },
      settings,
    });
  });

  app.get('/api/admin/users', requireAuth, requireSuperAdmin, (_req, res) => {
    res.json({ users: listAllUsers() });
  });

  app.patch('/api/admin/users/:id', requireAuth, requireSuperAdmin, (req, res) => {
    const id = typeof req.params.id === 'string' ? req.params.id.trim() : '';
    const { role, status, emailVerified } = req.body ?? {};
    if (!id) {
      res.status(400).json({ error: 'User ID is required.' });
      return;
    }
    if (role !== undefined && role !== 'admin' && role !== 'user') {
      res.status(400).json({ error: 'Role must be "admin" or "user".' });
      return;
    }
    if (status !== undefined && status !== 'active' && status !== 'suspended') {
      res.status(400).json({ error: 'Status must be "active" or "suspended".' });
      return;
    }
    if (emailVerified !== undefined && typeof emailVerified !== 'boolean') {
      res.status(400).json({ error: 'emailVerified must be a boolean.' });
      return;
    }
    try {
      const updated = updateUserRoleOrStatus({ targetUserId: id, role, status, emailVerified });
      res.json({ user: updated });
    } catch (err) {
      res.status(403).json({
        error: err instanceof Error ? err.message : 'Unable to update user.',
      });
    }
  });

  app.post('/api/admin/users/:id/recovery-token', requireAuth, requireSuperAdmin, (req, res) => {
    const id = typeof req.params.id === 'string' ? req.params.id.trim() : '';
    if (!id) {
      res.status(400).json({ error: 'User ID is required.' });
      return;
    }
    try {
      const issued = createAdminRecoveryTokenForUser(id);
      const origin = resolveAppOrigin(req);
      const resetUrl = `${origin}/?reset_password=${encodeURIComponent(issued.token)}`;
      res.json({
        ok: true,
        email: issued.user.email,
        code: issued.code,
        resetUrl,
      });
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : 'Unable to generate recovery link.',
      });
    }
  });

  app.delete('/api/admin/users/:id', requireAuth, requireSuperAdmin, (req, res) => {
    const id = typeof req.params.id === 'string' ? req.params.id.trim() : '';
    if (!id) {
      res.status(400).json({ error: 'User ID is required.' });
      return;
    }
    try {
      deleteUserAccount(id);
      res.json({ ok: true });
    } catch (err) {
      res.status(403).json({
        error: err instanceof Error ? err.message : 'Unable to delete user.',
      });
    }
  });

  app.get('/api/admin/settings', requireAuth, requireSuperAdmin, (_req, res) => {
    res.json({ settings: getGlobalAppSettings() });
  });

  app.post('/api/admin/oauth/test', requireAuth, requireSuperAdmin, async (req, res) => {
    const provider = req.body?.provider;
    if (provider !== 'google' && provider !== 'facebook') {
      res.status(400).json({ error: 'Provider must be "google" or "facebook".' });
      return;
    }

    if (provider === 'google') {
      const id = process.env.GOOGLE_CLIENT_ID?.trim();
      const secret = process.env.GOOGLE_CLIENT_SECRET?.trim();
      if (!id || !secret) {
        res.status(400).json({
          ok: false,
          error: 'GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are not configured in server Secrets.',
        });
        return;
      }
      try {
        const discovery = await fetch('https://accounts.google.com/.well-known/openid-configuration');
        if (!discovery.ok) {
          throw new Error('Could not reach Google OpenID discovery endpoint.');
        }
        res.json({
          ok: true,
          message: 'Google OAuth credentials are configured and OpenID endpoint is reachable.',
        });
      } catch (err) {
        res.status(502).json({
          ok: false,
          error: err instanceof Error ? err.message : 'Google OAuth verification failed.',
        });
      }
      return;
    }

    const fbId = process.env.FACEBOOK_APP_ID?.trim();
    const fbSecret = process.env.FACEBOOK_APP_SECRET?.trim();
    if (!fbId || !fbSecret) {
      res.status(400).json({
        ok: false,
        error: 'FACEBOOK_APP_ID and FACEBOOK_APP_SECRET are not configured in server Secrets.',
      });
      return;
    }
    try {
      const appTokenUrl = new URL('https://graph.facebook.com/oauth/access_token');
      appTokenUrl.searchParams.set('client_id', fbId);
      appTokenUrl.searchParams.set('client_secret', fbSecret);
      appTokenUrl.searchParams.set('grant_type', 'client_credentials');
      const fbRes = await fetch(appTokenUrl.toString());
      const fbData = (await fbRes.json()) as { access_token?: string; error?: { message?: string } };
      if (!fbRes.ok || !fbData.access_token) {
        throw new Error(fbData.error?.message || 'Facebook Graph API rejected the App ID/Secret.');
      }
      res.json({
        ok: true,
        message: 'Facebook App credentials verified with Meta Graph API.',
      });
    } catch (err) {
      res.status(400).json({
        ok: false,
        error: err instanceof Error ? err.message : 'Facebook credentials check failed.',
      });
    }
  });

  app.put('/api/admin/settings', requireAuth, requireSuperAdmin, (req: AuthenticatedRequest, res) => {
    const body = req.body ?? {};
    const googleConfigured = Boolean(
      process.env.GOOGLE_CLIENT_ID?.trim() && process.env.GOOGLE_CLIENT_SECRET?.trim()
    );
    const facebookConfigured = Boolean(
      process.env.FACEBOOK_APP_ID?.trim() && process.env.FACEBOOK_APP_SECRET?.trim()
    );

    if (body.googleOAuthEnabled === true && !googleConfigured) {
      res.status(400).json({
        error: 'Cannot enable Google Login until GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are configured.',
      });
      return;
    }
    if (body.facebookOAuthEnabled === true && !facebookConfigured) {
      res.status(400).json({
        error: 'Cannot enable Facebook Login until FACEBOOK_APP_ID and FACEBOOK_APP_SECRET are configured.',
      });
      return;
    }

    const updated = updateGlobalAppSettings(
      {
        defaultModel: ALLOWED_MODELS.has(body.defaultModel) ? body.defaultModel : undefined,
        googleSearchMode:
          body.googleSearchMode === 'auto' ||
          body.googleSearchMode === 'always' ||
          body.googleSearchMode === 'off'
            ? body.googleSearchMode
            : undefined,
        allowNewRegistrations:
          typeof body.allowNewRegistrations === 'boolean' ? body.allowNewRegistrations : undefined,
        googleOAuthEnabled:
          typeof body.googleOAuthEnabled === 'boolean' ? body.googleOAuthEnabled : undefined,
        facebookOAuthEnabled:
          typeof body.facebookOAuthEnabled === 'boolean' ? body.facebookOAuthEnabled : undefined,
        siteDomain: typeof body.siteDomain === 'string' ? body.siteDomain : undefined,
        googleSiteVerification:
          typeof body.googleSiteVerification === 'string' ? body.googleSiteVerification : undefined,
        customSystemInstruction:
          typeof body.customSystemInstruction === 'string' ? body.customSystemInstruction : undefined,
      },
      req.authUser?.email || OFFICIAL_OWNER_EMAIL
    );
    res.json({ settings: updated });
  });

  app.post('/api/admin/owner-passkey', requireAuth, requireSuperAdmin, (req, res) => {
    const { currentPasskey = '', newPasskey } = req.body ?? {};
    if (typeof newPasskey !== 'string') {
      res.status(400).json({ error: 'New passkey is required.' });
      return;
    }
    try {
      rotateOwnerPasskey(typeof currentPasskey === 'string' ? currentPasskey : '', newPasskey);
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : 'Unable to update owner passkey.',
      });
    }
  });

  app.post('/api/admin/learning/categories', requireAuth, requireSuperAdmin, (req, res) => {
    const { id, title, subtitle, description, imageKey = 'mosque', imageAlt = 'TALASH AI Islamic Learning' } =
      req.body ?? {};
    if (typeof id !== 'string' || !id.trim() || typeof title !== 'string' || !title.trim()) {
      res.status(400).json({ error: 'Category id and title are required.' });
      return;
    }
    const saved = upsertLearningCategory({
      id: id.trim() as Parameters<typeof upsertLearningCategory>[0]['id'],
      title: title.trim(),
      subtitle: typeof subtitle === 'string' && subtitle.trim() ? subtitle.trim() : 'اسلامي زده‌کړې',
      description: typeof description === 'string' ? description.trim() : '',
      imageKey: imageKey as Parameters<typeof upsertLearningCategory>[0]['imageKey'],
      imageAlt: typeof imageAlt === 'string' ? imageAlt.trim() : title.trim(),
    });
    res.json({ category: saved });
  });

  app.delete('/api/admin/learning/categories/:id', requireAuth, requireSuperAdmin, (req, res) => {
    const id = typeof req.params.id === 'string' ? req.params.id.trim() : '';
    const deleted = deleteLearningCategory(id);
    if (!deleted) {
      res.status(404).json({ error: 'Category not found.' });
      return;
    }
    res.json({ ok: true });
  });

  app.post('/api/admin/learning/topics', requireAuth, requireSuperAdmin, (req, res) => {
    const body = req.body ?? {};
    if (
      typeof body.category !== 'string' ||
      !body.category.trim() ||
      typeof body.title !== 'string' ||
      !body.title.trim()
    ) {
      res.status(400).json({ error: 'Topic category and title are required.' });
      return;
    }
    const id =
      typeof body.id === 'string' && body.id.trim()
        ? body.id.trim()
        : `topic-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const saved = upsertLearningTopic({
      id,
      category: body.category.trim(),
      numberLabel:
        typeof body.numberLabel === 'string' && body.numberLabel.trim()
          ? body.numberLabel.trim()
          : 'موضوع',
      title: body.title.trim(),
      arabic: typeof body.arabic === 'string' && body.arabic.trim() ? body.arabic.trim() : undefined,
      pashtoTranslation:
        typeof body.pashtoTranslation === 'string' && body.pashtoTranslation.trim()
          ? body.pashtoTranslation.trim()
          : undefined,
      authenticityGrade:
        typeof body.authenticityGrade === 'string' && body.authenticityGrade.trim()
          ? body.authenticityGrade.trim()
          : undefined,
      time: typeof body.time === 'string' && body.time.trim() ? body.time.trim() : undefined,
      place: typeof body.place === 'string' && body.place.trim() ? body.place.trim() : undefined,
      virtues: typeof body.virtues === 'string' && body.virtues.trim() ? body.virtues.trim() : undefined,
      details: Array.isArray(body.details) ? body.details : undefined,
      bodyParagraphs: Array.isArray(body.bodyParagraphs) ? body.bodyParagraphs : undefined,
      topicMeta:
        typeof body.topicMeta === 'string' && body.topicMeta.trim()
          ? body.topicMeta.trim()
          : undefined,
      difficulty:
        typeof body.difficulty === 'string' && body.difficulty.trim()
          ? body.difficulty.trim()
          : undefined,
      source:
        typeof body.source === 'string' && body.source.trim()
          ? body.source.trim()
          : 'مستند اسلامي ماخذ',
      imageKey:
        typeof body.imageKey === 'string' && body.imageKey.trim()
          ? body.imageKey.trim()
          : 'mosque',
      imageAlt:
        typeof body.imageAlt === 'string' && body.imageAlt.trim()
          ? body.imageAlt.trim()
          : body.title.trim(),
    });
    res.json({ topic: saved });
  });

  app.delete('/api/admin/learning/topics/:id', requireAuth, requireSuperAdmin, (req, res) => {
    const id = typeof req.params.id === 'string' ? req.params.id.trim() : '';
    const deleted = deleteLearningTopic(id);
    if (!deleted) {
      res.status(404).json({ error: 'Topic not found.' });
      return;
    }
    res.json({ ok: true });
  });

  app.get('/api/admin/export-database', requireAuth, requireSuperAdmin, (_req, res) => {
    const dump = exportLearningDatabase();
    const users = listAllUsers();
    const settings = getGlobalAppSettings();
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="talash-ai-backup-${new Date().toISOString().slice(0, 10)}.json"`
    );
    res.json({
      appName: OFFICIAL_APP_NAME,
      ownerEmail: OFFICIAL_OWNER_EMAIL,
      exportedAt: dump.exportedAt,
      schemaVersion: dump.schemaVersion,
      settings,
      users,
      learning: {
        categories: dump.categories,
        topics: dump.topics,
      },
    });
  });

  app.get('/api/learning/categories', (_req, res) => {
    try {
      const { categories, totalItems } = getCategoriesWithCounts();
      const stats = getLearningStats();
      res.json({ categories, totalItems, stats });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to load learning categories.';
      res.status(500).json({ error: message });
    }
  });

  app.get('/api/learning/topics', (req, res) => {
    const category = typeof req.query.category === 'string' ? req.query.category.trim() : '';
    if (!category) {
      res.status(400).json({ error: 'Query parameter "category" is required.' });
      return;
    }

    const q = typeof req.query.q === 'string' ? req.query.q.slice(0, 160) : '';
    const difficulty =
      typeof req.query.difficulty === 'string' ? req.query.difficulty.slice(0, 60) : '';
    const topicMeta =
      typeof req.query.topicMeta === 'string' ? req.query.topicMeta.slice(0, 100) : '';

    const rawPage = Number(req.query.page ?? 1);
    const rawLimit = Number(req.query.limit ?? 20);
    const page = Number.isFinite(rawPage) && rawPage >= 1 ? Math.floor(rawPage) : 1;
    const limit =
      Number.isFinite(rawLimit) && rawLimit >= 1 ? Math.min(100, Math.floor(rawLimit)) : 20;

    try {
      const result = queryLearningTopics({
        category,
        q,
        difficulty,
        topicMeta,
        page,
        limit,
      });

      if (!result) {
        res.status(404).json({ error: 'Learning category not found.' });
        return;
      }

      res.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to query learning topics.';
      res.status(500).json({ error: message });
    }
  });

  app.get('/api/learning/topics/:id', (req, res) => {
    const id = typeof req.params.id === 'string' ? req.params.id.trim() : '';
    if (!id || id.length > 100) {
      res.status(400).json({ error: 'Invalid topic ID.' });
      return;
    }

    try {
      const topic = getLearningTopicById(id);
      if (!topic) {
        res.status(404).json({ error: 'Learning topic not found.' });
        return;
      }
      res.json({ topic });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to load learning topic.';
      res.status(500).json({ error: message });
    }
  });

  app.post('/api/generate', requireAuth, async (req, res) => {
    const {
      prompt,
      model = 'gemini-4-hydrogen',
      systemInstruction = '',
      thinkingLevel = 'DEFAULT',
      responseFormat = 'text',
      stream = true,
      googleSearch = false,
    } = req.body ?? {};

    if (typeof prompt !== 'string' || prompt.trim().length === 0) {
      res.status(400).json({ error: 'Prompt must be a non-empty string.' });
      return;
    }

    const safety = evaluateSafetyPolicy(prompt);
    if (!safety.allowed) {
      if (!stream) {
        res.json({
          text: safety.refusalMessage,
          durationMs: 25,
          sources: [],
          usage: { promptTokens: null, outputTokens: null, thinkingTokens: null, totalTokens: null },
        });
        return;
      }
      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.write(`data: ${JSON.stringify({ type: 'chunk', text: safety.refusalMessage })}\n\n`);
      res.write(`data: ${JSON.stringify({ type: 'done', durationMs: 25, sources: [] })}\n\n`);
      res.end();
      return;
    }

    if (typeof model !== 'string' || !ALLOWED_MODELS.has(model)) {
      res.status(400).json({
        error: `Unsupported model "${String(model)}".`,
      });
      return;
    }

    const resolvedBaseModel =
      model === 'auto' || model === 'openai-gpt' ? 'gemini-4-hydrogen' : model;

    const requestAbortController = new AbortController();
    const overallTimeout = setTimeout(() => {
      requestAbortController.abort(new Error('Request timed out after 180 seconds.'));
    }, 180000);

    res.on('close', () => {
      clearTimeout(overallTimeout);
      if (!res.writableEnded) {
        requestAbortController.abort();
      }
    });

    const alternateModel = getAlternateGeminiModel(resolvedBaseModel);
    const attemptModels = [resolvedBaseModel, alternateModel, resolvedBaseModel, alternateModel];
    const startTime = Date.now();

    if (!stream) {
      let lastErr: unknown = null;
      try {
        const ai = getGeminiClient();
        for (let i = 0; i < attemptModels.length; i += 1) {
          if (requestAbortController.signal.aborted) break;
          const targetModel = attemptModels[i];
          const config = buildConfig({
            model: targetModel,
            systemInstruction: typeof systemInstruction === 'string' ? systemInstruction : '',
            thinkingLevel: typeof thinkingLevel === 'string' ? thinkingLevel : 'LOW',
            responseFormat: responseFormat === 'json' ? 'json' : 'text',
            googleSearch: Boolean(googleSearch) && i < 2,
            abortSignal: requestAbortController.signal,
          });

          try {
            const response = await ai.models.generateContent({
              model: targetModel,
              contents: prompt.trim(),
              config,
            });

            clearTimeout(overallTimeout);
            const durationMs = Date.now() - startTime;
            const usageMeta = response.usageMetadata;
            const sourcesMap = new Map<string, GroundingSourcePayload>();
            collectGroundingSources(response.candidates, sourcesMap);

            res.json({
              text: response.text ?? '',
              durationMs,
              sources: Array.from(sourcesMap.values()),
              usage: {
                promptTokens: usageMeta?.promptTokenCount ?? null,
                outputTokens: usageMeta?.candidatesTokenCount ?? null,
                thinkingTokens: usageMeta?.thoughtsTokenCount ?? null,
                totalTokens: usageMeta?.totalTokenCount ?? null,
              },
            });
            return;
          } catch (err) {
            lastErr = err;
            const info = extractErrorDetails(err);
            if (
              requestAbortController.signal.aborted ||
              (!info.retryable && info.status !== 400 && info.status !== 404)
            ) {
              throw err;
            }
            await sleepWithAbort(700 * (i + 1), requestAbortController.signal);
          }
        }
        throw lastErr ?? new Error('Generation failed after retries.');
      } catch (err) {
        clearTimeout(overallTimeout);
        const { status, message } = extractErrorDetails(err);
        res.status(status).json({ error: message });
      }
      return;
    }

    req.socket?.setNoDelay(true);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const writeEvent = (payload: Record<string, unknown>) => {
      if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify(payload)}\n\n`);
      }
    };

    try {
      const ai = getGeminiClient();
      let usageMeta:
        | {
            promptTokenCount?: number;
            candidatesTokenCount?: number;
            thoughtsTokenCount?: number;
            totalTokenCount?: number;
          }
        | undefined;

      const sourcesMap = new Map<string, GroundingSourcePayload>();
      let streamedAnyChunk = false;
      let lastErr: unknown = null;
      let succeeded = false;

      for (let i = 0; i < attemptModels.length; i += 1) {
        if (requestAbortController.signal.aborted) break;
        const targetModel = attemptModels[i];
        const config = buildConfig({
          model: targetModel,
          systemInstruction: typeof systemInstruction === 'string' ? systemInstruction : '',
          thinkingLevel: typeof thinkingLevel === 'string' ? thinkingLevel : 'LOW',
          responseFormat: responseFormat === 'json' ? 'json' : 'text',
          googleSearch: Boolean(googleSearch) && i < 2,
          abortSignal: requestAbortController.signal,
        });

        try {
          const responseStream = await ai.models.generateContentStream({
            model: targetModel,
            contents: prompt.trim(),
            config,
          });

          for await (const chunk of responseStream) {
            if (chunk.usageMetadata) {
              usageMeta = chunk.usageMetadata;
            }
            collectGroundingSources(chunk.candidates, sourcesMap);
            const chunkText = chunk.text;
            if (chunkText) {
              streamedAnyChunk = true;
              writeEvent({ type: 'chunk', text: chunkText });
            }
          }
          succeeded = true;
          break;
        } catch (err) {
          lastErr = err;
          const info = extractErrorDetails(err);
          if (
            streamedAnyChunk ||
            requestAbortController.signal.aborted ||
            (!info.retryable && info.status !== 400 && info.status !== 404)
          ) {
            throw err;
          }
          await sleepWithAbort(700 * (i + 1), requestAbortController.signal);
        }
      }

      if (!succeeded) {
        throw lastErr ?? new Error('Streaming generation failed.');
      }

      clearTimeout(overallTimeout);
      const durationMs = Date.now() - startTime;
      writeEvent({
        type: 'done',
        durationMs,
        sources: Array.from(sourcesMap.values()),
        usage: {
          promptTokens: usageMeta?.promptTokenCount ?? null,
          outputTokens: usageMeta?.candidatesTokenCount ?? null,
          thinkingTokens: usageMeta?.thoughtsTokenCount ?? null,
          totalTokens: usageMeta?.totalTokenCount ?? null,
        },
      });
      res.end();
    } catch (err) {
      clearTimeout(overallTimeout);
      const { message } = extractErrorDetails(err);
      writeEvent({ type: 'error', error: message });
      res.end();
    }
  });

  app.post('/api/chat', requireAuth, async (req, res) => {
    const {
      message,
      image = null,
      history = [],
      model = 'auto',
      systemInstruction = '',
      thinkingLevel = 'DEFAULT',
      googleSearch = 'auto',
      verifyMode = false,
      continuationRange = null,
    } = req.body ?? {};

    const trimmedMessage = typeof message === 'string' ? message.trim() : '';
    const hasValidImage =
      image &&
      typeof image === 'object' &&
      typeof (image as { data?: unknown }).data === 'string' &&
      typeof (image as { mimeType?: unknown }).mimeType === 'string';

    if (!trimmedMessage && !hasValidImage) {
      res.status(400).json({ error: 'Provide a message or upload an image.' });
      return;
    }

    if (typeof model !== 'string' || !ALLOWED_MODELS.has(model)) {
      res.status(400).json({
        error: `Unsupported model "${String(model)}".`,
      });
      return;
    }

    const startTime = Date.now();
    req.socket?.setNoDelay(true);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const writeEvent = (payload: Record<string, unknown>) => {
      if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify(payload)}\n\n`);
      }
    };

    // Server-side Islamic & general content safety filter
    const safety = evaluateSafetyPolicy(trimmedMessage);
    if (!safety.allowed && safety.refusalMessage) {
      writeEvent({ type: 'chunk', text: safety.refusalMessage });
      writeEvent({
        type: 'done',
        durationMs: Date.now() - startTime,
        searched: false,
        sources: [],
        meta: {
          domain: 'islamic',
          routedModel: 'policy-guard',
          verified: true,
          multiModelSynthesized: false,
        },
      });
      res.end();
      return;
    }

    const requestAbortController = new AbortController();
    const overallTimeout = setTimeout(() => {
      requestAbortController.abort(new Error('Request timed out after 180 seconds.'));
    }, 180000);

    res.on('close', () => {
      clearTimeout(overallTimeout);
      if (!res.writableEnded) {
        requestAbortController.abort();
      }
    });

    try {
      const normalizedEntries = normalizeRawHistory(history);
      const geminiHistory = toGeminiHistory(normalizedEntries);
      const langHint = detectLanguageHint(trimmedMessage);

      const safeContinuationRange =
        continuationRange &&
        typeof continuationRange === 'object' &&
        typeof (continuationRange as { startIndex?: unknown }).startIndex === 'number'
          ? {
              startIndex: (continuationRange as { startIndex: number }).startIndex,
              totalTarget:
                typeof (continuationRange as { totalTarget?: unknown }).totalTarget === 'number'
                  ? (continuationRange as { totalTarget: number }).totalTarget
                  : null,
              itemLabel:
                typeof (continuationRange as { itemLabel?: unknown }).itemLabel === 'string'
                  ? (continuationRange as { itemLabel: string }).itemLabel
                  : 'items',
            }
          : null;

      const largeRequest = detectLargeRequest(trimmedMessage, safeContinuationRange);
      const classification = classifyQuery(trimmedMessage, Boolean(hasValidImage));
      const previousItemTitles = largeRequest.isLarge
        ? extractPreviousItemTitlesFromHistory(history)
        : [];

      const fullSystemInstruction = buildCoreSystemInstruction({
        customInstruction: typeof systemInstruction === 'string' ? systemInstruction : '',
        domain: classification.domain,
        langHint,
        largeRequest,
        previousItemTitles,
      });

      const openaiApiKey = process.env.OPENAI_API_KEY?.trim() || '';
      const imagePayload = hasValidImage
        ? {
            data: (image as { data: string }).data,
            mimeType: (image as { mimeType: string }).mimeType.startsWith('image/')
              ? (image as { mimeType: string }).mimeType
              : 'image/jpeg',
          }
        : null;

      const textPrompt =
        trimmedMessage || 'Please describe and analyze this uploaded image clearly.';

      // Handle explicit OpenAI selection ONLY if OPENAI_API_KEY is truly configured
      if (model === 'openai-gpt') {
        if (!openaiApiKey) {
          clearTimeout(overallTimeout);
          writeEvent({
            type: 'error',
            error:
              'OpenAI GPT is not connected yet. Add OPENAI_API_KEY in Settings > Secrets on the server and restart to enable ChatGPT routing.',
          });
          res.end();
          return;
        }
        try {
          const openAiResult = await streamOpenAIChat({
            apiKey: openaiApiKey,
            model: classification.complexity === 'deep' ? 'gpt-4o' : 'gpt-4o-mini',
            systemInstruction: fullSystemInstruction,
            history: normalizedEntries,
            userPrompt: textPrompt,
            image: imagePayload,
            signal: requestAbortController.signal,
            onChunk: (chunkText) => writeEvent({ type: 'chunk', text: chunkText }),
          });

          const continuation = computeContinuationMetadata({
            largeRequest,
            generatedText: openAiResult.fullText,
            finishReason: openAiResult.finishReason,
          });

          clearTimeout(overallTimeout);
          writeEvent({
            type: 'done',
            durationMs: Date.now() - startTime,
            searched: false,
            sources: [],
            continuation,
            meta: {
              domain: classification.domain,
              routedModel: classification.complexity === 'deep' ? 'gpt-4o' : 'gpt-4o-mini',
              verified: false,
              multiModelSynthesized: false,
            },
          });
          res.end();
          return;
        } catch (openAiErr) {
          const openAiMsg =
            openAiErr instanceof Error ? openAiErr.message : 'OpenAI request failed.';
          // Only fall back to Gemini if nothing was streamed yet; warn cleanly via meta
          console.warn('OpenAI stream failed, falling back to Gemini:', openAiMsg);
        }
      }

      const ai = getGeminiClient();
      const routed = routeGeminiExecution({
        requestedModel: model,
        requestedThinking: typeof thinkingLevel === 'string' ? thinkingLevel : 'DEFAULT',
        googleSearchPreference: googleSearch,
        prompt: textPrompt,
        hasImage: Boolean(imagePayload),
        isLarge: largeRequest.isLarge,
        domain: classification.domain,
        complexity: classification.complexity,
        needsSearch: classification.needsSearch,
      });

      // Optional honest Dual-Model Synthesis when verifyMode is requested AND OpenAI key is configured
      let openaiDraft: string | null = null;
      let multiModelSynthesized = false;
      if (Boolean(verifyMode) && openaiApiKey && !imagePayload && !largeRequest.isLarge) {
        openaiDraft = await fetchOpenAIDraft({
          apiKey: openaiApiKey,
          systemInstruction: fullSystemInstruction,
          userPrompt: textPrompt,
          signal: requestAbortController.signal,
        });
        if (openaiDraft) {
          multiModelSynthesized = true;
        }
      }

      const finalUserMessageText = openaiDraft
        ? `${textPrompt}\n\n[CROSS-MODEL VERIFICATION CONTEXT — compare critically, remove any inaccuracies, verify citations/sources via Google Search, and produce one clear final answer]:\n${openaiDraft}`
        : textPrompt;

      const parts: Array<{ text: string } | { inlineData: { data: string; mimeType: string } }> = [];
      if (imagePayload) {
        parts.push({ inlineData: imagePayload });
      }
      parts.push({ text: finalUserMessageText });

      const alternateModel = getAlternateGeminiModel(routed.model);
      let usageMeta:
        | {
            promptTokenCount?: number;
            candidatesTokenCount?: number;
            thoughtsTokenCount?: number;
            totalTokenCount?: number;
          }
        | undefined;
      const sourcesMap = new Map<string, GroundingSourcePayload>();
      let streamedAnyChunk = false;
      let searchedUsed = false;
      let accumulatedText = '';
      let lastFinishReason: string | undefined;
      let actualRoutedModel: string = routed.model;

      const consumeStream = async (
        responseStream: AsyncIterable<{
          usageMetadata?: typeof usageMeta;
          candidates?: Parameters<typeof collectGroundingSources>[0];
          text?: string;
        }>,
        onFirstChunk?: () => void
      ) => {
        for await (const chunk of responseStream) {
          if (chunk.usageMetadata) {
            usageMeta = chunk.usageMetadata;
          }
          const fr = collectGroundingSources(chunk.candidates, sourcesMap);
          if (fr) lastFinishReason = fr;

          const chunkText = chunk.text;
          if (chunkText) {
            if (!streamedAnyChunk) {
              streamedAnyChunk = true;
              onFirstChunk?.();
            }
            accumulatedText += chunkText;
            writeEvent({ type: 'chunk', text: chunkText });
          }
        }
      };

      const runAttempt = async (
        targetModel: 'gemini-4-hydrogen' | 'gemini-3.1-flash-lite',
        enableSearch: boolean,
        firstChunkLimitMs: number | null
      ) => {
        const attemptController = new AbortController();
        const forwardAbort = () => attemptController.abort(requestAbortController.signal.reason);
        requestAbortController.signal.addEventListener('abort', forwardAbort, { once: true });

        let attemptTimedOut = false;
        const timer =
          firstChunkLimitMs !== null
            ? setTimeout(() => {
                if (!streamedAnyChunk) {
                  attemptTimedOut = true;
                  attemptController.abort(new Error('Search attempt timed out.'));
                }
              }, firstChunkLimitMs)
            : null;

        try {
          const config = buildConfig({
            model: targetModel,
            systemInstruction: fullSystemInstruction,
            thinkingLevel: routed.thinkingLevel,
            responseFormat: 'text',
            googleSearch: enableSearch,
            maxOutputTokens: largeRequest.isLarge ? 8192 : undefined,
            abortSignal: attemptController.signal,
          });

          const chat = ai.chats.create({
            model: targetModel,
            history: geminiHistory,
            config,
          });

          const stream = await chat.sendMessageStream({
            message: parts.length === 1 ? finalUserMessageText : parts,
          });

          await consumeStream(stream, () => {
            if (timer) clearTimeout(timer);
          });
          if (timer) clearTimeout(timer);
          actualRoutedModel = targetModel;
          if (enableSearch) {
            searchedUsed = true;
          }
        } catch (err) {
          if (timer) clearTimeout(timer);
          if (attemptTimedOut) {
            const timeoutErr = new Error('Search grounding timed out.') as Error & { status?: number };
            timeoutErr.status = 504;
            throw timeoutErr;
          }
          throw err;
        } finally {
          requestAbortController.signal.removeEventListener('abort', forwardAbort);
        }
      };

      const plan: Array<{
        targetModel: 'gemini-4-hydrogen' | 'gemini-3.1-flash-lite';
        enableSearch: boolean;
        timeoutMs: number | null;
        delayMs: number;
      }> = routed.enableSearch
        ? [
            { targetModel: routed.model, enableSearch: true, timeoutMs: 6500, delayMs: 0 },
            { targetModel: routed.model, enableSearch: false, timeoutMs: null, delayMs: 150 },
            { targetModel: alternateModel, enableSearch: false, timeoutMs: null, delayMs: 400 },
          ]
        : [
            { targetModel: routed.model, enableSearch: false, timeoutMs: null, delayMs: 0 },
            { targetModel: alternateModel, enableSearch: false, timeoutMs: null, delayMs: 250 },
            { targetModel: routed.model, enableSearch: false, timeoutMs: null, delayMs: 600 },
          ];

      let completed = false;
      let lastErr: unknown = null;

      for (const step of plan) {
        if (requestAbortController.signal.aborted) break;
        if (step.delayMs > 0) {
          await sleepWithAbort(step.delayMs, requestAbortController.signal);
        }
        try {
          await runAttempt(step.targetModel, step.enableSearch, step.timeoutMs);
          completed = true;
          break;
        } catch (err) {
          lastErr = err;
          const info = extractErrorDetails(err);
          const recoverable =
            !streamedAnyChunk &&
            !requestAbortController.signal.aborted &&
            (info.retryable || info.status === 400 || info.status === 404);
          if (!recoverable) {
            throw err;
          }
        }
      }

      if (!completed) {
        throw lastErr ?? new Error('Unable to complete chat response.');
      }

      const continuation = computeContinuationMetadata({
        largeRequest,
        generatedText: accumulatedText,
        finishReason: lastFinishReason,
      });

      clearTimeout(overallTimeout);
      const durationMs = Date.now() - startTime;
      writeEvent({
        type: 'done',
        durationMs,
        searched: searchedUsed || sourcesMap.size > 0,
        sources: Array.from(sourcesMap.values()),
        continuation,
        meta: {
          domain: classification.domain,
          routedModel: actualRoutedModel,
          verified: searchedUsed || sourcesMap.size > 0 || multiModelSynthesized,
          multiModelSynthesized,
          largeTotalTarget: largeRequest.totalTarget,
        },
        usage: {
          promptTokens: usageMeta?.promptTokenCount ?? null,
          outputTokens: usageMeta?.candidatesTokenCount ?? null,
          thinkingTokens: usageMeta?.thoughtsTokenCount ?? null,
          totalTokens: usageMeta?.totalTokenCount ?? null,
        },
      });
      res.end();
    } catch (err) {
      clearTimeout(overallTimeout);
      const { message: errMsg } = extractErrorDetails(err);
      writeEvent({ type: 'error', error: errMsg });
      res.end();
    }
  });

  app.post('/api/transcribe', requireAuth, async (req, res) => {
    const { audioData, mimeType = 'audio/webm' } = req.body ?? {};

    if (typeof audioData !== 'string' || audioData.trim().length === 0) {
      res.status(400).json({ error: 'Recorded audio data is missing.' });
      return;
    }

    const safeAudioMime =
      typeof mimeType === 'string' && mimeType.startsWith('audio/')
        ? mimeType.split(';')[0]
        : 'audio/webm';

    try {
      const ai = getGeminiClient();
      const audioPart = {
        inlineData: {
          mimeType: safeAudioMime,
          data: audioData,
        },
      };
      const transcribeContents = {
        parts: [
          audioPart,
          {
            text: 'Transcribe this spoken audio accurately in its original language (such as Pashto, English, Arabic, Dari, or Urdu). Output only the spoken words cleanly without commentary or extra text. If there is only silence or no intelligible speech, return an empty string.',
          },
        ],
      };

      const transcribePlan = [
        { targetModel: 'gemini-3.5-transcribe', delayMs: 0 },
        { targetModel: 'gemini-4-hydrogen', delayMs: 250 },
        { targetModel: 'gemini-3.1-flash-lite', delayMs: 600 },
        { targetModel: 'gemini-4-hydrogen', delayMs: 1200 },
      ];

      let transcriptText = '';
      let transcribed = false;
      let lastErr: unknown = null;

      for (const step of transcribePlan) {
        if (step.delayMs > 0) {
          await sleepWithAbort(step.delayMs);
        }
        try {
          const response = await ai.models.generateContent({
            model: step.targetModel,
            contents: transcribeContents,
          });
          transcriptText = response.text ?? '';
          transcribed = true;
          break;
        } catch (err) {
          lastErr = err;
          const info = extractErrorDetails(err);
          if (!info.retryable && info.status !== 404 && info.status !== 400) {
            throw err;
          }
        }
      }

      if (!transcribed) {
        throw lastErr ?? new Error('Unable to transcribe audio.');
      }

      res.json({ text: transcriptText.trim() });
    } catch (err) {
      const { status, message } = extractErrorDetails(err);
      res.status(status).json({ error: message });
    }
  });

  app.post('/api/media-analyze', requireAuth, async (req, res) => {
    const {
      prompt,
      mediaData = null,
      mediaMimeType = null,
      systemInstruction = '',
    } = req.body ?? {};

    const trimmedPrompt = typeof prompt === 'string' ? prompt.trim() : '';
    if (!trimmedPrompt) {
      res.status(400).json({ error: 'Prompt must be a non-empty string.' });
      return;
    }

    const parts: Array<{ text: string } | { inlineData: { data: string; mimeType: string } }> = [];
    if (typeof mediaData === 'string' && mediaData.length > 0 && typeof mediaMimeType === 'string') {
      parts.push({
        inlineData: {
          data: mediaData,
          mimeType: mediaMimeType,
        },
      });
    }
    parts.push({ text: trimmedPrompt });

    const startTime = Date.now();
    try {
      const ai = getGeminiClient();
      const attemptModels = ['gemini-4-hydrogen', 'gemini-3.1-flash-lite', 'gemini-4-hydrogen'];
      let response: Awaited<ReturnType<typeof ai.models.generateContent>> | null = null;
      let lastErr: unknown = null;

      for (let i = 0; i < attemptModels.length; i += 1) {
        if (i > 0) {
          await sleepWithAbort(600 * i);
        }
        try {
          response = await ai.models.generateContent({
            model: attemptModels[i],
            contents: { parts },
            config:
              typeof systemInstruction === 'string' && systemInstruction.trim().length > 0
                ? { systemInstruction: systemInstruction.trim() }
                : undefined,
          });
          break;
        } catch (err) {
          lastErr = err;
          const info = extractErrorDetails(err);
          if (!info.retryable && info.status !== 404 && info.status !== 400) {
            throw err;
          }
        }
      }

      if (!response) {
        throw lastErr ?? new Error('Media analysis failed.');
      }

      const durationMs = Date.now() - startTime;
      const usageMeta = response.usageMetadata;

      res.json({
        text: response.text ?? '',
        durationMs,
        usage: {
          promptTokens: usageMeta?.promptTokenCount ?? null,
          outputTokens: usageMeta?.candidatesTokenCount ?? null,
          thinkingTokens: usageMeta?.thoughtsTokenCount ?? null,
          totalTokens: usageMeta?.totalTokenCount ?? null,
        },
      });
    } catch (err) {
      const { status, message } = extractErrorDetails(err);
      res.status(status).json({ error: message });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir, { index: false }));
    app.get('*', (_req, res) => {
      const htmlPath = path.join(distDir, 'index.html');
      try {
        let html = fs.readFileSync(htmlPath, 'utf8');
        const settings = getGlobalAppSettings();
        const verification = settings.googleSiteVerification.trim();
        const metaTag = verification
          ? `<meta name="google-site-verification" content="${escapeHtml(verification)}" />`
          : '';
        html = html.replace('<!-- GOOGLE_SITE_VERIFICATION_META -->', metaTag);
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.send(html);
      } catch {
        res.sendFile(htmlPath);
      }
    });
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`${OFFICIAL_APP_NAME} server running at http://localhost:${port}`);
  });
}

startServer();

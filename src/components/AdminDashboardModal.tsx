import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  BookOpen,
  Check,
  Copy,
  Database,
  Download,
  Globe,
  KeyRound,
  Loader2,
  Plus,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Sliders,
  Smartphone,
  Trash2,
  UserCheck,
  Users,
  UserX,
  X,
} from 'lucide-react';
import type {
  AuthUser,
  ChatModelId,
  GlobalAppSettings,
  GoogleSearchMode,
} from '../types';
import type { LearningCategoryView, LearningTopicSeed } from '../types/learning';

interface AdminOverviewResponse {
  appName: string;
  ownerEmail: string;
  stats: {
    totalUsers: number;
    activeUsers: number;
    suspendedUsers: number;
    adminCount: number;
    learningCategories: number;
    learningTopics: number;
  };
  secretsStatus: {
    geminiConfigured: boolean;
    openaiConfigured: boolean;
    emailDeliveryConfigured: boolean;
    emailDeliveryProvider: 'smtp' | 'resend' | null;
    googleOAuthConfigured: boolean;
    facebookOAuthConfigured: boolean;
    ownerEnvKeyConfigured: boolean;
    ownerPasskeyClaimed: boolean;
  };
  callbacks: {
    origin: string;
    googleRedirectUri: string;
    facebookRedirectUri: string;
  };
  settings: GlobalAppSettings;
}

interface AdminDashboardModalProps {
  isOpen: boolean;
  onClose: () => void;
  sessionToken: string | null;
  currentUser: AuthUser;
  onGlobalSettingsUpdated: (settings: GlobalAppSettings) => void;
}

type AdminTab = 'overview' | 'users' | 'settings' | 'learning' | 'launch';

export function AdminDashboardModal({
  isOpen,
  onClose,
  sessionToken,
  currentUser,
  onGlobalSettingsUpdated,
}: AdminDashboardModalProps) {
  const [tab, setTab] = useState<AdminTab>('overview');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [overview, setOverview] = useState<AdminOverviewResponse | null>(null);
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [settingsForm, setSettingsForm] = useState<GlobalAppSettings>({
    appName: 'TALASH Ai',
    ownerEmail: 'shamsmomtaze33@gmail.com',
    defaultModel: 'auto',
    googleSearchMode: 'auto',
    allowNewRegistrations: true,
    googleOAuthEnabled: false,
    facebookOAuthEnabled: false,
    siteDomain: '',
    googleSiteVerification: '',
    customSystemInstruction: '',
  });
  const [savingSettings, setSavingSettings] = useState(false);
  const [testingOAuth, setTestingOAuth] = useState<'google' | 'facebook' | null>(null);
  const [issuedRecovery, setIssuedRecovery] = useState<{
    email: string;
    code: string;
    resetUrl: string;
  } | null>(null);

  // Passkey rotation
  const [currentPasskey, setCurrentPasskey] = useState('');
  const [newPasskey, setNewPasskey] = useState('');
  const [rotatingKey, setRotatingKey] = useState(false);

  // Learning CMS state
  const [categories, setCategories] = useState<LearningCategoryView[]>([]);
  const [selectedCatId, setSelectedCatId] = useState('');
  const [catTopics, setCatTopics] = useState<LearningTopicSeed[]>([]);
  const [newTopicTitle, setNewTopicTitle] = useState('');
  const [newTopicArabic, setNewTopicArabic] = useState('');
  const [newTopicPashto, setNewTopicPashto] = useState('');
  const [newTopicSource, setNewTopicSource] = useState('مستند اسلامي ماخذ');
  const [addingTopic, setAddingTopic] = useState(false);

  const [copiedUri, setCopiedUri] = useState<string | null>(null);

  const buildHeaders = useCallback(
    (json = false): HeadersInit => {
      const h: Record<string, string> = {};
      if (json) h['Content-Type'] = 'application/json';
      if (sessionToken) h.Authorization = `Bearer ${sessionToken}`;
      return h;
    },
    [sessionToken]
  );

  const loadAdminData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [ovRes, usersRes, catsRes] = await Promise.all([
        fetch('/api/admin/overview', { headers: buildHeaders(), credentials: 'include' }),
        fetch('/api/admin/users', { headers: buildHeaders(), credentials: 'include' }),
        fetch('/api/learning/categories', { credentials: 'include' }),
      ]);

      if (!ovRes.ok) {
        const err = await ovRes.json().catch(() => ({}));
        throw new Error(err.error || 'Unable to load Super Admin dashboard.');
      }

      const ovData = (await ovRes.json()) as AdminOverviewResponse;
      setOverview(ovData);
      setSettingsForm(ovData.settings);

      if (usersRes.ok) {
        const uData = (await usersRes.json()) as { users: AuthUser[] };
        setUsers(uData.users || []);
      }

      if (catsRes.ok) {
        const cData = (await catsRes.json()) as { categories: LearningCategoryView[] };
        const list = cData.categories || [];
        setCategories(list);
        if (list.length > 0 && !selectedCatId) {
          setSelectedCatId(list[0].id);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load Super Admin dashboard.');
    } finally {
      setLoading(false);
    }
  }, [buildHeaders, selectedCatId]);

  useEffect(() => {
    if (isOpen && currentUser.role === 'super_admin') {
      void loadAdminData();
    }
  }, [currentUser.role, isOpen, loadAdminData]);

  useEffect(() => {
    if (!isOpen || !selectedCatId) return;
    fetch(`/api/learning/topics?category=${encodeURIComponent(selectedCatId)}&limit=50`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.items) setCatTopics(data.items);
      })
      .catch(() => {
        // Ignore transient topic load error
      });
  }, [isOpen, selectedCatId]);

  if (!isOpen) return null;

  const showNotice = (msg: string) => {
    setNotice(msg);
    window.setTimeout(() => setNotice(null), 2800);
  };

  const handleCopy = async (key: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedUri(key);
      window.setTimeout(() => setCopiedUri(null), 1600);
    } catch {
      // Ignore clipboard failure
    }
  };

  const handleUpdateUser = async (
    targetUserId: string,
    updates: { role?: 'admin' | 'user'; status?: 'active' | 'suspended'; emailVerified?: boolean }
  ) => {
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(targetUserId)}`, {
        method: 'PATCH',
        headers: buildHeaders(true),
        credentials: 'include',
        body: JSON.stringify(updates),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update user.');
      setUsers((prev) => prev.map((u) => (u.id === targetUserId ? data.user : u)));
      showNotice('User account updated.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update user.');
    }
  };

  const handleIssueRecoveryLink = async (targetUserId: string) => {
    setError(null);
    setIssuedRecovery(null);
    try {
      const res = await fetch(
        `/api/admin/users/${encodeURIComponent(targetUserId)}/recovery-token`,
        {
          method: 'POST',
          headers: buildHeaders(),
          credentials: 'include',
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to generate recovery link.');
      setIssuedRecovery({
        email: data.email,
        code: data.code,
        resetUrl: data.resetUrl,
      });
      showNotice(`One-time password recovery link issued for ${data.email}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to generate recovery link.');
    }
  };

  const handleTestOAuth = async (provider: 'google' | 'facebook') => {
    setError(null);
    setTestingOAuth(provider);
    try {
      const res = await fetch('/api/admin/oauth/test', {
        method: 'POST',
        headers: buildHeaders(true),
        credentials: 'include',
        body: JSON.stringify({ provider }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || `${provider} OAuth test failed.`);
      }
      showNotice(data.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'OAuth credential test failed.');
    } finally {
      setTestingOAuth(null);
    }
  };

  const handleDeleteUser = async (targetUserId: string) => {
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(targetUserId)}`, {
        method: 'DELETE',
        headers: buildHeaders(),
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete user.');
      setUsers((prev) => prev.filter((u) => u.id !== targetUserId));
      showNotice('User account deleted.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to delete user.');
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSettings(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: buildHeaders(true),
        credentials: 'include',
        body: JSON.stringify(settingsForm),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Unable to save global settings.');
      setSettingsForm(data.settings);
      onGlobalSettingsUpdated(data.settings);
      showNotice('Global TALASH Ai settings saved.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save settings.');
    } finally {
      setSavingSettings(false);
    }
  };

  const handleRotatePasskey = async (e: React.FormEvent) => {
    e.preventDefault();
    setRotatingKey(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/owner-passkey', {
        method: 'POST',
        headers: buildHeaders(true),
        credentials: 'include',
        body: JSON.stringify({ currentPasskey, newPasskey }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Unable to rotate passkey.');
      setCurrentPasskey('');
      setNewPasskey('');
      showNotice('Owner passkey updated.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Passkey update failed.');
    } finally {
      setRotatingKey(false);
    }
  };

  const handleAddTopic = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCatId || !newTopicTitle.trim()) return;
    setAddingTopic(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/learning/topics', {
        method: 'POST',
        headers: buildHeaders(true),
        credentials: 'include',
        body: JSON.stringify({
          category: selectedCatId,
          numberLabel: `نوی #${catTopics.length + 1}`,
          title: newTopicTitle.trim(),
          arabic: newTopicArabic.trim() || undefined,
          pashtoTranslation: newTopicPashto.trim() || undefined,
          source: newTopicSource.trim() || 'مستند اسلامي ماخذ',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Unable to save topic.');
      setCatTopics((prev) => [...prev, data.topic]);
      setNewTopicTitle('');
      setNewTopicArabic('');
      setNewTopicPashto('');
      showNotice('Learning topic saved to SQLite database.');
      void loadAdminData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save learning topic.');
    } finally {
      setAddingTopic(false);
    }
  };

  const handleDeleteTopic = async (topicId: string) => {
    setError(null);
    try {
      const res = await fetch(`/api/admin/learning/topics/${encodeURIComponent(topicId)}`, {
        method: 'DELETE',
        headers: buildHeaders(),
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete topic.');
      setCatTopics((prev) => prev.filter((t) => t.id !== topicId));
      showNotice('Learning topic removed.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete topic.');
    }
  };

  const handleDownloadDbBackup = async () => {
    try {
      const res = await fetch('/api/admin/export-database', {
        headers: buildHeaders(),
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Database export failed.');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `talash-ai-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showNotice('Full SQLite database backup downloaded.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed.');
    }
  };

  const navTabs: Array<{ id: AdminTab; label: string; icon: typeof ShieldCheck }> = [
    { id: 'overview', label: 'Overview', icon: ShieldCheck },
    { id: 'users', label: 'Users & Roles', icon: Users },
    { id: 'settings', label: 'Global AI & SEO', icon: Sliders },
    { id: 'learning', label: 'Learning CMS', icon: BookOpen },
    { id: 'launch', label: 'Owner & Android APK', icon: Smartphone },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/50 backdrop-blur-[3px] p-3 sm:p-5"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="super-admin-title"
    >
      <div
        className="w-full max-w-4xl bg-white rounded-3xl border border-zinc-200/90 shadow-[0_24px_75px_rgba(0,0,0,0.22)] overflow-hidden flex flex-col max-h-[90dvh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 sm:px-6 py-4 bg-zinc-900 text-white flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-[#10a37f]/20 border border-[#10a37f]/40 text-[#10a37f] flex items-center justify-center shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 id="super-admin-title" className="text-base font-semibold leading-tight truncate">
                TALASH Ai — Owner &amp; Super Admin Control Center
              </h2>
              <p className="text-[11px] text-zinc-400 truncate">
                Immutable Owner: {currentUser.email}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => void loadAdminData()}
              aria-label="Refresh admin data"
              className="w-8 h-8 inline-flex items-center justify-center text-zinc-300 hover:text-white bg-zinc-800 hover:bg-zinc-700 rounded-xl transition-colors cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close admin dashboard"
              className="w-8 h-8 inline-flex items-center justify-center text-zinc-300 hover:text-white bg-zinc-800 hover:bg-zinc-700 rounded-xl transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Navigation Strip */}
        <nav className="px-4 py-2.5 bg-[#f7f7f8] border-b border-zinc-200/85 flex items-center gap-1.5 overflow-x-auto shrink-0">
          {navTabs.map((item) => {
            const Icon = item.icon;
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer border transition-colors ${
                  active
                    ? 'bg-zinc-900 text-white border-zinc-900'
                    : 'bg-white text-zinc-600 border-zinc-200 hover:text-zinc-900'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${active ? 'text-[#10a37f]' : 'text-zinc-500'}`} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5 bg-white">
          {error && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-800 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {notice && (
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 flex items-center gap-2">
              <Check className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{notice}</span>
            </div>
          )}

          {loading && !overview ? (
            <div className="py-16 flex flex-col items-center justify-center gap-3 text-zinc-500">
              <Loader2 className="w-6 h-6 animate-spin text-[#10a37f]" />
              <span className="text-xs">Loading Super Admin controls...</span>
            </div>
          ) : (
            <>
              {tab === 'overview' && overview && (
                <div className="space-y-6">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="p-4 rounded-2xl border border-zinc-200 bg-[#fafafa]">
                      <p className="text-[11px] font-medium text-zinc-500">Registered Users</p>
                      <p className="text-2xl font-bold text-zinc-900 mt-1 tabular-nums">
                        {overview.stats.totalUsers}
                      </p>
                    </div>
                    <div className="p-4 rounded-2xl border border-zinc-200 bg-[#fafafa]">
                      <p className="text-[11px] font-medium text-zinc-500">Active Accounts</p>
                      <p className="text-2xl font-bold text-emerald-700 mt-1 tabular-nums">
                        {overview.stats.activeUsers}
                      </p>
                    </div>
                    <div className="p-4 rounded-2xl border border-zinc-200 bg-[#fafafa]">
                      <p className="text-[11px] font-medium text-zinc-500">Learning Categories</p>
                      <p className="text-2xl font-bold text-zinc-900 mt-1 tabular-nums">
                        {overview.stats.learningCategories}
                      </p>
                    </div>
                    <div className="p-4 rounded-2xl border border-zinc-200 bg-[#fafafa]">
                      <p className="text-[11px] font-medium text-zinc-500">Islamic Topics</p>
                      <p className="text-2xl font-bold text-zinc-900 mt-1 tabular-nums">
                        {overview.stats.learningTopics}
                      </p>
                    </div>
                  </div>

                  {/* Environment Secrets & OAuth Callbacks */}
                  <section className="rounded-2xl border border-zinc-200 p-4 sm:p-5 space-y-4 bg-[#fafafa]">
                    <div className="flex items-center gap-2">
                      <KeyRound className="w-4 h-4 text-[#10a37f]" />
                      <h3 className="text-sm font-semibold text-zinc-900">
                        Server Integrations, Email Delivery &amp; Future OAuth
                      </h3>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                      {[
                        {
                          label: 'Google Gemini API',
                          status: overview.secretsStatus.geminiConfigured ? 'Connected' : 'Add in Secrets',
                          ok: overview.secretsStatus.geminiConfigured,
                        },
                        {
                          label: 'OpenAI ChatGPT API',
                          status: overview.secretsStatus.openaiConfigured ? 'Connected' : 'Optional',
                          ok: overview.secretsStatus.openaiConfigured,
                        },
                        {
                          label: 'Email Delivery (SMTP / Resend)',
                          status: overview.secretsStatus.emailDeliveryConfigured
                            ? `Active (${overview.secretsStatus.emailDeliveryProvider?.toUpperCase()})`
                            : 'Not Configured',
                          ok: overview.secretsStatus.emailDeliveryConfigured,
                        },
                        {
                          label: 'Google OAuth Sign-In',
                          status: !overview.secretsStatus.googleOAuthConfigured
                            ? 'Temporarily Disabled'
                            : overview.settings.googleOAuthEnabled
                            ? 'Enabled'
                            : 'Configured (Off)',
                          ok:
                            overview.secretsStatus.googleOAuthConfigured &&
                            overview.settings.googleOAuthEnabled,
                        },
                        {
                          label: 'Facebook OAuth Login',
                          status: !overview.secretsStatus.facebookOAuthConfigured
                            ? 'Temporarily Disabled'
                            : overview.settings.facebookOAuthEnabled
                            ? 'Enabled'
                            : 'Configured (Off)',
                          ok:
                            overview.secretsStatus.facebookOAuthConfigured &&
                            overview.settings.facebookOAuthEnabled,
                        },
                      ].map((row) => (
                        <div
                          key={row.label}
                          className="flex items-center justify-between px-3.5 py-2.5 bg-white rounded-xl border border-zinc-200/80"
                        >
                          <span className="font-medium text-zinc-800">{row.label}</span>
                          <span
                            className={`font-mono text-[11px] font-semibold ${
                              row.ok ? 'text-emerald-700' : 'text-amber-700'
                            }`}
                          >
                            {row.status}
                          </span>
                        </div>
                      ))}
                    </div>

                    {/* OAuth Readiness & Credential Test */}
                    <div className="space-y-2 pt-2 border-t border-zinc-200/75 text-xs">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-semibold text-zinc-800">
                          Future OAuth Redirect URIs (Ready for Google Cloud &amp; Meta Console):
                        </p>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            disabled={
                              !overview.secretsStatus.googleOAuthConfigured ||
                              testingOAuth === 'google'
                            }
                            onClick={() => void handleTestOAuth('google')}
                            className="px-2.5 py-1 text-[11px] font-semibold rounded-lg bg-white border border-zinc-200 hover:border-zinc-400 disabled:opacity-50 cursor-pointer"
                          >
                            {testingOAuth === 'google' ? 'Testing...' : 'Test Google OAuth'}
                          </button>
                          <button
                            type="button"
                            disabled={
                              !overview.secretsStatus.facebookOAuthConfigured ||
                              testingOAuth === 'facebook'
                            }
                            onClick={() => void handleTestOAuth('facebook')}
                            className="px-2.5 py-1 text-[11px] font-semibold rounded-lg bg-white border border-zinc-200 hover:border-zinc-400 disabled:opacity-50 cursor-pointer"
                          >
                            {testingOAuth === 'facebook' ? 'Testing...' : 'Test Facebook OAuth'}
                          </button>
                        </div>
                      </div>
                      {[
                        { key: 'g', label: 'Google Callback', uri: overview.callbacks.googleRedirectUri },
                        { key: 'f', label: 'Facebook Callback', uri: overview.callbacks.facebookRedirectUri },
                      ].map((item) => (
                        <div
                          key={item.key}
                          className="flex items-center justify-between gap-2 bg-white border border-zinc-200 rounded-xl px-3 py-2"
                        >
                          <div className="min-w-0">
                            <span className="text-[11px] font-semibold text-zinc-500 block">
                              {item.label}
                            </span>
                            <code className="font-mono text-[11px] text-zinc-800 break-all">
                              {item.uri}
                            </code>
                          </div>
                          <button
                            type="button"
                            onClick={() => void handleCopy(item.key, item.uri)}
                            className="p-2 text-zinc-600 hover:text-zinc-900 bg-zinc-100 rounded-lg shrink-0 cursor-pointer"
                          >
                            {copiedUri === item.key ? (
                              <Check className="w-3.5 h-3.5 text-emerald-600" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      ))}
                    </div>
                  </section>
                </div>
              )}

              {tab === 'users' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-semibold text-zinc-900">
                        Registered Accounts ({users.length})
                      </h3>
                      <p className="text-xs text-zinc-500">
                        Manage roles, email verification, recovery links, and status. {overview?.ownerEmail || currentUser.email} is protected by database immutability triggers.
                      </p>
                    </div>
                  </div>

                  {issuedRecovery && (
                    <div className="p-4 rounded-2xl border border-emerald-200 bg-emerald-50 space-y-2 text-xs text-emerald-950">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold">
                          One-Time Password Recovery Link for {issuedRecovery.email}
                        </span>
                        <button
                          type="button"
                          onClick={() => setIssuedRecovery(null)}
                          className="text-emerald-800 hover:text-emerald-950 cursor-pointer"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                      <p className="text-[11px]">
                        Recovery Code: <code className="font-mono font-bold">{issuedRecovery.code}</code> (expires in 30 minutes)
                      </p>
                      <div className="flex items-center justify-between gap-2 bg-white border border-emerald-200 rounded-xl px-3 py-2">
                        <code className="font-mono text-[11px] truncate">{issuedRecovery.resetUrl}</code>
                        <button
                          type="button"
                          onClick={() => void handleCopy('recovery', issuedRecovery.resetUrl)}
                          className="px-2.5 py-1 bg-emerald-700 text-white rounded-lg text-[11px] font-semibold shrink-0 cursor-pointer"
                        >
                          {copiedUri === 'recovery' ? 'Copied' : 'Copy Link'}
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="divide-y divide-zinc-200 border border-zinc-200 rounded-2xl overflow-hidden">
                    {users.map((u) => (
                      <div
                        key={u.id}
                        className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white hover:bg-zinc-50/70"
                      >
                        <div className="min-w-0 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-semibold text-zinc-900 truncate">
                              {u.name}
                            </span>
                            <span
                              className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-md border ${
                                u.isImmutableOwner
                                  ? 'bg-zinc-900 text-white border-zinc-900'
                                  : u.role === 'admin'
                                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                  : 'bg-zinc-100 text-zinc-700 border-zinc-200'
                              }`}
                            >
                              {u.isImmutableOwner ? 'Immutable Owner' : u.role}
                            </span>
                            <span
                              className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-md border ${
                                u.emailVerified
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                  : 'bg-amber-50 text-amber-800 border-amber-200'
                              }`}
                            >
                              {u.emailVerified ? 'Email Verified' : 'Unverified'}
                            </span>
                            {u.status === 'suspended' && (
                              <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-md bg-red-50 text-red-700 border border-red-200">
                                Suspended
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-zinc-600 truncate">{u.email}</p>
                          <p className="text-[11px] text-zinc-400">
                            Providers: {u.providers.join(', ') || 'email'} &middot; Last login:{' '}
                            {new Date(u.lastLoginAt).toLocaleString()}
                          </p>
                        </div>

                        {u.isImmutableOwner ? (
                          <div className="inline-flex items-center gap-1.5 text-xs font-medium text-[#10a37f] shrink-0">
                            <ShieldCheck className="w-4 h-4" />
                            <span>Protected Super Admin</span>
                          </div>
                        ) : (
                          <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                            {!u.emailVerified && (
                              <button
                                type="button"
                                onClick={() =>
                                  void handleUpdateUser(u.id, { emailVerified: true })
                                }
                                className="px-2.5 py-1.5 text-xs font-medium bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-lg cursor-pointer"
                              >
                                Verify Email
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => void handleIssueRecoveryLink(u.id)}
                              className="px-2.5 py-1.5 text-xs font-medium bg-zinc-100 hover:bg-zinc-200 text-zinc-800 rounded-lg cursor-pointer"
                            >
                              Reset Link
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                void handleUpdateUser(u.id, {
                                  role: u.role === 'admin' ? 'user' : 'admin',
                                })
                              }
                              className="px-3 py-1.5 text-xs font-medium bg-zinc-100 hover:bg-zinc-200 text-zinc-800 rounded-lg cursor-pointer"
                            >
                              {u.role === 'admin' ? 'Make User' : 'Make Admin'}
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                void handleUpdateUser(u.id, {
                                  status: u.status === 'active' ? 'suspended' : 'active',
                                })
                              }
                              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-zinc-100 hover:bg-zinc-200 text-zinc-800 rounded-lg cursor-pointer"
                            >
                              {u.status === 'active' ? (
                                <>
                                  <UserX className="w-3.5 h-3.5 text-amber-600" />
                                  <span>Suspend</span>
                                </>
                              ) : (
                                <>
                                  <UserCheck className="w-3.5 h-3.5 text-emerald-600" />
                                  <span>Activate</span>
                                </>
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleDeleteUser(u.id)}
                              aria-label="Delete user"
                              className="p-1.5 text-zinc-400 hover:text-red-600 hover:bg-red-50 rounded-lg cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {tab === 'settings' && (
                <form onSubmit={handleSaveSettings} className="space-y-5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-zinc-900">
                        Default AI Routing Model
                      </label>
                      <select
                        value={settingsForm.defaultModel}
                        onChange={(e) =>
                          setSettingsForm((prev) => ({
                            ...prev,
                            defaultModel: e.target.value as ChatModelId,
                          }))
                        }
                        className="w-full px-3 py-2.5 text-xs bg-[#fafafa] border border-zinc-200 rounded-xl text-zinc-900"
                      >
                        <option value="auto">Smart Auto</option>
                        <option value="gemini-4-hydrogen">Talash Pro (Gemini)</option>
                        <option value="gemini-3.1-flash-lite">Fast Lite</option>
                        <option value="openai-gpt">OpenAI GPT</option>
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-zinc-900">
                        Default Google Search Grounding
                      </label>
                      <select
                        value={settingsForm.googleSearchMode}
                        onChange={(e) =>
                          setSettingsForm((prev) => ({
                            ...prev,
                            googleSearchMode: e.target.value as GoogleSearchMode,
                          }))
                        }
                        className="w-full px-3 py-2.5 text-xs bg-[#fafafa] border border-zinc-200 rounded-xl text-zinc-900"
                      >
                        <option value="auto">Smart Auto</option>
                        <option value="always">Always Search</option>
                        <option value="off">Off</option>
                      </select>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-4 p-4 rounded-2xl border border-zinc-200 bg-[#fafafa]">
                    <div>
                      <p className="text-xs font-semibold text-zinc-900">
                        Allow New User Registrations
                      </p>
                      <p className="text-[11px] text-zinc-500 mt-0.5">
                        When paused, existing users and the official owner can still sign in, while new account registrations are blocked.
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={settingsForm.allowNewRegistrations}
                      onChange={(e) =>
                        setSettingsForm((prev) => ({
                          ...prev,
                          allowNewRegistrations: e.target.checked,
                        }))
                      }
                      className="w-4 h-4 accent-[#10a37f] cursor-pointer"
                    />
                  </div>

                  {/* Future OAuth Enablement Toggles */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="flex items-center justify-between gap-3 p-4 rounded-2xl border border-zinc-200 bg-[#fafafa]">
                      <div>
                        <p className="text-xs font-semibold text-zinc-900">
                          Enable Google OAuth Login
                        </p>
                        <p className="text-[11px] text-zinc-500 mt-0.5">
                          {overview?.secretsStatus.googleOAuthConfigured
                            ? 'Credentials found — test before enabling.'
                            : 'Disabled until GOOGLE_CLIENT_ID & SECRET are configured.'}
                        </p>
                      </div>
                      <input
                        type="checkbox"
                        disabled={!overview?.secretsStatus.googleOAuthConfigured}
                        checked={settingsForm.googleOAuthEnabled}
                        onChange={(e) =>
                          setSettingsForm((prev) => ({
                            ...prev,
                            googleOAuthEnabled: e.target.checked,
                          }))
                        }
                        className="w-4 h-4 accent-[#10a37f] cursor-pointer disabled:opacity-40"
                      />
                    </div>

                    <div className="flex items-center justify-between gap-3 p-4 rounded-2xl border border-zinc-200 bg-[#fafafa]">
                      <div>
                        <p className="text-xs font-semibold text-zinc-900">
                          Enable Facebook Login
                        </p>
                        <p className="text-[11px] text-zinc-500 mt-0.5">
                          {overview?.secretsStatus.facebookOAuthConfigured
                            ? 'Credentials found — test before enabling.'
                            : 'Disabled until FACEBOOK_APP_ID & SECRET are configured.'}
                        </p>
                      </div>
                      <input
                        type="checkbox"
                        disabled={!overview?.secretsStatus.facebookOAuthConfigured}
                        checked={settingsForm.facebookOAuthEnabled}
                        onChange={(e) =>
                          setSettingsForm((prev) => ({
                            ...prev,
                            facebookOAuthEnabled: e.target.checked,
                          }))
                        }
                        className="w-4 h-4 accent-[#10a37f] cursor-pointer disabled:opacity-40"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-zinc-900 flex items-center gap-1.5">
                        <Globe className="w-3.5 h-3.5 text-[#10a37f]" />
                        <span>Official Custom Domain (for Sitemap &amp; SEO)</span>
                      </label>
                      <input
                        type="text"
                        value={settingsForm.siteDomain}
                        onChange={(e) =>
                          setSettingsForm((prev) => ({ ...prev, siteDomain: e.target.value }))
                        }
                        placeholder="e.g. talashai.com"
                        className="w-full px-3 py-2 text-xs bg-[#fafafa] border border-zinc-200 rounded-xl text-zinc-900"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-zinc-900">
                        Google Search Console Verification Token
                      </label>
                      <input
                        type="text"
                        value={settingsForm.googleSiteVerification}
                        onChange={(e) =>
                          setSettingsForm((prev) => ({
                            ...prev,
                            googleSiteVerification: e.target.value,
                          }))
                        }
                        placeholder="Paste GSC verification meta content value..."
                        className="w-full px-3 py-2 text-xs bg-[#fafafa] border border-zinc-200 rounded-xl text-zinc-900"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-zinc-900">
                      Global AI System Persona Override (Optional)
                    </label>
                    <textarea
                      rows={3}
                      value={settingsForm.customSystemInstruction}
                      onChange={(e) =>
                        setSettingsForm((prev) => ({
                          ...prev,
                          customSystemInstruction: e.target.value,
                        }))
                      }
                      placeholder="Optional owner-level guidance for TALASH Ai..."
                      className="w-full px-3 py-2.5 text-xs bg-[#fafafa] border border-zinc-200 rounded-xl text-zinc-900 resize-y"
                    />
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-zinc-200">
                    <div className="flex items-center gap-3 text-xs">
                      <a
                        href="/robots.txt"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[#10a37f] font-semibold hover:underline"
                      >
                        /robots.txt
                      </a>
                      <a
                        href="/sitemap.xml"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[#10a37f] font-semibold hover:underline"
                      >
                        /sitemap.xml
                      </a>
                    </div>

                    <button
                      type="submit"
                      disabled={savingSettings}
                      className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold text-white bg-zinc-900 hover:bg-zinc-800 rounded-xl cursor-pointer disabled:opacity-60"
                    >
                      {savingSettings && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                      <span>Save Global Settings</span>
                    </button>
                  </div>
                </form>
              )}

              {tab === 'learning' && (
                <div className="space-y-5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold text-zinc-900">
                        SQLite Pashto Islamic Learning CMS
                      </h3>
                      <p className="text-xs text-zinc-500">
                        Manage existing categories and add or remove topics in{' '}
                        <code className="font-mono">data/talash_learning.db</code>.
                      </p>
                    </div>
                    <select
                      value={selectedCatId}
                      onChange={(e) => setSelectedCatId(e.target.value)}
                      className="px-3 py-2 text-xs font-semibold bg-[#fafafa] border border-zinc-200 rounded-xl text-zinc-900"
                    >
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.title} ({c.itemCount})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Add New Topic Form */}
                  <form
                    onSubmit={handleAddTopic}
                    className="p-4 rounded-2xl border border-zinc-200 bg-[#fafafa] space-y-3"
                  >
                    <p className="text-xs font-semibold text-zinc-900">Add Topic to Selected Category</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <input
                        type="text"
                        dir="rtl"
                        required
                        value={newTopicTitle}
                        onChange={(e) => setNewTopicTitle(e.target.value)}
                        placeholder="د موضوع سرلیک (پښتو)..."
                        className="px-3 py-2 text-xs bg-white border border-zinc-200 rounded-xl"
                      />
                      <input
                        type="text"
                        dir="rtl"
                        value={newTopicSource}
                        onChange={(e) => setNewTopicSource(e.target.value)}
                        placeholder="مستند ماخذ (لکه: صحیح البخاري)..."
                        className="px-3 py-2 text-xs bg-white border border-zinc-200 rounded-xl"
                      />
                    </div>
                    <textarea
                      rows={2}
                      dir="rtl"
                      value={newTopicArabic}
                      onChange={(e) => setNewTopicArabic(e.target.value)}
                      placeholder="عربي متن (اختیاري)..."
                      className="w-full px-3 py-2 text-xs bg-white border border-zinc-200 rounded-xl"
                    />
                    <textarea
                      rows={2}
                      dir="rtl"
                      value={newTopicPashto}
                      onChange={(e) => setNewTopicPashto(e.target.value)}
                      placeholder="پښتو ژباړه او تشریح..."
                      className="w-full px-3 py-2 text-xs bg-white border border-zinc-200 rounded-xl"
                    />
                    <button
                      type="submit"
                      disabled={addingTopic}
                      className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-zinc-900 hover:bg-zinc-800 rounded-xl cursor-pointer disabled:opacity-60"
                    >
                      <Plus className="w-3.5 h-3.5 text-[#10a37f]" />
                      <span>{addingTopic ? 'Saving...' : 'Save Topic to Database'}</span>
                    </button>
                  </form>

                  <div className="divide-y divide-zinc-200 border border-zinc-200 rounded-2xl overflow-hidden max-h-72 overflow-y-auto">
                    {catTopics.map((topic) => (
                      <div
                        key={topic.id}
                        className="px-4 py-3 flex items-center justify-between gap-3 bg-white"
                      >
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-zinc-900 truncate" dir="rtl">
                            {topic.numberLabel} &middot; {topic.title}
                          </p>
                          <p className="text-[11px] text-zinc-500 truncate">{topic.source}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => void handleDeleteTopic(topic.id)}
                          aria-label="Delete topic"
                          className="p-1.5 text-zinc-400 hover:text-red-600 hover:bg-red-50 rounded-lg shrink-0 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {tab === 'launch' && (
                <div className="space-y-5">
                  <section className="p-4 sm:p-5 rounded-2xl border border-zinc-200 bg-[#fafafa] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="space-y-1">
                      <div className="inline-flex items-center gap-1.5 text-sm font-semibold text-zinc-900">
                        <Database className="w-4 h-4 text-[#10a37f]" />
                        <span>Full Ownership Database Backup</span>
                      </div>
                      <p className="text-xs text-zinc-600">
                        Download all SQLite users, global settings, and 12 Learning categories / topics as portable JSON.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleDownloadDbBackup()}
                      className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-zinc-900 hover:bg-zinc-800 rounded-xl whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5 text-[#10a37f]" />
                      <span>Export Full Database</span>
                    </button>
                  </section>

                  {!overview?.secretsStatus.ownerEnvKeyConfigured && (
                    <form
                      onSubmit={handleRotatePasskey}
                      className="p-4 sm:p-5 rounded-2xl border border-zinc-200 bg-white space-y-3"
                    >
                      <h3 className="text-sm font-semibold text-zinc-900">
                        Rotate Owner Passkey
                      </h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <input
                          type="password"
                          value={currentPasskey}
                          onChange={(e) => setCurrentPasskey(e.target.value)}
                          placeholder="Current passkey (if set)..."
                          className="px-3 py-2 text-xs bg-[#fafafa] border border-zinc-200 rounded-xl"
                        />
                        <input
                          type="password"
                          required
                          minLength={8}
                          value={newPasskey}
                          onChange={(e) => setNewPasskey(e.target.value)}
                          placeholder="New passkey (8+ characters)..."
                          className="px-3 py-2 text-xs bg-[#fafafa] border border-zinc-200 rounded-xl"
                        />
                      </div>
                      <button
                        type="submit"
                        disabled={rotatingKey}
                        className="px-4 py-2 text-xs font-semibold text-white bg-zinc-900 hover:bg-zinc-800 rounded-xl cursor-pointer disabled:opacity-60"
                      >
                        {rotatingKey ? 'Updating...' : 'Update Owner Passkey'}
                      </button>
                    </form>
                  )}

                  <section className="p-4 sm:p-5 rounded-2xl border border-zinc-200 bg-[#fafafa] space-y-2.5 text-xs text-zinc-700 leading-relaxed">
                    <div className="inline-flex items-center gap-1.5 font-semibold text-zinc-900 text-sm">
                      <ShieldAlert className="w-4 h-4 text-[#10a37f]" />
                      <span>Android APK, iOS App &amp; Google Search Console Checklist</span>
                    </div>
                    <p>
                      1. <strong>Installable Web App (PWA):</strong> Active right now via VitePWA service worker and manifest — Android Chrome, iOS Safari, and Desktop users can install TALASH Ai directly.
                    </p>
                    <p>
                      2. <strong>Signed Android APK / Play Store AAB (com.shamstalash.talashai):</strong> Because Java JDK and Android SDK are not installed inside this cloud container, a complete Capacitor Android Gradle project (<code className="font-mono">android/</code> + <code className="font-mono">capacitor.config.ts</code>) and GitHub Actions APK builder (<code className="font-mono">.github/workflows/build-android-apk.yml</code>) are included in the repository so you can generate your signed APK/AAB under your own keystore.
                    </p>
                    <p>
                      3. <strong>iOS App Store Preparation:</strong> Capacitor iOS config (<code className="font-mono">com.shamstalash.talashai</code>) and Xcode archive instructions (<code className="font-mono">ios/README_IOS_RELEASE.md</code>) are ready for macOS + Xcode signing.
                    </p>
                    <p>
                      4. <strong>Google Search Visibility:</strong> Dynamic <code className="font-mono">/robots.txt</code>, <code className="font-mono">/sitemap.xml</code>, OpenGraph, and JSON-LD are live. To appear in Google Search on your own domain, deploy under your domain, paste your Google Search Console token in the <em>Global AI &amp; SEO</em> tab, and submit <code className="font-mono">sitemap.xml</code> in Google Search Console.
                    </p>
                  </section>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

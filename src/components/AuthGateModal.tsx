import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Lock,
  Mail,
  ShieldCheck,
  User,
} from 'lucide-react';
import type { AuthUser, GlobalAppSettings, OAuthProvidersStatus } from '../types';
import { PWAInstallButton } from './PWAInstallButton';
import { TalashLogoMark } from './TalashLogo';

interface AuthGateModalProps {
  onAuthenticated: (payload: {
    user: AuthUser;
    sessionToken: string;
    globalSettings?: GlobalAppSettings;
  }) => void;
}

type AuthScreenMode = 'signin' | 'register' | 'verify' | 'forgot' | 'reset';

const OFFICIAL_OWNER_EMAIL = 'shamsmomtaze33@gmail.com';

function clearAuthQueryParams(): void {
  if (typeof window === 'undefined') return;
  try {
    const url = new URL(window.location.href);
    url.searchParams.delete('verify_email');
    url.searchParams.delete('reset_password');
    window.history.replaceState({}, '', url.pathname + url.search + url.hash);
  } catch {
    // Ignore history state errors
  }
}

export function AuthGateModal({ onAuthenticated }: AuthGateModalProps) {
  const initialQuery =
    typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
  const initialVerifyToken = initialQuery?.get('verify_email')?.trim() || '';
  const initialResetToken = initialQuery?.get('reset_password')?.trim() || '';

  const [mode, setMode] = useState<AuthScreenMode>(() => {
    if (initialResetToken) return 'reset';
    if (initialVerifyToken) return 'verify';
    return 'signin';
  });

  const [providers, setProviders] = useState<OAuthProvidersStatus | null>(null);
  const [loadingProviders, setLoadingProviders] = useState(true);
  const [oauthBusy, setOauthBusy] = useState<'google' | 'facebook' | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Standard Email + Password fields
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Verification / Recovery state
  const [verifyToken, setVerifyToken] = useState(initialVerifyToken);
  const [verifyCode, setVerifyCode] = useState('');
  const [unverifiedEmailPrompt, setUnverifiedEmailPrompt] = useState<string | null>(null);
  const [resetToken, setResetToken] = useState(initialResetToken);
  const [resetCode, setResetCode] = useState('');

  // First-run Owner Setup panel (shown only before owner sets initial password)
  const [ownerPanelOpen, setOwnerPanelOpen] = useState(false);
  const [ownerPasskey, setOwnerPasskey] = useState('');
  const [ownerConfirmPasskey, setOwnerConfirmPasskey] = useState('');

  const loadProviders = useCallback(async () => {
    setLoadingProviders(true);
    try {
      const res = await fetch('/api/auth/providers', { credentials: 'include' });
      if (res.ok) {
        const data = (await res.json()) as OAuthProvidersStatus;
        setProviders(data);
      }
    } catch {
      // Ignore transient startup error
    } finally {
      setLoadingProviders(false);
    }
  }, []);

  useEffect(() => {
    void loadProviders();
  }, [loadProviders]);

  // Auto-verify if ?verify_email=<token> link was opened
  useEffect(() => {
    if (!initialVerifyToken) return;
    let active = true;
    setBusy(true);
    fetch('/api/auth/verify-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ token: initialVerifyToken }),
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Verification link expired or invalid.');
        return data;
      })
      .then((data) => {
        if (!active) return;
        clearAuthQueryParams();
        onAuthenticated(data);
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Unable to verify email.');
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [initialVerifyToken, onAuthenticated]);

  // Listen for OAuth popup completion when Google/Facebook OAuth is enabled
  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      const data = event.data as
        | { type?: string; provider?: 'google' | 'facebook'; ticket?: string; error?: string }
        | undefined;
      if (!data || typeof data !== 'object') return;

      if (data.type === 'OAUTH_AUTH_ERROR') {
        setOauthBusy(null);
        setError(data.error || 'Sign-in was cancelled or failed.');
        return;
      }

      if (data.type === 'OAUTH_AUTH_SUCCESS' && data.ticket) {
        try {
          const res = await fetch('/api/auth/exchange', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ ticket: data.ticket }),
          });
          const payload = await res.json();
          if (!res.ok) {
            throw new Error(payload.error || 'Could not complete sign-in session.');
          }
          onAuthenticated(payload);
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Unable to finalize sign-in.');
        } finally {
          setOauthBusy(null);
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onAuthenticated]);

  const startOAuthFlow = async (provider: 'google' | 'facebook') => {
    setError(null);
    setNotice(null);
    setOauthBusy(provider);

    try {
      const res = await fetch(`/api/auth/${provider}/url`, { credentials: 'include' });
      const data = await res.json();
      if (!res.ok || !data.url) {
        throw new Error(data.error || 'OAuth provider is currently unavailable.');
      }

      const popup = window.open(
        data.url,
        `talash_oauth_${provider}`,
        'width=520,height=660,menubar=no,toolbar=no,status=no'
      );

      if (!popup) {
        setOauthBusy(null);
        setError('Popup was blocked by your browser. Allow popups for TALASH Ai and try again.');
        return;
      }

      const pollClosed = window.setInterval(() => {
        if (popup.closed) {
          window.clearInterval(pollClosed);
          setOauthBusy((current) => (current === provider ? null : current));
        }
      }, 600);
    } catch (err) {
      setOauthBusy(null);
      setError(err instanceof Error ? err.message : 'Unable to open sign-in window.');
    }
  };

  const switchMode = (nextMode: AuthScreenMode) => {
    setMode(nextMode);
    setError(null);
    setNotice(null);
    setUnverifiedEmailPrompt(null);
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setUnverifiedEmailPrompt(null);
    setBusy(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          email: email.trim(),
          password,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.code === 'EMAIL_NOT_VERIFIED' && data.email) {
          setUnverifiedEmailPrompt(data.email);
        }
        throw new Error(data.error || 'Invalid email or password.');
      }
      onAuthenticated(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);

    if (password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setBusy(true);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: fullName.trim(),
          email: email.trim(),
          password,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Unable to create account.');
      }

      if (data.requiresVerification) {
        setVerifyToken('');
        setVerifyCode('');
        setMode('verify');
        setNotice(data.message || 'Check your email for your verification code or link.');
        return;
      }

      onAuthenticated(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleVerifyEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);

    try {
      const res = await fetch('/api/auth/verify-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          token: verifyToken.trim() || undefined,
          email: email.trim() || undefined,
          code: verifyCode.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Verification code or link is invalid.');
      }
      clearAuthQueryParams();
      onAuthenticated(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to verify email.');
    } finally {
      setBusy(false);
    }
  };

  const handleResendVerification = async (targetEmail?: string) => {
    const cleanEmail = (targetEmail || email).trim();
    if (!cleanEmail) {
      setError('Enter your email address first to resend verification.');
      return;
    }
    setError(null);
    setNotice(null);
    setBusy(true);

    try {
      const res = await fetch('/api/auth/resend-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: cleanEmail }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Could not send verification email.');
      }
      setNotice(data.message || 'Verification email sent.');
      setMode('verify');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send verification email.');
    } finally {
      setBusy(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);

    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Unable to process password recovery.');
      }
      setNotice(
        data.message ||
          'If an account exists for that email, a password recovery link and code have been sent.'
      );
      setMode('reset');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Password recovery failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);

    if (password.length < 8) {
      setError('New password must be at least 8 characters long.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setBusy(true);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          token: resetToken.trim() || undefined,
          email: email.trim() || undefined,
          code: resetCode.trim() || undefined,
          newPassword: password,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Unable to reset password.');
      }
      clearAuthQueryParams();
      setPassword('');
      setConfirmPassword('');
      setResetToken('');
      setResetCode('');
      setMode('signin');
      setNotice(data.message || 'Password updated. Sign in with your new password.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Password reset failed.');
    } finally {
      setBusy(false);
    }
  };

  const needsInitialOwnerClaim =
    providers !== null &&
    !providers.ownerAccess.claimed &&
    !providers.ownerAccess.envKeyConfigured;

  const handleOwnerClaimSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);

    if (ownerPasskey.trim().length < 8) {
      setError('Create an owner password with at least 8 characters.');
      return;
    }
    if (ownerPasskey !== ownerConfirmPasskey) {
      setError('Owner passwords do not match.');
      return;
    }

    setBusy(true);
    try {
      const res = await fetch('/api/auth/owner-claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          email: OFFICIAL_OWNER_EMAIL,
          passkey: ownerPasskey,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Unable to complete first-time owner setup.');
      }
      onAuthenticated(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Owner setup failed.');
    } finally {
      setBusy(false);
    }
  };

  const googleEnabled = Boolean(providers?.google.configured && providers?.google.enabled);
  const facebookEnabled = Boolean(providers?.facebook.configured && providers?.facebook.enabled);
  const showOAuthDivider = googleEnabled || facebookEnabled;

  return (
    <div className="min-h-[100dvh] w-full talash-cosmic-bg text-slate-100 flex flex-col justify-between p-4 sm:p-6">
      <div className="w-full max-w-md mx-auto my-auto space-y-5">
        {/* Official TALASH Ai Header */}
        <div className="text-center space-y-3">
          <div className="mx-auto inline-flex items-center justify-center relative">
            <div aria-hidden="true" className="absolute -inset-3 rounded-full bg-sky-500/20 blur-xl" />
            <TalashLogoMark className="relative w-20 h-20 rounded-full shadow-[0_0_28px_rgba(56,189,248,0.45)]" />
          </div>
          <div className="space-y-1">
            <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-white">
              TALASH <span className="text-sky-400 italic">Ai</span>
            </h1>
            <p className="text-xs sm:text-sm text-slate-400">
              Your Intelligent AI Assistant &amp; Verified Islamic Learning Platform
            </p>
          </div>
        </div>

        {/* Glassmorphic Auth Card */}
        <div className="talash-glass-card rounded-3xl p-5 sm:p-6 space-y-5">
          {/* Primary Mode Tabs (Sign In / Create Account) */}
          {(mode === 'signin' || mode === 'register') && (
            <div className="grid grid-cols-2 gap-1 p-1 bg-[#040916]/90 border border-sky-500/25 rounded-xl">
              <button
                type="button"
                onClick={() => switchMode('signin')}
                className={`py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                  mode === 'signin'
                    ? 'talash-neon-btn text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => switchMode('register')}
                className={`py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                  mode === 'register'
                    ? 'talash-neon-btn text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Create Account
              </button>
            </div>
          )}

          {/* Back Link on Secondary Flows */}
          {(mode === 'verify' || mode === 'forgot' || mode === 'reset') && (
            <button
              type="button"
              onClick={() => {
                clearAuthQueryParams();
                switchMode('signin');
              }}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-sky-400 hover:text-cyan-300 cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Sign In</span>
            </button>
          )}

          <div className="space-y-1">
            <h2 className="text-base font-semibold text-white">
              {mode === 'signin'
                ? 'Sign in with Email'
                : mode === 'register'
                ? 'Create your TALASH Ai account'
                : mode === 'verify'
                ? 'Verify your email address'
                : mode === 'forgot'
                ? 'Recover your password'
                : 'Set a new password'}
            </h2>
            <p className="text-xs text-slate-400">
              {mode === 'signin'
                ? 'Enter your registered email and password to continue.'
                : mode === 'register'
                ? 'Register using your email address and a strong password.'
                : mode === 'verify'
                ? 'Enter the verification code sent to your email address.'
                : mode === 'forgot'
                ? 'Enter your account email to receive a password recovery code.'
                : 'Enter your recovery code or reset link token and choose a new password.'}
            </p>
          </div>

          {error && (
            <div className="p-3 rounded-xl bg-red-950/60 border border-red-500/40 space-y-2 text-xs text-red-200">
              <div className="flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <span className="leading-relaxed">{error}</span>
              </div>
              {unverifiedEmailPrompt && (
                <div className="pl-6 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void handleResendVerification(unverifiedEmailPrompt)}
                    className="font-semibold text-cyan-300 underline cursor-pointer"
                  >
                    Resend verification email
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEmail(unverifiedEmailPrompt);
                      switchMode('verify');
                    }}
                    className="font-semibold text-cyan-300 underline cursor-pointer"
                  >
                    Enter verification code
                  </button>
                </div>
              )}
            </div>
          )}

          {notice && (
            <div className="p-3 rounded-xl bg-sky-950/60 border border-cyan-400/40 flex items-start gap-2.5 text-xs text-cyan-100">
              <CheckCircle2 className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
              <span className="leading-relaxed">{notice}</span>
            </div>
          )}

          {/* SIGN IN FORM */}
          {mode === 'signin' && (
            <form onSubmit={handleSignIn} className="space-y-3.5">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-300">Email Address</label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-sky-400/70 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full pl-9 pr-3 py-2.5 text-sm bg-[#040916]/90 border border-sky-500/30 rounded-xl text-white placeholder:text-slate-500 focus:outline-none focus:border-sky-400"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-300">Password</label>
                  <button
                    type="button"
                    onClick={() => switchMode('forgot')}
                    className="text-[11px] font-semibold text-sky-400 hover:text-cyan-300 hover:underline cursor-pointer"
                  >
                    Forgot password?
                  </button>
                </div>
                <div className="relative">
                  <Lock className="w-4 h-4 text-sky-400/70 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    className="w-full pl-9 pr-10 py-2.5 text-sm bg-[#040916]/90 border border-sky-500/30 rounded-xl text-white placeholder:text-slate-500 focus:outline-none focus:border-sky-400"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((p) => !p)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-1 cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={busy}
                className="w-full min-h-[46px] px-4 rounded-xl talash-neon-btn text-white text-sm font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-60"
              >
                {busy && <Loader2 className="w-4 h-4 animate-spin text-cyan-200" />}
                <span>Sign In</span>
              </button>
            </form>
          )}

          {/* CREATE ACCOUNT FORM */}
          {mode === 'register' && (
            <form onSubmit={handleRegister} className="space-y-3.5">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-300">Full Name</label>
                <div className="relative">
                  <User className="w-4 h-4 text-sky-400/70 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    required
                    minLength={2}
                    autoComplete="name"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Your full name"
                    className="w-full pl-9 pr-3 py-2.5 text-sm bg-[#040916]/90 border border-sky-500/30 rounded-xl text-white placeholder:text-slate-500 focus:outline-none focus:border-sky-400"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-300">Email Address</label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-sky-400/70 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full pl-9 pr-3 py-2.5 text-sm bg-[#040916]/90 border border-sky-500/30 rounded-xl text-white placeholder:text-slate-500 focus:outline-none focus:border-sky-400"
                  />
                </div>
                {email.trim().toLowerCase() === OFFICIAL_OWNER_EMAIL && needsInitialOwnerClaim && (
                  <p className="text-[11px] text-cyan-300 font-medium pt-0.5">
                    Official Owner email detected — activates Super Administrator access.
                  </p>
                )}
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-300">Password</label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-sky-400/70 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={8}
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="At least 8 characters"
                    className="w-full pl-9 pr-10 py-2.5 text-sm bg-[#040916]/90 border border-sky-500/30 rounded-xl text-white placeholder:text-slate-500 focus:outline-none focus:border-sky-400"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((p) => !p)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-1 cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-300">Confirm Password</label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-sky-400/70 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={8}
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter password"
                    className="w-full pl-9 pr-3 py-2.5 text-sm bg-[#040916]/90 border border-sky-500/30 rounded-xl text-white placeholder:text-slate-500 focus:outline-none focus:border-sky-400"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={busy}
                className="w-full min-h-[46px] px-4 rounded-xl talash-neon-btn text-white text-sm font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-60"
              >
                {busy && <Loader2 className="w-4 h-4 animate-spin text-cyan-200" />}
                <span>Create Account</span>
              </button>
            </form>
          )}

          {/* EMAIL VERIFICATION FORM */}
          {mode === 'verify' && (
            <form onSubmit={handleVerifyEmail} className="space-y-3.5">
              {!verifyToken && (
                <>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-300">Email Address</label>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="w-full px-3 py-2.5 text-sm bg-[#040916]/90 border border-sky-500/30 rounded-xl text-white placeholder:text-slate-500 focus:outline-none focus:border-sky-400"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-300">Verification Code</label>
                    <input
                      type="text"
                      required
                      value={verifyCode}
                      onChange={(e) => setVerifyCode(e.target.value.toUpperCase())}
                      placeholder="8-character code from email"
                      className="w-full px-3 py-2.5 text-sm font-mono tracking-widest bg-[#040916]/90 border border-sky-500/30 rounded-xl text-white placeholder:text-slate-500 focus:outline-none focus:border-sky-400"
                    />
                  </div>
                </>
              )}

              <button
                type="submit"
                disabled={busy}
                className="w-full min-h-[44px] px-4 rounded-xl talash-neon-btn text-white text-sm font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-60"
              >
                {busy && <Loader2 className="w-4 h-4 animate-spin text-cyan-200" />}
                <span>Verify Email &amp; Sign In</span>
              </button>

              {providers?.emailDelivery?.configured && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleResendVerification()}
                  className="w-full text-xs font-semibold text-sky-400 hover:text-cyan-300 hover:underline py-1 cursor-pointer"
                >
                  Resend verification email
                </button>
              )}
            </form>
          )}

          {/* FORGOT PASSWORD FORM */}
          {mode === 'forgot' && (
            <form onSubmit={handleForgotPassword} className="space-y-3.5">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-300">Registered Email</label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-sky-400/70 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full pl-9 pr-3 py-2.5 text-sm bg-[#040916]/90 border border-sky-500/30 rounded-xl text-white placeholder:text-slate-500 focus:outline-none focus:border-sky-400"
                  />
                </div>
              </div>

              {providers && !providers.emailDelivery.configured && (
                <p className="text-[11px] text-amber-200 bg-amber-950/50 border border-amber-500/35 rounded-xl p-3 leading-relaxed">
                  Outgoing email (SMTP / Resend) is not configured yet. If you already received a recovery code or link from the Super Admin, select below to set a new password.
                </p>
              )}

              <button
                type="submit"
                disabled={busy}
                className="w-full min-h-[44px] px-4 rounded-xl talash-neon-btn text-white text-sm font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-60"
              >
                {busy && <Loader2 className="w-4 h-4 animate-spin text-cyan-200" />}
                <span>Send Recovery Code</span>
              </button>

              <button
                type="button"
                onClick={() => switchMode('reset')}
                className="w-full text-xs font-semibold text-slate-400 hover:text-white py-1 cursor-pointer"
              >
                I already have a recovery code
              </button>
            </form>
          )}

          {/* RESET PASSWORD FORM */}
          {mode === 'reset' && (
            <form onSubmit={handleResetPassword} className="space-y-3.5">
              {!resetToken && (
                <>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-300">Email Address</label>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="w-full px-3 py-2.5 text-sm bg-[#040916]/90 border border-sky-500/30 rounded-xl text-white placeholder:text-slate-500 focus:outline-none focus:border-sky-400"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-300">Recovery Code</label>
                    <input
                      type="text"
                      required
                      value={resetCode}
                      onChange={(e) => setResetCode(e.target.value.toUpperCase())}
                      placeholder="8-character recovery code"
                      className="w-full px-3 py-2.5 text-sm font-mono tracking-widest bg-[#040916]/90 border border-sky-500/30 rounded-xl text-white placeholder:text-slate-500 focus:outline-none focus:border-sky-400"
                    />
                  </div>
                </>
              )}

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-300">New Password</label>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  className="w-full px-3 py-2.5 text-sm bg-[#040916]/90 border border-sky-500/30 rounded-xl text-white placeholder:text-slate-500 focus:outline-none focus:border-sky-400"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-300">Confirm New Password</label>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  minLength={8}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter new password"
                  className="w-full px-3 py-2.5 text-sm bg-[#040916]/90 border border-sky-500/30 rounded-xl text-white placeholder:text-slate-500 focus:outline-none focus:border-sky-400"
                />
              </div>

              <button
                type="submit"
                disabled={busy}
                className="w-full min-h-[44px] px-4 rounded-xl talash-neon-btn text-white text-sm font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-60"
              >
                {busy && <Loader2 className="w-4 h-4 animate-spin text-cyan-200" />}
                <span>Update Password</span>
              </button>
            </form>
          )}

          {/* Optional Social OAuth Buttons */}
          {showOAuthDivider && (mode === 'signin' || mode === 'register') && (
            <div className="space-y-3 pt-1">
              <div className="relative flex items-center">
                <div className="flex-grow border-t border-sky-500/20" />
                <span className="shrink mx-3 text-[11px] font-medium text-slate-400">or continue with</span>
                <div className="flex-grow border-t border-sky-500/20" />
              </div>

              <div className="space-y-2">
                {googleEnabled && (
                  <button
                    type="button"
                    disabled={oauthBusy !== null || loadingProviders}
                    onClick={() => void startOAuthFlow('google')}
                    className="w-full min-h-[44px] px-4 rounded-xl border border-sky-500/30 bg-[#081229]/90 hover:bg-[#0e1d3f] text-white font-semibold text-sm flex items-center justify-center gap-3 transition-colors cursor-pointer disabled:opacity-60"
                  >
                    {oauthBusy === 'google' ? (
                      <Loader2 className="w-4 h-4 animate-spin text-sky-400" />
                    ) : (
                      <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0" aria-hidden="true">
                        <path
                          fill="#4285F4"
                          d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
                        />
                        <path
                          fill="#34A853"
                          d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
                        />
                        <path
                          fill="#FBBC05"
                          d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
                        />
                        <path
                          fill="#EA4335"
                          d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
                        />
                      </svg>
                    )}
                    <span>Continue with Google</span>
                  </button>
                )}

                {facebookEnabled && (
                  <button
                    type="button"
                    disabled={oauthBusy !== null || loadingProviders}
                    onClick={() => void startOAuthFlow('facebook')}
                    className="w-full min-h-[44px] px-4 rounded-xl bg-[#1877F2] hover:bg-[#166FE5] text-white font-semibold text-sm flex items-center justify-center gap-3 transition-colors cursor-pointer disabled:opacity-60"
                  >
                    {oauthBusy === 'facebook' ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 shrink-0" aria-hidden="true">
                        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073Z" />
                      </svg>
                    )}
                    <span>Continue with Facebook</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* First-Run Owner Setup */}
          {needsInitialOwnerClaim && (
            <div className="pt-2 border-t border-sky-500/20">
              <button
                type="button"
                onClick={() => setOwnerPanelOpen((prev) => !prev)}
                className="w-full flex items-center justify-between text-xs font-semibold text-slate-300 hover:text-white py-1.5 cursor-pointer"
              >
                <span className="inline-flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-sky-400" />
                  <span>First-Time Owner Setup ({OFFICIAL_OWNER_EMAIL})</span>
                </span>
                {ownerPanelOpen ? (
                  <ChevronUp className="w-4 h-4 text-slate-400" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-slate-400" />
                )}
              </button>

              {ownerPanelOpen && (
                <form onSubmit={handleOwnerClaimSubmit} className="mt-3 space-y-3">
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Set the Super Administrator password for <strong className="text-white">{OFFICIAL_OWNER_EMAIL}</strong>. Once set, you can sign in anytime using the standard email and password form above.
                  </p>

                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-slate-300">
                      Owner Password (8+ characters)
                    </label>
                    <div className="relative">
                      <KeyRound className="w-3.5 h-3.5 text-sky-400/70 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="password"
                        required
                        minLength={8}
                        value={ownerPasskey}
                        onChange={(e) => setOwnerPasskey(e.target.value)}
                        placeholder="Create Super Admin password..."
                        className="w-full pl-9 pr-3 py-2 text-xs bg-[#040916]/90 border border-sky-500/30 rounded-xl text-white placeholder:text-slate-500 focus:outline-none focus:border-sky-400"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-slate-300">
                      Confirm Owner Password
                    </label>
                    <div className="relative">
                      <Lock className="w-3.5 h-3.5 text-sky-400/70 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="password"
                        required
                        minLength={8}
                        value={ownerConfirmPasskey}
                        onChange={(e) => setOwnerConfirmPasskey(e.target.value)}
                        placeholder="Re-enter password..."
                        className="w-full pl-9 pr-3 py-2 text-xs bg-[#040916]/90 border border-sky-500/30 rounded-xl text-white placeholder:text-slate-500 focus:outline-none focus:border-sky-400"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={busy}
                    className="w-full min-h-[42px] px-4 rounded-xl talash-neon-btn text-white text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-60"
                  >
                    {busy ? (
                      <Loader2 className="w-4 h-4 animate-spin text-cyan-200" />
                    ) : (
                      <ShieldCheck className="w-4 h-4 text-cyan-200" />
                    )}
                    <span>Set Owner Password &amp; Enter</span>
                  </button>
                </form>
              )}
            </div>
          )}
        </div>

        {/* Footer & Install App */}
        <div className="flex flex-col items-center gap-2 text-center">
          <PWAInstallButton compact />
          <p className="text-[11px] text-slate-400">
            TALASH Ai &middot; Created by <span className="text-sky-400">Shams Talash</span> &middot; Owner: {OFFICIAL_OWNER_EMAIL}
          </p>
        </div>
      </div>
    </div>
  );
}

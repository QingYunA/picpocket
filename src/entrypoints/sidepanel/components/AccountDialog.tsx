import React, { useEffect, useState } from 'react';
import { X, Mail, LogOut, Loader2, ArrowLeft, Coins, ChevronRight } from 'lucide-react';
import { useI18n } from '@/i18n';
import type { TranslationKey } from '@/i18n';
import {
  AuthError,
  sendEmailCode,
  signInWithOAuth,
  signOut,
  verifyEmailCode,
  type AccountUser,
  type AuthErrorCode,
  type OAuthProvider,
} from '@/services/auth';
import { cancelGoogleWebSignIn, GOOGLE_SIGN_IN_RESULT, startGoogleWebSignIn } from '@/services/googleWebSignIn';
import { AccountAvatar } from './AccountAvatar';
import { useEntitlement } from '@/hooks/useEntitlement';

interface AccountDialogProps {
  isOpen: boolean;
  onClose: () => void;
  user: AccountUser | null;
}

const ERROR_KEYS: Record<AuthErrorCode, TranslationKey> = {
  cancelled: 'account.errors.cancelled',
  invalid_email: 'account.errors.invalid_email',
  invalid_code: 'account.errors.invalid_code',
  rate_limited: 'account.errors.rate_limited',
  provider_error: 'account.errors.provider_error',
  expired: 'account.errors.expired',
  network: 'account.errors.network',
  unknown: 'account.errors.unknown',
};

const PROVIDER_LABELS: Record<string, string> = { google: 'Google', github: 'GitHub', email: 'Email' };

/** 品牌标识（lucide 不含品牌图标，按图标规范属于允许的例外） */
const GoogleMark = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" aria-hidden="true">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z" />
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
    <path fill="#FBBC05" d="M5.84 14.1A6.6 6.6 0 0 1 5.5 12c0-.73.13-1.44.34-2.1V7.06H2.18A11 11 0 0 0 1 12c0 1.77.43 3.45 1.18 4.94l3.66-2.84z" />
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15A10.96 10.96 0 0 0 12 1 11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z" />
  </svg>
);

const GithubMark = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="currentColor" aria-hidden="true">
    <path d="M12 .5a11.5 11.5 0 0 0-3.64 22.41c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.52-1.33-1.28-1.69-1.28-1.69-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.84 1.19 3.1 0 4.42-2.7 5.4-5.26 5.68.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .5z" />
  </svg>
);

type Busy = null | OAuthProvider | 'send' | 'verify' | 'signout';

export const AccountDialog: React.FC<AccountDialogProps> = ({ isOpen, onClose, user }) => {
  const { t, language } = useI18n();
  const [email, setEmail] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<AuthErrorCode | null>(null);
  const [awaitingGoogle, setAwaitingGoogle] = useState(false);
  const { entitlement } = useEntitlement(isOpen && user ? user.id : null);

  useEffect(() => {
    if (isOpen) {
      setError(null);
      setBusy(null);
      setCode('');
      setSentTo(null);
      setAwaitingGoogle(false);
    }
  }, [isOpen]);

  // 官网登录失败时由后台广播结果；成功则 user 变化后自动切换到已登录视图
  useEffect(() => {
    if (!awaitingGoogle) return;
    const onMessage = (message: { action?: string; ok?: boolean; code?: AuthErrorCode }) => {
      if (message?.action !== GOOGLE_SIGN_IN_RESULT) return;
      setAwaitingGoogle(false);
      if (!message.ok) setError(message.code ?? 'unknown');
    };
    chrome.runtime.onMessage.addListener(onMessage);
    return () => chrome.runtime.onMessage.removeListener(onMessage);
  }, [awaitingGoogle]);

  if (!isOpen) return null;

  const run = async (kind: Exclude<Busy, null>, action: () => Promise<unknown>) => {
    setBusy(kind);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(err instanceof AuthError ? err.code : 'unknown');
    } finally {
      setBusy(null);
    }
  };

  const handleSend = () => run('send', async () => setSentTo(await sendEmailCode(email)));
  const handleVerify = () => run('verify', async () => {
    if (sentTo) await verifyEmailCode(sentTo, code);
  });

  const disabled = busy !== null;
  const spinner = <Loader2 className="h-4 w-4 shrink-0 animate-spin" />;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-2xs p-4 animate-in fade-in duration-150">
      <div className="relative flex max-h-[85vh] w-full max-w-sm flex-col overflow-hidden rounded-2xl border border-zinc-200/90 bg-white shadow-xl text-zinc-900">
        <div className="flex items-start justify-between border-b border-zinc-100 px-5 pt-5 pb-4">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold whitespace-nowrap">{user ? user.name : t('account.title')}</h2>
            {!user && <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">{t('account.subtitle')}</p>}
          </div>
          <button
            onClick={onClose}
            className="ml-3 shrink-0 rounded-lg p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 cursor-pointer"
            aria-label={t('common.close')}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3 overflow-y-auto px-5 py-4">
          {user ? (
            <>
              <div className="flex items-center gap-3">
                <AccountAvatar user={user} sizeClass="h-10 w-10" textClass="text-sm" />
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{user.email || user.name}</div>
                  <div className="text-[11px] text-zinc-500">
                    {t('account.signedInVia', { provider: PROVIDER_LABELS[user.provider] || user.provider })}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => chrome.tabs.create({ url: chrome.runtime.getURL('/options.html#/account') })}
                className="flex w-full items-center justify-between rounded-xl border border-amber-200 bg-amber-50/50 px-3 py-2.5 text-left hover:bg-amber-50 cursor-pointer"
              >
                <span className="flex items-center gap-2 text-xs text-zinc-700">
                  <Coins className="h-4 w-4 shrink-0 text-amber-600" />
                  {entitlement ? (
                    <span>
                      <span className="font-semibold">{t(`billing.plans.${entitlement.plan}`)}</span>
                      {' · '}
                      <span className="font-mono font-semibold">{entitlement.balance}</span> {t('billing.creditsUnit')}
                    </span>
                  ) : (
                    t('billing.title')
                  )}
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-zinc-400" />
              </button>
              <button
                onClick={() => run('signout', async () => { await signOut(); onClose(); })}
                disabled={disabled}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-zinc-200 px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-60 cursor-pointer"
              >
                {busy === 'signout' ? spinner : <LogOut className="h-4 w-4 shrink-0" />}
                {t('account.signOut')}
              </button>
            </>
          ) : awaitingGoogle ? (
            <>
              <p className="text-xs leading-relaxed text-zinc-600">{t('account.googleWaiting')}</p>
              <button
                onClick={() => {
                  setAwaitingGoogle(false);
                  cancelGoogleWebSignIn().catch(() => {});
                }}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-zinc-200 px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50 cursor-pointer"
              >
                {t('common.cancel')}
              </button>
            </>
          ) : sentTo ? (
            <>
              <button
                onClick={() => { setSentTo(null); setCode(''); setError(null); }}
                className="flex items-center gap-1 text-[11px] text-zinc-500 hover:text-zinc-800 cursor-pointer"
              >
                <ArrowLeft className="h-3 w-3" />
                {t('account.useAnotherEmail')}
              </button>
              <p className="text-xs text-zinc-600">{t('account.codeSentTo', { email: sentTo })}</p>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                onKeyDown={(e) => e.key === 'Enter' && code.length === 6 && handleVerify()}
                inputMode="numeric"
                autoComplete="one-time-code"
                autoFocus
                placeholder={t('account.codePlaceholder')}
                className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-center font-mono text-lg tracking-[0.4em] outline-none focus:border-amber-400"
              />
              <button
                onClick={handleVerify}
                disabled={disabled || code.length !== 6}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-zinc-900 px-3 py-2 text-xs font-medium text-white hover:bg-zinc-800 disabled:opacity-50 cursor-pointer"
              >
                {busy === 'verify' && spinner}
                {t('account.verify')}
              </button>
            </>
          ) : (
            <>
              {(['google', 'github'] as const).map((provider) => (
                <button
                  key={provider}
                  onClick={() =>
                    provider === 'google'
                      ? run('google', async () => {
                          await startGoogleWebSignIn(language);
                          setAwaitingGoogle(true);
                        })
                      : run(provider, () => signInWithOAuth(provider))
                  }
                  disabled={disabled}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-zinc-200 px-3 py-2 text-xs font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-60 cursor-pointer"
                >
                  {busy === provider ? spinner : provider === 'google' ? <GoogleMark /> : <GithubMark />}
                  {provider === 'google' ? t('account.continueGoogle') : t('account.continueGithub')}
                </button>
              ))}
              <div className="flex items-center gap-2 text-[11px] text-zinc-400">
                <span className="h-px flex-1 bg-zinc-200" />
                <span className="shrink-0 whitespace-nowrap">{t('account.orEmail')}</span>
                <span className="h-px flex-1 bg-zinc-200" />
              </div>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && email.trim() && handleSend()}
                autoComplete="email"
                placeholder={t('account.emailPlaceholder')}
                className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-xs outline-none focus:border-amber-400"
              />
              <button
                onClick={handleSend}
                disabled={disabled || !email.trim()}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-zinc-900 px-3 py-2 text-xs font-medium text-white hover:bg-zinc-800 disabled:opacity-50 cursor-pointer"
              >
                {busy === 'send' ? spinner : <Mail className="h-4 w-4 shrink-0" />}
                {t('account.sendCode')}
              </button>
            </>
          )}

          {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-[11px] text-rose-700">{t(ERROR_KEYS[error])}</p>}
        </div>
      </div>
    </div>
  );
};

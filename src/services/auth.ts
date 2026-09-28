import { z } from 'zod';
import type { User } from '@supabase/supabase-js';
import { supabase } from './supabase';

export type OAuthProvider = 'google' | 'github';

export type AuthErrorCode = 'cancelled' | 'invalid_email' | 'invalid_code' | 'rate_limited' | 'provider_error' | 'network' | 'unknown';

export class AuthError extends Error {
  constructor(public readonly code: AuthErrorCode, message?: string) {
    super(message || code);
    this.name = 'AuthError';
  }
}

/** 扩展内展示用的账号信息，屏蔽不同登录方式的元数据差异 */
export interface AccountUser {
  id: string;
  email: string | null;
  name: string;
  avatarUrl: string | null;
  provider: string;
}

const emailSchema = z.string().trim().toLowerCase().pipe(z.email());
const codeSchema = z.string().trim().regex(/^\d{6}$/);

export function toAccountUser(user: User): AccountUser {
  const meta = (user.user_metadata || {}) as Record<string, unknown>;
  const pick = (...keys: string[]) => keys.map((k) => meta[k]).find((v): v is string => typeof v === 'string' && v.length > 0);
  const email = user.email ?? null;
  return {
    id: user.id,
    email,
    name: pick('full_name', 'name', 'user_name', 'preferred_username') || email?.split('@')[0] || 'PicPocket',
    avatarUrl: pick('avatar_url', 'picture') ?? null,
    provider: (user.app_metadata?.provider as string) || 'email',
  };
}

/** 解析 OAuth 回调地址中的 PKCE code 或错误（错误可能在 query 或 hash 中） */
export function extractAuthCallback(url: string): { code?: string; error?: string } {
  const parsed = new URL(url);
  const hash = new URLSearchParams(parsed.hash.replace(/^#/, ''));
  const read = (k: string) => parsed.searchParams.get(k) ?? hash.get(k) ?? undefined;
  const error = read('error_description') || read('error');
  if (error) return { error };
  const code = read('code');
  return code ? { code } : {};
}

function fromSupabaseError(error: { status?: number; message?: string } | null, fallback: AuthErrorCode): AuthError {
  if (!error) return new AuthError(fallback);
  if (error.status === 429 || /rate limit/i.test(error.message || '')) return new AuthError('rate_limited', error.message);
  if (/fetch|network/i.test(error.message || '')) return new AuthError('network', error.message);
  return new AuthError(fallback, error.message);
}

/** Google / GitHub 登录：PKCE 授权码流程，授权窗口由 chrome.identity 打开 */
export async function signInWithOAuth(provider: OAuthProvider): Promise<AccountUser> {
  const redirectTo = chrome.identity.getRedirectURL();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error || !data?.url) throw fromSupabaseError(error, 'provider_error');

  let responseUrl: string | undefined;
  try {
    responseUrl = await chrome.identity.launchWebAuthFlow({ url: data.url, interactive: true });
  } catch (err) {
    // 用户关闭授权窗口时 Chrome 抛出 "The user did not approve access."
    throw new AuthError('cancelled', err instanceof Error ? err.message : String(err));
  }
  if (!responseUrl) throw new AuthError('cancelled');

  const callback = extractAuthCallback(responseUrl);
  if (callback.error) throw new AuthError('provider_error', callback.error);
  if (!callback.code) throw new AuthError('provider_error', 'Missing authorization code');

  const exchanged = await supabase.auth.exchangeCodeForSession(callback.code);
  if (exchanged.error || !exchanged.data?.user) throw fromSupabaseError(exchanged.error, 'provider_error');
  return toAccountUser(exchanged.data.user);
}

/** 邮箱登录第一步：发送 6 位验证码（新邮箱自动注册） */
export async function sendEmailCode(rawEmail: string): Promise<string> {
  const parsed = emailSchema.safeParse(rawEmail);
  if (!parsed.success) throw new AuthError('invalid_email');
  const { error } = await supabase.auth.signInWithOtp({ email: parsed.data, options: { shouldCreateUser: true } });
  if (error) throw fromSupabaseError(error, 'unknown');
  return parsed.data;
}

/** 邮箱登录第二步：校验验证码并建立会话 */
export async function verifyEmailCode(email: string, rawCode: string): Promise<AccountUser> {
  const code = codeSchema.safeParse(rawCode);
  if (!code.success) throw new AuthError('invalid_code');
  const { data, error } = await supabase.auth.verifyOtp({ email, token: code.data, type: 'email' });
  if (error) {
    // 只有服务端明确拒绝（4xx）才判定为验证码错误；网络与 5xx 故障如实报告，避免用户反复输入正确的码
    const status = error.status ?? 0;
    const isCodeRejected = status >= 400 && status < 500 && status !== 429;
    throw isCodeRejected ? new AuthError('invalid_code', error.message) : fromSupabaseError(error, 'unknown');
  }
  if (!data?.user) throw new AuthError('invalid_code');
  return toAccountUser(data.user);
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}

/** 读取本地会话（不发网络请求）；过期时 supabase-js 会自动续期 */
export async function getCurrentUser(): Promise<AccountUser | null> {
  const { data } = await supabase.auth.getSession();
  return data?.session?.user ? toAccountUser(data.session.user) : null;
}

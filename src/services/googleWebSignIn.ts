import { z } from 'zod';
import { supabase } from './supabase';
import { AuthError, fromSupabaseError, toAccountUser, type AccountUser } from './auth';

/**
 * Google 登录改由官网完成：Google 账号选择页显示的是回调域名，
 * 走 Supabase 托管回调只会显示 <ref>.supabase.co；在 picpocket.top 用 Google Identity Services
 * 取得 ID Token，再由扩展调用 signInWithIdToken 换取会话，页面上就显示为 picpocket.top。
 */
export const WEB_SIGN_IN_ORIGIN = 'https://www.picpocket.top';
export const WEB_SIGN_IN_URL = `${WEB_SIGN_IN_ORIGIN}/auth/extension`;
export const GOOGLE_ID_TOKEN_MESSAGE = 'picpocket:google-id-token';
/** 后台广播给扩展页面的登录结果消息 */
export const GOOGLE_SIGN_IN_RESULT = 'GOOGLE_SIGN_IN_RESULT';

const PENDING_KEY = 'picpocket-google-signin';
const PENDING_TTL_MS = 10 * 60_000;

const messageSchema = z.object({ type: z.literal(GOOGLE_ID_TOKEN_MESSAGE), idToken: z.string().min(1) });
const pendingSchema = z.object({ nonce: z.string(), createdAt: z.number() });

/** 会话级存储：浏览器关闭即清空；老版本 Chrome 无 storage.session 时退回 local */
function pendingStore(): chrome.storage.StorageArea {
  return chrome.storage.session ?? chrome.storage.local;
}

function toHex(bytes: ArrayBuffer | Uint8Array): string {
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('');
}

export function isGoogleIdTokenMessage(message: unknown): boolean {
  return typeof message === 'object' && message !== null && (message as { type?: unknown }).type === GOOGLE_ID_TOKEN_MESSAGE;
}

/** 生成一次性 nonce（原值留在扩展，哈希值交给 Google），并在新标签页打开官网登录页 */
export async function startGoogleWebSignIn(): Promise<void> {
  const nonce = toHex(crypto.getRandomValues(new Uint8Array(32)));
  const hashedNonce = toHex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(nonce)));
  await pendingStore().set({ [PENDING_KEY]: { nonce, createdAt: Date.now() } });

  const url = new URL(WEB_SIGN_IN_URL);
  url.searchParams.set('nonce', hashedNonce);
  url.searchParams.set('ext', chrome.runtime.id);
  await chrome.tabs.create({ url: url.toString() });
}

/** 后台收到官网发来的 ID Token 后调用：校验来源与 nonce，换取 Supabase 会话 */
export async function completeGoogleWebSignIn(
  message: unknown,
  sender: { url?: string; origin?: string }
): Promise<AccountUser> {
  const senderUrl = sender.url ? new URL(sender.url) : null;
  if (!senderUrl || senderUrl.origin !== WEB_SIGN_IN_ORIGIN || `${senderUrl.origin}${senderUrl.pathname}` !== WEB_SIGN_IN_URL) {
    throw new AuthError('provider_error', 'Untrusted sign-in sender');
  }
  const parsed = messageSchema.safeParse(message);
  if (!parsed.success) throw new AuthError('provider_error', 'Malformed sign-in message');

  const store = pendingStore();
  const stored = pendingSchema.safeParse((await store.get(PENDING_KEY))[PENDING_KEY]);
  // nonce 只能用一次：无论成败先清除，防止同一 Token 被重放
  await store.remove(PENDING_KEY);
  if (!stored.success || Date.now() - stored.data.createdAt > PENDING_TTL_MS) {
    throw new AuthError('provider_error', 'Sign-in request expired');
  }

  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: 'google',
    token: parsed.data.idToken,
    nonce: stored.data.nonce,
  });
  if (error || !data?.user) throw fromSupabaseError(error, 'provider_error');
  return toAccountUser(data.user);
}

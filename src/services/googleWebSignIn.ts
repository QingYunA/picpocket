import { z } from 'zod';
import { supabase } from './supabase';
import { AuthError, fromSupabaseError, toAccountUser, type AccountUser, type AuthErrorCode } from './auth';

/**
 * Google 登录改由官网完成：Google 账号选择页显示的是回调域名，
 * 走 Supabase 托管回调只会显示 <ref>.supabase.co；在 picpocket.top 用 Google Identity Services
 * 取得 ID Token，再由扩展调用 signInWithIdToken 换取会话，页面上就显示为 picpocket.top。
 *
 * 部署前提：Google Web 客户端的 JavaScript 来源包含 https://www.picpocket.top，
 * 且该客户端 ID 已配置为 Supabase Google provider 的 Client ID（signInWithIdToken 校验 aud）。
 */
export const WEB_SIGN_IN_ORIGIN = 'https://www.picpocket.top';
export const WEB_SIGN_IN_URL = `${WEB_SIGN_IN_ORIGIN}/auth/extension`;
export const GOOGLE_ID_TOKEN_MESSAGE = 'picpocket:google-id-token';
/** 后台广播给扩展页面的登录结果消息 */
export const GOOGLE_SIGN_IN_RESULT = 'GOOGLE_SIGN_IN_RESULT';

const PENDING_KEY = 'picpocket-google-signin';
const PENDING_TTL_MS = 10 * 60_000;

const messageSchema = z.object({ type: z.literal(GOOGLE_ID_TOKEN_MESSAGE), idToken: z.string().min(1) });
const pendingSchema = z.object({ nonce: z.string(), createdAt: z.number(), tabId: z.number() });

type IdTokenMessage = z.infer<typeof messageSchema>;
type Pending = z.infer<typeof pendingSchema>;
export interface SignInResult {
  ok: boolean;
  code?: AuthErrorCode;
}

/**
 * 待完成的登录记录。storage.session 随浏览器关闭清空且不落盘；
 * Service Worker 没有 localStorage，无法走三层降级，老版本 Chrome 退回 storage.local。
 */
function pendingStore(): chrome.storage.StorageArea {
  return chrome.storage.session ?? chrome.storage.local;
}

async function readPending(): Promise<Pending | null> {
  const parsed = pendingSchema.safeParse((await pendingStore().get(PENDING_KEY))[PENDING_KEY]);
  return parsed.success ? parsed.data : null;
}

function toHex(bytes: ArrayBuffer | Uint8Array): string {
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('');
}

export function isGoogleIdTokenMessage(message: unknown): message is IdTokenMessage {
  return messageSchema.safeParse(message).success;
}

/**
 * 生成一次性 nonce（原值留在扩展，哈希值交给 Google），在新标签页打开官网登录页。
 * 同一时间只保留一个登录请求：重复发起会关闭上一个登录页。
 */
export async function startGoogleWebSignIn(language: 'zh' | 'en'): Promise<void> {
  await cancelGoogleWebSignIn();
  const nonce = toHex(crypto.getRandomValues(new Uint8Array(32)));
  const hashedNonce = toHex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(nonce)));

  const url = new URL(WEB_SIGN_IN_URL);
  url.searchParams.set('nonce', hashedNonce);
  url.searchParams.set('ext', chrome.runtime.id);
  url.searchParams.set('lang', language);
  const tab = await chrome.tabs.create({ url: url.toString() });
  if (tab.id === undefined) throw new AuthError('unknown', 'Failed to open sign-in tab');
  await pendingStore().set({ [PENDING_KEY]: { nonce, createdAt: Date.now(), tabId: tab.id } });
}

/** 放弃当前登录：清除 nonce 并关闭官网登录页，之后该页即使完成登录也不会生效 */
export async function cancelGoogleWebSignIn(): Promise<void> {
  const pending = await readPending();
  await pendingStore().remove(PENDING_KEY);
  if (pending) await chrome.tabs.remove(pending.tabId).catch(() => {});
}

function isTrustedSender(sender: chrome.runtime.MessageSender, pending: Pending): boolean {
  if (!sender.url || sender.tab?.id !== pending.tabId) return false;
  const url = new URL(sender.url);
  // Vercel cleanUrls 下 /auth/extension/ 也会直接返回页面
  return url.origin === WEB_SIGN_IN_ORIGIN && `${url.origin}${url.pathname.replace(/\/$/, '')}` === WEB_SIGN_IN_URL;
}

// Service Worker 内的同步占位：同一 Token 并发到达时只处理第一次
let consuming = false;

/** 后台收到官网发来的 ID Token 后调用：校验来源标签页与 nonce，换取 Supabase 会话 */
export async function completeGoogleWebSignIn(message: unknown, sender: chrome.runtime.MessageSender): Promise<AccountUser> {
  const parsed = messageSchema.safeParse(message);
  if (!parsed.success) throw new AuthError('provider_error', 'Malformed sign-in message');
  if (consuming) throw new AuthError('expired', 'Sign-in already in progress');
  consuming = true;
  try {
    const pending = await readPending();
    if (!pending) throw new AuthError('expired', 'No pending sign-in');
    if (!isTrustedSender(sender, pending)) throw new AuthError('provider_error', 'Untrusted sign-in sender');
    // nonce 只能用一次：先清除再兑换，防止同一 Token 被重放
    await pendingStore().remove(PENDING_KEY);
    if (Date.now() - pending.createdAt > PENDING_TTL_MS) throw new AuthError('expired', 'Sign-in request expired');

    const { data, error } = await supabase.auth.signInWithIdToken({
      provider: 'google',
      token: parsed.data.idToken,
      nonce: pending.nonce,
    });
    if (error || !data?.user) throw fromSupabaseError(error, 'provider_error');
    return toAccountUser(data.user);
  } finally {
    consuming = false;
  }
}

function broadcast(result: SignInResult): void {
  chrome.runtime.sendMessage({ action: GOOGLE_SIGN_IN_RESULT, ...result }).catch(() => {});
}

/** 后台 onMessageExternal 处理：兑换会话、关闭登录页，并把结果回给网页与扩展页面 */
export async function handleExternalSignIn(message: unknown, sender: chrome.runtime.MessageSender): Promise<SignInResult> {
  try {
    await completeGoogleWebSignIn(message, sender);
    if (sender.tab?.id !== undefined) chrome.tabs.remove(sender.tab.id).catch(() => {});
    broadcast({ ok: true });
    return { ok: true };
  } catch (err) {
    const result = { ok: false, code: err instanceof AuthError ? err.code : 'unknown' } as const;
    broadcast(result);
    return result;
  }
}

/** 后台 tabs.onRemoved 处理：用户关掉登录页时放弃该次登录，并通知对话框结束等待 */
export async function handleSignInTabRemoved(tabId: number): Promise<void> {
  const pending = await readPending();
  if (pending?.tabId !== tabId) return;
  await pendingStore().remove(PENDING_KEY);
  broadcast({ ok: false, code: 'cancelled' });
}

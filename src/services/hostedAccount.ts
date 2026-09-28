import { getSupabaseConfig, supabase } from './supabase';
import { buildHostedProxyHeaders, licenseUsableFor, type HostedRequestType } from './billing';
import { getTranslation } from '../i18n';
import type { Language, UserSettings } from '../types';

/** 托管调用后网关回报了新余额：写入时间戳作为信号，界面据此刷新权益（数值以 get-entitlement 为准） */
export const CREDIT_BALANCE_KEY = 'picpocket-credit-balance';

/** 托管调用使用的凭据：兑换码优先，其次已登录账号（按积分计费） */
export type HostedCredential =
  | { kind: 'license'; licenseKey: string }
  | { kind: 'account'; accessToken: string };

/**
 * 当前登录用户的 access token；未登录或读取失败返回 null。
 * getSession 会在 token 过期前自动续期，后台 Service Worker 中同样可用。
 */
export async function getAccountAccessToken(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    return data?.session?.access_token ?? null;
  } catch {
    return null;
  }
}

/** 没有自备 Key 时调用：可用兑换码 → 已登录账号 → null（需要配置 Key 或登录） */
export async function resolveHostedCredential(
  settings: UserSettings,
  requestType: HostedRequestType
): Promise<HostedCredential | null> {
  if (licenseUsableFor(settings, requestType)) {
    return { kind: 'license', licenseKey: settings.proMembership!.licenseKey! };
  }
  const accessToken = await getAccountAccessToken();
  return accessToken ? { kind: 'account', accessToken } : null;
}

export function hostedHeaders(credential: HostedCredential, requestType: HostedRequestType): Record<string, string> {
  if (credential.kind === 'license') return buildHostedProxyHeaders(credential.licenseKey, requestType);
  return {
    apikey: getSupabaseConfig().anonKey,
    Authorization: `Bearer ${credential.accessToken}`,
    'X-Request-Type': requestType,
  };
}

/** 网关回报了新余额时通知界面刷新；缓存失败不影响调用结果 */
export async function readCreditBalance(headers: Headers): Promise<void> {
  const raw = headers.get('X-Credits-Balance');
  const balance = raw === null ? NaN : Number(raw);
  if (!Number.isFinite(balance) || typeof chrome === 'undefined' || !chrome.storage?.local) return;
  try {
    await chrome.storage.local.set({ [CREDIT_BALANCE_KEY]: { balance, updatedAt: Date.now() } });
  } catch {
    // 仅用于界面刷新信号
  }
}

function parseErrorBody(body: string): { code?: string; balance?: number; required?: number } {
  try {
    return JSON.parse(body) ?? {};
  } catch {
    return {};
  }
}

/** 把账号托管调用的业务错误转换为可读提示；其他错误返回 null，由调用方按原逻辑处理 */
export function hostedCreditError(status: number, body: string, language: Language = 'zh'): Error | null {
  const parsed = parseErrorBody(body);
  const t = (key: string, params?: Record<string, string | number>) => String(getTranslation(language, key, params));
  if (status === 402 || parsed.code === 'insufficient_credits') {
    return new Error(t('billing.hostedErrors.insufficient', { balance: parsed.balance ?? 0, required: parsed.required ?? '?' }));
  }
  if (status === 429 || parsed.code === 'rate_limited') return new Error(t('billing.hostedErrors.rateLimited'));
  if (parsed.code === 'unsupported_model') return new Error(t('billing.hostedErrors.unsupportedModel'));
  if (status === 503) return new Error(t('billing.hostedErrors.unavailable'));
  return null;
}

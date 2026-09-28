import { getSupabaseConfig, supabase } from './supabase';
import type { HostedRequestType } from './billing';

/** 托管调用后网关回报的积分余额缓存，供界面即时展示（权威数据以 get-entitlement 为准） */
export const CREDIT_BALANCE_KEY = 'picpocket-credit-balance';

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

/** 已登录用户调用托管网关的请求头：用户 token 代替兑换码，按账号积分计费 */
export function accountHostedHeaders(accessToken: string, requestType: HostedRequestType): Record<string, string> {
  return {
    apikey: getSupabaseConfig().anonKey,
    Authorization: `Bearer ${accessToken}`,
    'X-Request-Type': requestType,
  };
}

export async function readCreditBalance(headers: Headers): Promise<void> {
  const raw = headers.get('X-Credits-Balance');
  const balance = raw === null ? NaN : Number(raw);
  if (!Number.isFinite(balance) || typeof chrome === 'undefined' || !chrome.storage?.local) return;
  try {
    await chrome.storage.local.set({ [CREDIT_BALANCE_KEY]: { balance, updatedAt: Date.now() } });
  } catch {
    // 缓存只用于展示，写入失败不影响调用结果
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
export function hostedCreditError(status: number, body: string): Error | null {
  const parsed = parseErrorBody(body);
  if (status === 402 || parsed.code === 'insufficient_credits') {
    return new Error(`积分不足：当前余额 ${parsed.balance ?? 0}，本次需要 ${parsed.required ?? '?'}。请在「账号与套餐」中升级套餐或购买积分包`);
  }
  if (status === 429 || parsed.code === 'rate_limited') return new Error('请求太频繁，请稍后再试');
  if (parsed.code === 'unsupported_model') return new Error('该模型暂不支持使用积分托管，请换一个模型或使用自己的 API Key');
  if (status === 503) return new Error('托管服务暂不可用，请稍后再试或使用自己的 API Key');
  return null;
}

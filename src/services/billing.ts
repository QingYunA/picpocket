import { getUserSettings, saveUserSettings } from '../utils/storage';
import type { ProMembership, UserSettings } from '../types';
import { supabase, isSupabaseConfigured, getSupabaseConfig } from './supabase';
import type { TranslationKey } from '../i18n';

export const DEFAULT_HOSTED_PROXY_URL = `${getSupabaseConfig().url}/functions/v1/ai-proxy`;

export type HostedRequestType = 'vision' | 'image-generation';

/**
 * 托管通道 ai-proxy 的请求头（约定见 docs/api-contract.md）。
 * apikey / Authorization 用公开 key 通过 Supabase 网关的 JWT 校验，缺失时网关直接 401；
 * X-License-Key 才是扣减额度的身份凭证。
 */
export function buildHostedProxyHeaders(licenseKey: string, requestType: HostedRequestType): Record<string, string> {
  const { anonKey } = getSupabaseConfig();
  return {
    apikey: anonKey,
    Authorization: `Bearer ${anonKey}`,
    'X-License-Key': licenseKey,
    'X-Request-Type': requestType,
  };
}

export interface SubscriptionPlan {
  id: 'monthly' | 'yearly';
  nameZh: string;
  nameEn: string;
  priceZh: string;
  priceEn: string;
  periodZh: string;
  periodEn: string;
  savings?: string;
  paypalPlanId: string;
}

export const SUBSCRIPTION_PLANS: SubscriptionPlan[] = [
  {
    id: 'monthly',
    nameZh: '月度会员',
    nameEn: 'Monthly Pro',
    priceZh: '¥29',
    priceEn: '$4.99',
    periodZh: '/ 月',
    periodEn: '/ mo',
    paypalPlanId: 'P-MONTHLY-PICPOCKET-PRO',
  },
  {
    id: 'yearly',
    nameZh: '年度会员',
    nameEn: 'Annual Pro',
    priceZh: '¥238',
    priceEn: '$39.99',
    periodZh: '/ 年',
    periodEn: '/ yr',
    savings: '省 30%',
    paypalPlanId: 'P-ANNUAL-PICPOCKET-PRO',
  },
];

/**
 * PayPal 订阅配置
 * 真实环境下可替换为生产 client-id
 */
export const PAYPAL_CONFIG = {
  clientId: 'sb', // Sandbox default client-id for testing
  currency: 'USD',
  intent: 'subscription',
};

/**
 * 构建 PayPal 结账/订阅重定向 URL 或唤起 PayPal SDK 弹窗
 */
export function buildPayPalCheckoutUrl(plan: SubscriptionPlan): string {
  return `https://www.paypal.com/checkoutnow?plan_id=${encodeURIComponent(
    plan.paypalPlanId
  )}&brand_name=PicPocket&locale=zh_CN`;
}

/**
 * 检查 Pro 会员是否已过期或配额耗尽
 */
export function isProExpired(mem?: ProMembership): boolean {
  if (!mem || !mem.isPro) return true;
  if (mem.expiresAt && Date.now() > mem.expiresAt) return true;

  // 如果具备双独立额度，任意一项有剩余即算有效（未完全耗尽）
  const hasDual =
    typeof mem.visionQuotaRemaining === 'number' || typeof mem.imageQuotaRemaining === 'number';
  if (hasDual) {
    const vRemaining = mem.visionQuotaRemaining ?? 0;
    const iRemaining = mem.imageQuotaRemaining ?? 0;
    return vRemaining <= 0 && iRemaining <= 0;
  }

  // 兼容单额度
  if (typeof mem.quotaRemaining === 'number' && mem.quotaRemaining <= 0) return true;
  return false;
}

/**
 * 判定目标配置或会员是否处于真正有效的 Pro 活跃状态
 */
export function isProActive(target?: UserSettings | ProMembership | null): boolean {
  if (!target) return false;
  const mem: ProMembership | undefined =
    'proMembership' in target ? target.proMembership : (target as ProMembership);
  return Boolean(mem?.isPro && !isProExpired(mem));
}

/**
 * 同步网关返回的最新剩余可用额度（支持反推与生图双配额）
 */
export async function syncDualRemainingQuota(quotas: {
  visionRemaining?: number;
  imageRemaining?: number;
  generalRemaining?: number;
}): Promise<void> {
  try {
    const settings = await getUserSettings();
    if (settings.proMembership?.isPro) {
      const current = settings.proMembership;
      const updated: ProMembership = {
        ...current,
        visionQuotaRemaining:
          typeof quotas.visionRemaining === 'number'
            ? quotas.visionRemaining
            : current.visionQuotaRemaining,
        imageQuotaRemaining:
          typeof quotas.imageRemaining === 'number'
            ? quotas.imageRemaining
            : current.imageQuotaRemaining,
        quotaRemaining:
          typeof quotas.generalRemaining === 'number'
            ? quotas.generalRemaining
            : typeof quotas.visionRemaining === 'number'
            ? quotas.visionRemaining
            : current.quotaRemaining,
      };
      await saveUserSettings({
        ...settings,
        proMembership: updated,
      });
    }
  } catch (err) {
    console.warn('[billing] Failed to sync dual remaining quota:', err);
  }
}

/**
 * 兼容旧版的单额度同步函数
 */
export async function syncRemainingQuota(newQuota: number): Promise<void> {
  if (isNaN(newQuota) || newQuota < 0) return;
  await syncDualRemainingQuota({ generalRemaining: newQuota });
}

/**
 * 检查当前设置是否具备视觉反推权限（自备 Key 或有效 Pro 反推托管算力）
 */
export function hasVisionAccess(settings?: UserSettings | null): boolean {
  if (!settings) return false;
  if (settings.apiKey && settings.apiKey.trim()) return true;
  if (!isProActive(settings)) return false;
  const mem = settings.proMembership;
  if (mem?.visionQuotaRemaining !== undefined) {
    return mem.visionQuotaRemaining > 0;
  }
  return true;
}

/**
 * 检查当前设置是否具备 AI 生图权限（自备生图/通用 Key 或有效 Pro 生图托管算力）
 */
export function hasImageGenAccess(settings?: UserSettings | null): boolean {
  if (!settings) return false;
  if (settings.imageApiKey && settings.imageApiKey.trim()) return true;
  if (settings.apiKey && settings.apiKey.trim()) return true;
  if (!isProActive(settings)) return false;
  const mem = settings.proMembership;
  if (mem?.imageQuotaRemaining !== undefined) {
    return mem.imageQuotaRemaining > 0;
  }
  return true;
}

/** 激活失败原因，界面通过 getLicenseErrorKey 映射为本地化文案 */
export type LicenseErrorCode = 'invalid' | 'expired' | 'exhausted' | 'network' | 'server';

const LICENSE_ERROR_KEYS: Record<LicenseErrorCode, TranslationKey> = {
  invalid: 'subscription.invalidKey',
  expired: 'subscription.codeExpired',
  exhausted: 'subscription.codeExhausted',
  network: 'subscription.verifyNetworkError',
  server: 'subscription.verifyServerError',
};

export function getLicenseErrorKey(code: LicenseErrorCode): TranslationKey {
  return LICENSE_ERROR_KEYS[code];
}

/** verify_license RPC 返回的单行激活码信息 */
interface VerifiedLicenseRow {
  key: string;
  tier: string | null;
  total_quota: number | null;
  remaining_quota: number | null;
  vision_total_quota: number | null;
  vision_remaining_quota: number | null;
  image_total_quota: number | null;
  image_remaining_quota: number | null;
  expires_at: string | null;
  note: string | null;
}

/**
 * 验证并激活 License Key 激活码
 * 支持任意命名的兑换码（博主专属码、商业码等）
 * 仅通过 Supabase verify_license RPC 远程核验配额与有效期，不存在本地激活规则
 */
export async function activateLicenseKey(
  key: string
): Promise<{ success: boolean; message?: string; errorCode?: LicenseErrorCode; membership?: ProMembership }> {
  const trimmed = key.trim().toUpperCase();

  // 基础有效性校验：只要非空且长度 >= 4 即可支持任意个性化命名 (如 REDNOTE-TOM, VIP-ZHANG 等)
  if (!trimmed || trimmed.length < 4) {
    return {
      success: false,
      message: '激活码格式无效，长度至少需要 4 位字符',
    };
  }

  // 1. 通过 Supabase verify_license RPC 远程核验（按完整激活码精确匹配）
  //    licenses 表不对 anon 开放直接读取，避免任何人用内置 anon key 拖出全部激活码。
  //    一旦配置了 Supabase，核验结果即为最终结论：查不到 / 网络失败都不会降级为离线激活。
  if (isSupabaseConfigured()) {
    let row: VerifiedLicenseRow | undefined;
    try {
      const { data, error } = await supabase.rpc('verify_license', { license_key: trimmed });
      if (error) {
        // supabase-js 不会因网络失败抛错，而是返回不带 code 的 error；
        // 带 code 的（PGRST202 函数缺失、42501 权限不足等）属于服务端故障
        console.error('[billing] verify_license RPC error:', error);
        return { success: false, errorCode: (error as { code?: string }).code ? 'server' : 'network' };
      }
      row = Array.isArray(data) ? data[0] : data ?? undefined;
    } catch (err) {
      console.warn('[billing] Could not reach license verification:', err);
      return { success: false, errorCode: 'network' };
    }

    if (!row) {
      return { success: false, errorCode: 'invalid' };
    }
    if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) {
      return { success: false, errorCode: 'expired' };
    }

    const vTotal = row.vision_total_quota ?? row.total_quota ?? 1000;
    const vRemaining = row.vision_remaining_quota ?? row.remaining_quota ?? 1000;
    const iTotal = row.image_total_quota ?? 200;
    const iRemaining = row.image_remaining_quota ?? 200;

    if (vRemaining <= 0 && iRemaining <= 0) {
      return { success: false, errorCode: 'exhausted' };
    }

    const membership: ProMembership = {
      isPro: true,
      licenseKey: row.key,
      tier: (row.tier as any) || 'pro',
      plan: 'yearly',
      quotaRemaining: vRemaining,
      totalQuota: vTotal,
      visionQuotaRemaining: vRemaining,
      visionTotalQuota: vTotal,
      imageQuotaRemaining: iRemaining,
      imageTotalQuota: iTotal,
      note: row.note || undefined,
      activatedAt: Date.now(),
      expiresAt: row.expires_at ? new Date(row.expires_at).getTime() : undefined,
    };

    const settings = await getUserSettings();
    await saveUserSettings({
      ...settings,
      proMembership: membership,
    });

    return {
      success: true,
      membership,
    };
  }

  // 未配置托管服务时无法核验，一律拒绝；兑换码只认服务端核验结果
  return { success: false, errorCode: 'server' };
}

/**
 * 获取当前用户的 Pro 会员状态
 */
export async function getProMembership(): Promise<ProMembership> {
  const settings = await getUserSettings();
  const mem = settings.proMembership;

  if (!mem || !mem.isPro) {
    return { isPro: false };
  }

  // 检查是否过期或配额耗尽
  if (isProExpired(mem)) {
    return {
      isPro: false,
      licenseKey: mem.licenseKey,
      quotaRemaining: mem.quotaRemaining,
      expiresAt: mem.expiresAt,
    };
  }

  return mem;
}


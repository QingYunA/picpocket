import { FunctionsHttpError } from '@supabase/supabase-js';
import { applyHostedCatalog } from '../config/hostedModels';
import { supabase } from './supabase';

export type PlanId = 'free' | 'plus' | 'pro' | 'max';
export type PaidPlanId = Exclude<PlanId, 'free'>;
export type BillingInterval = 'month' | 'year';
export type PaymentProvider = 'waffo' | 'paypal';
export type CreditPackSku = 'credits_300' | 'credits_1000';
export type Sku = `${PaidPlanId}_${BillingInterval}` | CreditPackSku;

/** 展示用价目表；实际扣款金额以支付平台商品为准 */
export const PLANS: Array<{ id: PlanId; monthlyCredits: number; usd: Record<BillingInterval, number> }> = [
  { id: 'free', monthlyCredits: 30, usd: { month: 0, year: 0 } },
  { id: 'plus', monthlyCredits: 400, usd: { month: 9.9, year: 99 } },
  { id: 'pro', monthlyCredits: 1100, usd: { month: 24.9, year: 249 } },
  { id: 'max', monthlyCredits: 3000, usd: { month: 59.9, year: 599 } },
];

export const CREDIT_PACKS: Array<{ sku: CreditPackSku; credits: number; usd: number; validMonths: number }> = [
  { sku: 'credits_300', credits: 300, usd: 9.9, validMonths: 12 },
  { sku: 'credits_1000', credits: 1000, usd: 24.9, validMonths: 12 },
];

export function isPackSku(sku: Sku): sku is CreditPackSku {
  return CREDIT_PACKS.some((pack) => pack.sku === sku);
}

export function subscriptionSku(plan: PaidPlanId, interval: BillingInterval): Sku {
  return `${plan}_${interval}`;
}

/** 年付相对 12 个月月付节省的百分比（取整） */
export function yearlySavingsPercent(plan: PaidPlanId): number {
  const { usd } = PLANS.find((p) => p.id === plan)!;
  return Math.round((1 - usd.year / (usd.month * 12)) * 100);
}

export interface CreditBucket {
  source: 'free_monthly' | 'subscription' | 'pack' | 'admin' | 'refund';
  amount: number;
  remaining: number;
  expiresAt: string;
}

export interface Entitlement {
  plan: PlanId;
  subscription: {
    provider: PaymentProvider;
    interval: BillingInterval;
    status: 'active' | 'past_due' | 'canceled' | 'expired';
    currentPeriodEnd: string;
    cancelAtPeriodEnd: boolean;
  } | null;
  monthlyCredits: number;
  balance: number;
  /** 免费月额度没有发放时的原因；已领取或有订阅时为 null */
  freeBlocked?: 'unverified_email' | 'disposable_email' | 'limit' | null;
  buckets: CreditBucket[];
  pricing: {
    defaultVisionModel: string;
    defaultImageModel?: string;
    vision: Array<{ id: string; min: number; max: number }>;
    image: Array<{ id: string; credits: number; credits4k?: number; supportsEdit?: boolean }>;
  };
}

export type BillingErrorCode =
  | 'unauthenticated'
  | 'already_on_plan'
  | 'subscribed_elsewhere'
  | 'change_not_supported'
  | 'resume_not_supported'
  | 'no_subscription'
  | 'network'
  | 'unknown';

const KNOWN_CODES = new Set<BillingErrorCode>([
  'already_on_plan', 'subscribed_elsewhere', 'change_not_supported', 'resume_not_supported', 'no_subscription',
]);

export class BillingError extends Error {
  constructor(public readonly code: BillingErrorCode, message?: string) {
    super(message || code);
    this.name = 'BillingError';
  }
}

async function toBillingError(error: unknown): Promise<BillingError> {
  if (error instanceof FunctionsHttpError) {
    const body = await (error.context as Response).json().catch(() => ({}));
    if ((error.context as Response).status === 401) return new BillingError('unauthenticated');
    const code = KNOWN_CODES.has(body?.code) ? (body.code as BillingErrorCode) : 'unknown';
    return new BillingError(code, body?.error);
  }
  return new BillingError('network', error instanceof Error ? error.message : String(error));
}

async function invoke<T>(name: string, options: { method?: 'GET'; body?: Record<string, unknown> }): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, options);
  if (error) throw await toBillingError(error);
  return data as T;
}

export async function fetchEntitlement(): Promise<Entitlement> {
  const entitlement = await invoke<Entitlement>('get-entitlement', { method: 'GET' });
  applyHostedCatalog(entitlement.pricing);
  return entitlement;
}

/** 生成支付链接；付款结果以支付回调为准，界面随后刷新权益即可 */
export async function requestCheckoutUrl(provider: PaymentProvider, sku: Sku): Promise<string> {
  const { url } = await invoke<{ url: string }>('create-checkout', { body: { provider, sku } });
  return url;
}

export function manageSubscription(action: 'cancel' | 'resume'): Promise<{ ok: boolean; cancelAtPeriodEnd: boolean }> {
  return invoke('manage-subscription', { body: { action } });
}

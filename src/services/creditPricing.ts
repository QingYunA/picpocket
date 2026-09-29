import type { Entitlement } from './accountBilling';

/** 网关返回的托管模型计价，随 get-entitlement 一并下发，界面不自带价目表 */
export type CreditPricing = Entitlement['pricing'];

export interface CreditCost {
  min: number;
  max: number;
}

const sameModel = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** 生图单张的积分消耗；尺寸在提交前未知，有 4K 价的模型给出「标准 ~ 4K」区间 */
export function imageCreditCost(pricing: CreditPricing | null | undefined, model: string | undefined): CreditCost | null {
  const entry = model ? pricing?.image.find((item) => sameModel(item.id, model)) : undefined;
  return entry ? { min: entry.credits, max: entry.credits4k ?? entry.credits } : null;
}

/** 图片反推按实际 token 计费，给出该模型的积分区间 */
export function visionCreditCost(pricing: CreditPricing | null | undefined, model: string | undefined): CreditCost | null {
  const entry = model ? pricing?.vision.find((item) => sameModel(item.id, model)) : undefined;
  return entry ? { min: entry.min, max: entry.max } : null;
}

export function formatCreditCost({ min, max }: CreditCost): string {
  return min === max ? String(min) : `${min}–${max}`;
}

/** 一次生成多张图时的总消耗；张数取整并至少为 1 */
export function scaleCreditCost(cost: CreditCost, count: number): CreditCost {
  const images = Math.max(1, Math.floor(Number.isFinite(count) ? count : 1));
  return { min: cost.min * images, max: cost.max * images };
}

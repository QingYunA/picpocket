import { useAuth } from './useAuth';
import { useEntitlement } from './useEntitlement';
import type { CreditPricing } from '../services/creditPricing';

/**
 * 当前账号的积分余额与托管模型计价，侧边栏与画布共用。
 * 只在当前渠道走 PicPocket 官方托管（active）且已登录时才请求；其余情况返回 null，界面不展示积分。
 */
export function useHostedCredits(active: boolean): { balance: number | null; pricing: CreditPricing | null } {
  const { user } = useAuth();
  const { entitlement } = useEntitlement(active && user ? user.id : null);
  return {
    balance: active && entitlement ? entitlement.balance : null,
    pricing: active && entitlement ? entitlement.pricing : null,
  };
}

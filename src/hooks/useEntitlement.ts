import { useCallback, useEffect, useRef, useState } from 'react';
import { BillingError, fetchEntitlement, type BillingErrorCode, type Entitlement } from '@/services/accountBilling';
import { CREDIT_BALANCE_KEY } from '@/services/hostedAccount';

const CHECKOUT_POLL_INTERVAL_MS = 5_000;
const CHECKOUT_POLL_DURATION_MS = 3 * 60_000;

/**
 * 当前账号的套餐与积分。登录状态变化、窗口重新获得焦点（从付款页返回）、
 * 托管调用回报新余额时自动刷新；付款后调用 watchCheckout() 短时间轮询直到到账。
 */
export function useEntitlement(userId: string | null) {
  const [entitlement, setEntitlement] = useState<Entitlement | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<BillingErrorCode | null>(null);
  const entitlementRef = useRef<Entitlement | null>(null);
  entitlementRef.current = entitlement;
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  // 多个来源（聚焦、轮询、余额信号）可能并发刷新，只采用最后发出的请求结果
  const requestSeq = useRef(0);
  // 付款前的权益快照：轮询期间一旦变化就提前停止
  const checkoutBaseline = useRef<string | null>(null);

  const stopPolling = useCallback(() => {
    if (pollTimer.current) clearInterval(pollTimer.current);
    pollTimer.current = null;
    checkoutBaseline.current = null;
  }, []);

  const refresh = useCallback(async () => {
    const seq = ++requestSeq.current;
    if (!userId) {
      setEntitlement(null);
      return;
    }
    setLoading(true);
    try {
      const next = await fetchEntitlement();
      if (seq !== requestSeq.current) return;
      setEntitlement(next);
      setError(null);
      const snapshot = JSON.stringify([next.plan, next.balance, next.subscription]);
      if (checkoutBaseline.current !== null && checkoutBaseline.current !== snapshot) stopPolling();
    } catch (err) {
      if (seq === requestSeq.current) setError(err instanceof BillingError ? err.code : 'unknown');
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }, [userId, stopPolling]);

  const watchCheckout = useCallback(() => {
    stopPolling();
    checkoutBaseline.current = entitlementRef.current
      ? JSON.stringify([entitlementRef.current.plan, entitlementRef.current.balance, entitlementRef.current.subscription])
      : '';
    const startedAt = Date.now();
    pollTimer.current = setInterval(() => {
      if (Date.now() - startedAt > CHECKOUT_POLL_DURATION_MS) stopPolling();
      else refresh();
    }, CHECKOUT_POLL_INTERVAL_MS);
  }, [refresh, stopPolling]);

  useEffect(() => {
    refresh();
    const onFocus = () => refresh();
    window.addEventListener('focus', onFocus);

    const onStorage = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === 'local' && CREDIT_BALANCE_KEY in changes) refresh();
    };
    const hasStorageEvents = typeof chrome !== 'undefined' && Boolean(chrome.storage?.onChanged);
    if (hasStorageEvents) chrome.storage.onChanged.addListener(onStorage);

    return () => {
      window.removeEventListener('focus', onFocus);
      if (hasStorageEvents) chrome.storage.onChanged.removeListener(onStorage);
      stopPolling();
    };
  }, [refresh, stopPolling]);

  return { entitlement, loading, error, refresh, watchCheckout };
}

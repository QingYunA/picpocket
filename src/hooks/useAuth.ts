import { useCallback, useEffect, useState } from 'react';
import { supabase, AUTH_STORAGE_KEY } from '../services/supabase';
import { getCurrentUser, toAccountUser, type AccountUser } from '../services/auth';

/**
 * 当前登录账号。侧边栏、工作台、设置页各自持有 Supabase 客户端，
 * 通过 chrome.storage 的会话键变化互相同步，任一页面登录或退出，其他页面立即更新。
 */
export function useAuth(): { user: AccountUser | null; loading: boolean; refresh: () => Promise<void> } {
  const [user, setUser] = useState<AccountUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      setUser(await getCurrentUser());
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ? toAccountUser(session.user) : null);
      setLoading(false);
    });

    const onStorageChange = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === 'local' && AUTH_STORAGE_KEY in changes) refresh();
    };
    const hasStorageEvents = typeof chrome !== 'undefined' && Boolean(chrome.storage?.onChanged);
    if (hasStorageEvents) chrome.storage.onChanged.addListener(onStorageChange);

    return () => {
      data.subscription.unsubscribe();
      if (hasStorageEvents) chrome.storage.onChanged.removeListener(onStorageChange);
    };
  }, [refresh]);

  return { user, loading, refresh };
}

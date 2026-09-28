/**
 * Supabase Auth 会话存储适配器。
 * 按 AGENTS.md 的存储容错规范三级降级：chrome.storage.local → localStorage → 内存；
 * 任一层失败都不抛异常，最坏情况只是需要重新登录。
 */
const memory = new Map<string, string>();

function chromeLocal(): chrome.storage.LocalStorageArea | null {
  return typeof chrome !== 'undefined' && chrome.storage?.local ? chrome.storage.local : null;
}

function webLocal(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' && localStorage ? localStorage : null;
  } catch {
    return null;
  }
}

export const authStorage = {
  async getItem(key: string): Promise<string | null> {
    const area = chromeLocal();
    if (area) {
      try {
        const data = await area.get(key);
        const value = data?.[key];
        return typeof value === 'string' ? value : null;
      } catch {
        // 降级到下一层
      }
    }
    const web = webLocal();
    if (web) {
      try {
        return web.getItem(key);
      } catch {
        // 降级到内存
      }
    }
    return memory.get(key) ?? null;
  },

  async setItem(key: string, value: string): Promise<void> {
    const area = chromeLocal();
    if (area) {
      try {
        await area.set({ [key]: value });
        return;
      } catch {
        // 降级到下一层
      }
    }
    const web = webLocal();
    if (web) {
      try {
        web.setItem(key, value);
        return;
      } catch {
        // 降级到内存
      }
    }
    memory.set(key, value);
  },

  async removeItem(key: string): Promise<void> {
    memory.delete(key);
    const area = chromeLocal();
    if (area) {
      try {
        await area.remove(key);
      } catch {
        // 忽略：下一层同样清理
      }
    }
    const web = webLocal();
    if (web) {
      try {
        web.removeItem(key);
      } catch {
        // 忽略
      }
    }
  },
};

/** 仅供测试重置内存层 */
export function __resetAuthMemoryForTests(): void {
  memory.clear();
}

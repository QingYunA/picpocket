import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getUserSettings, saveUserSettings, getActiveGeneration, resetInMemoryStorageForTesting } from '../storage';

type Store = Record<string, unknown>;

/** 带延迟的 chrome.storage.local 模拟：get / set 各自异步，才能暴露「读-改-写」交错 */
function installChromeStorage(store: Store, options: { failSet?: boolean; failGet?: boolean } = {}) {
  const delay = () => new Promise((resolve) => setTimeout(resolve, 5));
  (globalThis as any).chrome = {
    storage: {
      local: {
        get: vi.fn(async (key: string) => {
          await delay();
          if (options.failGet) throw new Error('context invalidated');
          return key in store ? { [key]: structuredClone(store[key]) } : {};
        }),
        set: vi.fn(async (items: Store) => {
          await delay();
          if (options.failSet) throw new Error('QUOTA_BYTES exceeded');
          Object.assign(store, structuredClone(items));
        }),
      },
    },
  };
}

describe('saveUserSettings 并发与容错', () => {
  const originalChrome = (globalThis as any).chrome;

  beforeEach(() => {
    resetInMemoryStorageForTesting();
    if (typeof localStorage !== 'undefined') localStorage.clear?.();
  });

  afterEach(() => {
    (globalThis as any).chrome = originalChrome;
  });

  it('并发保存不同字段时互不覆盖', async () => {
    const store: Store = {};
    installChromeStorage(store);

    await Promise.all([
      saveUserSettings({ model: 'model-a' }),
      saveUserSettings({ enableHoverBadge: false }),
      saveUserSettings({ contextMenuMode: 'direct-collect' }),
    ]);

    const saved = (await getUserSettings()) as unknown as Record<string, unknown>;
    expect(saved.model).toBe('model-a');
    expect(saved.enableHoverBadge).toBe(false);
    expect(saved.contextMenuMode).toBe('direct-collect');
  });

  it('chrome.storage 写入失败时不抛出，设置仍可在本会话读回', async () => {
    const store: Store = {};
    installChromeStorage(store, { failSet: true });

    await expect(saveUserSettings({ model: 'fallback-model' })).resolves.toMatchObject({ model: 'fallback-model' });
  });

  it('chrome.storage 读取失败（扩展上下文失效）时降级为默认值而不是抛出', async () => {
    installChromeStorage({}, { failGet: true });

    await expect(getUserSettings()).resolves.toMatchObject({ language: expect.any(String) });
    await expect(getActiveGeneration()).resolves.toBeNull();
  });
});

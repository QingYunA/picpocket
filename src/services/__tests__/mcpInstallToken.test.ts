import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ensureMcpAuthTokenOnInstall } from '../mcpInstallToken';
import { getUserSettings, resetInMemoryStorageForTesting } from '@/utils/storage';
import { LEGACY_MCP_AUTH_TOKEN } from '@/utils/mcpToken';

type Store = Record<string, unknown>;

function installChromeStorage(store: Store, options: { failSet?: boolean } = {}) {
  (globalThis as any).chrome = {
    storage: {
      local: {
        get: vi.fn(async (key: string) => (key in store ? { [key]: structuredClone(store[key]) } : {})),
        set: vi.fn(async (items: Store) => {
          if (options.failSet) throw new Error('QUOTA_BYTES exceeded');
          Object.assign(store, structuredClone(items));
        }),
      },
    },
  };
}

describe('ensureMcpAuthTokenOnInstall', () => {
  const originalChrome = (globalThis as any).chrome;

  beforeEach(() => {
    resetInMemoryStorageForTesting();
    if (typeof localStorage !== 'undefined') localStorage.clear?.();
  });

  afterEach(() => {
    (globalThis as any).chrome = originalChrome;
  });

  it('全新安装（无任何设置）写入随机 Token，其余 MCP 默认值保留', async () => {
    const store: Store = {};
    installChromeStorage(store);

    await ensureMcpAuthTokenOnInstall();

    const mcp = (await getUserSettings()).mcpSettings!;
    expect(mcp.authToken).toMatch(/^pp_[A-Za-z0-9_-]{43}$/);
    expect(mcp.port).toBe(18088);
    expect(mcp.permissions).toEqual({ read: true, write: true, generate: false });
    expect((store.promptsnap_settings as any).mcpSettings.authToken).toBe(mcp.authToken);
  });

  it('已有专属 Token 时不覆盖', async () => {
    const store: Store = {
      promptsnap_settings: { mcpSettings: { enabled: true, port: 19000, authToken: 'pp_existing', permissions: { read: true, write: true, generate: true } } },
    };
    installChromeStorage(store);

    await ensureMcpAuthTokenOnInstall();

    const mcp = (await getUserSettings()).mcpSettings!;
    expect(mcp.authToken).toBe('pp_existing');
    expect(mcp.port).toBe(19000);
  });

  it('旧版默认 Token 视为未配置，替换为随机 Token 并保留端口与权限', async () => {
    const store: Store = {
      promptsnap_settings: { mcpSettings: { enabled: true, port: 19000, authToken: LEGACY_MCP_AUTH_TOKEN, permissions: { read: true, write: false, generate: false } } },
    };
    installChromeStorage(store);

    await ensureMcpAuthTokenOnInstall();

    const mcp = (await getUserSettings()).mcpSettings!;
    expect(mcp.authToken).toMatch(/^pp_/);
    expect(mcp.port).toBe(19000);
    expect(mcp.permissions.write).toBe(false);
  });

  it('chrome.storage 写入失败时降级到内存，不抛出且本会话可读回', async () => {
    installChromeStorage({}, { failSet: true });

    await expect(ensureMcpAuthTokenOnInstall()).resolves.toBeUndefined();

    expect((await getUserSettings()).mcpSettings!.authToken).toMatch(/^pp_/);
  });
});

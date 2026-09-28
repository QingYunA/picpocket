import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { authStorage, __resetAuthMemoryForTests } from '../authStorage';

function mockChromeStorage(store: Record<string, unknown>, opts: { failing?: boolean } = {}) {
  (globalThis as any).chrome = {
    storage: {
      local: {
        get: vi.fn(async (key: string) => {
          if (opts.failing) throw new Error('storage unavailable');
          return key in store ? { [key]: store[key] } : {};
        }),
        set: vi.fn(async (items: Record<string, unknown>) => {
          if (opts.failing) throw new Error('QUOTA_BYTES quota exceeded');
          Object.assign(store, items);
        }),
        remove: vi.fn(async (key: string) => {
          if (opts.failing) throw new Error('storage unavailable');
          delete store[key];
        }),
      },
    },
  };
}

function mockLocalStorage(store: Record<string, string>) {
  (globalThis as any).localStorage = {
    getItem: (k: string) => (k in store ? store[k] : null),
    setItem: (k: string, v: string) => {
      store[k] = v;
    },
    removeItem: (k: string) => {
      delete store[k];
    },
  };
}

describe('authStorage', () => {
  let originalLocalStorage: unknown;

  beforeEach(() => {
    originalLocalStorage = (globalThis as any).localStorage;
    delete (globalThis as any).chrome;
    delete (globalThis as any).localStorage;
    __resetAuthMemoryForTests();
  });

  afterEach(() => {
    delete (globalThis as any).chrome;
    (globalThis as any).localStorage = originalLocalStorage;
  });

  it('persists the session in chrome.storage.local when available', async () => {
    const store: Record<string, unknown> = {};
    mockChromeStorage(store);

    await authStorage.setItem('picpocket-auth', '{"access_token":"a"}');
    expect(store['picpocket-auth']).toBe('{"access_token":"a"}');
    expect(await authStorage.getItem('picpocket-auth')).toBe('{"access_token":"a"}');

    await authStorage.removeItem('picpocket-auth');
    expect(await authStorage.getItem('picpocket-auth')).toBeNull();
  });

  it('falls back to localStorage when chrome.storage throws', async () => {
    const local: Record<string, string> = {};
    mockChromeStorage({}, { failing: true });
    mockLocalStorage(local);

    await authStorage.setItem('picpocket-auth', 'session');
    expect(local['picpocket-auth']).toBe('session');
    expect(await authStorage.getItem('picpocket-auth')).toBe('session');
  });

  it('falls back to memory when no persistent storage exists, without throwing', async () => {
    await authStorage.setItem('picpocket-auth', 'session');
    expect(await authStorage.getItem('picpocket-auth')).toBe('session');
    await authStorage.removeItem('picpocket-auth');
    expect(await authStorage.getItem('picpocket-auth')).toBeNull();
  });

  it('ignores non-string values left in chrome.storage', async () => {
    mockChromeStorage({ 'picpocket-auth': { corrupted: true } });
    expect(await authStorage.getItem('picpocket-auth')).toBeNull();
  });
});

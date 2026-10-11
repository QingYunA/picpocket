import { describe, it, expect, beforeEach } from 'vitest';
import {
  getActiveReferenceAnalysis,
  setActiveReferenceAnalysis,
  clearActiveReferenceAnalysis,
  resetInMemoryStorageForTesting,
} from '../storage';
import type { ActiveReferenceAnalysisState } from '@/types';

// 测试环境无 localStorage 时补一个简易实现，覆盖「无 chrome.storage -> localStorage」降级层
if (typeof globalThis.localStorage === 'undefined') {
  const store: Record<string, string> = {};
  const mockStorage: Storage = {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => {
      store[k] = String(v);
    },
    removeItem: (k: string) => {
      delete store[k];
    },
    clear: () => {
      for (const k of Object.keys(store)) delete store[k];
    },
    get length() {
      return Object.keys(store).length;
    },
    key: (i: number) => Object.keys(store)[i] ?? null,
  };
  Object.defineProperty(globalThis, 'localStorage', { value: mockStorage, configurable: true, writable: true });
}

const state: ActiveReferenceAnalysisState = {
  requestId: 'r1',
  startTime: 1_700_000_000_000,
  status: 'running',
  promptSnapshot: 'p',
};

describe('active reference analysis storage', () => {
  beforeEach(() => {
    localStorage.clear();
    resetInMemoryStorageForTesting();
  });

  it('round-trips through the fallback storage tiers', async () => {
    expect(await getActiveReferenceAnalysis()).toBeNull();
    await setActiveReferenceAnalysis(state);
    expect(await getActiveReferenceAnalysis()).toEqual(state);
  });

  it('only clears the matching request id when one is given', async () => {
    await setActiveReferenceAnalysis(state);
    await clearActiveReferenceAnalysis('other');
    expect(await getActiveReferenceAnalysis()).toEqual(state);
    await clearActiveReferenceAnalysis('r1');
    expect(await getActiveReferenceAnalysis()).toBeNull();
  });

  it('clears unconditionally without an id', async () => {
    await setActiveReferenceAnalysis(state);
    await clearActiveReferenceAnalysis();
    expect(await getActiveReferenceAnalysis()).toBeNull();
  });
});

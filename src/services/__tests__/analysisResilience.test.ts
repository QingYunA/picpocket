import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getActiveAnalysis,
  setActiveAnalysis,
  clearActiveAnalysis,
  resetInMemoryStorageForTesting,
} from '@/utils/storage';
import type { ActiveAnalysisState, InspirationItem } from '@/types';

// Polyfill localStorage if needed in test runner environment
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
      for (const k of Object.keys(store)) {
        delete store[k];
      }
    },
    get length() {
      return Object.keys(store).length;
    },
    key: (i: number) => Object.keys(store)[i] ?? null,
  };
  Object.defineProperty(globalThis, 'localStorage', {
    value: mockStorage,
    configurable: true,
    writable: true,
  });
}

/**
 * 模拟后台 CHECK_ANALYSIS_STATUS 判定逻辑
 */
async function simulateCheckAnalysisStatus(
  itemId: number | undefined,
  activeInMemoryMap: Map<number, AbortController>
): Promise<{ isRunning: boolean; itemId?: number }> {
  if (typeof itemId === 'number') {
    const isRunningInMemory = activeInMemoryMap.has(itemId);
    if (isRunningInMemory) {
      return { isRunning: true, itemId };
    }

    // 容错：Service Worker 休眠重启后向持久化 Storage 核对有效窗口 (3分钟 = 180,000ms)
    const active = await getActiveAnalysis();
    const isStillActive = Boolean(
      active &&
      active.itemId === itemId &&
      Date.now() - (active.startTime || Date.now()) < 180000
    );
    return { isRunning: isStillActive, itemId };
  }
  return { isRunning: activeInMemoryMap.size > 0 };
}

/**
 * 模拟自愈纠偏逻辑：扫描数据库中 analyzing 状态的 items
 */
async function simulateReconcileStaleAnalyzingItems(
  items: Array<Pick<InspirationItem, 'id' | 'status'>>,
  updateFn: (id: number, patch: Partial<InspirationItem>) => Promise<void>
) {
  const active = await getActiveAnalysis();
  for (const it of items) {
    if (it.status === 'analyzing') {
      const isRunning = Boolean(
        active &&
        active.itemId === it.id &&
        Date.now() - (active.startTime || 0) < 180000
      );
      if (!isRunning && it.id) {
        await updateFn(it.id, { status: 'pending' });
      }
    }
  }
}

describe('Vision Analysis Lifecycle Resilience & Stale State Self-Healing', () => {
  beforeEach(() => {
    localStorage.clear();
    resetInMemoryStorageForTesting();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should persist and retrieve active analysis state correctly', async () => {
    const now = 1710000000000;
    vi.setSystemTime(now);

    const testState: ActiveAnalysisState = {
      itemId: 42,
      startTime: now,
      model: 'deepseek-chat',
    };

    await setActiveAnalysis(testState);
    const retrieved = await getActiveAnalysis();

    expect(retrieved).not.toBeNull();
    expect(retrieved?.itemId).toBe(42);
    expect(retrieved?.startTime).toBe(now);
    expect(retrieved?.model).toBe('deepseek-chat');
  });

  it('should auto-heal and reset stale analyzing items to pending if task was terminated', async () => {
    const fakeDbItems: Array<Pick<InspirationItem, 'id' | 'status'>> = [
      { id: 101, status: 'analyzing' }, // 模拟之前侧边栏关闭被遗弃的卡死 item
      { id: 102, status: 'analyzed' },
    ];

    const updatedMap: Record<number, string> = {};
    const mockUpdate = async (id: number, patch: Partial<InspirationItem>) => {
      if (patch.status) {
        updatedMap[id] = patch.status;
      }
    };

    // 执行启动自愈扫描
    await simulateReconcileStaleAnalyzingItems(fakeDbItems, mockUpdate);

    // 验证卡死的 item #101 已经被自动纠偏重置为 pending，解除死锁
    expect(updatedMap[101]).toBe('pending');
    expect(updatedMap[102]).toBeUndefined();
  });

  it('should keep analyzing status if task is legitimately running within 3-minute window', async () => {
    const startTime = 1710000000000;
    vi.setSystemTime(startTime);

    await setActiveAnalysis({
      itemId: 202,
      startTime,
      model: 'qwen2.5-vl',
    });

    const activeMemory = new Map<number, AbortController>();

    // 经过 40 秒（仍在 3 分钟窗口内）
    vi.advanceTimersByTime(40000);

    const status = await simulateCheckAnalysisStatus(202, activeMemory);
    expect(status.isRunning).toBe(true);

    const fakeDbItems: Array<Pick<InspirationItem, 'id' | 'status'>> = [
      { id: 202, status: 'analyzing' },
    ];
    const updatedMap: Record<number, string> = {};
    const mockUpdate = async (id: number, patch: Partial<InspirationItem>) => {
      if (patch.status) updatedMap[id] = patch.status;
    };

    // 验证正在执行中的任务不会被误判重置
    await simulateReconcileStaleAnalyzingItems(fakeDbItems, mockUpdate);
    expect(updatedMap[202]).toBeUndefined();
  });

  it('should expire and self-heal tasks exceeding 3-minute window', async () => {
    const startTime = 1710000000000;
    vi.setSystemTime(startTime);

    await setActiveAnalysis({
      itemId: 303,
      startTime,
    });

    const activeMemory = new Map<number, AbortController>();

    // 经过 180,001 毫秒（超时）
    vi.advanceTimersByTime(180001);

    const status = await simulateCheckAnalysisStatus(303, activeMemory);
    expect(status.isRunning).toBe(false);

    const fakeDbItems: Array<Pick<InspirationItem, 'id' | 'status'>> = [
      { id: 303, status: 'analyzing' },
    ];
    const updatedMap: Record<number, string> = {};
    const mockUpdate = async (id: number, patch: Partial<InspirationItem>) => {
      if (patch.status) updatedMap[id] = patch.status;
    };

    await simulateReconcileStaleAnalyzingItems(fakeDbItems, mockUpdate);
    expect(updatedMap[303]).toBe('pending');
  });

  it('should support manual cancellation and properly clean storage', async () => {
    await setActiveAnalysis({
      itemId: 404,
      startTime: Date.now(),
    });

    const controller = new AbortController();
    const activeMemory = new Map<number, AbortController>();
    activeMemory.set(404, controller);

    // 触发手动终止
    controller.abort();
    activeMemory.delete(404);
    await clearActiveAnalysis(404);

    expect(controller.signal.aborted).toBe(true);
    expect(activeMemory.has(404)).toBe(false);
    const stored = await getActiveAnalysis();
    expect(stored).toBeNull();
  });
});

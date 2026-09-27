import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  getActiveGeneration,
  setActiveGeneration,
  clearActiveGeneration,
  resetInMemoryStorageForTesting,
} from '@/utils/storage';
import type { ActiveGenerationState } from '@/types';

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
 * 模拟 MV3 Service Worker 消息分发核心中的 CHECK_GENERATION_STATUS 自愈判定逻辑
 * 与 src/entrypoints/background.ts 保持 100% 行为一致
 */
async function simulateCheckGenerationStatus(
  taskId: string | undefined,
  activeInMemoryMap: Map<string, AbortController>
): Promise<{ isRunning: boolean; taskId?: string; taskIds?: string[] }> {
  if (taskId) {
    const isRunningInMemory = activeInMemoryMap.has(taskId);
    if (isRunningInMemory) {
      return { isRunning: true, taskId };
    }

    // 容错自愈：Service Worker 休眠重启后内存 Map 清空，向持久化 Storage 核对有效窗口 (5分钟)
    const active = await getActiveGeneration();
    const isStillActive = Boolean(
      active &&
      active.taskId === taskId &&
      Date.now() - (active.startTime || Date.now()) < 300000
    );
    return { isRunning: isStillActive, taskId };
  } else {
    const activeIds = Array.from(activeInMemoryMap.keys());
    return { isRunning: activeIds.length > 0, taskIds: activeIds };
  }
}

describe('MV3 Service Worker Lifecycle Resilience & Mathematical Continuity', () => {
  beforeEach(() => {
    localStorage.clear();
    resetInMemoryStorageForTesting();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should persist and retrieve active generation state accurately', async () => {
    const now = 1710000000000;
    vi.setSystemTime(now);

    const testState: ActiveGenerationState = {
      taskId: 'task_001',
      startTime: now,
      prompt: 'A cyberpunk cityscape in heavy rain',
    };

    await setActiveGeneration(testState);
    const retrieved = await getActiveGeneration();

    expect(retrieved).not.toBeNull();
    expect(retrieved?.taskId).toBe('task_001');
    expect(retrieved?.startTime).toBe(now);
    expect(retrieved?.prompt).toBe('A cyberpunk cityscape in heavy rain');
  });

  it('should heal task state when Service Worker restarts and memory map is wiped', async () => {
    const startTime = 1710000000000;
    vi.setSystemTime(startTime);

    const activeMemory = new Map<string, AbortController>();
    activeMemory.set('task_001', new AbortController());

    await setActiveGeneration({
      taskId: 'task_001',
      startTime,
      prompt: 'Isometric 3D game asset',
    });

    // 1. 正常运行阶段：内存 Map 存在任务
    const statusBefore = await simulateCheckGenerationStatus('task_001', activeMemory);
    expect(statusBefore.isRunning).toBe(true);

    // 2. 模拟 Chrome MV3 挂起并重启 SW：内存 Map 被彻底回收（清空）
    activeMemory.clear();
    expect(activeMemory.size).toBe(0);

    // 模拟 45 秒后，用户重新展开侧边栏发起对齐
    vi.advanceTimersByTime(45000);

    // 3. 验证 SW 自愈机制：内存虽空，但核对 Storage 在有效窗口内，依然正确识别 isRunning: true
    const statusAfterHeal = await simulateCheckGenerationStatus('task_001', activeMemory);
    expect(statusAfterHeal.isRunning).toBe(true);
    expect(statusAfterHeal.taskId).toBe('task_001');

    // 4. 验证前台数学推导计算耗时：不需要秒级 IPC，直接通过时间戳精确对齐
    const recoveredState = await getActiveGeneration();
    expect(recoveredState).not.toBeNull();
    const elapsedSec = Math.max(0, Math.floor((Date.now() - (recoveredState?.startTime || 0)) / 1000));
    expect(elapsedSec).toBe(45);
  });

  it('should auto-expire stale tasks that exceed 5-minute timeout window', async () => {
    const startTime = 1710000000000;
    vi.setSystemTime(startTime);

    const activeMemory = new Map<string, AbortController>();

    await setActiveGeneration({
      taskId: 'task_stale_999',
      startTime,
      prompt: 'Unfinished stale generation',
    });

    // 模拟经过了 300,001 毫秒 (超过 5 分钟超时保护硬门禁)
    vi.advanceTimersByTime(300001);

    const status = await simulateCheckGenerationStatus('task_stale_999', activeMemory);
    expect(status.isRunning).toBe(false);
  });

  it('should clean active generation on explicit completion without touching mismatched task', async () => {
    const startTime = 1710000000000;
    vi.setSystemTime(startTime);

    await setActiveGeneration({
      taskId: 'task_current',
      startTime,
      prompt: 'Current prompt',
    });

    // 尝试清理不匹配的旧任务 ID，不应误删当前任务
    await clearActiveGeneration('task_different');
    let current = await getActiveGeneration();
    expect(current?.taskId).toBe('task_current');

    // 准确匹配清理
    await clearActiveGeneration('task_current');
    current = await getActiveGeneration();
    expect(current).toBeNull();
  });
});

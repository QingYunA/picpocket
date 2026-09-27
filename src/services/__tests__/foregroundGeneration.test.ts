import { describe, it, expect, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { db, addGenerationTask } from '../../db';
import { runForegroundGenerationTask } from '../imageGenerator';
import type { ImageGenerationParams, UserSettings } from '@/types';

const settings: UserSettings = {
  apiKey: 'sk-test',
  baseUrl: 'https://api.example.com/v1',
  model: 'vision',
  autoAnalyzeOnCapture: false,
  language: 'zh',
  imageApiKey: 'sk-image',
  imageBaseUrl: 'https://img.example.com/v1',
  imageModel: 'flux',
};
const params = { prompt: 'a cat', aspectRatio: '1:1', count: 1, model: 'flux' } as ImageGenerationParams;

async function seedTask(id: string) {
  await addGenerationTask({
    id,
    prompt: 'a cat',
    aspectRatio: '1:1',
    model: 'flux',
    images: [],
    status: 'generating',
    createdAt: Date.now(),
  });
}

describe('runForegroundGenerationTask', () => {
  beforeEach(async () => {
    await db.generationTasks.clear();
  });

  it('marks the task as foreground-executed and finalizes it on success', async () => {
    await seedTask('fg_ok');
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({ data: [{ b64_json: 'aGVsbG8=' }] }),
    })) as any;
    try {
      const result = await runForegroundGenerationTask({ taskId: 'fg_ok', params, settings, startTime: Date.now(), signal: new AbortController().signal });
      expect(result?.images).toHaveLength(1);
      const task = await db.generationTasks.get('fg_ok');
      expect(task?.status).toBe('success');
      expect(task?.executor).toBe('foreground');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('does not overwrite a task cancelled while results are being persisted', async () => {
    await seedTask('fg_late_cancel');
    const controller = new AbortController();
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({ data: [{ b64_json: 'aGVsbG8=' }] }),
    })) as any;
    const simulateCancelDuringSave = async () => {
      // 模拟用户在写入画廊期间点击取消，取消方已把任务写为 cancelled
      controller.abort();
      await db.generationTasks.update('fg_late_cancel', { status: 'cancelled' });
      return 1;
    };
    const gallerySpy = vi
      .spyOn(db.items, 'add')
      .mockImplementation(simulateCancelDuringSave as unknown as typeof db.items.add);
    try {
      const result = await runForegroundGenerationTask({
        taskId: 'fg_late_cancel',
        params,
        settings: { ...settings, autoSaveGeneratedToGallery: true },
        startTime: Date.now(),
        signal: controller.signal,
      });
      expect(result).toBeNull();
      const task = await db.generationTasks.get('fg_late_cancel');
      expect(task?.status).toBe('cancelled');
    } finally {
      gallerySpy.mockRestore();
      globalThis.fetch = originalFetch;
    }
  });

  it('returns null and leaves the status to the canceller when aborted', async () => {
    await seedTask('fg_cancel');
    const controller = new AbortController();
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn((_url: string, init: RequestInit) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () =>
          reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))
        );
      })
    ) as any;
    try {
      const pending = runForegroundGenerationTask({ taskId: 'fg_cancel', params, settings, startTime: Date.now(), signal: controller.signal });
      await vi.waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
      controller.abort();
      await expect(pending).resolves.toBeNull();
      const task = await db.generationTasks.get('fg_cancel');
      expect(task?.status).toBe('generating');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

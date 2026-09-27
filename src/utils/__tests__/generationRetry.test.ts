import { describe, it, expect, vi } from 'vitest';
import { buildRetryRequest, resolveTaskReferences } from '../generationRetry';
import type { GenerationBatchTask } from '@/types';

const baseTask: GenerationBatchTask = {
  id: 'task_1',
  prompt: 'a cat',
  aspectRatio: '16:9',
  model: 'flux',
  images: [],
  status: 'success',
  createdAt: 1,
  partialFailure: { failed: 3, requested: 4 },
  generationOptions: { quality: 'hd', negativePrompt: 'blurry', sendAsReferenceImage: false },
};

describe('buildRetryRequest', () => {
  it('replays the original options and only asks for the failed images', () => {
    expect(buildRetryRequest(baseTask)).toEqual({
      prompt: 'a cat',
      aspectRatio: '16:9',
      model: 'flux',
      count: 3,
      quality: 'hd',
      negativePrompt: 'blurry',
      sendAsReferenceImage: false,
    });
  });

  it('returns null when the task has nothing to retry', () => {
    expect(buildRetryRequest({ ...baseTask, partialFailure: undefined })).toBeNull();
    expect(buildRetryRequest({ ...baseTask, partialFailure: { failed: 0, requested: 4 } })).toBeNull();
  });

  it('falls back to safe defaults for tasks recorded before options were stored', () => {
    const legacy = { ...baseTask, generationOptions: undefined };
    expect(buildRetryRequest(legacy)).toMatchObject({ quality: 'auto', negativePrompt: '', sendAsReferenceImage: true });
  });
});

describe('resolveTaskReferences', () => {
  const loaders = {
    getMany: vi.fn(async (ids: string[]) => ids.map((id) => `data:${id}`)),
    getOne: vi.fn(async (id: string) => `data:${id}`),
  };

  it('prefers the deduplicated reference asset pool', async () => {
    const refs = await resolveTaskReferences({ ...baseTask, referenceAssetIds: ['a', 'b'] }, loaders);
    expect(refs).toEqual({ images: ['data:a', 'data:b'], assetIds: ['a', 'b'], complete: true });
  });

  it('supports the legacy single reference asset id', async () => {
    const refs = await resolveTaskReferences({ ...baseTask, referenceAssetId: 'x' }, loaders);
    expect(refs).toEqual({ images: ['data:x'], assetIds: ['x'], complete: true });
  });

  it('supports inline reference data urls', async () => {
    const refs = await resolveTaskReferences({ ...baseTask, referenceImageDataUrl: 'data:inline' }, loaders);
    expect(refs).toEqual({ images: ['data:inline'], assetIds: [], complete: true });
  });

  it('returns no references when none were recorded', async () => {
    expect(await resolveTaskReferences(baseTask, loaders)).toEqual({ images: [], assetIds: [], complete: true });
  });

  it('reports incomplete references when some pooled assets were deleted', async () => {
    const partial = { getMany: async () => ['data:a'], getOne: async () => undefined };
    const refs = await resolveTaskReferences({ ...baseTask, referenceAssetIds: ['a', 'b'] }, partial);
    expect(refs.complete).toBe(false);
  });

  it('reports incomplete references when the single legacy asset is gone', async () => {
    const empty = { getMany: async () => [], getOne: async () => undefined };
    const refs = await resolveTaskReferences({ ...baseTask, referenceAssetId: 'gone' }, empty);
    expect(refs.complete).toBe(false);
  });
});

import { describe, it, expect, beforeEach } from 'vitest';
import {
  getActiveTab,
  saveActiveTab,
  getInitialActiveTab,
  getGeneratorDraft,
  saveGeneratorDraft,
  getInitialGeneratorDraft,
  DEFAULT_GENERATOR_DRAFT,
  resetInMemoryStorageForTesting,
  getActiveGeneration,
  setActiveGeneration,
  clearActiveGeneration,
  getActiveFolder,
  setActiveFolder,
  getPendingAutoAnalyzeItemId,
  setPendingAutoAnalyzeItemId,
} from '../storage';

// Type-safe localStorage polyfill in Node/Vitest environment
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

describe('Tab and Draft Storage', () => {
  beforeEach(() => {
    localStorage.clear();
    resetInMemoryStorageForTesting();
  });

  describe('Active Tab Persistence', () => {
    it('should default to gallery if nothing stored', async () => {
      const tab = await getActiveTab();
      expect(tab).toBe('gallery');
      expect(getInitialActiveTab()).toBe('gallery');
    });

    it('should persist and retrieve active tab correctly', async () => {
      await saveActiveTab('generator');
      expect(getInitialActiveTab()).toBe('generator');
      const tab = await getActiveTab();
      expect(tab).toBe('generator');

      await saveActiveTab('prompts');
      expect(getInitialActiveTab()).toBe('prompts');
      expect(await getActiveTab()).toBe('prompts');
    });

    it('should fallback to gallery if an invalid tab string is stored', async () => {
      localStorage.setItem('promptsnap_active_tab', 'invalid_tab');
      expect(getInitialActiveTab()).toBe('gallery');
      expect(await getActiveTab()).toBe('gallery');
    });
  });

  describe('Generator Draft Persistence', () => {
    it('should return default draft when none is stored', async () => {
      const draft = await getGeneratorDraft();
      expect(draft).toEqual(DEFAULT_GENERATOR_DRAFT);
      expect(draft.count).toBe(1);
      expect(draft.aspectRatio).toBe('1:1');
    });

    it('should persist and retrieve modified draft fields (e.g. Type 4 count and custom prompt)', async () => {
      await saveGeneratorDraft({
        prompt: 'A futuristic cyber city',
        count: 4,
        aspectRatio: '16:9',
        negativePrompt: 'blurry, low quality',
        showAdvanced: true,
      });

      const initial = getInitialGeneratorDraft();
      expect(initial.prompt).toBe('A futuristic cyber city');
      expect(initial.count).toBe(4);
      expect(initial.aspectRatio).toBe('16:9');
      expect(initial.showAdvanced).toBe(true);

      const asyncDraft = await getGeneratorDraft();
      expect(asyncDraft.prompt).toBe('A futuristic cyber city');
      expect(asyncDraft.count).toBe(4);
      expect(asyncDraft.negativePrompt).toBe('blurry, low quality');
    });

    it('should strip bulky referenceImage from disk payload when referenceAssetId is provided', async () => {
      const hugeDataUrl = 'data:image/png;base64,' + 'A'.repeat(5000);
      const testAssetId = 'sha256_mock_hash_12345';

      await saveGeneratorDraft({
        prompt: 'Cat with reference',
        referenceImage: hugeDataUrl,
        referenceAssetId: testAssetId,
      });

      // In-memory cache preserves referenceImage for instantaneous UI display
      const memoryDraft = getInitialGeneratorDraft();
      expect(memoryDraft.referenceImage).toBe(hugeDataUrl);
      expect(memoryDraft.referenceAssetId).toBe(testAssetId);

      // Verify that disk storage omitted the huge DataURL to protect quota
      const rawStored = localStorage.getItem('promptsnap_generator_draft');
      expect(rawStored).toBeTruthy();
      const parsed = JSON.parse(rawStored!);
      expect(parsed.referenceAssetId).toBe(testAssetId);
      expect(parsed.referenceImage).toBeNull();
    });
  });

  describe('Active Generation State Persistence', () => {
    it('returns null when no active generation task exists', async () => {
      expect(await getActiveGeneration()).toBeNull();
    });

    it('persists and clears active generation state correctly', async () => {
      const mockTask = {
        taskId: 'task_123456789',
        startTime: Date.now(),
        prompt: 'Generating an awesome artwork',
      };

      await setActiveGeneration(mockTask);
      expect(await getActiveGeneration()).toEqual(mockTask);

      // Clearing with mismatched taskId does not clear
      await clearActiveGeneration('different_task_id');
      expect(await getActiveGeneration()).toEqual(mockTask);

      // Clearing with matching taskId removes it
      await clearActiveGeneration('task_123456789');
      expect(await getActiveGeneration()).toBeNull();
    });
  });

  describe('Active Folder Persistence', () => {
    it('returns null when no active folder is set', async () => {
      expect(await getActiveFolder()).toBeNull();
    });

    it('persists and retrieves active folder state correctly', async () => {
      const folderState = { id: 42 as const };
      await setActiveFolder(folderState);
      expect(await getActiveFolder()).toEqual(folderState);

      const inboxState = { id: 'inbox' as const };
      await setActiveFolder(inboxState);
      expect(await getActiveFolder()).toEqual(inboxState);

      const allState = { id: null };
      await setActiveFolder(allState);
      expect(await getActiveFolder()).toEqual(allState);
    });
  });

  describe('Pending Auto Analyze Item ID Persistence', () => {
    it('returns null when no pending item exists', async () => {
      expect(await getPendingAutoAnalyzeItemId()).toBeNull();
    });

    it('persists and clears pending auto analyze item id', async () => {
      await setPendingAutoAnalyzeItemId(108);
      expect(await getPendingAutoAnalyzeItemId()).toBe(108);

      await setPendingAutoAnalyzeItemId(null);
      expect(await getPendingAutoAnalyzeItemId()).toBeNull();
    });
  });
});

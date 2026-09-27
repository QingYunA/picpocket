import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { db, toggleFavoritePrompt } from '../index';
import { savePromptFromAnalysis } from '../../services/promptRuntime';
import type { InspirationItem, PromptResult, PromptSource, PromptItem } from '../../types';

describe('Prompt Database Operations', () => {
  beforeEach(async () => {
    await db.promptItems.clear();
    await db.promptSources.clear();
  });

  it('can store and query prompt sources', async () => {
    const source: PromptSource = {
      id: 'src-1',
      name: 'Test Source',
      url: 'https://example.com/source.json',
      homepage: 'https://example.com',
      enabled: true,
      builtIn: true,
    };

    await db.promptSources.put(source);
    const retrieved = await db.promptSources.get('src-1');
    expect(retrieved).toBeDefined();
    expect(retrieved?.name).toBe('Test Source');
  });

  it('can save prompt items and search with multi-entry tags index', async () => {
    const item1: PromptItem = {
      id: 'p-1',
      sourceId: 'src-1',
      category: 'Test Source',
      title: 'Neon City',
      prompt: 'A futuristic city glowing with neon lights',
      tags: ['cyberpunk', 'city', 'neon'],
    };

    const item2: PromptItem = {
      id: 'p-2',
      sourceId: 'src-1',
      category: 'Test Source',
      title: 'Fantasy Forest',
      prompt: 'Enchanted forest with mythical creatures',
      tags: ['fantasy', 'nature'],
    };

    await db.promptItems.bulkPut([item1, item2]);

    // Query via multi-entry *tags index
    const cyberpunkItems = await db.promptItems.where('tags').equals('cyberpunk').toArray();
    expect(cyberpunkItems.length).toBe(1);
    expect(cyberpunkItems[0]?.title).toBe('Neon City');

    const allItems = await db.promptItems.toArray();
    expect(allItems.length).toBe(2);
  });

  it('can save analyzed prompt into local vault and toggle favorite', async () => {
    const item: InspirationItem = {
      id: 101,
      originalBlob: new Blob(['fake-img'], { type: 'image/png' }),
      pageTitle: 'Awesome Concept Art',
      tags: ['concept', 'game'],
      status: 'analyzed',
      createdAt: Date.now(),
    };

    const promptResult: PromptResult = {
      id: 201,
      itemId: 101,
      model: 'deepseek-chat',
      subject: ['cyborg warrior'],
      style: ['unreal engine 5', 'cinematic'],
      lighting: ['dramatic rim lighting'],
      composition: ['wide angle'],
      masterPrompt: 'cyborg warrior, unreal engine 5, dramatic rim lighting, wide angle',
      createdAt: Date.now(),
    };

    const saved = await savePromptFromAnalysis(item, promptResult);
    expect(saved.sourceId).toBe('my-vault');
    expect(saved.title).toBe('Awesome Concept Art');
    expect(saved.prompt).toBe(promptResult.masterPrompt);
    expect(saved.blocks?.subject).toContain('cyborg warrior');
    expect(saved.isFavorite).toBe(true);

    const fromDb = await db.promptItems.get(saved.id);
    expect(fromDb).toBeDefined();
    expect(fromDb?.isFavorite).toBe(true);

    // Toggle favorite
    const toggled = await toggleFavoritePrompt(saved.id);
    expect(toggled).toBe(false);
    const fromDbAfter = await db.promptItems.get(saved.id);
    expect(fromDbAfter?.isFavorite).toBe(false);
  });

  it('can clean up deprecated sources and their prompt items', async () => {
    const deprecatedSourceId = 'banana-prompt-quicker';
    await db.promptSources.put({
      id: deprecatedSourceId,
      name: 'Banana Prompt Quicker',
      url: 'https://example.com/banana.json',
      homepage: 'https://example.com',
      enabled: false,
      builtIn: true,
    });
    await db.promptItems.put({
      id: 'old-item-1',
      sourceId: deprecatedSourceId,
      category: 'Banana',
      title: 'Old Prompt',
      prompt: 'old prompt text',
      tags: ['old'],
    });

    // Verify they exist
    expect(await db.promptSources.get(deprecatedSourceId)).toBeDefined();
    expect(await db.promptItems.get('old-item-1')).toBeDefined();

    // Run cleanup
    const { cleanupDeprecatedSources } = await import('../../services/promptRuntime');
    await cleanupDeprecatedSources();

    // Verify they are removed
    expect(await db.promptSources.get(deprecatedSourceId)).toBeUndefined();
    expect(await db.promptItems.get('old-item-1')).toBeUndefined();
  });
});

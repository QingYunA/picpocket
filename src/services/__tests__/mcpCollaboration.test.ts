import { describe, it, expect, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { db } from '@/db';
import {
  executeSearchPromptsAndAssets,
  executeManageFolders,
  executeSaveAsset,
  executeSavePrompt,
  executeUpdateTags,
  executeGenerateAndSaveAsset,
  mcpManager,
} from '../mcpCollaboration';
import { generateImagesWithAI } from '../imageGenerator';

import type { UserSettings } from '@/types';
import { DEFAULT_SETTINGS } from '@/utils/storage';

vi.mock('../imageGenerator', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../imageGenerator')>();
  return {
    ...actual,
    generateImagesWithAI: vi.fn(async (params: any) => [
      {
        id: 'test-gen-img-1',
        dataUrl: 'data:image/png;base64,mockGeneratedDataUrl',
        prompt: params.prompt,
        aspectRatio: params.aspectRatio,
        width: 1024,
        height: 1024,
        createdAt: Date.now(),
        model: params.model || 'test-model',
      },
    ]),
  };
});

describe('mcpCollaboration Tool Handlers', () => {
  beforeEach(async () => {
    await db.items.clear();
    await db.prompts.clear();
    await db.folders.clear();
    await db.promptItems.clear();
  });

  describe('Permission Interception & Actionable Feedback', () => {
    it('blocks search when read permission is disabled with actionable error message', async () => {
      const result = await executeSearchPromptsAndAssets(
        { query: 'cyberpunk' },
        { read: false, write: true, generate: true }
      );

      expect(result.isError).toBe(true);
      expect(result.content[0]!.text).toContain('权限拦截');
      expect(result.content[0]!.text).toContain('允许读取资产与提示词');
    });

    it('blocks folder creation when write permission is disabled', async () => {
      const result = await executeManageFolders(
        { action: 'create', name: 'New Folder' },
        { read: true, write: false, generate: true }
      );

      expect(result.isError).toBe(true);
      expect(result.content[0]!.text).toContain('权限拦截');
      expect(result.content[0]!.text).toContain('写入');
    });

    it('blocks image generation when generate permission is disabled', async () => {
      const settings: UserSettings = {
        ...DEFAULT_SETTINGS,
        apiKey: 'test-key',
        imageApiKey: 'test-key',
      };

      const result = await executeGenerateAndSaveAsset(
        { prompt: 'a cute cat', aspectRatio: '16:9' },
        { read: true, write: true, generate: false },
        settings
      );

      expect(result.isError).toBe(true);
      expect(result.content[0]!.text).toContain('权限拦截');
      expect(result.content[0]!.text).toContain('生图');
    });
  });

  describe('manage_folders', () => {
    it('lists empty folders and creates new folder', async () => {
      const permissions = { read: true, write: true, generate: true };

      // List initial empty
      const listRes = await executeManageFolders({ action: 'list' }, permissions);
      expect(listRes.isError).toBe(false);
      expect(listRes.content[0]!.text).toContain('共 0 个文件夹');

      // Create new folder
      const createRes = await executeManageFolders(
        { action: 'create', name: '赛博朋克' },
        permissions
      );
      expect(createRes.isError).toBe(false);
      expect(createRes.content[0]!.text).toContain('创建文件夹成功');
      expect(createRes.content[0]!.text).toContain('赛博朋克');

      const folders = await db.folders.toArray();
      expect(folders).toHaveLength(1);
      expect(folders[0]!.name).toBe('赛博朋克');
    });
  });

  describe('search_prompts_and_assets', () => {
    it('finds items matching query in pageTitle or promptItems', async () => {
      const permissions = { read: true, write: true, generate: true };

      // Insert dummy promptItem
      await db.promptItems.add({
        id: 'test-prompt-1',
        sourceId: 'curated',
        title: 'Neon Cyberpunk Samurai',
        prompt: 'A cyberpunk samurai standing in neon rain, 8k, cinematic',
        tags: ['cyberpunk', 'samurai', 'neon'],
        category: 'Character',
        isFavorite: true,
        createdAt: new Date().toISOString(),
      });

      const res = await executeSearchPromptsAndAssets({ query: 'samurai' }, permissions);
      expect(res.isError).toBe(false);
      expect(res.content[0]!.text).toContain('Neon Cyberpunk Samurai');
      expect(res.content[0]!.text).toContain('cyberpunk samurai standing in neon rain');

      // Test with matching tag
      const tagMatchRes = await executeSearchPromptsAndAssets({ tags: ['neon'] }, permissions);
      expect(tagMatchRes.isError).toBe(false);
      expect(tagMatchRes.content[0]!.text).toContain('Neon Cyberpunk Samurai');

      // Test with non-matching tag
      const tagMismatchRes = await executeSearchPromptsAndAssets({ tags: ['vintage-oil-painting'] }, permissions);
      expect(tagMismatchRes.isError).toBe(false);
      expect(tagMismatchRes.content[0]!.text).toContain('找到 0 条匹配素材/提示词');
    });
  });


  describe('save_asset', () => {
    it('saves external dataUrl and assigns to specified folder', async () => {
      const permissions = { read: true, write: true, generate: true };
      const fakeDataUrl =
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

      const res = await executeSaveAsset(
        {
          dataUrl: fakeDataUrl,
          prompt: 'a futuristic city',
          title: 'Cyber City Asset',
          aspectRatio: '16:9',
          folderName: 'Architecture',
          tags: ['architecture', 'future'],
        },
        permissions
      );

      expect(res.isError).toBe(false);
      expect(res.content[0]!.text).toContain('保存成功');
      expect(res.content[0]!.text).toContain('Cyber City Asset');

      const items = await db.items.toArray();
      expect(items).toHaveLength(1);
      expect(items[0]!.pageTitle).toBe('Cyber City Asset');
      expect(items[0]!.tags).toContain('architecture');
      expect(items[0]!.tags).toContain('16:9');

      const promptRec = await db.prompts.where('itemId').equals(items[0]!.id!).first();
      expect(promptRec?.style).toContain('16:9');

      const folders = await db.folders.toArray();
      expect(folders).toHaveLength(1);
      expect(folders[0]!.name).toBe('Architecture');
      expect(items[0]!.folderId).toBe(folders[0]!.id);
    });
  });

  describe('save_prompt', () => {
    it('blocks saving prompt when write permission is disabled', async () => {
      const res = await executeSavePrompt(
        { prompt: 'masterpiece prompt' },
        { read: true, write: false, generate: true }
      );
      expect(res.isError).toBe(true);
      expect(res.content[0]!.text).toContain('权限拦截');
    });

    it('blocks empty prompt', async () => {
      const res = await executeSavePrompt(
        { prompt: '   ' },
        { read: true, write: true, generate: true }
      );
      expect(res.isError).toBe(true);
      expect(res.content[0]!.text).toContain('必须提供非空的 prompt');
    });

    it('saves refined prompt to db.promptItems successfully', async () => {
      const res = await executeSavePrompt(
        {
          prompt: 'photorealistic neon cyberpunk girl, cinematic lighting, 8k resolution',
          title: 'Cyberpunk Portrait',
          category: '人物肖像',
          tags: ['赛博朋克', '肖像'],
        },
        { read: true, write: true, generate: true }
      );

      expect(res.isError).toBe(false);
      expect(res.content[0]!.text).toContain('提示词保存成功');

      const prompts = await db.promptItems.toArray();
      expect(prompts).toHaveLength(1);
      expect(prompts[0]!.title).toBe('Cyberpunk Portrait');
      expect(prompts[0]!.prompt).toContain('photorealistic neon cyberpunk girl');
      expect(prompts[0]!.category).toBe('人物肖像');
      expect(prompts[0]!.tags).toContain('赛博朋克');
      expect(prompts[0]!.isCustom).toBe(true);
    });
  });

  describe('generate_and_save_asset config guard', () => {
    it('returns actionable error when image API key is missing', async () => {
      const settings: UserSettings = {
        ...DEFAULT_SETTINGS,
        apiKey: '',
        imageApiKey: '',
      };

      const result = await executeGenerateAndSaveAsset(
        { prompt: 'a cat', aspectRatio: '16:9' },
        { read: true, write: true, generate: true },
        settings
      );

      expect(result.isError).toBe(true);
      expect(result.content[0]!.text).toContain('未配置有效生图 API Key');
    });
  });

  describe('generate_and_save_asset reference image support (img2img)', () => {
    const validSettings: UserSettings = {
      ...DEFAULT_SETTINGS,
      apiKey: 'test-key',
      imageApiKey: 'test-key',
      imageModel: 'flux-dev',
    };
    const permissions = { read: true, write: true, generate: true };

    it('returns error when referenceAssetId is invalid number', async () => {
      const res = await executeGenerateAndSaveAsset(
        { prompt: 'cyberpunk girl', referenceAssetId: 'abc' as any },
        permissions,
        validSettings
      );
      expect(res.isError).toBe(true);
      expect(res.content[0]!.text).toContain('参数错误');
      expect(res.content[0]!.text).toContain('referenceAssetId 必须为有效数字 ID');
    });

    it('returns error when referenceAssetId does not exist in library', async () => {
      const res = await executeGenerateAndSaveAsset(
        { prompt: 'cyberpunk girl', referenceAssetId: 99999 },
        permissions,
        validSettings
      );
      expect(res.isError).toBe(true);
      expect(res.content[0]!.text).toContain('参考图未找到');
      expect(res.content[0]!.text).toContain('ID 为 99999');
    });

    it('returns error when asset exists but originalBlob is missing', async () => {
      const assetId = await db.items.add({
        originalBlob: null as any,
        thumbnailBlob: new Blob(['fake-thumb']),
        pageTitle: '损坏的素材',
        aspectRatio: 1,
        createdAt: Date.now(),
        tags: ['corrupted'],
        status: 'analyzed',
      });

      const res = await executeGenerateAndSaveAsset(
        { prompt: 'cyberpunk girl', referenceAssetId: assetId },
        permissions,
        validSettings
      );
      expect(res.isError).toBe(true);
      expect(res.content[0]!.text).toContain('参考图数据损坏');
      expect(res.content[0]!.text).toContain(`资产 ID 为 ${assetId}`);
    });

    it('generates image with reference asset from local library', async () => {
      const assetId = await db.items.add({
        originalBlob: new Blob(['fake-image-bytes'], { type: 'image/png' }),
        thumbnailBlob: new Blob(['fake-thumb']),
        pageTitle: '小浣熊头像原型',
        aspectRatio: 1,
        createdAt: Date.now(),
        tags: ['raccoon', 'avatar'],
        status: 'analyzed',
      });

      const res = await executeGenerateAndSaveAsset(
        {
          prompt: 'a cute raccoon holding a coffee cup',
          aspectRatio: '1:1',
          referenceAssetId: assetId,
          folderName: '小浣熊漫画',
        },
        permissions,
        validSettings
      );

      expect(res.isError).toBe(false);
      expect(res.content[0]!.text).toContain('生图成功');
      expect(res.content[0]!.text).toContain(`资产 ID: ${assetId}`);
      expect(res.content[0]!.text).toContain('小浣熊头像原型');

      // Verify generateImagesWithAI called with reference image
      expect(generateImagesWithAI).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: 'a cute raccoon holding a coffee cup',
          sendAsReferenceImage: true,
          referenceImageDataUrl: expect.stringMatching(/^data:/),
        }),
        validSettings
      );

      // Verify newly saved item in DB has img2img tag
      const items = await db.items.toArray();
      const generatedItem = items.find((i) => i.id !== assetId);
      expect(generatedItem).toBeDefined();
      expect(generatedItem?.tags).toContain('img2img');
    });

    it('generates image with external referenceImageUrl', async () => {
      const fakeRefDataUrl = 'data:image/png;base64,externalRefMockData';

      const res = await executeGenerateAndSaveAsset(
        {
          prompt: 'futuristic city skyline',
          aspectRatio: '16:9',
          referenceImageUrl: fakeRefDataUrl,
        },
        permissions,
        validSettings
      );

      expect(res.isError).toBe(false);
      expect(res.content[0]!.text).toContain('生图成功');
      expect(res.content[0]!.text).toContain('垫图参考图');

      expect(generateImagesWithAI).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: 'futuristic city skyline',
          sendAsReferenceImage: true,
          referenceImageDataUrl: fakeRefDataUrl,
        }),
        validSettings
      );
    });
  });

  describe('update_tags tool handler', () => {
    it('blocks update_tags when write permission is disabled', async () => {
      const result = await executeUpdateTags(
        { itemId: 1, tags: ['tag1'] },
        { read: true, write: false, generate: true }
      );
      expect(result.isError).toBe(true);
      expect(result.content[0]!.text).toContain('权限拦截');
    });

    it('updates item tags in append mode without duplicates', async () => {
      const itemId = await db.items.add({
        originalBlob: new Blob(['test']),
        thumbnailBlob: new Blob(['test']),
        aspectRatio: 1,
        createdAt: Date.now(),
        tags: ['existing'],
        status: 'analyzed',
      });

      const result = await executeUpdateTags(
        { itemId, tags: ['new-tag', 'existing'] },
        { read: true, write: true, generate: true }
      );

      expect(result.isError).toBe(false);
      const updated = await db.items.get(itemId);
      expect(updated?.tags).toEqual(['existing', 'new-tag']);
    });

    it('replaces item tags in replace mode', async () => {
      const itemId = await db.items.add({
        originalBlob: new Blob(['test']),
        thumbnailBlob: new Blob(['test']),
        aspectRatio: 1,
        createdAt: Date.now(),
        tags: ['old1', 'old2'],
        status: 'analyzed',
      });

      const result = await executeUpdateTags(
        { itemId, tags: ['replaced'], mode: 'replace' },
        { read: true, write: true, generate: true }
      );

      expect(result.isError).toBe(false);
      const updated = await db.items.get(itemId);
      expect(updated?.tags).toEqual(['replaced']);
    });

    it('updates prompt item tags', async () => {
      const promptId = 'prompt-123';
      await db.promptItems.add({
        id: promptId,
        sourceId: 'test',
        category: 'test',
        title: 'test',
        prompt: 'a prompt',
        tags: ['prompt-tag'],
        isCustom: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const result = await executeUpdateTags(
        { promptId, tags: ['appended-tag'] },
        { read: true, write: true, generate: true }
      );

      expect(result.isError).toBe(false);
      const updated = await db.promptItems.get(promptId);
      expect(updated?.tags).toContain('appended-tag');
      expect(updated?.tags).toContain('prompt-tag');
    });
  });

  describe('mcpManager connection and log lifecycle', () => {
    it('manages state subscriptions and initial state correctly', () => {
      expect(mcpManager.getState()).toBe('disconnected');

      const stateHistory: string[] = [];
      const unsub = mcpManager.subscribeState((st) => stateHistory.push(st));

      expect(stateHistory).toContain('disconnected');
      mcpManager.stop();
      expect(mcpManager.getState()).toBe('disconnected');
      unsub();
    });

    it('manages log subscription and clear logs', () => {
      mcpManager.clearLogs();
      expect(mcpManager.getLogs()).toEqual([]);

      const logsHistory: any[] = [];
      const unsub = mcpManager.subscribeLogs((logs) => logsHistory.push(logs));

      expect(logsHistory.length).toBeGreaterThanOrEqual(1);
      mcpManager.clearLogs();
      expect(mcpManager.getLogs()).toHaveLength(0);
      unsub();
    });
  });
});


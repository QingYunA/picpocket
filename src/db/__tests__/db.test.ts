import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { db } from '../index';

describe('InspirationDatabase (Dexie)', () => {
  beforeEach(async () => {
    await db.items.clear();
    await db.prompts.clear();
  });

  it('should save and retrieve an inspiration item', async () => {
    const fakeBlob = new Blob(['fake image data'], { type: 'image/png' });
    const id = await db.items.add({
      originalBlob: fakeBlob,
      createdAt: Date.now(),
      tags: ['3D', 'Render'],
      status: 'pending',
    });

    expect(id).toBeDefined();
    const item = await db.items.get(id);
    expect(item?.tags).toEqual(['3D', 'Render']);
    expect(item?.status).toBe('pending');
  });

  it('should save and query prompt results associated with an item', async () => {
    const fakeBlob = new Blob(['image'], { type: 'image/jpeg' });
    const itemId = (await db.items.add({
      originalBlob: fakeBlob,
      createdAt: Date.now(),
      tags: ['Portrait'],
      status: 'analyzed',
    })) as number;

    const promptId = await db.prompts.add({
      itemId,
      model: 'deepseek-v4.1-flash',
      subject: ['机械猫', '义眼'],
      style: ['虚幻引擎5'],
      lighting: ['体积雾'],
      composition: ['85mm 特写'],
      masterPrompt: 'Cyberpunk mechanical cat with glowing eye, UE5 render',
      latencyMs: 280,
      createdAt: Date.now(),
    });

    expect(promptId).toBeDefined();
    const prompt = await db.prompts.where('itemId').equals(itemId).first();
    expect(prompt?.subject).toContain('机械猫');
    expect(prompt?.latencyMs).toBe(280);
  });

  it('should gracefully handle cropImage and createThumbnail in headless test environments', async () => {
    const { createThumbnail, cropImage, dataUrlToBlob } = await import('../index');
    const fakeBlob = new Blob(['image payload'], { type: 'image/png' });

    // Test dataUrlToBlob
    const sampleDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const parsedBlob = dataUrlToBlob(sampleDataUrl);
    expect(parsedBlob).toBeInstanceOf(Blob);
    expect(parsedBlob.size).toBeGreaterThan(0);
    expect(parsedBlob.type).toBe('image/png');

    // In node/fake-indexeddb environment without window.createImageBitmap, it should safely fallback
    const thumbResult = await createThumbnail(fakeBlob, 400);
    expect(thumbResult.thumbnailBlob).toBeDefined();
    expect(thumbResult.width).toBe(400);

    const cropResult = await cropImage(sampleDataUrl, {
      x: 0,
      y: 0,
      width: 1,
      height: 1,
      dpr: 1,
    });
    expect(cropResult.croppedBlob).toBeDefined();
  });

  it('should save generated image to gallery and prompt library', async () => {
    const { saveGeneratedImageToGallery, saveGeneratedImageToPromptLibrary } = await import('../index');
    const sampleImage = {
      id: 'gen_123',
      dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      prompt: 'A tiny cute robot with glowing eyes',
      aspectRatio: '1:1' as const,
      width: 1024,
      height: 1024,
      createdAt: Date.now(),
    };

    // 1. Save to gallery
    const galleryId = await saveGeneratedImageToGallery(sampleImage);
    expect(galleryId).toBeGreaterThan(0);

    const item = await db.items.get(galleryId);
    expect(item).toBeDefined();
    expect(item?.tags).toContain('AI生图');
    expect(item?.status).toBe('generated');
    expect(item?.sourceUrl).toBe('ai-generation');

    const promptResult = await db.prompts.where('itemId').equals(galleryId).first();
    expect(promptResult).toBeDefined();
    expect(promptResult?.masterPrompt).toBe(sampleImage.prompt);
    expect(promptResult?.isOriginalPrompt).toBe(true);

    // 2. Save to prompt library
    const promptItemId = await saveGeneratedImageToPromptLibrary(sampleImage);
    expect(promptItemId).toContain('user_gen_');
    const promptItem = await db.promptItems.get(promptItemId);
    expect(promptItem).toBeDefined();
    expect(promptItem?.sourceId).toBe('my-vault');
    expect(promptItem?.category).toBe('my-vault');
  });

  it('should support folder creation, renaming, item moving and cascading deletion', async () => {
    const { createFolder, renameFolder, deleteFolder, moveItemToFolder } = await import('../index');
    await db.folders.clear();

    // 1. Create root folder
    const rootFolderId = await createFolder('设计灵感');
    expect(rootFolderId).toBeGreaterThan(0);
    let folder = await db.folders.get(rootFolderId);
    expect(folder?.name).toBe('设计灵感');
    expect(folder?.parentId).toBeNull();

    // 2. Create subfolder
    const subFolderId = await createFolder('UI 组件', rootFolderId);
    const subFolder = await db.folders.get(subFolderId);
    expect(subFolder?.name).toBe('UI 组件');
    expect(subFolder?.parentId).toBe(rootFolderId);

    // 3. Rename folder
    await renameFolder(rootFolderId, '品牌设计');
    folder = await db.folders.get(rootFolderId);
    expect(folder?.name).toBe('品牌设计');

    // 4. Move item to folder
    const fakeBlob = new Blob(['sample'], { type: 'image/png' });
    const itemId = (await db.items.add({
      originalBlob: fakeBlob,
      createdAt: Date.now(),
      tags: ['Design'],
      status: 'pending',
    })) as number;

    await moveItemToFolder(itemId, subFolderId);
    let item = await db.items.get(itemId);
    expect(item?.folderId).toBe(subFolderId);

    // 5. Delete root folder (should cascade delete subfolder and uncategorize items)
    await deleteFolder(rootFolderId);
    const deletedRoot = await db.folders.get(rootFolderId);
    const deletedSub = await db.folders.get(subFolderId);
    expect(deletedRoot).toBeUndefined();
    expect(deletedSub).toBeUndefined();

    // Item should now be uncategorized (folderId === null)
    item = await db.items.get(itemId);
    expect(item?.folderId).toBeNull();

    // 6. Test multiple root folders order calculation
    const root1 = await createFolder('Folder A');
    const root2 = await createFolder('Folder B');
    const root3 = await createFolder('Folder C');
    const f1 = await db.folders.get(root1);
    const f2 = await db.folders.get(root2);
    const f3 = await db.folders.get(root3);
    expect(f1?.order).toBe(1);
    expect(f2?.order).toBe(2);
    expect(f3?.order).toBe(3);
  });

  it('should support batch moving and batch deleting items', async () => {
    const { batchMoveItemsToFolder, batchDeleteItems, createFolder } = await import('../index');
    await db.folders.clear();
    const folderA = await createFolder('Folder A');

    const fakeBlob = new Blob(['sample'], { type: 'image/png' });
    const id1 = (await db.items.add({
      originalBlob: fakeBlob,
      createdAt: Date.now(),
      tags: ['Test1'],
      status: 'pending',
    })) as number;

    const id2 = (await db.items.add({
      originalBlob: fakeBlob,
      createdAt: Date.now(),
      tags: ['Test2'],
      status: 'pending',
    })) as number;

    const id3 = (await db.items.add({
      originalBlob: fakeBlob,
      createdAt: Date.now(),
      tags: ['Test3'],
      status: 'pending',
    })) as number;

    await db.prompts.add({
      itemId: id1,
      model: 'test-model',
      subject: ['test'],
      style: [],
      lighting: [],
      composition: [],
      masterPrompt: 'prompt 1',
      createdAt: Date.now(),
    });

    // 1. Batch move id1 and id2 to folderA
    await batchMoveItemsToFolder([id1, id2], folderA);
    const item1 = await db.items.get(id1);
    const item2 = await db.items.get(id2);
    const item3 = await db.items.get(id3);
    expect(item1?.folderId).toBe(folderA);
    expect(item2?.folderId).toBe(folderA);
    expect(item3?.folderId).toBeUndefined();

    // 2. Batch delete id1 and id3
    await batchDeleteItems([id1, id3]);
    const deleted1 = await db.items.get(id1);
    const deleted3 = await db.items.get(id3);
    const remaining2 = await db.items.get(id2);
    expect(deleted1).toBeUndefined();
    expect(deleted3).toBeUndefined();
    expect(remaining2).toBeDefined();

    // Associated prompt should be deleted too
    const prompt1 = await db.prompts.where('itemId').equals(id1).first();
    expect(prompt1).toBeUndefined();
  });
});


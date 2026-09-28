import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { db } from '../../db';
import { buildFullBackupArchive, createZipArchive } from '../storageBackup';
import { restoreFromBackupFile } from '../backupRestore';

// 1x1 PNG / JPEG 文件头，用于按内容识别图片类型
const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 5, 6, 7, 8]);
const PNG_DATA_URL = 'data:image/png;base64,iVBORw0KGgoBAgME';

async function clearAll() {
  await Promise.all([
    db.items.clear(),
    db.prompts.clear(),
    db.folders.clear(),
    db.promptItems.clear(),
    db.promptSources.clear(),
    db.generationTasks.clear(),
    db.referenceAssets.clear(),
  ]);
}

async function seed() {
  const parentId = await db.folders.add({ name: '人像', parentId: null, order: 1, createdAt: 1 });
  const childId = await db.folders.add({ name: '胶片', parentId, order: 1, createdAt: 2 });
  const itemId = await db.items.add({
    originalBlob: new Blob([JPEG_BYTES], { type: 'image/jpeg' }),
    sourceUrl: 'https://example.com/a.jpg',
    pageTitle: 'Example',
    width: 800,
    height: 600,
    aspectRatio: 4 / 3,
    createdAt: 1000,
    tags: ['portrait'],
    status: 'analyzed',
    folderId: childId,
  });
  await db.prompts.add({
    itemId,
    model: 'm',
    subject: ['猫'],
    style: [],
    lighting: [],
    composition: [],
    masterPrompt: 'a cat',
    createdAt: 1100,
  });
  await db.promptItems.add({ id: 'p1', sourceId: 's', title: 'T', prompt: 'P', tags: [], category: 'custom', createdAt: '2026-01-01' });
  await db.referenceAssets.add({ id: 'ref1', dataUrl: PNG_DATA_URL, createdAt: 5 });
  await db.generationTasks.add({
    id: 'task1',
    prompt: 'x',
    aspectRatio: '1:1',
    model: 'm',
    referenceAssetId: 'ref1',
    images: [{ id: 'img1', dataUrl: PNG_DATA_URL, prompt: 'x', aspectRatio: '1:1', width: 1, height: 1, createdAt: 9 }],
    status: 'success',
    createdAt: 9,
  });
}

describe('restoreFromBackupFile', () => {
  beforeEach(clearAll);

  it('round-trips a full ZIP backup into an empty library', async () => {
    await seed();
    const { blob } = await buildFullBackupArchive();
    await clearAll();

    const res = await restoreFromBackupFile(blob);

    expect(res).toMatchObject({ itemsRestored: 1, analysesRestored: 1, tasksRestored: 1, promptsRestored: 1, foldersRestored: 2 });
    const [item] = await db.items.toArray();
    expect(item).toMatchObject({ sourceUrl: 'https://example.com/a.jpg', pageTitle: 'Example', createdAt: 1000, tags: ['portrait'], status: 'analyzed' });
    expect(item!.originalBlob.type).toBe('image/jpeg');
    expect(item!.originalBlob.size).toBe(JPEG_BYTES.length);

    const child = await db.folders.get(item!.folderId!);
    expect(child?.name).toBe('胶片');
    expect((await db.folders.get(child!.parentId!))?.name).toBe('人像');

    const [analysis] = await db.prompts.toArray();
    expect(analysis!.itemId).toBe(item!.id);

    const task = await db.generationTasks.get('task1');
    expect(task!.images[0]!.dataUrl).toBe(PNG_DATA_URL);
    expect((await db.referenceAssets.get('ref1'))?.dataUrl).toBe(PNG_DATA_URL);
  });

  it('does not duplicate anything when the same backup is imported twice', async () => {
    await seed();
    const { blob } = await buildFullBackupArchive();
    const res = await restoreFromBackupFile(blob);

    expect(res).toMatchObject({ itemsRestored: 0, analysesRestored: 0, tasksRestored: 0, promptsRestored: 0, foldersRestored: 0 });
    expect(await db.items.count()).toBe(1);
    expect(await db.prompts.count()).toBe(1);
    expect(await db.folders.count()).toBe(2);
  });

  it('recovers gallery images from legacy v1 ZIP backups that lack item metadata', async () => {
    const manifest = {
      version: 1,
      format: 'zip',
      data: {
        prompts: [{ id: 3, itemId: 7, model: 'm', subject: [], style: [], lighting: [], composition: [], masterPrompt: 'legacy', createdAt: 4242 }],
        folders: [],
        promptItems: [],
        promptSources: [],
        generationTasks: [
          {
            id: 'task_old',
            prompt: 'y',
            aspectRatio: '1:1',
            model: 'm',
            images: [{ id: 'i1', dataUrl: 'generated_images/task_old_i1.png', prompt: 'y', aspectRatio: '1:1', width: 1, height: 1, createdAt: 1 }],
            status: 'success',
            createdAt: 1,
          },
        ],
      },
    };
    const zip = createZipArchive([
      { name: 'manifest.json', data: new TextEncoder().encode(JSON.stringify(manifest)) },
      { name: 'gallery/7.png', data: JPEG_BYTES },
      { name: 'generated_images/task_old_i1.png', data: PNG_BYTES },
      { name: 'reference_assets/refX.png', data: PNG_BYTES },
    ]);

    const res = await restoreFromBackupFile(zip);

    expect(res).toMatchObject({ itemsRestored: 1, analysesRestored: 1, tasksRestored: 1 });
    const [item] = await db.items.toArray();
    // v1 按 .png 命名但实际是 JPEG，应按文件内容识别类型；时间取反推结果时间
    expect(item).toMatchObject({ createdAt: 4242, status: 'analyzed' });
    expect(item!.originalBlob.type).toBe('image/jpeg');
    expect((await db.prompts.toArray())[0]!.itemId).toBe(item!.id);
    expect((await db.generationTasks.get('task_old'))!.images[0]!.dataUrl).toMatch(/^data:image\/png;base64,/);
    expect(await db.referenceAssets.get('refX')).toBeTruthy();
  });

  it('still restores lightweight JSON backups', async () => {
    const json = new Blob([JSON.stringify({ folders: [{ name: 'F' }], promptItems: [{ title: 'A', prompt: 'B' }] })], { type: 'application/json' });
    const res = await restoreFromBackupFile(json);
    expect(res).toMatchObject({ foldersRestored: 1, promptsRestored: 1, itemsRestored: 0 });
  });

  it('rejects a ZIP without manifest.json', async () => {
    const zip = createZipArchive([{ name: 'README.txt', data: new TextEncoder().encode('hi') }]);
    await expect(restoreFromBackupFile(zip)).rejects.toThrow();
  });

  it('re-importing a legacy v1 ZIP does not duplicate images that were never analyzed', async () => {
    const manifest = { version: 1, exportedAt: '2026-09-28T03:18:33.647Z', data: { prompts: [], folders: [], promptItems: [], promptSources: [], generationTasks: [] } };
    const zip = createZipArchive([
      { name: 'manifest.json', data: new TextEncoder().encode(JSON.stringify(manifest)) },
      { name: 'gallery/9.png', data: PNG_BYTES },
    ]);
    await restoreFromBackupFile(zip);
    const second = await restoreFromBackupFile(zip);
    expect(second.itemsRestored).toBe(0);
    expect(await db.items.count()).toBe(1);
    expect((await db.items.toArray())[0]).toMatchObject({ status: 'pending', createdAt: Date.parse('2026-09-28T03:18:33.647Z') });
  });

  it('marks imported in-flight generation tasks as failed', async () => {
    const manifest = { data: { generationTasks: [{ id: 't', prompt: 'p', aspectRatio: '1:1', model: 'm', status: 'generating', images: [], createdAt: 1 }] } };
    const zip = createZipArchive([{ name: 'manifest.json', data: new TextEncoder().encode(JSON.stringify(manifest)) }]);
    await restoreFromBackupFile(zip);
    expect((await db.generationTasks.get('t'))!.status).toBe('failed');
  });

  it('rolls back every table when a write fails midway', async () => {
    const manifest = {
      data: {
        items: [{ id: 1, file: 'gallery/1.png', createdAt: 1, tags: [], status: 'analyzed' }],
        prompts: [{ itemId: 1, model: 'm', subject: [], style: [], lighting: [], composition: [], masterPrompt: 'x', createdAt: 1 }],
        promptItems: [{ id: 'dup', title: 'a', prompt: 'b' }, { id: 'dup', title: 'a', prompt: 'b' }],
      },
    };
    const zip = createZipArchive([
      { name: 'manifest.json', data: new TextEncoder().encode(JSON.stringify(manifest)) },
      { name: 'gallery/1.png', data: PNG_BYTES },
    ]);
    await expect(restoreFromBackupFile(zip)).rejects.toThrow();
    expect(await db.items.count()).toBe(0);
    expect(await db.prompts.count()).toBe(0);
  });

  it('reports truncated archives as corrupted instead of crashing', async () => {
    const zip = createZipArchive([{ name: 'manifest.json', data: new TextEncoder().encode('{}') }]);
    const bytes = new Uint8Array(await zip.arrayBuffer());
    const broken = new Uint8Array(bytes);
    new DataView(broken.buffer).setUint32(broken.length - 6, 999999, true);
    await expect(restoreFromBackupFile(new Blob([broken]))).rejects.toThrow(/Corrupted/);
  });

  it('rejects manifests with an unrecognized structure', async () => {
    const zip = createZipArchive([{ name: 'manifest.json', data: new TextEncoder().encode('{"data":{"folders":"oops"}}') }]);
    await expect(restoreFromBackupFile(zip)).rejects.toThrow(/manifest/);
  });
});

import { db, createThumbnail } from '../db';
import type { FolderItem, InspirationItem, PromptItem, PromptResult, PromptSource, UserSettings } from '../types';
import type { GenerationBatchTask } from '../types/imageGeneration';
import { saveUserSettings } from '../utils/storage';
import { readZipArchive } from '../utils/zipReader';
import { bytesToDataUrl, sniffImageMime } from './backupFormat';
import { restoreFromBackupJson } from './storageBackup';

export interface RestoreSummary {
  itemsRestored: number;
  analysesRestored: number;
  tasksRestored: number;
  promptsRestored: number;
  foldersRestored: number;
  settingsRestored: boolean;
}

type ItemRecord = Omit<InspirationItem, 'originalBlob' | 'thumbnailBlob'> & { file?: string };
type AssetRecord = { id: string; createdAt?: number; file?: string };

interface BackupManifest {
  version?: number;
  settings?: Partial<UserSettings>;
  data?: {
    items?: ItemRecord[];
    prompts?: PromptResult[];
    folders?: FolderItem[];
    promptItems?: PromptItem[];
    promptSources?: PromptSource[];
    generationTasks?: GenerationBatchTask[];
    referenceAssets?: AssetRecord[];
  };
}

function isZip(head: Uint8Array): boolean {
  return head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04;
}

/** 按文件内容自动识别：ZIP 完整备份或 JSON 轻量备份 */
export async function restoreFromBackupFile(file: Blob): Promise<RestoreSummary> {
  const buffer = await file.arrayBuffer();
  if (isZip(new Uint8Array(buffer, 0, Math.min(4, buffer.byteLength)))) {
    return restoreFromZip(await readZipArchive(buffer));
  }
  const res = await restoreFromBackupJson(new TextDecoder().decode(buffer));
  return { itemsRestored: 0, analysesRestored: 0, tasksRestored: 0, ...res };
}

async function restoreFromZip(files: Map<string, Uint8Array<ArrayBuffer>>): Promise<RestoreSummary> {
  const manifestBytes = files.get('manifest.json');
  if (!manifestBytes) throw new Error('Invalid backup: manifest.json not found');
  const manifest = JSON.parse(new TextDecoder().decode(manifestBytes)) as BackupManifest;
  const data = manifest.data ?? {};
  const analyses = data.prompts ?? [];

  const settingsRestored = await restoreSettings(manifest.settings);
  const { folderIdMap, created: foldersRestored } = await restoreFolders(data.folders ?? []);
  const { itemIdMap, created: itemsRestored } = await restoreItems(
    data.items ?? legacyItemRecords(files, analyses),
    files,
    folderIdMap,
    analyses
  );

  const newAnalyses = analyses
    .filter((a) => itemIdMap.has(a.itemId))
    .map(({ id: _id, ...a }) => ({ ...a, itemId: itemIdMap.get(a.itemId)! }));
  await db.prompts.bulkAdd(newAnalyses);

  const promptsRestored = await addMissing(db.promptItems, data.promptItems ?? []);
  await addMissing(db.promptSources, data.promptSources ?? []);
  await restoreReferenceAssets(data.referenceAssets ?? legacyAssetRecords(files), files);
  const tasksRestored = await restoreTasks(data.generationTasks ?? [], files);

  return { itemsRestored, analysesRestored: newAnalyses.length, tasksRestored, promptsRestored, foldersRestored, settingsRestored };
}

async function restoreSettings(settings: Partial<UserSettings> | undefined): Promise<boolean> {
  if (!settings || typeof settings !== 'object') return false;
  await saveUserSettings(settings);
  return true;
}

/** 按「名称 + 父级」合并分类；父级先于子级处理，旧 ID 映射为本机 ID */
async function restoreFolders(folders: FolderItem[]): Promise<{ folderIdMap: Map<number, number>; created: number }> {
  const folderIdMap = new Map<number, number>();
  const pending = folders.filter((f) => typeof f.id === 'number' && typeof f.name === 'string');
  let created = 0;

  while (pending.length > 0) {
    const index = pending.findIndex((f) => f.parentId == null || folderIdMap.has(f.parentId) || !pending.some((p) => p.id === f.parentId));
    const [folder] = pending.splice(index === -1 ? 0 : index, 1);
    const parentId = folder!.parentId != null ? folderIdMap.get(folder!.parentId) ?? null : null;
    const name = folder!.name.trim();
    const existing = (await db.folders.where('name').equals(name).toArray()).find((f) => (f.parentId ?? null) === parentId);
    if (existing?.id != null) {
      folderIdMap.set(folder!.id!, existing.id);
      continue;
    }
    const newId = await db.folders.add({ name, parentId, order: folder!.order ?? 0, createdAt: folder!.createdAt ?? Date.now() });
    folderIdMap.set(folder!.id!, newId as number);
    created++;
  }
  return { folderIdMap, created };
}

/** v1 备份没有图库元数据：从 gallery/<id>.<ext> 还原，创建时间取该图最早的反推时间 */
function legacyItemRecords(files: Map<string, Uint8Array<ArrayBuffer>>, analyses: PromptResult[]): ItemRecord[] {
  const records: ItemRecord[] = [];
  for (const path of files.keys()) {
    const match = path.match(/^gallery\/(\d+)\.\w+$/);
    if (!match) continue;
    const id = Number(match[1]);
    const times = analyses.filter((a) => a.itemId === id).map((a) => a.createdAt);
    records.push({
      id,
      file: path,
      createdAt: times.length > 0 ? Math.min(...times) : Date.now(),
      tags: [],
      status: times.length > 0 ? 'analyzed' : 'pending',
    });
  }
  return records;
}

function legacyAssetRecords(files: Map<string, Uint8Array<ArrayBuffer>>): AssetRecord[] {
  return [...files.keys()]
    .map((path) => path.match(/^reference_assets\/(.+)\.\w+$/))
    .filter((m): m is RegExpMatchArray => Boolean(m))
    .map((m) => ({ id: m[1]!, file: m[0] }));
}

async function restoreItems(
  records: ItemRecord[],
  files: Map<string, Uint8Array<ArrayBuffer>>,
  folderIdMap: Map<number, number>,
  analyses: PromptResult[]
): Promise<{ itemIdMap: Map<number, number>; created: number }> {
  const itemIdMap = new Map<number, number>();
  let created = 0;

  for (const { id: oldId, file, ...meta } of records) {
    const bytes = file ? files.get(file) : undefined;
    if (oldId == null || !bytes) continue;
    const originalBlob = new Blob([bytes], { type: sniffImageMime(bytes) });

    // 同一时间、同样大小的图片视为已导入过，避免重复导入产生副本
    const duplicate = (await db.items.where('createdAt').equals(meta.createdAt).toArray()).some(
      (existing) => existing.originalBlob?.size === originalBlob.size
    );
    if (duplicate) continue;

    const { thumbnailBlob, width, height, aspectRatio } = await createThumbnail(originalBlob);
    const hasAnalysis = analyses.some((a) => a.itemId === oldId);
    const status = meta.status === 'analyzing' ? (hasAnalysis ? 'analyzed' : 'pending') : meta.status;
    const newId = await db.items.add({
      ...meta,
      width: meta.width ?? width,
      height: meta.height ?? height,
      aspectRatio: meta.aspectRatio ?? aspectRatio,
      tags: Array.isArray(meta.tags) ? meta.tags : [],
      status,
      folderId: meta.folderId != null ? folderIdMap.get(meta.folderId) ?? null : null,
      originalBlob,
      thumbnailBlob,
    });
    itemIdMap.set(oldId, newId as number);
    created++;
  }
  return { itemIdMap, created };
}

async function addMissing<T extends { id?: string }>(
  table: { bulkGet(keys: string[]): Promise<(T | undefined)[]>; bulkAdd(items: T[]): Promise<unknown> },
  records: T[]
): Promise<number> {
  const withIds = records.filter((r): r is T & { id: string } => typeof r.id === 'string');
  const existing = await table.bulkGet(withIds.map((r) => r.id));
  const missing = withIds.filter((_, i) => !existing[i]);
  if (missing.length > 0) await table.bulkAdd(missing);
  return missing.length;
}

function fileToDataUrl(files: Map<string, Uint8Array<ArrayBuffer>>, path: string): string | undefined {
  const bytes = files.get(path);
  return bytes && bytes.length > 0 ? bytesToDataUrl(bytes, sniffImageMime(bytes)) : undefined;
}

async function restoreReferenceAssets(records: AssetRecord[], files: Map<string, Uint8Array<ArrayBuffer>>): Promise<void> {
  const assets = records.flatMap((r) => {
    const dataUrl = r.file ? fileToDataUrl(files, r.file) : undefined;
    return dataUrl ? [{ id: r.id, dataUrl, createdAt: r.createdAt ?? Date.now() }] : [];
  });
  await addMissing(db.referenceAssets, assets);
}

async function restoreTasks(tasks: GenerationBatchTask[], files: Map<string, Uint8Array<ArrayBuffer>>): Promise<number> {
  const restored = tasks.map((task) => ({
    ...task,
    images: task.images.flatMap((img) => {
      if (img.dataUrl?.startsWith('data:')) return [img];
      const dataUrl = img.dataUrl ? fileToDataUrl(files, img.dataUrl) : undefined;
      return dataUrl ? [{ ...img, dataUrl }] : [];
    }),
  }));
  return addMissing(db.generationTasks, restored);
}

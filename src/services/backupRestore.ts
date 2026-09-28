import { z } from 'zod';
import { db, createThumbnail } from '../db';
import type { InspirationItem, PromptItem, PromptResult, PromptSource, UserSettings } from '../types';
import type { GenerationBatchTask } from '../types/imageGeneration';
import { getUserSettings, saveUserSettings } from '../utils/storage';
import { readZipArchive } from '../utils/zipReader';
import { bytesToDataUrl, mergeSettings, sniffImageMime } from './backupFormat';
import { restoreFromBackupJson } from './storageBackup';

export interface RestoreSummary {
  itemsRestored: number;
  analysesRestored: number;
  tasksRestored: number;
  promptsRestored: number;
  foldersRestored: number;
  settingsRestored: boolean;
}

type Files = Map<string, Uint8Array<ArrayBuffer>>;

const idNumber = z.number().int();
const manifestSchema = z.object({
  exportedAt: z.union([z.string(), z.number()]).optional(),
  settings: z.record(z.string(), z.unknown()).optional(),
  data: z
    .object({
      items: z.array(z.looseObject({ id: idNumber, file: z.string().optional(), createdAt: z.number().optional(), status: z.string().optional(), folderId: idNumber.nullish() })).optional(),
      prompts: z.array(z.looseObject({ itemId: idNumber, createdAt: z.number().optional() })).default([]),
      folders: z.array(z.looseObject({ id: idNumber, name: z.string(), parentId: idNumber.nullish(), order: z.number().optional(), createdAt: z.number().optional() })).default([]),
      promptItems: z.array(z.looseObject({ id: z.string() })).default([]),
      promptSources: z.array(z.looseObject({ id: z.string() })).default([]),
      generationTasks: z.array(z.looseObject({ id: z.string(), status: z.string().optional(), images: z.array(z.looseObject({ id: z.string(), dataUrl: z.string().optional() })).default([]) })).default([]),
      referenceAssets: z.array(z.object({ id: z.string(), createdAt: z.number().optional(), file: z.string().optional() })).optional(),
    })
    .default({ prompts: [], folders: [], promptItems: [], promptSources: [], generationTasks: [] }),
});

type Manifest = z.infer<typeof manifestSchema>;
type ManifestData = Manifest['data'];
type ItemRecord = NonNullable<ManifestData['items']>[number];
type AssetRecord = NonNullable<ManifestData['referenceAssets']>[number];

interface PreparedItem {
  oldId: number;
  meta: Record<string, unknown> & Pick<ItemRecord, 'createdAt' | 'status' | 'folderId'>;
  originalBlob: Blob;
  thumbnailBlob: Blob;
  width: number;
  height: number;
  aspectRatio: number;
}

function isZip(buffer: ArrayBuffer): boolean {
  const head = new Uint8Array(buffer, 0, Math.min(4, buffer.byteLength));
  return head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04;
}

function parseManifest(raw: unknown): Manifest {
  const parsed = manifestSchema.safeParse(raw);
  if (!parsed.success) throw new Error('Invalid backup: unrecognized manifest structure');
  return parsed.data;
}

function parseJson(bytes: Uint8Array): unknown {
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new Error('Invalid JSON format');
  }
}

/** 按文件内容自动识别：ZIP 完整备份、完整清单 JSON 或轻量 JSON 备份 */
export async function restoreFromBackupFile(file: Blob): Promise<RestoreSummary> {
  const buffer = await file.arrayBuffer();
  if (isZip(buffer)) {
    const files = await readZipArchive(buffer);
    const manifestBytes = files.get('manifest.json');
    if (!manifestBytes) throw new Error('Invalid backup: manifest.json not found');
    return restoreFromManifest(parseManifest(parseJson(manifestBytes)), files);
  }

  const json = parseJson(new Uint8Array(buffer));
  if (typeof json === 'object' && json !== null && 'data' in json) {
    return restoreFromManifest(parseManifest(json), new Map());
  }
  const res = await restoreFromBackupJson(new TextDecoder().decode(buffer));
  return { itemsRestored: 0, analysesRestored: 0, tasksRestored: 0, ...res };
}

/**
 * 先在事务外完成所有异步准备（解码、哈希、缩略图），再用单个 Dexie 事务写入，
 * 中途失败整体回滚，不会留下「图片已入库但反推结果缺失」的半套数据。
 */
async function restoreFromManifest(manifest: Manifest, files: Files): Promise<RestoreSummary> {
  const { data } = manifest;
  const fallbackTime = Number(new Date(manifest.exportedAt ?? 0)) || 0;
  const records = data.items ?? legacyItemRecords(files, data.prompts, fallbackTime);
  const items = await prepareNewItems(records, files, data.prompts);
  const tasks = prepareTasks(data.generationTasks, files);
  const assets = prepareAssets(data.referenceAssets ?? legacyAssetRecords(files), files);

  const summary = await db.transaction(
    'rw',
    [db.folders, db.items, db.prompts, db.promptItems, db.promptSources, db.referenceAssets, db.generationTasks],
    async () => {
      const folders = await writeFolders(data.folders);
      const itemIdMap = await writeItems(items, folders.idMap);
      const analyses = data.prompts
        .filter((a) => itemIdMap.has(a.itemId))
        .map(({ id: _id, ...a }) => ({ ...a, itemId: itemIdMap.get(a.itemId)! }) as unknown as PromptResult);
      await db.prompts.bulkAdd(analyses);
      await addMissing(db.promptSources, data.promptSources as unknown as PromptSource[]);
      await addMissing(db.referenceAssets, assets);
      return {
        itemsRestored: itemIdMap.size,
        analysesRestored: analyses.length,
        tasksRestored: await addMissing(db.generationTasks, tasks),
        promptsRestored: await addMissing(db.promptItems, data.promptItems as unknown as PromptItem[]),
        foldersRestored: folders.created,
      };
    }
  );

  const settingsRestored = await restoreSettings(manifest.settings);
  return { ...summary, settingsRestored };
}

async function restoreSettings(settings: Record<string, unknown> | undefined): Promise<boolean> {
  if (!settings) return false;
  const current = (await getUserSettings()) as unknown as Record<string, unknown>;
  await saveUserSettings(mergeSettings(current, settings) as unknown as Partial<UserSettings>);
  return true;
}

/** v1 备份没有图库元数据：从 gallery/<id>.<ext> 还原；时间取最早反推时间，否则取导出时间（保证重复导入可去重） */
function legacyItemRecords(files: Files, analyses: ManifestData['prompts'], fallbackTime: number): ItemRecord[] {
  return [...files.keys()].flatMap((path) => {
    const match = path.match(/^gallery\/(\d+)\.\w+$/);
    if (!match) return [];
    const id = Number(match[1]);
    const times = analyses.filter((a) => a.itemId === id).map((a) => a.createdAt ?? fallbackTime);
    return [{ id, file: path, createdAt: times.length > 0 ? Math.min(...times) : fallbackTime, tags: [], status: times.length > 0 ? 'analyzed' : 'pending' }];
  });
}

function legacyAssetRecords(files: Files): AssetRecord[] {
  return [...files.keys()].flatMap((path) => {
    const match = path.match(/^reference_assets\/(.+)\.\w+$/);
    return match ? [{ id: match[1]!, file: path }] : [];
  });
}

async function sha256(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** 已在本机（按图片内容哈希）或在本次备份中重复出现的图片不再导入 */
async function prepareNewItems(records: ItemRecord[], files: Files, analyses: ManifestData['prompts']): Promise<PreparedItem[]> {
  const candidates = records.flatMap(({ id, file, ...meta }) => {
    const bytes = file ? files.get(file) : undefined;
    return bytes ? [{ oldId: id, meta, blob: new Blob([bytes], { type: sniffImageMime(bytes) }) }] : [];
  });

  const sizes = new Set(candidates.map((c) => c.blob.size));
  const sameSize = await db.items.filter((item) => sizes.has(item.originalBlob?.size ?? -1)).toArray();
  const seen = new Set(await Promise.all(sameSize.map((item) => sha256(item.originalBlob))));

  const prepared: PreparedItem[] = [];
  for (const { oldId, meta, blob } of candidates) {
    const hash = await sha256(blob);
    if (seen.has(hash)) continue;
    seen.add(hash);
    const { thumbnailBlob, width, height, aspectRatio } = await createThumbnail(blob);
    const hasAnalysis = analyses.some((a) => a.itemId === oldId);
    const status = meta.status === 'analyzing' || meta.status === undefined ? (hasAnalysis ? 'analyzed' : 'pending') : meta.status;
    prepared.push({ oldId, meta: { ...meta, status }, originalBlob: blob, thumbnailBlob, width, height, aspectRatio });
  }
  return prepared;
}

function fileToDataUrl(files: Files, path: string): string | undefined {
  const bytes = files.get(path);
  return bytes && bytes.length > 0 ? bytesToDataUrl(bytes, sniffImageMime(bytes)) : undefined;
}

/** 生成图在清单里记录的是包内路径，还原为 DataURL；找不到文件的图片无法显示，直接略过 */
function prepareTasks(tasks: ManifestData['generationTasks'], files: Files): GenerationBatchTask[] {
  return tasks.map((task) => ({
    ...task,
    // 导入的任务不可能还在执行，避免悬挂在「生成中」
    status: task.status === 'generating' ? 'failed' : task.status,
    images: task.images.flatMap((img) => {
      if (img.dataUrl?.startsWith('data:')) return [img];
      const dataUrl = img.dataUrl ? fileToDataUrl(files, img.dataUrl) : undefined;
      return dataUrl ? [{ ...img, dataUrl }] : [];
    }),
  })) as unknown as GenerationBatchTask[];
}

function prepareAssets(records: AssetRecord[], files: Files): { id: string; dataUrl: string; createdAt: number }[] {
  return records.flatMap((r) => {
    const dataUrl = r.file ? fileToDataUrl(files, r.file) : undefined;
    return dataUrl ? [{ id: r.id, dataUrl, createdAt: r.createdAt ?? Date.now() }] : [];
  });
}

/** 按「名称 + 父级」合并分类；父级先于子级处理，旧 ID 映射为本机 ID */
async function writeFolders(folders: ManifestData['folders']): Promise<{ idMap: Map<number, number>; created: number }> {
  const idMap = new Map<number, number>();
  const oldIds = new Set(folders.map((f) => f.id));
  const isReady = (f: (typeof folders)[number]) => f.parentId == null || idMap.has(f.parentId) || !oldIds.has(f.parentId);
  let remaining = folders;
  let created = 0;

  while (remaining.length > 0) {
    // 父子关系成环时无法排序，把剩余分类当作顶层处理
    const ready = remaining.some(isReady) ? remaining.filter(isReady) : remaining;
    for (const folder of ready) {
      const parentId = folder.parentId != null ? idMap.get(folder.parentId) ?? null : null;
      const name = folder.name.trim();
      const existing = (await db.folders.where('name').equals(name).toArray()).find((f) => (f.parentId ?? null) === parentId);
      if (existing?.id != null) {
        idMap.set(folder.id, existing.id);
        continue;
      }
      const newId = await db.folders.add({ name, parentId, order: folder.order ?? 0, createdAt: folder.createdAt ?? Date.now() });
      idMap.set(folder.id, newId as number);
      created++;
    }
    remaining = remaining.filter((f) => !ready.includes(f));
  }
  return { idMap, created };
}

async function writeItems(items: PreparedItem[], folderIdMap: Map<number, number>): Promise<Map<number, number>> {
  const itemIdMap = new Map<number, number>();
  for (const { oldId, meta, originalBlob, thumbnailBlob, width, height, aspectRatio } of items) {
    const record = {
      ...meta,
      createdAt: meta.createdAt ?? Date.now(),
      tags: Array.isArray(meta.tags) ? meta.tags : [],
      width: typeof meta.width === 'number' ? meta.width : width,
      height: typeof meta.height === 'number' ? meta.height : height,
      aspectRatio: typeof meta.aspectRatio === 'number' ? meta.aspectRatio : aspectRatio,
      folderId: meta.folderId != null ? folderIdMap.get(meta.folderId) ?? null : null,
      originalBlob,
      thumbnailBlob,
    } as unknown as InspirationItem;
    itemIdMap.set(oldId, (await db.items.add(record)) as number);
  }
  return itemIdMap;
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

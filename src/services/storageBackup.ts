import { db } from '../db';
import { getUserSettings, saveUserSettings } from '../utils/storage';
import type { InspirationItem, UserSettings } from '../types';
import type { GenerationBatchTask } from '../types/imageGeneration';
import { BACKUP_MANIFEST_VERSION, extensionForMime, mergeSettings, mimeFromDataUrl, toPortableSettings } from './backupFormat';

export interface StorageEstimateResult {
  usedBytes: number;
  quotaBytes: number;
  usedFormatted: string;
  quotaFormatted: string | null;
  percent: number;
}

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

export async function getStorageEstimate(): Promise<StorageEstimateResult> {
  if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.estimate) {
    try {
      const estimate = await navigator.storage.estimate();
      const used = estimate.usage || 0;
      const quota = estimate.quota || 0;
      const percent = quota > 0 ? (used / quota) * 100 : 0;
      return {
        usedBytes: used,
        quotaBytes: quota,
        usedFormatted: formatBytes(used),
        quotaFormatted: formatBytes(quota),
        percent: Number(percent.toFixed(2)),
      };
    } catch {
      // ignore
    }
  }
  return {
    usedBytes: 0,
    quotaBytes: 0,
    usedFormatted: '0 B',
    quotaFormatted: null,
    percent: 0,
  };
}

/**
 * Universal safe browser file downloader.
 */
export function downloadBlobOrUrl(blobOrUrl: Blob | string, filename: string): void {
  if (typeof document === 'undefined') return;
  const isBlob = typeof blobOrUrl !== 'string';
  const url = isBlob ? (URL.createObjectURL ? URL.createObjectURL(blobOrUrl) : '') : blobOrUrl;
  if (!url) return;

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  if (isBlob && URL.revokeObjectURL) {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

/**
 * Converts a Base64 DataURL to a pure Uint8Array in memory without network fetch.
 */
export function dataUrlToUint8Array(dataUrl: string): Uint8Array {
  const commaIdx = dataUrl.indexOf(',');
  if (commaIdx === -1) return new Uint8Array(0);
  const base64 = dataUrl.slice(commaIdx + 1);

  if (typeof atob !== 'undefined') {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(base64, 'base64'));
  }

  return new Uint8Array(0);
}

/**
 * Standard IEEE 802.3 CRC-32 table and calculator for ZIP generation.
 */
const CRC_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  CRC_TABLE[i] = c;
}

export function calculateCrc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC_TABLE[(crc ^ bytes[i]!) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export interface ZipEntry {
  name: string;
  data: Uint8Array;
}

/**
 * Builds a valid RFC 1950 / PKWARE ZIP file (Store mode, 0 compression) from entries.
 * Zero external dependencies, ultra-fast and natively extractable on macOS, Windows & Linux.
 */
export function createZipArchive(entries: ZipEntry[]): Blob {
  const encoder = new TextEncoder();
  const fileRecords: {
    nameBytes: Uint8Array;
    data: Uint8Array;
    crc: number;
    offset: number;
  }[] = [];

  let currentOffset = 0;
  const parts: Uint8Array[] = [];

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name);
    const crc = calculateCrc32(entry.data);
    const dataLen = entry.data.length;

    // Local file header (30 bytes + name length)
    const localHeader = new Uint8Array(30 + nameBytes.length);
    const view = new DataView(localHeader.buffer);

    view.setUint32(0, 0x04034b50, true); // Local header signature
    view.setUint16(4, 20, true); // Version needed (2.0)
    view.setUint16(6, 0x0800, true); // General purpose bit (UTF-8 flag)
    view.setUint16(8, 0, true); // Compression: Store (0)
    view.setUint16(10, 0, true); // Mod time
    view.setUint16(12, 0, true); // Mod date
    view.setUint32(14, crc, true); // CRC-32
    view.setUint32(18, dataLen, true); // Compressed size
    view.setUint32(22, dataLen, true); // Uncompressed size
    view.setUint16(26, nameBytes.length, true); // Filename length
    view.setUint16(28, 0, true); // Extra field length

    localHeader.set(nameBytes, 30);

    parts.push(localHeader);
    parts.push(entry.data);

    fileRecords.push({
      nameBytes,
      data: entry.data,
      crc,
      offset: currentOffset,
    });

    currentOffset += localHeader.length + dataLen;
  }

  // Central directory headers
  const centralDirStart = currentOffset;
  let centralDirSize = 0;

  for (const record of fileRecords) {
    const nameLen = record.nameBytes.length;
    const cdHeader = new Uint8Array(46 + nameLen);
    const view = new DataView(cdHeader.buffer);

    view.setUint32(0, 0x02014b50, true); // Central dir signature
    view.setUint16(4, 20, true); // Version made by
    view.setUint16(6, 20, true); // Version needed
    view.setUint16(8, 0x0800, true); // UTF-8 filename flag
    view.setUint16(10, 0, true); // Compression: Store
    view.setUint16(12, 0, true); // Mod time
    view.setUint16(14, 0, true); // Mod date
    view.setUint32(16, record.crc, true); // CRC-32
    view.setUint32(20, record.data.length, true); // Compressed size
    view.setUint32(24, record.data.length, true); // Uncompressed size
    view.setUint16(28, nameLen, true); // Filename length
    view.setUint16(30, 0, true); // Extra field length
    view.setUint16(32, 0, true); // Comment length
    view.setUint16(34, 0, true); // Disk start
    view.setUint16(36, 0, true); // Internal attributes
    view.setUint32(38, 0, true); // External attributes
    view.setUint32(42, record.offset, true); // Relative offset of local header

    cdHeader.set(record.nameBytes, 46);

    parts.push(cdHeader);
    centralDirSize += cdHeader.length;
  }

  // End of central directory record (22 bytes)
  const eocd = new Uint8Array(22);
  const eocdView = new DataView(eocd.buffer);
  eocdView.setUint32(0, 0x06054b50, true); // EOCD signature
  eocdView.setUint16(4, 0, true); // Disk number
  eocdView.setUint16(6, 0, true); // Disk with central dir
  eocdView.setUint16(8, fileRecords.length, true); // Records on this disk
  eocdView.setUint16(10, fileRecords.length, true); // Total records
  eocdView.setUint32(12, centralDirSize, true); // Central dir size
  eocdView.setUint32(16, centralDirStart, true); // Central dir offset
  eocdView.setUint16(20, 0, true); // Comment length

  parts.push(eocd);

  const totalLength = parts.reduce((acc, p) => acc + p.length, 0);
  const fullArchive = new Uint8Array(totalLength);
  let writeOffset = 0;
  for (const p of parts) {
    fullArchive.set(p, writeOffset);
    writeOffset += p.length;
  }

  return new Blob([fullArchive], { type: 'application/zip' });
}

type BinaryCollector = (name: string, data: Uint8Array) => void;

async function galleryRecords(items: InspirationItem[], add: BinaryCollector) {
  const records = [];
  for (const { originalBlob, thumbnailBlob: _thumbnail, ...meta } of items) {
    if (!originalBlob) {
      records.push(meta);
      continue;
    }
    const file = `gallery/${meta.id}.${extensionForMime(originalBlob.type)}`;
    add(file, new Uint8Array(await originalBlob.arrayBuffer()));
    records.push({ ...meta, file });
  }
  return records;
}

/** 把 DataURL 写成包内文件并返回路径；空图返回 undefined */
function dataUrlToArchiveFile(dataUrl: string | undefined, basePath: string, add: BinaryCollector): string | undefined {
  const bytes = dataUrl ? dataUrlToUint8Array(dataUrl) : new Uint8Array(0);
  if (bytes.length === 0) return undefined;
  const file = `${basePath}.${extensionForMime(mimeFromDataUrl(dataUrl!))}`;
  add(file, bytes);
  return file;
}

function taskRecords(tasks: GenerationBatchTask[], add: BinaryCollector) {
  return tasks.map((task) => ({
    ...task,
    images: task.images.map((img) => ({
      ...img,
      dataUrl: dataUrlToArchiveFile(img.dataUrl, `generated_images/${task.id}_${img.id}`, add) ?? '',
    })),
  }));
}

function assetRecords(assets: { id: string; dataUrl: string; createdAt: number }[], add: BinaryCollector) {
  return assets.map((asset) => ({
    id: asset.id,
    createdAt: asset.createdAt,
    file: dataUrlToArchiveFile(asset.dataUrl, `reference_assets/${asset.id}`, add),
  }));
}

function backupReadme(dateStr: string): string {
  return (
    `PicPocket Full Data Backup (${dateStr})\r\n\r\n` +
    `Restore: Settings > Storage > Restore from Backup, then select this ZIP file.\r\n` +
    `API keys and membership are not included; configure them again after restoring.\r\n\r\n` +
    `Contents:\r\n` +
    `- manifest.json: Settings, gallery metadata, prompt library and task logs\r\n` +
    `- gallery/: Saved pocket inspiration images\r\n` +
    `- generated_images/: AI workbench generated images\r\n` +
    `- reference_assets/: Deduplicated reference assets pool\r\n`
  );
}

/**
 * Builds the full-library ZIP archive (ADR-0007): manifest.json holds every table's
 * metadata with binaries replaced by in-archive paths, so the archive can be fully restored.
 */
export async function buildFullBackupArchive(): Promise<{ blob: Blob; count: number; filename: string }> {
  const [items, prompts, folders, promptItems, generationTasks, referenceAssets, promptSources, settings] =
    await Promise.all([
      db.items.toArray(),
      db.prompts.toArray(),
      db.folders.toArray(),
      db.promptItems.toArray(),
      db.generationTasks.toArray(),
      db.referenceAssets.toArray(),
      db.promptSources.toArray(),
      getUserSettings(),
    ]);

  const binaries: ZipEntry[] = [];
  const add: BinaryCollector = (name, data) => binaries.push({ name, data });
  const manifest = {
    version: BACKUP_MANIFEST_VERSION,
    appName: 'PicPocket',
    exportedAt: new Date().toISOString(),
    format: 'zip',
    stats: {
      itemsCount: items.length,
      tasksCount: generationTasks.length,
      promptsCount: promptItems.length,
      foldersCount: folders.length,
      referenceAssetsCount: referenceAssets.length,
      sourcesCount: promptSources.length,
    },
    settings: toPortableSettings(settings),
    data: {
      items: await galleryRecords(items, add),
      prompts,
      folders,
      promptItems,
      generationTasks: taskRecords(generationTasks, add),
      referenceAssets: assetRecords(referenceAssets, add),
      promptSources,
    },
  };

  const dateStr = new Date().toISOString().slice(0, 10);
  const encoder = new TextEncoder();
  const blob = createZipArchive([
    { name: 'manifest.json', data: encoder.encode(JSON.stringify(manifest, null, 2)) },
    { name: 'README.txt', data: encoder.encode(backupReadme(dateStr)) },
    ...binaries,
  ]);

  return {
    blob,
    count: items.length + generationTasks.length + promptItems.length + referenceAssets.length + promptSources.length,
    filename: `PicPocket_Backup_${dateStr}.zip`,
  };
}

/**
 * Exports all PicPocket user data as a restorable ZIP archive.
 */
export async function exportAllDataAsBackup(): Promise<{ count: number; filename: string }> {
  const { blob, count, filename } = await buildFullBackupArchive();
  downloadBlobOrUrl(blob, filename);
  return { count, filename };
}

/**
 * Exports lightweight JSON metadata backup (settings, prompt presets, folders, item metadata)
 */
export async function exportMetadataAsJsonBackup(): Promise<{ filename: string }> {
  const settings = await getUserSettings();
  const folders = await db.folders.toArray();
  const promptItems = await db.promptItems.toArray();
  const rawItems = await db.items.toArray();
  const items = rawItems.map((item) => ({
    ...item,
    originalBlob: undefined,
    thumbnailBlob: undefined,
  }));
  const rawTasks = await db.generationTasks.toArray();
  const generationTasks = rawTasks.map((task) => ({
    ...task,
    images: task.images.map((img) => ({
      ...img,
      dataUrl: undefined,
    })),
  }));

  const backupData = {
    appName: 'PicPocket',
    version: '1.0.0',
    exportedAt: Date.now(),
    date: new Date().toISOString(),
    settings: toPortableSettings(settings),
    folders,
    promptItems,
    items,
    generationTasks,
  };

  const dateStr = new Date().toISOString().slice(0, 10);
  const filename = `PicPocket_Backup_${dateStr}.json`;
  const jsonBlob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
  downloadBlobOrUrl(jsonBlob, filename);

  return { filename };
}

/**
 * Restores data from a user-selected JSON backup file string.
 */
export async function restoreFromBackupJson(jsonContent: string): Promise<{
  foldersRestored: number;
  promptsRestored: number;
  settingsRestored: boolean;
}> {
  let parsed: any;
  try {
    parsed = JSON.parse(jsonContent);
  } catch {
    throw new Error('Invalid JSON format');
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Invalid backup file structure');
  }

  let foldersRestored = 0;
  let promptsRestored = 0;
  let settingsRestored = false;

  // 1. Restore User Settings
  if (parsed.settings && typeof parsed.settings === 'object') {
    const current = (await getUserSettings()) as unknown as Record<string, unknown>;
    await saveUserSettings(mergeSettings(current, parsed.settings) as Partial<UserSettings>);
    settingsRestored = true;
  }

  // 2. Restore Folders (upsert by name)
  if (Array.isArray(parsed.folders)) {
    for (const f of parsed.folders) {
      if (f.name && typeof f.name === 'string') {
        const existing = await db.folders.where('name').equals(f.name.trim()).first();
        if (!existing) {
          await db.folders.add({
            name: f.name.trim(),
            parentId: f.parentId || null,
            order: f.order || 0,
            createdAt: f.createdAt || Date.now(),
          });
          foldersRestored++;
        }
      }
    }
  }

  // 3. Restore Prompts (upsert by title)
  if (Array.isArray(parsed.promptItems)) {
    for (const p of parsed.promptItems) {
      if (p.title && p.prompt) {
        const promptId = p.id || `custom-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const existing = await db.promptItems.where('title').equals(p.title.trim()).first();
        if (!existing) {
          await db.promptItems.add({
            id: promptId,
            sourceId: p.sourceId || 'backup-restore',
            title: p.title.trim(),
            prompt: p.prompt,
            tags: Array.isArray(p.tags) ? p.tags : [],
            category: p.category || 'custom',
            isCustom: true,
            createdAt: p.createdAt || new Date().toISOString(),
          });
          promptsRestored++;
        }
      }
    }
  }

  return { foldersRestored, promptsRestored, settingsRestored };
}


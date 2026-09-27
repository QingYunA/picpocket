import Dexie, { type Table } from 'dexie';
import type {
  InspirationItem,
  PromptResult,
  PromptSource,
  PromptItem,
  GeneratedImage,
  FolderItem,
  GenerationBatchTask,
} from '../types';

export class InspirationDatabase extends Dexie {
  items!: Table<InspirationItem, number>;
  prompts!: Table<PromptResult, number>;
  promptSources!: Table<PromptSource, string>;
  promptItems!: Table<PromptItem, string>;
  folders!: Table<FolderItem, number>;
  generationTasks!: Table<GenerationBatchTask, string>;
  referenceAssets!: Table<{ id: string; dataUrl: string; createdAt: number }, string>;

  constructor() {
    super('PromptSnapInspirationDB');
    this.version(1).stores({
      items: '++id, createdAt, status, *tags',
      prompts: '++id, itemId, model, createdAt',
    });
    this.version(2).stores({
      items: '++id, createdAt, status, *tags',
      prompts: '++id, itemId, model, createdAt',
      promptSources: '&id, enabled, lastSuccessAt',
      promptItems: '&id, sourceId, title, *tags, category, isFavorite, createdAt',
    });
    this.version(3).stores({
      items: '++id, createdAt, status, *tags, folderId',
      prompts: '++id, itemId, model, createdAt',
      promptSources: '&id, enabled, lastSuccessAt',
      promptItems: '&id, sourceId, title, *tags, category, isFavorite, createdAt',
      folders: '++id, name, parentId, order, createdAt',
    });
    this.version(4).stores({
      items: '++id, createdAt, status, *tags, folderId',
      prompts: '++id, itemId, model, createdAt',
      promptSources: '&id, enabled, lastSuccessAt',
      promptItems: '&id, sourceId, title, *tags, category, isFavorite, createdAt',
      folders: '++id, name, parentId, order, createdAt',
      generationTasks: '&id, createdAt, status, model',
    });
    this.version(5).stores({
      items: '++id, createdAt, status, *tags, folderId',
      prompts: '++id, itemId, model, createdAt',
      promptSources: '&id, enabled, lastSuccessAt',
      promptItems: '&id, sourceId, title, *tags, category, isFavorite, createdAt',
      folders: '++id, name, parentId, order, createdAt',
      generationTasks: '&id, createdAt, status, model',
      referenceAssets: '&id, createdAt',
    });
  }
}

export const db = new InspirationDatabase();

export async function createFolder(name: string, parentId: number | null = null): Promise<number> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Folder name cannot be empty');

  // Handle null parentId gracefully in Dexie
  const siblings =
    parentId === null
      ? await db.folders.filter((f) => f.parentId === null).toArray()
      : await db.folders.where('parentId').equals(parentId).toArray();

  const maxOrder = siblings.reduce((max, f) => Math.max(max, f.order || 0), 0);
  const nextOrder = maxOrder + 1;

  const id = await db.folders.add({
    name: trimmed,
    parentId,
    order: nextOrder,
    createdAt: Date.now(),
  });
  return id as number;
}

export async function renameFolder(id: number, newName: string): Promise<void> {
  const trimmed = newName.trim();
  if (!trimmed) throw new Error('Folder name cannot be empty');
  await db.folders.update(id, { name: trimmed });
}

export async function deleteFolder(id: number): Promise<void> {
  // Move all direct items in this folder to uncategorized (null)
  await db.items.where('folderId').equals(id).modify({ folderId: null });

  // Recursively find and delete child subfolders
  const subFolders = await db.folders.where('parentId').equals(id).toArray();
  for (const sub of subFolders) {
    if (sub.id) {
      await deleteFolder(sub.id);
    }
  }

  // Delete this folder
  await db.folders.delete(id);
}

export async function moveItemToFolder(itemId: number, folderId: number | null): Promise<void> {
  await db.items.update(itemId, { folderId });
}

export async function batchMoveItemsToFolder(itemIds: number[], folderId: number | null): Promise<void> {
  if (!itemIds || itemIds.length === 0) return;
  await db.transaction('rw', db.items, async () => {
    for (const id of itemIds) {
      await db.items.update(id, { folderId });
    }
  });
}

export async function batchDeleteItems(itemIds: number[]): Promise<void> {
  if (!itemIds || itemIds.length === 0) return;
  await db.transaction('rw', [db.items, db.prompts], async () => {
    for (const id of itemIds) {
      await db.items.delete(id);
      await db.prompts.where('itemId').equals(id).delete();
    }
  });
}

export async function toggleFavoritePrompt(id: string): Promise<boolean> {
  const item = await db.promptItems.get(id);
  if (!item) return false;
  const newStatus = !item.isFavorite;
  await db.promptItems.update(id, { isFavorite: newStatus });
  return newStatus;
}

/**
 * Generate a compressed WebP thumbnail (max 400px wide) from an image blob.
 * Compatible with both Window and Service Worker (OffscreenCanvas) environments.
 */
export async function createThumbnail(
  blob: Blob,
  maxDimension = 400
): Promise<{ thumbnailBlob: Blob; width: number; height: number; aspectRatio: number }> {
  const hasImageBitmap = typeof createImageBitmap !== 'undefined';
  if (!hasImageBitmap) {
    return {
      thumbnailBlob: blob,
      width: 400,
      height: 400,
      aspectRatio: 1,
    };
  }

  try {
    const bitmap = await createImageBitmap(blob);
    const origWidth = bitmap.width;
    const origHeight = bitmap.height;
    const aspectRatio = origWidth / (origHeight || 1);

    let targetWidth = origWidth;
    let targetHeight = origHeight;

    if (origWidth > maxDimension || origHeight > maxDimension) {
      if (origWidth > origHeight) {
        targetWidth = maxDimension;
        targetHeight = Math.max(1, Math.round(maxDimension / aspectRatio));
      } else {
        targetHeight = maxDimension;
        targetWidth = Math.max(1, Math.round(maxDimension * aspectRatio));
      }
    }

    let thumbnailBlob: Blob | null = null;

    if (typeof OffscreenCanvas !== 'undefined') {
      const offscreen = new OffscreenCanvas(targetWidth, targetHeight);
      const ctx = offscreen.getContext('2d');
      if (ctx) {
        ctx.drawImage(bitmap, 0, 0, targetWidth, targetHeight);
        try {
          thumbnailBlob = await offscreen.convertToBlob({ type: 'image/webp', quality: 0.82 });
        } catch {
          thumbnailBlob = await offscreen.convertToBlob({ type: 'image/png' });
        }
      }
    } else if (typeof document !== 'undefined') {
      const canvas = document.createElement('canvas');
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(bitmap, 0, 0, targetWidth, targetHeight);
        thumbnailBlob = await new Promise<Blob>((resolve) => {
          canvas.toBlob((b) => resolve(b || blob), 'image/webp', 0.82);
        });
      }
    }

    return {
      thumbnailBlob: thumbnailBlob || blob,
      width: origWidth,
      height: origHeight,
      aspectRatio,
    };
  } catch (err) {
    console.warn('Thumbnail generation fallback:', err);
    return {
      thumbnailBlob: blob,
      width: 400,
      height: 400,
      aspectRatio: 1,
    };
  }
}

export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
  dpr: number;
}

/**
 * Safely convert a base64 DataURL into a Blob without relying on fetch()
 * Prevents "Failed to fetch" on large screenshots in Service Worker.
 */
export function dataUrlToBlob(dataUrl: string): Blob {
  const parts = dataUrl.split(',');
  if (parts.length < 2 || !parts[0] || !parts[1]) {
    return new Blob([], { type: 'image/png' });
  }
  const mime = parts[0].match(/:(.*?);/)?.[1] || 'image/png';
  const binStr = atob(parts[1]);
  const len = binStr.length;
  const u8arr = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    u8arr[i] = binStr.charCodeAt(i);
  }
  return new Blob([u8arr], { type: mime });
}

/**
 * Accurately crop a rectangular area from an image DataURL or Blob.
 * Handles Retina DPR scaling and supports both Worker (OffscreenCanvas) and DOM environments.
 */
export async function cropImage(
  dataUrlOrBlob: string | Blob,
  rect: CropRect
): Promise<{ croppedBlob: Blob; width: number; height: number }> {
  let blob: Blob;
  if (typeof dataUrlOrBlob === 'string') {
    blob = dataUrlToBlob(dataUrlOrBlob);
  } else {
    blob = dataUrlOrBlob;
  }

  if (typeof createImageBitmap === 'undefined') {
    return { croppedBlob: blob, width: Math.round(rect.width), height: Math.round(rect.height) };
  }

  try {
    const bitmap = await createImageBitmap(blob);
    const dpr = rect.dpr || 1;

    const sx = Math.max(0, Math.round(rect.x * dpr));
    const sy = Math.max(0, Math.round(rect.y * dpr));
    const sw = Math.min(bitmap.width - sx, Math.max(1, Math.round(rect.width * dpr)));
    const sh = Math.min(bitmap.height - sy, Math.max(1, Math.round(rect.height * dpr)));

    let croppedBlob: Blob | null = null;

    if (typeof OffscreenCanvas !== 'undefined') {
      const offscreen = new OffscreenCanvas(sw, sh);
      const ctx = offscreen.getContext('2d');
      if (ctx) {
        ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, sw, sh);
        croppedBlob = await offscreen.convertToBlob({ type: 'image/png' });
      }
    } else if (typeof document !== 'undefined') {
      const canvas = document.createElement('canvas');
      canvas.width = sw;
      canvas.height = sh;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, sw, sh);
        croppedBlob = await new Promise<Blob>((resolve) => {
          canvas.toBlob((b) => resolve(b || blob), 'image/png');
        });
      }
    }

    return {
      croppedBlob: croppedBlob || blob,
      width: sw,
      height: sh,
    };
  } catch (err) {
    console.warn('Image crop failed, falling back to original blob:', err);
    return {
      croppedBlob: blob,
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    };
  }
}

/**
 * Saves an AI-generated image into the Inspiration Gallery (Dexie `items`).
 * Automatically generates a 400px WebP thumbnail and tags it with ['AI生图'].
 * Also registers the prompt in `prompts` table so InspectorDrawer can display it directly.
 */
export async function saveGeneratedImageToGallery(
  image: GeneratedImage,
  pageTitle?: string,
  folderId?: number | null
): Promise<number> {
  const blob = dataUrlToBlob(image.dataUrl);
  const { thumbnailBlob, width, height, aspectRatio } = await createThumbnail(blob);

  const id = await db.items.add({
    originalBlob: blob,
    thumbnailBlob,
    sourceUrl: 'ai-generation',
    pageTitle:
      pageTitle || (image.prompt.length > 35 ? `${image.prompt.slice(0, 35)}...` : image.prompt),
    width: width || image.width,
    height: height || image.height,
    aspectRatio,
    createdAt: Date.now(),
    tags: ['AI生图'],
    status: 'generated',
    folderId: folderId ?? null,
  });

  // Register the original prompt that generated this image
  await db.prompts.add({
    itemId: id,
    model: image.model || 'ai-generator',
    subject: [],
    style: [image.aspectRatio],
    lighting: [],
    composition: [`${image.width}×${image.height}`],
    masterPrompt: image.prompt,
    createdAt: Date.now(),
    isOriginalPrompt: true,
  });

  return id;
}

/**
 * Saves an AI-generated prompt + image into Prompt Library (Dexie `promptItems`).
 */
export async function saveGeneratedImageToPromptLibrary(
  image: GeneratedImage,
  title?: string
): Promise<string> {
  const promptId = `user_gen_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  await db.promptItems.put({
    id: promptId,
    sourceId: 'my-vault',
    category: 'my-vault',
    prompt: image.prompt,
    title:
      title || (image.prompt.length > 25 ? `${image.prompt.slice(0, 25)}...` : image.prompt),
    coverUrl: image.dataUrl,
    tags: ['AI生图', image.aspectRatio],
    isFavorite: true,
    createdAt: new Date().toISOString(),
  });
  return promptId;
}

/**
 * Persists an AI generation batch task to Dexie IndexedDB.
 */
export async function addGenerationTask(task: GenerationBatchTask): Promise<void> {
  await db.generationTasks.put(task);
}

/**
 * Retrieves all generation tasks ordered by creation time descending.
 */
export async function getGenerationTasks(): Promise<GenerationBatchTask[]> {
  return await db.generationTasks.orderBy('createdAt').reverse().toArray();
}

/**
 * Updates a generation task (e.g. image saved flags, status).
 */
export async function updateGenerationTask(
  id: string,
  updates: Partial<GenerationBatchTask>
): Promise<void> {
  await db.generationTasks.update(id, updates);
}

/**
 * Deletes a single generation task by its ID.
 */
export async function deleteGenerationTask(id: string): Promise<void> {
  await db.generationTasks.delete(id);
}

/**
 * Clears all generation tasks from IndexedDB.
 */
export async function clearGenerationTasks(): Promise<void> {
  await db.generationTasks.clear();
}

/**
 * Calculates a SHA-256 hash for a DataURL string to power single-instance deduplication.
 */
export async function calculateDataUrlHash(dataUrl: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(dataUrl);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Saves a reference image into the single-instance Reference Asset Pool (`referenceAssets`).
 * Computes a SHA-256 hash from the DataURL to deduplicate identical reference images,
 * preventing storage explosion when generating multiple times with large reference images.
 * Preserves 100% lossless fidelity without silent compression.
 */
export async function saveReferenceAsset(dataUrl: string): Promise<string> {
  if (!dataUrl) return '';
  const id = await calculateDataUrlHash(dataUrl);
  const existing = await db.referenceAssets.get(id);
  if (!existing) {
    await db.referenceAssets.put({
      id,
      dataUrl,
      createdAt: Date.now(),
    });
  }
  return id;
}

/**
 * Retrieves a reference image DataURL from the Reference Asset Pool by its hash ID.
 */
export async function getReferenceAsset(id: string): Promise<string | undefined> {
  if (!id) return undefined;
  const asset = await db.referenceAssets.get(id);
  return asset?.dataUrl;
}

/**
 * Saves multiple reference images into the single-instance Reference Asset Pool in parallel.
 * Returns an array of SHA-256 hash IDs corresponding to each reference image.
 */
export async function saveReferenceAssets(dataUrls: string[]): Promise<string[]> {
  if (!dataUrls || dataUrls.length === 0) return [];
  return Promise.all(dataUrls.map((url) => saveReferenceAsset(url)));
}

/**
 * Retrieves multiple reference images from the Reference Asset Pool by their hash IDs.
 */
export async function getReferenceAssets(ids: string[]): Promise<string[]> {
  if (!ids || ids.length === 0) return [];
  const results = await Promise.all(ids.map((id) => getReferenceAsset(id)));
  return results.filter((url): url is string => Boolean(url));
}

/**
 * Deletes a single reference asset by its hash ID.
 */
export async function deleteReferenceAsset(id: string): Promise<void> {
  await db.referenceAssets.delete(id);
}


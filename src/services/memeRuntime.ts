import { db } from '../db';
import type { MemeItem, MemeSource, MemeSourceRefreshResult } from '../types';
import { CAPTURE_TAGS } from '../utils/itemHelpers';
import { MAX_MEME_INDEX_BYTES, normalizeMemeIndex } from './memeAdapters';

export const DEFAULT_MEME_SOURCES: MemeSource[] = [
  {
    id: 'memegen',
    name: 'Meme 模板 memegen',
    kind: 'memegen',
    url: 'https://api.memegen.link/templates/',
    homepage: 'https://github.com/jacebrowning/memegen',
    enabled: true,
    builtIn: true,
  },
];

/** 补齐内置来源，不覆盖用户已改过的启用状态 */
export async function ensureDefaultMemeSources(): Promise<void> {
  const existing = new Set((await db.memeSources.toArray()).map((s) => s.id));
  const missing = DEFAULT_MEME_SOURCES.filter((s) => !existing.has(s.id));
  if (missing.length > 0) await db.memeSources.bulkPut(missing);
}

async function fetchIndex(source: MemeSource, signal?: AbortSignal): Promise<MemeItem[]> {
  const response = await fetch(source.url, { cache: 'no-store', signal: signal ?? AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const length = Number(response.headers.get('content-length') || 0);
  if (length > MAX_MEME_INDEX_BYTES) throw new Error('Index file is too large');
  const body = await response.text();
  if (body.length > MAX_MEME_INDEX_BYTES) throw new Error('Index file is too large');
  return normalizeMemeIndex(JSON.parse(body), source);
}

const loading = new Map<string, Promise<MemeSourceRefreshResult>>();

export function refreshMemeSource(source: MemeSource): Promise<MemeSourceRefreshResult> {
  const current = loading.get(source.id);
  if (current) return current;

  const promise = (async (): Promise<MemeSourceRefreshResult> => {
    try {
      const items = await fetchIndex(source);
      const now = new Date().toISOString();
      await db.transaction('rw', db.memes, db.memeSources, async () => {
        // 同步期间来源可能已被删除，此时不能把它写回去
        if (!(await db.memeSources.get(source.id))) return;
        const previous = new Map(
          (await db.memes.where('sourceId').equals(source.id).toArray()).map((m) => [m.id, m])
        );
        const merged = items.map((item) => {
          const old = previous.get(item.id);
          return old ? { ...item, isFavorite: old.isFavorite, savedItemId: old.savedItemId } : item;
        });
        await db.memes.where('sourceId').equals(source.id).delete();
        await db.memes.bulkPut(merged);
        await db.memeSources.update(source.id, { count: merged.length, lastSuccessAt: now, lastError: '' });
      });
      return { sourceId: source.id, sourceName: source.name, count: items.length, success: true, lastError: '' };
    } catch (err) {
      const lastError = err instanceof Error ? err.message : String(err);
      await db.memeSources.update(source.id, { lastError });
      return { sourceId: source.id, sourceName: source.name, count: 0, success: false, lastError };
    } finally {
      loading.delete(source.id);
    }
  })();

  loading.set(source.id, promise);
  return promise;
}

export async function refreshAllMemeSources(): Promise<MemeSourceRefreshResult[]> {
  await ensureDefaultMemeSources();
  const sources = await db.memeSources.filter((s) => s.enabled).toArray();
  return Promise.all(sources.map(refreshMemeSource));
}

export function isValidIndexUrl(value: string): boolean {
  try {
    return new URL(value.trim()).protocol === 'https:';
  } catch {
    return false;
  }
}

export async function addCustomMemeSource(name: string, url: string): Promise<MemeSource> {
  const cleanUrl = url.trim();
  if (!isValidIndexUrl(cleanUrl)) throw new Error('Invalid URL');
  const source: MemeSource = {
    id: `custom-${Date.now().toString(36)}`,
    name: name.trim() || new URL(cleanUrl).hostname,
    kind: 'custom',
    url: cleanUrl,
    homepage: cleanUrl,
    enabled: true,
    builtIn: false,
  };
  await db.memeSources.put(source);
  return source;
}

export async function removeMemeSource(id: string): Promise<void> {
  await db.transaction('rw', db.memes, db.memeSources, async () => {
    await db.memes.where('sourceId').equals(id).delete();
    await db.memeSources.delete(id);
  });
}

export async function setMemeSourceEnabled(id: string, enabled: boolean): Promise<void> {
  await db.memeSources.update(id, { enabled });
}

export async function toggleMemeFavorite(id: string, isFavorite: boolean): Promise<void> {
  await db.memes.update(id, { isFavorite });
}

const saving = new Map<string, Promise<number>>();

/** 存入图库：已存过则直接复用，同一张并发点击只入库一次；下载在 Service Worker 内完成 */
export function saveMemeToGallery(meme: MemeItem): Promise<number> {
  const current = saving.get(meme.id);
  if (current) return current;
  const promise = saveMemeOnce(meme).finally(() => saving.delete(meme.id));
  saving.set(meme.id, promise);
  return promise;
}

async function saveMemeOnce(meme: MemeItem): Promise<number> {
  if (typeof meme.savedItemId === 'number' && (await db.items.get(meme.savedItemId))) {
    return meme.savedItemId;
  }
  const response = await chrome.runtime.sendMessage({
    action: 'CAPTURE_IMAGE',
    src: meme.url,
    sourceUrl: meme.url,
    pageTitle: meme.name,
    tags: [CAPTURE_TAGS.MEME],
  });
  if (!response?.success || typeof response.item?.id !== 'number') {
    throw new Error(response?.error || 'Failed to save meme');
  }
  await db.memes.update(meme.id, { savedItemId: response.item.id });
  return response.item.id;
}

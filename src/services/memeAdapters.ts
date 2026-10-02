import type { MemeItem, MemeSource } from '../types';

const IMAGE_EXT = /\.(gif|png|jpe?g|webp)$/i;

export const MAX_MEME_INDEX_BYTES = 30 * 1024 * 1024;

function text(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
}

function textList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map(text).filter(Boolean)));
}

function httpUrl(value: string, base?: string): string {
  if (!value) return '';
  try {
    const url = new URL(value, base);
    return url.protocol === 'https:' ? url.toString() : '';
  } catch {
    return '';
  }
}

function fileNameOf(url: string): string {
  const last = (url.split('?')[0] ?? url).split('/').pop() || url;
  try {
    return decodeURIComponent(last).replace(IMAGE_EXT, '');
  } catch {
    return last.replace(IMAGE_EXT, '');
  }
}

export function normalizeMemegen(data: unknown, source: MemeSource): MemeItem[] {
  if (!Array.isArray(data)) throw new Error('Unexpected memegen response');
  const now = Date.now();
  const seen = new Set<string>();
  const items: MemeItem[] = [];
  for (const entry of data) {
    const record = (entry ?? {}) as Record<string, unknown>;
    const key = text(record.id);
    const name = text(record.name);
    const url = httpUrl(text(record.blank));
    if (!key || !name || !url || seen.has(key)) continue;
    seen.add(key);
    items.push({
      id: `${source.id}:${key}`,
      sourceId: source.id,
      name,
      url,
      tags: textList(record.keywords),
      createdAt: now,
    });
  }
  return items;
}

/** 自定义索引：`[{name,url,tags?,category?}]` 或 `{items:[...]}` */
export function normalizeCustomIndex(data: unknown, source: MemeSource): MemeItem[] {
  const list = Array.isArray(data) ? data : (data as { items?: unknown } | null)?.items;
  if (!Array.isArray(list)) throw new Error('Index must be an array or { "items": [...] }');
  const now = Date.now();
  const seen = new Set<string>();
  const items: MemeItem[] = [];
  for (const entry of list) {
    const record = (entry ?? {}) as Record<string, unknown>;
    const url = httpUrl(text(record.url), source.url);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    const category = text(record.category);
    items.push({
      id: `${source.id}:${url}`,
      sourceId: source.id,
      name: text(record.name) || fileNameOf(url),
      url,
      category: category || undefined,
      tags: Array.from(new Set([...(category ? [category] : []), ...textList(record.tags)])),
      createdAt: now,
    });
  }
  return items;
}

export function normalizeMemeIndex(data: unknown, source: MemeSource): MemeItem[] {
  switch (source.kind) {
    case 'memegen':
      return normalizeMemegen(data, source);
    default:
      return normalizeCustomIndex(data, source);
  }
}

export function matchesMemeQuery(item: MemeItem, query: string): boolean {
  if (!query) return true;
  const haystack = [item.name, item.category, ...item.tags].filter(Boolean).join(' ').toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((term) => haystack.includes(term));
}

import type {
  PromptSource,
  PromptItem,
  PromptSourceRefreshResult,
  PromptSourceRefreshSummary,
  InspirationItem,
  PromptResult,
} from '../types';
import { db } from '../db';

import { PICPOCKET_CURATED_PROMPTS } from './curatedPrompts';

export const PROMPT_REGISTRY_BASE =
  'https://cdn.jsdelivr.net/gh/yukkcat/image-prompts@main/dist/sources';

export const DEFAULT_PROMPT_SOURCES: PromptSource[] = [
  {
    id: 'picpocket-curated',
    name: 'PicPocket 官方精选',
    url: 'local://picpocket-curated',
    homepage: 'https://github.com/QingYunA/picpocket',
    enabled: true,
    builtIn: true,
  },
  {
    id: 'youmind-gpt-image-2',
    name: 'YouMind GPT Image 2',
    url: `${PROMPT_REGISTRY_BASE}/youmind-gpt-image-2.json`,
    homepage: 'https://github.com/YouMind-OpenLab/awesome-gpt-image-2',
    enabled: false,
    builtIn: true,
  },
  {
    id: 'youmind-nano-banana-pro',
    name: 'YouMind Nano Banana Pro',
    url: `${PROMPT_REGISTRY_BASE}/youmind-nano-banana-pro-prompts.json`,
    homepage: 'https://github.com/YouMind-OpenLab/awesome-nano-banana-pro-prompts',
    enabled: false,
    builtIn: true,
  },
  {
    id: 'freestylefly-gpt-image-2',
    name: 'Freestylefly GPT Image 2',
    url: `${PROMPT_REGISTRY_BASE}/freestylefly-gpt-image-2.json`,
    homepage: 'https://github.com/freestylefly/awesome-gpt-image-2',
    enabled: false,
    builtIn: true,
  },
];

export const DEPRECATED_SOURCE_IDS = [
  'banana-prompt-quicker',
  'davidwu-gpt-image2-prompts',
  'awesome-gpt-image',
  'awesome-gpt4o-image-prompts',
];

export async function cleanupDeprecatedSources(): Promise<void> {
  try {
    for (const deprecatedId of DEPRECATED_SOURCE_IDS) {
      await db.promptSources.delete(deprecatedId);
      await db.promptItems.where('sourceId').equals(deprecatedId).delete();
    }
  } catch (err) {
    console.warn('Failed to cleanup deprecated prompt sources:', err);
  }
}

export function absoluteUrl(baseUrl: string, path?: string): string {
  if (!path) return '';
  try {
    return new URL(path, baseUrl).toString();
  } catch {
    return path;
  }
}

function leftPad(num: number, length = 4): string {
  return String(num).padStart(length, '0');
}

function stringValue(val: unknown): string {
  return typeof val === 'string' || typeof val === 'number' ? String(val) : '';
}

function stringArray(val: unknown): string[] {
  if (!Array.isArray(val)) return [];
  return val.map(stringValue).map((s) => s.trim()).filter(Boolean);
}

export function normalizeItems(values: unknown[], source: PromptSource): PromptItem[] {
  if (!Array.isArray(values)) return [];
  const seen = new Set<string>();
  const items: PromptItem[] = [];

  values.forEach((val, idx) => {
    if (!val || typeof val !== 'object') return;
    const record = val as Record<string, unknown>;

    const title = stringValue(record.title).trim();
    const prompt = stringValue(record.prompt).trim();
    if (!title || !prompt) return;

    const id = stringValue(record.id).trim() || `${source.id}-${leftPad(idx + 1)}`;
    if (seen.has(id)) return;
    seen.add(id);

    const rawRefImages = stringArray(record.referenceImageUrls);
    const referenceImageUrls = rawRefImages.map((u) => absoluteUrl(source.url, u));
    const coverUrl =
      absoluteUrl(source.url, stringValue(record.coverUrl)) || referenceImageUrls[0] || '';

    items.push({
      id,
      sourceId: source.id,
      category: source.name,
      title,
      prompt,
      description: stringValue(record.description).trim(),
      coverUrl,
      referenceImageUrls,
      tags: stringArray(record.tags),
      preview: stringValue(record.preview),
      createdAt: stringValue(record.createdAt),
      updatedAt: stringValue(record.updatedAt),
      author: stringValue(record.author).trim(),
      sourceUrl: absoluteUrl(source.url, stringValue(record.sourceUrl)),
      githubUrl: stringValue(record.sourceUrl)
        ? absoluteUrl(source.url, stringValue(record.sourceUrl))
        : source.homepage,
      imageMode: stringValue(record.imageMode) || undefined,
      imageModel: stringValue(record.imageModel) || undefined,
      imageSize: stringValue(record.imageSize) || undefined,
      imageCount: Number(record.imageCount) || undefined,
    });
  });

  return items;
}

export async function fetchSourcePrompts(
  source: PromptSource,
  signal?: AbortSignal
): Promise<PromptItem[]> {
  if (source.id === 'picpocket-curated' || source.url?.startsWith('local://')) {
    return [...PICPOCKET_CURATED_PROMPTS];
  }

  if (!source.url?.trim()) {
    throw new Error(`Prompt source "${source.name}" has no valid URL.`);
  }

  const response = await fetch(source.url, {
    cache: 'no-store',
    signal,
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch source "${source.name}": HTTP ${response.status}`);
  }

  const data = await response.json();
  return normalizeItems(data, source);
}

// In-memory loading lock to deduplicate concurrent calls
const loadingSources = new Map<string, Promise<PromptSourceRefreshResult>>();

export async function refreshSingleSource(source: PromptSource): Promise<PromptSourceRefreshResult> {
  const current = loadingSources.get(source.id);
  if (current) return current;

  const promise = (async () => {
    try {
      const items = await fetchSourcePrompts(source);
      const now = new Date().toISOString();

      // Transact items into Dexie: clear old items from this source and save fresh ones
      await db.transaction('rw', db.promptItems, db.promptSources, async () => {
        // Keep favorites if any
        const existingFavorites = new Set(
          (await db.promptItems.where('sourceId').equals(source.id).toArray())
            .filter((i) => i.isFavorite)
            .map((i) => i.id)
        );

        items.forEach((item) => {
          if (existingFavorites.has(item.id)) {
            item.isFavorite = true;
          }
        });

        // Replace items of this source
        await db.promptItems.where('sourceId').equals(source.id).delete();
        await db.promptItems.bulkPut(items);

        // Update source stats
        await db.promptSources.put({
          ...source,
          count: items.length,
          lastSuccessAt: now,
          lastError: '',
        });
      });

      return {
        sourceId: source.id,
        sourceName: source.name,
        count: items.length,
        lastSuccessAt: now,
        lastError: '',
        success: true,
      };
    } catch (err) {
      const lastError = err instanceof Error ? err.message : String(err);
      await db.promptSources.put({
        ...source,
        lastError,
      });

      return {
        sourceId: source.id,
        sourceName: source.name,
        count: 0,
        lastSuccessAt: source.lastSuccessAt || '',
        lastError,
        success: false,
      };
    } finally {
      loadingSources.delete(source.id);
    }
  })();

  loadingSources.set(source.id, promise);
  return promise;
}

export async function refreshAllPromptSources(): Promise<PromptSourceRefreshSummary> {
  const sources = await db.promptSources.filter((s) => s.enabled).toArray();
  const targetSources = sources.length > 0 ? sources : DEFAULT_PROMPT_SOURCES;

  const results = await Promise.all(targetSources.map((s) => refreshSingleSource(s)));

  return {
    results,
    total: results.reduce((acc, cur) => acc + cur.count, 0),
    successCount: results.filter((r) => r.success).length,
    failureCount: results.filter((r) => !r.success).length,
  };
}

export async function savePromptFromAnalysis(
  item: InspirationItem,
  result: PromptResult
): Promise<PromptItem> {
  const now = new Date().toISOString();
  // Stable idempotent ID based on original inspiration item ID
  const id = item.id ? `vault-inspiration-${item.id}` : `vault-${Date.now()}`;

  let localImageDataUrl: string | undefined;
  const targetBlob = item.thumbnailBlob || item.originalBlob;
  if (targetBlob && typeof FileReader !== 'undefined') {
    try {
      localImageDataUrl = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve((reader.result as string) || '');
        reader.onerror = () => resolve('');
        reader.readAsDataURL(targetBlob);
      });
    } catch {
      // Fallback
    }
  }

  const promptItem: PromptItem = {
    id,
    sourceId: 'my-vault',
    category: 'my-vault',
    title: item.pageTitle?.trim() || 'Master Prompt',
    prompt: result.masterPrompt,
    description: `Model: ${result.model}`,
    coverUrl: localImageDataUrl || '',
    localImageDataUrl,
    tags: Array.from(
      new Set([
        ...(item.tags || []),
        ...(result.subject || []),
        ...(result.style || []),
      ])
    ).filter(Boolean),
    blocks: {
      subject: result.subject || [],
      style: result.style || [],
      lighting: result.lighting || [],
      composition: result.composition || [],
    },
    isFavorite: true,
    isCustom: true,
    createdAt: now,
  };

  await db.promptItems.put(promptItem);
  return promptItem;
}

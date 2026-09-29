/**
 * 托管（积分 / 兑换码）模式可选的模型。线上以服务端的托管目录为准（随 get-entitlement 下发，
 * 见下方 applyHostedCatalog），服务端可随时上新或下线模型而无需发版；
 * 下面的清单是尚未联网 / 未登录时的内置兜底，路由与计价始终在服务端完成。
 */
export const HOSTED_VISION_MODELS = [
  'deepseek-flash',
  'qwen3.7-plus',
  'gemini-3.8-flash',
  'gpt-6-sol',
  'claude-sonnet-5',
  'gemini-3.1-pro',
  'glm-5.3-flash',
  'kimi-k3',
  'minimax-m3',
] as const;

export const HOSTED_IMAGE_MODELS = [
  'gpt-image-2.5-sunburst',
  'gpt-image-2.5-flare',
  'gpt-image-2',
  'grok-imagine-image-2.0',
  'nano-banana-pro',
  'seedream-5-pro',
  'qwen-image-2.0',
  'z-image-turbo',
  'wan2.7-image',
] as const;

/** 内置的 PicPocket 官方渠道：不需要用户配置，按账号积分或兑换码使用下面的托管模型 */
export const PICPOCKET_CHANNEL_ID = 'picpocket';

export const DEFAULT_HOSTED_VISION_MODEL = 'deepseek-flash';
export const DEFAULT_HOSTED_IMAGE_MODEL = 'gpt-image-2.5-sunburst';

export interface HostedCatalog {
  vision: readonly string[];
  image: readonly string[];
  defaultVision: string;
  defaultImage: string;
}

export const HOSTED_CATALOG_STORAGE_KEY = 'picpocket_hosted_catalog';
const FALLBACK_CATALOG: HostedCatalog = {
  vision: HOSTED_VISION_MODELS,
  image: HOSTED_IMAGE_MODELS,
  defaultVision: DEFAULT_HOSTED_VISION_MODEL,
  defaultImage: DEFAULT_HOSTED_IMAGE_MODEL,
};

let catalog: HostedCatalog = FALLBACK_CATALOG;
/** 已由服务端目录（联网拉取）覆盖过；此后存储里较旧的缓存不能再盖掉它 */
let appliedFromServer = false;
const listeners = new Set<() => void>();

export const getHostedCatalog = (): HostedCatalog => catalog;

export function subscribeHostedCatalog(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function setCatalog(next: HostedCatalog): void {
  const same = JSON.stringify(next) === JSON.stringify(catalog);
  if (same) return;
  catalog = next;
  listeners.forEach((listener) => listener());
}

/** 只接受结构完整、默认模型在清单内的目录，避免一份残缺数据让模型选择器变空 */
function parseCatalog(value: unknown): HostedCatalog | null {
  const raw = value as Partial<HostedCatalog> | null | undefined;
  const isList = (list: unknown): list is string[] => Array.isArray(list) && list.length > 0 && list.every((id) => typeof id === 'string');
  if (!raw || !isList(raw.vision) || !isList(raw.image)) return null;
  const defaultVision = raw.defaultVision && raw.vision.includes(raw.defaultVision) ? raw.defaultVision : (raw.vision[0] as string);
  const defaultImage = raw.defaultImage && raw.image.includes(raw.defaultImage) ? raw.defaultImage : (raw.image[0] as string);
  return { vision: raw.vision, image: raw.image, defaultVision, defaultImage };
}

/** get-entitlement 返回的 pricing 就是服务端当前启用的托管目录；写入内存并缓存，后台与画布页面通过 storage 事件同步 */
export function applyHostedCatalog(pricing?: {
  defaultVisionModel?: string;
  defaultImageModel?: string;
  vision: Array<{ id: string }>;
  image: Array<{ id: string }>;
}): void {
  if (!Array.isArray(pricing?.vision) || !Array.isArray(pricing?.image)) return;
  const next = parseCatalog({
    vision: pricing.vision.map((item) => item.id),
    image: pricing.image.map((item) => item.id),
    defaultVision: pricing.defaultVisionModel,
    defaultImage: pricing.defaultImageModel,
  });
  if (!next) return;
  appliedFromServer = true;
  setCatalog(next);
  // 存储不可用或配额溢出时只在本次会话内生效
  if (typeof chrome === 'undefined' || !chrome.storage?.local) return;
  void Promise.resolve(chrome.storage.local.set({ [HOSTED_CATALOG_STORAGE_KEY]: next })).catch(() => undefined);
}

let catalogLoaded: Promise<void> = Promise.resolve();

function watchStoredCatalog(): void {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) return;
  catalogLoaded = chrome.storage.local.get(HOSTED_CATALOG_STORAGE_KEY).then(
    (data) => {
      const stored = parseCatalog(data?.[HOSTED_CATALOG_STORAGE_KEY]);
      if (stored && !appliedFromServer) setCatalog(stored);
    },
    () => undefined
  );
  chrome.storage.onChanged?.addListener((changes, area) => {
    if (area !== 'local' || !changes[HOSTED_CATALOG_STORAGE_KEY]) return;
    const stored = parseCatalog(changes[HOSTED_CATALOG_STORAGE_KEY].newValue);
    if (stored) setCatalog(stored);
  });
}
watchStoredCatalog();

/** Service Worker 冷启动后首次解析托管模型前先等缓存读完，避免新上线的模型被内置清单误判为不存在 */
export function ensureHostedCatalogLoaded(): Promise<void> {
  return catalogLoaded;
}

function pick(list: readonly string[], fallback: string, candidates: Array<string | undefined>): string {
  for (const candidate of candidates) {
    const id = candidate?.trim().toLowerCase();
    if (id && list.includes(id)) return id;
  }
  return fallback;
}

/** 按顺序取第一个在托管目录里的反推模型，都不在时用默认模型（自备 Key 的模型名不会被发往托管网关） */
export function hostedVisionModel(...candidates: Array<string | undefined>): string {
  return pick(catalog.vision, catalog.defaultVision, candidates);
}

/** 按顺序取第一个在托管目录里的生图模型，都不在时用默认模型 */
export function hostedImageModel(...candidates: Array<string | undefined>): string {
  return pick(catalog.image, catalog.defaultImage, candidates);
}

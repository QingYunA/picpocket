import type { UserSettings, Language, ImageAspectRatio, McpSettings, ActiveGenerationState, ActiveAnalysisState } from '../types';
import { sanitizeHttpHeaderToken, sanitizeHttpUrl } from './sanitize';

export function getDefaultLanguage(): Language {
  if (typeof navigator !== 'undefined' && navigator.language) {
    return navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en';
  }
  return 'zh';
}

export const DEFAULT_MCP_SETTINGS: McpSettings = {
  enabled: true,
  port: 18088,
  authToken: 'promptsnap-local-token',
  permissions: {
    read: true,
    write: true,
    generate: false,
  },
};

export const DEFAULT_SETTINGS: UserSettings = {
  apiKey: '',
  baseUrl: 'https://api.deepseek.com/v1',
  model: 'deepseek-chat',
  autoAnalyzeOnCapture: false,
  language: 'zh',
  enableHoverBadge: true,
  hoverBadgePromptDismissed: false,
  contextMenuMode: 'dual-menu',
  defaultImageAspectRatio: '1:1',
  mcpSettings: DEFAULT_MCP_SETTINGS,
};


let inMemoryStorage: Record<string, any> | null = null;

export async function getUserSettings(): Promise<UserSettings> {
  const fallbackSettings: UserSettings = {
    ...DEFAULT_SETTINGS,
    language: getDefaultLanguage(),
  };

  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    const data = await chrome.storage.local.get('promptsnap_settings');
    return { ...fallbackSettings, ...(data.promptsnap_settings || {}) };
  }

  if (typeof localStorage !== 'undefined') {
    const stored = localStorage.getItem('promptsnap_settings');
    if (stored) {
      try {
        return { ...fallbackSettings, ...JSON.parse(stored) };
      } catch {
        // ignore
      }
    }
  }

  if (inMemoryStorage && inMemoryStorage.promptsnap_settings) {
    return { ...fallbackSettings, ...inMemoryStorage.promptsnap_settings };
  }

  return fallbackSettings;
}

export async function saveUserSettings(settings: Partial<UserSettings>): Promise<UserSettings> {
  const current = await getUserSettings();
  const updated = { ...current, ...settings };

  if (settings.imageModel !== undefined && settings.imageChannels === undefined && current.imageChannels?.length) {
    const active = current.imageChannels.find((channel) => channel.id === (current.activeImageChannelId || current.imageChannels?.[0]?.id));
    const allowed = active?.models || (active?.model ? [active.model] : []);
    if (settings.imageModel && !allowed.includes(settings.imageModel)) updated.imageModel = current.imageModel;
    updated.imageChannels = current.imageChannels.map((channel) =>
      channel.id === active?.id && updated.imageModel !== current.imageModel
        ? { ...channel, model: updated.imageModel || channel.model }
        : channel
    );
  }

  if (settings.model !== undefined && settings.visionChannels === undefined && current.visionChannels?.length) {
    updated.visionChannels = current.visionChannels.map((channel) =>
      channel.id === current.activeVisionChannelId ? { ...channel, model: settings.model! } : channel
    );
  }

  if (updated.apiKey !== undefined) {
    updated.apiKey = sanitizeHttpHeaderToken(updated.apiKey);
  }
  if (updated.imageApiKey !== undefined) {
    updated.imageApiKey = sanitizeHttpHeaderToken(updated.imageApiKey);
  }
  if (updated.baseUrl !== undefined) {
    updated.baseUrl = sanitizeHttpUrl(updated.baseUrl);
  }
  if (updated.imageBaseUrl !== undefined) {
    updated.imageBaseUrl = sanitizeHttpUrl(updated.imageBaseUrl);
  }

  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    await chrome.storage.local.set({ promptsnap_settings: updated });
  }

  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('promptsnap_settings', JSON.stringify(updated));
  }

  if (typeof chrome === 'undefined' && typeof localStorage === 'undefined') {
    if (!inMemoryStorage) inMemoryStorage = {};
    inMemoryStorage.promptsnap_settings = updated;
  }

  return updated;
}

export function onLanguageChange(callback: (newLang: Language) => void): () => void {
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
    const listener = (changes: { [key: string]: chrome.storage.StorageChange }, area: string) => {
      if (area === 'local' && changes.promptsnap_settings?.newValue) {
        const newLang = (changes.promptsnap_settings.newValue as any).language;
        if (newLang === 'zh' || newLang === 'en') {
          callback(newLang);
        }
      }
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }
  return () => {};
}

export type SidepanelTab = 'gallery' | 'prompts' | 'memes' | 'generator';

export const VALID_TABS: SidepanelTab[] = ['gallery', 'prompts', 'memes', 'generator'];

export function resetInMemoryStorageForTesting(): void {
  inMemoryStorage = null;
  currentGeneratorDraftCache = null;
}

export function getInitialActiveTab(): SidepanelTab {
  if (typeof localStorage !== 'undefined') {
    const stored = localStorage.getItem('promptsnap_active_tab');
    if (stored !== null) {
      return (VALID_TABS as string[]).includes(stored) ? (stored as SidepanelTab) : 'gallery';
    }
  }
  if (inMemoryStorage && inMemoryStorage.promptsnap_active_tab) {
    const mem = inMemoryStorage.promptsnap_active_tab;
    if ((VALID_TABS as string[]).includes(mem)) {
      return mem as SidepanelTab;
    }
  }
  return 'gallery';
}

export async function getActiveTab(): Promise<SidepanelTab> {
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    const data = await chrome.storage.local.get('promptsnap_active_tab');
    const val = data?.promptsnap_active_tab;
    if (typeof val === 'string' && (VALID_TABS as string[]).includes(val)) {
      return val as SidepanelTab;
    }
  }
  return getInitialActiveTab();
}

async function persistStorageEntry<T>(
  key: string,
  value: T,
  sanitizeFallback?: (val: T) => T
): Promise<void> {
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    try {
      await chrome.storage.local.set({ [key]: value });
    } catch (e) {
      console.warn(`Failed to persist ${key} to chrome.storage.local:`, e);
    }
  }

  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
    } catch (e) {
      if (sanitizeFallback) {
        try {
          const fallback = sanitizeFallback(value);
          localStorage.setItem(key, typeof fallback === 'string' ? fallback : JSON.stringify(fallback));
        } catch {
          // ignore
        }
      }
    }
  }

  if (!inMemoryStorage) inMemoryStorage = {};
  inMemoryStorage[key] = value;
}

export async function saveActiveTab(tab: SidepanelTab): Promise<SidepanelTab> {
  const safeTab: SidepanelTab = VALID_TABS.includes(tab) ? tab : 'gallery';
  await persistStorageEntry('promptsnap_active_tab', safeTab);
  return safeTab;
}

export interface GeneratorDraftState {
  prompt: string;
  aspectRatio: ImageAspectRatio;
  count: number;
  negativePrompt: string;
  referenceImage: string | null;
  referenceAssetId?: string | null;
  referenceImages?: string[];
  referenceAssetIds?: string[];
  sendAsRef: boolean;
  showAdvanced: boolean;
}

export const DEFAULT_GENERATOR_DRAFT: GeneratorDraftState = {
  prompt: '',
  aspectRatio: '1:1',
  count: 1,
  negativePrompt: '',
  referenceImage: null,
  referenceAssetId: null,
  referenceImages: [],
  referenceAssetIds: [],
  sendAsRef: false,
  showAdvanced: false,
};

let currentGeneratorDraftCache: GeneratorDraftState | null = null;

export function getInitialGeneratorDraft(): GeneratorDraftState {
  if (currentGeneratorDraftCache) {
    return currentGeneratorDraftCache;
  }
  let draft: GeneratorDraftState = { ...DEFAULT_GENERATOR_DRAFT };
  if (typeof localStorage !== 'undefined') {
    const stored = localStorage.getItem('promptsnap_generator_draft');
    if (stored) {
      try {
        draft = { ...DEFAULT_GENERATOR_DRAFT, ...JSON.parse(stored) };
        currentGeneratorDraftCache = draft;
        return draft;
      } catch {
        // ignore
      }
    }
  }
  if (inMemoryStorage && inMemoryStorage.promptsnap_generator_draft) {
    draft = {
      ...DEFAULT_GENERATOR_DRAFT,
      ...inMemoryStorage.promptsnap_generator_draft,
    };
    currentGeneratorDraftCache = draft;
    return draft;
  }
  currentGeneratorDraftCache = draft;
  return draft;
}

export async function getGeneratorDraft(): Promise<GeneratorDraftState> {
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    const data = await chrome.storage.local.get('promptsnap_generator_draft');
    if (data?.promptsnap_generator_draft) {
      const draft: GeneratorDraftState = {
        ...DEFAULT_GENERATOR_DRAFT,
        ...data.promptsnap_generator_draft,
      };
      currentGeneratorDraftCache = draft;
      return draft;
    }
  }
  return getInitialGeneratorDraft();
}

/**
 * Persists generator draft while adhering to strict separation of concerns (ADR-0007).
 * When referenceAssetId(s) are present, multi-megabyte referenceImage(s) Base64 strings are excluded from
 * chrome.storage.local and localStorage to prevent quota exhaustion, while remaining in
 * memory cache for instant UI continuity.
 */
export async function saveGeneratorDraft(
  draft: Partial<GeneratorDraftState>
): Promise<GeneratorDraftState> {
  const current = getInitialGeneratorDraft();
  const updated: GeneratorDraftState = { ...current, ...draft };

  // Synchronously update in-memory cache to eliminate race conditions
  currentGeneratorDraftCache = updated;

  const hasDeduplicatedRefs = Boolean(
    updated.referenceAssetId || (updated.referenceAssetIds && updated.referenceAssetIds.length > 0)
  );

  // Stripped payload for chrome.storage.local and localStorage
  const diskPayload: GeneratorDraftState = {
    ...updated,
    referenceImage: hasDeduplicatedRefs ? null : updated.referenceImage,
    referenceImages: hasDeduplicatedRefs ? [] : updated.referenceImages,
  };

  await persistStorageEntry('promptsnap_generator_draft', diskPayload, (val) => ({
    ...val,
    referenceImage: null,
    referenceImages: [],
  }));

  return updated;
}

export type { ActiveGenerationState, ActiveAnalysisState };

export async function getActiveGeneration(): Promise<ActiveGenerationState | null> {
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    const data = await chrome.storage.local.get('promptsnap_active_generation');
    if (data?.promptsnap_active_generation) {
      return data.promptsnap_active_generation as ActiveGenerationState;
    }
  }
  if (typeof localStorage !== 'undefined') {
    const raw = localStorage.getItem('promptsnap_active_generation');
    if (raw) {
      try {
        return JSON.parse(raw);
      } catch {
        // ignore
      }
    }
  }
  if (inMemoryStorage && inMemoryStorage.promptsnap_active_generation) {
    return inMemoryStorage.promptsnap_active_generation;
  }
  return null;
}

export async function setActiveGeneration(state: ActiveGenerationState): Promise<void> {
  await persistStorageEntry('promptsnap_active_generation', state);
}

export async function clearActiveGeneration(taskId?: string): Promise<void> {
  if (taskId) {
    const current = await getActiveGeneration();
    if (current && current.taskId !== taskId) {
      return;
    }
  }
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    await chrome.storage.local.remove('promptsnap_active_generation');
  }
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem('promptsnap_active_generation');
  }
  if (inMemoryStorage) {
    delete inMemoryStorage.promptsnap_active_generation;
  }
}

export async function getActiveAnalysis(): Promise<ActiveAnalysisState | null> {
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    const data = await chrome.storage.local.get('promptsnap_active_analysis');
    if (data?.promptsnap_active_analysis) {
      return data.promptsnap_active_analysis as ActiveAnalysisState;
    }
  }
  if (typeof localStorage !== 'undefined') {
    const raw = localStorage.getItem('promptsnap_active_analysis');
    if (raw) {
      try {
        return JSON.parse(raw);
      } catch {
        // ignore
      }
    }
  }
  if (inMemoryStorage && inMemoryStorage.promptsnap_active_analysis) {
    return inMemoryStorage.promptsnap_active_analysis;
  }
  return null;
}

export async function setActiveAnalysis(state: ActiveAnalysisState): Promise<void> {
  await persistStorageEntry('promptsnap_active_analysis', state);
}

export async function clearActiveAnalysis(itemId?: number): Promise<void> {
  if (typeof itemId === 'number') {
    const current = await getActiveAnalysis();
    if (current && current.itemId !== itemId) {
      return;
    }
  }
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    await chrome.storage.local.remove('promptsnap_active_analysis');
  }
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem('promptsnap_active_analysis');
  }
  if (inMemoryStorage) {
    delete inMemoryStorage.promptsnap_active_analysis;
  }
}

export type ActiveFolderState = {
  id: number | null | 'inbox'; // null: all assets, 'inbox': uncategorized, number: specific folder id
};

export async function getActiveFolder(): Promise<ActiveFolderState | null> {
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    const data = await chrome.storage.local.get('promptsnap_active_folder');
    if (data?.promptsnap_active_folder) {
      return data.promptsnap_active_folder as ActiveFolderState;
    }
  }
  if (typeof localStorage !== 'undefined') {
    const raw = localStorage.getItem('promptsnap_active_folder');
    if (raw) {
      try {
        return JSON.parse(raw);
      } catch {
        // ignore
      }
    }
  }
  if (inMemoryStorage && inMemoryStorage.promptsnap_active_folder) {
    return inMemoryStorage.promptsnap_active_folder;
  }
  return null;
}

export async function setActiveFolder(state: ActiveFolderState): Promise<void> {
  await persistStorageEntry('promptsnap_active_folder', state);
}

export function onActiveFolderChange(callback: (folderState: ActiveFolderState | null) => void): () => void {
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
    const listener = (changes: { [key: string]: chrome.storage.StorageChange }, areaName: string) => {
      if (areaName === 'local' && changes.promptsnap_active_folder) {
        const val = changes.promptsnap_active_folder.newValue;
        if (val && typeof val === 'object' && 'id' in val) {
          callback(val as ActiveFolderState);
        } else {
          callback(null);
        }
      }
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }
  return () => {};
}

export async function getPendingAutoAnalyzeItemId(): Promise<number | null> {
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    const data = await chrome.storage.local.get('promptsnap_pending_auto_analyze_item_id');
    const val = data?.promptsnap_pending_auto_analyze_item_id;
    return typeof val === 'number' ? val : null;
  }
  if (typeof localStorage !== 'undefined') {
    const raw = localStorage.getItem('promptsnap_pending_auto_analyze_item_id');
    if (raw) {
      const num = Number(raw);
      return Number.isFinite(num) ? num : null;
    }
  }
  if (inMemoryStorage && typeof inMemoryStorage.promptsnap_pending_auto_analyze_item_id === 'number') {
    return inMemoryStorage.promptsnap_pending_auto_analyze_item_id;
  }
  return null;
}

export async function setPendingAutoAnalyzeItemId(itemId: number | null): Promise<void> {
  if (itemId === null) {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      await chrome.storage.local.remove('promptsnap_pending_auto_analyze_item_id');
    }
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('promptsnap_pending_auto_analyze_item_id');
    }
    if (inMemoryStorage) {
      delete inMemoryStorage.promptsnap_pending_auto_analyze_item_id;
    }
  } else {
    await persistStorageEntry('promptsnap_pending_auto_analyze_item_id', itemId);
  }
}


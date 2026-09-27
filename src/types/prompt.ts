export interface PromptSource {
  id: string;
  name: string;
  url: string;
  homepage: string;
  enabled: boolean;
  builtIn: boolean;
  lastSuccessAt?: string;
  lastError?: string;
  count?: number;
}

export interface PromptBlocks {
  subject?: string[];
  style?: string[];
  lighting?: string[];
  composition?: string[];
}

export interface RawPrompt {
  id: string;
  title: string;
  prompt: string;
  description?: string;
  coverUrl?: string;
  referenceImageUrls?: string[];
  tags: string[];
  preview?: string;
  createdAt?: string;
  updatedAt?: string;
  author?: string;
  sourceUrl?: string;
  imageMode?: string;
  imageModel?: string;
  imageSize?: string;
  imageCount?: number;
}

export interface PromptItem extends RawPrompt {
  sourceId: string;
  category: string;
  githubUrl?: string;
  isFavorite?: boolean;
  isCustom?: boolean;
  blocks?: PromptBlocks;
  localImageDataUrl?: string;
}

export type PromptSourceRefreshResult = {
  sourceId: string;
  sourceName: string;
  count: number;
  lastSuccessAt: string;
  lastError: string;
  success: boolean;
};

export type PromptSourceRefreshSummary = {
  results: PromptSourceRefreshResult[];
  total: number;
  successCount: number;
  failureCount: number;
};

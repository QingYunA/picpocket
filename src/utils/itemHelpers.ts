import type { InspirationItem } from '../types';

export const ASSET_SOURCE_TAGS = {
  AI_GENERATED: 'AI生图',
  AGENT_SETTLED: 'Agent沉淀',
  AGENT_COLLAB: 'Agent协同',
} as const;

export const ASSET_SOURCE_URLS = {
  AI_GENERATION: 'ai-generation',
  MCP_COLLABORATION: 'mcp-collaboration',
} as const;

export const CAPTURE_TAGS = {
  WEB_CAPTURE: '网页采集',
  ANALYZED: '已反推',
} as const;

/**
 * 反推成功后追加「已反推」标签；已存在时原样返回，避免重复
 */
export function withAnalyzedTag(tags: string[] | undefined): string[] {
  if (tags?.includes(CAPTURE_TAGS.ANALYZED)) return tags;
  return [...(tags || []), CAPTURE_TAGS.ANALYZED];
}

export type AssetSourceTag = (typeof ASSET_SOURCE_TAGS)[keyof typeof ASSET_SOURCE_TAGS];
export type AssetSourceUrl = (typeof ASSET_SOURCE_URLS)[keyof typeof ASSET_SOURCE_URLS];

/**
 * Checks whether an item was generated via AI (Workbench or External Agent).
 */
export function isAiGeneratedItem(item?: InspirationItem | null): boolean {
  if (!item) return false;
  return (
    item.status === 'generated' ||
    Boolean(item.tags?.includes(ASSET_SOURCE_TAGS.AI_GENERATED)) ||
    item.sourceUrl === ASSET_SOURCE_URLS.AI_GENERATION
  );
}

/**
 * Checks whether an item was created through external AI Agent MCP collaboration.
 */
export function isAgentCollabItem(item?: InspirationItem | null): boolean {
  if (!item) return false;
  return (
    isAiGeneratedItem(item) &&
    (Boolean(item.tags?.includes(ASSET_SOURCE_TAGS.AGENT_SETTLED)) ||
      Boolean(item.tags?.includes(ASSET_SOURCE_TAGS.AGENT_COLLAB)) ||
      item.sourceUrl === ASSET_SOURCE_URLS.MCP_COLLABORATION)
  );
}

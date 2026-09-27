import { describe, it, expect } from 'vitest';
import {
  withAnalyzedTag,
  CAPTURE_TAGS,
  isAiGeneratedItem,
  isAgentCollabItem,
  ASSET_SOURCE_TAGS,
  ASSET_SOURCE_URLS,
} from '../itemHelpers';
import type { InspirationItem } from '@/types';

describe('itemHelpers', () => {
  const baseItem: InspirationItem = {
    id: 1,
    originalBlob: new Blob(['test']),
    createdAt: Date.now(),
    tags: [],
    status: 'analyzed',
  };

  it('identifies AI generated item by status, tag or sourceUrl', () => {
    expect(isAiGeneratedItem(null)).toBe(false);
    expect(isAiGeneratedItem(undefined)).toBe(false);
    expect(isAiGeneratedItem(baseItem)).toBe(false);

    expect(isAiGeneratedItem({ ...baseItem, status: 'generated' })).toBe(true);
    expect(
      isAiGeneratedItem({ ...baseItem, tags: [ASSET_SOURCE_TAGS.AI_GENERATED] })
    ).toBe(true);
    expect(
      isAiGeneratedItem({ ...baseItem, sourceUrl: ASSET_SOURCE_URLS.AI_GENERATION })
    ).toBe(true);
  });

  it('identifies Agent collaboration item accurately', () => {
    expect(isAgentCollabItem(null)).toBe(false);
    expect(isAgentCollabItem(baseItem)).toBe(false);

    // Must be AI generated first
    const aiItem: InspirationItem = { ...baseItem, status: 'generated' };
    expect(isAgentCollabItem(aiItem)).toBe(false);

    expect(
      isAgentCollabItem({ ...aiItem, tags: [ASSET_SOURCE_TAGS.AGENT_SETTLED] })
    ).toBe(true);
    expect(
      isAgentCollabItem({ ...aiItem, tags: [ASSET_SOURCE_TAGS.AGENT_COLLAB] })
    ).toBe(true);
    expect(
      isAgentCollabItem({
        ...aiItem,
        sourceUrl: ASSET_SOURCE_URLS.MCP_COLLABORATION,
      })
    ).toBe(true);
  });
});

describe('withAnalyzedTag', () => {
  it('appends the analyzed tag once analysis succeeds', () => {
    expect(withAnalyzedTag([CAPTURE_TAGS.WEB_CAPTURE])).toEqual([CAPTURE_TAGS.WEB_CAPTURE, CAPTURE_TAGS.ANALYZED]);
  });

  it('does not duplicate an existing analyzed tag', () => {
    const tags = [CAPTURE_TAGS.WEB_CAPTURE, CAPTURE_TAGS.ANALYZED];
    expect(withAnalyzedTag(tags)).toBe(tags);
  });

  it('handles items without tags', () => {
    expect(withAnalyzedTag(undefined)).toEqual([CAPTURE_TAGS.ANALYZED]);
  });
});

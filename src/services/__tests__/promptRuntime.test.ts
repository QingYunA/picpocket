import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  absoluteUrl,
  normalizeItems,
  DEFAULT_PROMPT_SOURCES,
} from '../promptRuntime';
import type { PromptSource } from '../../types';

describe('promptRuntime', () => {
  const mockSource: PromptSource = {
    id: 'test-source',
    name: 'Test Source',
    url: 'https://cdn.example.com/sources/test.json',
    homepage: 'https://github.com/example/test',
    enabled: true,
    builtIn: true,
  };

  describe('absoluteUrl', () => {
    it('returns empty string for empty path', () => {
      expect(absoluteUrl('https://example.com/api', '')).toBe('');
      expect(absoluteUrl('https://example.com/api', undefined)).toBe('');
    });

    it('returns absolute URL directly if already absolute', () => {
      expect(absoluteUrl('https://example.com/api', 'https://other.com/img.jpg')).toBe(
        'https://other.com/img.jpg'
      );
    });

    it('resolves relative path correctly against base URL', () => {
      expect(
        absoluteUrl('https://cdn.example.com/dist/sources/test.json', './images/cat.webp')
      ).toBe('https://cdn.example.com/dist/sources/images/cat.webp');
    });
  });

  describe('normalizeItems', () => {
    it('filters out records without title or prompt', () => {
      const input = [
        { title: 'Valid 1', prompt: 'Prompt 1' },
        { title: '', prompt: 'Prompt 2' },
        { title: 'No prompt' },
        { title: '   ', prompt: 'Prompt 4' },
      ];
      const items = normalizeItems(input, mockSource);
      expect(items.length).toBe(1);
      expect(items[0]?.title).toBe('Valid 1');
      expect(items[0]?.prompt).toBe('Prompt 1');
    });

    it('deduplicates items with identical IDs and generates stable fallback IDs', () => {
      const input = [
        { id: 'custom-1', title: 'Item 1', prompt: 'P1' },
        { id: 'custom-1', title: 'Duplicate Item', prompt: 'P2' },
        { title: 'No ID Item', prompt: 'P3' },
      ];
      const items = normalizeItems(input, mockSource);
      expect(items.length).toBe(2);
      expect(items[0]?.id).toBe('custom-1');
      expect(items[1]?.id).toBe('test-source-0003');
    });

    it('correctly maps source metadata and falls back coverUrl to first reference image', () => {
      const input = [
        {
          title: 'Cyberpunk Girl',
          prompt: 'A neon cyberpunk portrait',
          referenceImageUrls: ['img1.png', 'img2.png'],
          tags: ['cyberpunk', 'neon'],
        },
      ];
      const items = normalizeItems(input, mockSource);
      expect(items.length).toBe(1);
      const item = items[0]!;
      expect(item.sourceId).toBe('test-source');
      expect(item.category).toBe('Test Source');
      expect(item.githubUrl).toBe('https://github.com/example/test');
      expect(item.coverUrl).toBe('https://cdn.example.com/sources/img1.png');
      expect(item.referenceImageUrls).toEqual([
        'https://cdn.example.com/sources/img1.png',
        'https://cdn.example.com/sources/img2.png',
      ]);
    });
  });

  describe('DEFAULT_PROMPT_SOURCES', () => {
    it('contains curated library and 3 latest open-source repositories', () => {
      expect(DEFAULT_PROMPT_SOURCES.length).toBe(4);
      const ids = DEFAULT_PROMPT_SOURCES.map((s) => s.id);
      expect(ids).toContain('picpocket-curated');
      expect(ids).toContain('youmind-gpt-image-2');
      expect(ids).toContain('youmind-nano-banana-pro');
      expect(ids).toContain('freestylefly-gpt-image-2');
    });

    it('enables curated source by default and keeps external sources disabled by default', () => {
      const curated = DEFAULT_PROMPT_SOURCES.find((s) => s.id === 'picpocket-curated');
      expect(curated?.enabled).toBe(true);
      expect(curated?.url).toBe('local://picpocket-curated');

      const externals = DEFAULT_PROMPT_SOURCES.filter((s) => s.id !== 'picpocket-curated');
      externals.forEach((source) => {
        expect(source.url).toContain('cdn.jsdelivr.net');
        expect(source.enabled).toBe(false);
        expect(source.builtIn).toBe(true);
      });
    });
  });
});

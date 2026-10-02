import { describe, expect, it } from 'vitest';
import type { MemeSource } from '@/types';
import {
  matchesMemeQuery,
  normalizeCustomIndex,
  normalizeMemegen,
} from '../memeAdapters';

const source = (over: Partial<MemeSource>): MemeSource => ({
  id: 's',
  name: 'S',
  kind: 'custom',
  url: 'https://example.com/index.json',
  homepage: '',
  enabled: true,
  builtIn: false,
  ...over,
});

describe('normalizeMemegen', () => {
  it('maps templates, uses keywords as tags and drops duplicate ids', () => {
    const items = normalizeMemegen(
      [
        { id: '3hd', name: 'Three-Headed Dragon', blank: 'https://api.memegen.link/images/3hd.jpg', keywords: ['King Ghidorah'] },
        { id: '3hd', name: 'dup', blank: 'https://api.memegen.link/images/3hd.jpg' },
        { id: 'bad', name: 'No image' },
      ],
      source({ id: 'memegen', kind: 'memegen' })
    );
    expect(items).toHaveLength(1);
    expect(items[0]!).toMatchObject({ id: 'memegen:3hd', tags: ['King Ghidorah'] });
  });
});

describe('normalizeCustomIndex', () => {
  it('accepts an array or { items }, resolves relative URLs and rejects non-https', () => {
    const items = normalizeCustomIndex(
      {
        items: [
          { name: 'a', url: '/img/a.png', tags: ['x'], category: 'c' },
          { url: 'javascript:alert(1)' },
          { url: 'http://insecure.example.com/a.png' },
          { url: 'https://cdn.example.com/%E7%8C%AB.gif' },
          { name: 'dup', url: '/img/a.png' },
        ],
      },
      source({})
    );
    expect(items.map((i) => i.url)).toEqual(['https://example.com/img/a.png', 'https://cdn.example.com/%E7%8C%AB.gif']);
    expect(items[0]!.tags).toEqual(['c', 'x']);
    expect(items[1]!.name).toBe('猫');
    expect(normalizeCustomIndex([{ url: 'https://a.com/1.png' }], source({}))).toHaveLength(1);
    expect(() => normalizeCustomIndex({ nope: 1 }, source({}))).toThrow();
  });
});

describe('matchesMemeQuery', () => {
  const item = { id: '1', sourceId: 's', name: '扭起来', url: 'u', category: '滑稽大佬', tags: ['滑稽大佬'], createdAt: 0 };
  it('matches name, category and tags; all terms must hit', () => {
    expect(matchesMemeQuery(item, '')).toBe(true);
    expect(matchesMemeQuery(item, '扭')).toBe(true);
    expect(matchesMemeQuery(item, '滑稽 扭起')).toBe(true);
    expect(matchesMemeQuery(item, '滑稽 猫')).toBe(false);
  });
});

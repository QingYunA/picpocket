import { describe, it, expect } from 'vitest';
import { parseHash } from '../useHashRoute';

describe('useHashRoute parseHash', () => {
  it('should default to /general when hash is empty', () => {
    expect(parseHash('')).toEqual({ path: '/general', params: {} });
    expect(parseHash('#')).toEqual({ path: '/general', params: {} });
    expect(parseHash('#/')).toEqual({ path: '/general', params: {} });
  });

  it('should parse path and query parameters accurately', () => {
    const result = parseHash('#/models/vision?provider=mimo&highlight=apiKey');
    expect(result.path).toBe('/models/vision');
    expect(result.params).toEqual({
      provider: 'mimo',
      highlight: 'apiKey',
    });
  });

  it('should parse simple routes without query strings', () => {
    expect(parseHash('#/mcp').path).toBe('/mcp');
    expect(parseHash('#/prompts').path).toBe('/prompts');
    expect(parseHash('#/storage').path).toBe('/storage');
    expect(parseHash('models/image').path).toBe('/models/image');
  });
});

import { describe, it, expect } from 'vitest';
import { sanitizeHttpHeaderToken, sanitizeHttpUrl } from '../sanitize';

describe('sanitizeHttpHeaderToken', () => {
  it('should return empty string for nullish or empty values', () => {
    expect(sanitizeHttpHeaderToken('')).toBe('');
    expect(sanitizeHttpHeaderToken(null as any)).toBe('');
    expect(sanitizeHttpHeaderToken(undefined as any)).toBe('');
  });

  it('should preserve standard valid API keys', () => {
    const key = 'sk-proj-1234567890abcdef1234567890';
    expect(sanitizeHttpHeaderToken(key)).toBe(key);
  });

  it('should strip Bearer prefix', () => {
    expect(sanitizeHttpHeaderToken('Bearer sk-1234567890abcdef')).toBe('sk-1234567890abcdef');
    expect(sanitizeHttpHeaderToken('bearer   sk-1234567890abcdef')).toBe('sk-1234567890abcdef');
  });

  it('should extract token from text mixed with Chinese or explanations', () => {
    const mixed = '这是我的key: ci_live_f2699e54ac59895398e90ff231f9f9cb2541c1829b73567c，请保存';
    expect(sanitizeHttpHeaderToken(mixed)).toBe('ci_live_f2699e54ac59895398e90ff231f9f9cb2541c1829b73567c');
  });

  it('should eliminate non ISO-8859-1 code points from raw strings', () => {
    const tainted = 'sk_test_12345\u3000\u4e2d\u6587';
    const sanitized = sanitizeHttpHeaderToken(tainted);
    // Must contain only standard printable ASCII
    expect(/[^\x21-\x7E]/.test(sanitized)).toBe(false);
  });
});

describe('sanitizeHttpUrl', () => {
  it('should strip trailing slashes and whitespace', () => {
    expect(sanitizeHttpUrl('https://api.deepseek.com/v1/// ')).toBe('https://api.deepseek.com/v1');
  });

  it('should remove non-ASCII characters from URL', () => {
    expect(sanitizeHttpUrl('https://api.example.com/v1（中文）/')).toBe('https://api.example.com/v1');
  });
});

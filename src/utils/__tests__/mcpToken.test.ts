import { describe, it, expect } from 'vitest';
import { LEGACY_MCP_AUTH_TOKEN, generateMcpAuthToken, isLegacyMcpToken } from '../mcpToken';

describe('generateMcpAuthToken', () => {
  it('带 pp_ 前缀，后接 32 字节的 base64url（43 字符，无填充）', () => {
    const token = generateMcpAuthToken();
    expect(token).toMatch(/^pp_[A-Za-z0-9_-]{43}$/);
  });

  it('每次生成的 Token 不同', () => {
    const tokens = new Set(Array.from({ length: 20 }, () => generateMcpAuthToken()));
    expect(tokens.size).toBe(20);
  });

  it('使用注入的随机源，字节全 0xff 时输出确定', () => {
    const token = generateMcpAuthToken((bytes) => {
      bytes.fill(0xff);
      return bytes;
    });
    expect(token).toBe(`pp_${'_'.repeat(42)}8`);
  });

  it('不会生成旧版公开默认 Token', () => {
    expect(generateMcpAuthToken()).not.toBe(LEGACY_MCP_AUTH_TOKEN);
  });
});

describe('isLegacyMcpToken', () => {
  it('旧版默认值、空值视为未配置专属 Token', () => {
    expect(isLegacyMcpToken(LEGACY_MCP_AUTH_TOKEN)).toBe(true);
    expect(isLegacyMcpToken('')).toBe(true);
    expect(isLegacyMcpToken(undefined)).toBe(true);
  });

  it('随机 Token 不是旧版默认值', () => {
    expect(isLegacyMcpToken('pp_abc')).toBe(false);
  });
});

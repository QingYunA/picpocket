import { describe, it, expect } from 'vitest';
import { resolveAuthToken, LEGACY_AUTH_TOKEN, DEFAULT_TOKEN_WARNING } from '../token';

describe('resolveAuthToken', () => {
  it('优先使用 PICPOCKET_MCP_TOKEN', () => {
    expect(resolveAuthToken({ PICPOCKET_MCP_TOKEN: 'pp_new', PROMPTSNAP_MCP_TOKEN: 'old' })).toEqual({
      token: 'pp_new',
      isLegacyDefault: false,
    });
  });

  it('兼容旧环境变量 PROMPTSNAP_MCP_TOKEN', () => {
    expect(resolveAuthToken({ PROMPTSNAP_MCP_TOKEN: 'old-token' })).toEqual({
      token: 'old-token',
      isLegacyDefault: false,
    });
  });

  it('未配置（或为空串）时回退到旧版默认值并标记，保证存量配置继续可用', () => {
    expect(resolveAuthToken({})).toEqual({ token: LEGACY_AUTH_TOKEN, isLegacyDefault: true });
    expect(resolveAuthToken({ PICPOCKET_MCP_TOKEN: '' })).toEqual({ token: LEGACY_AUTH_TOKEN, isLegacyDefault: true });
  });

  it('显式配置成旧版默认值同样视为在用默认值', () => {
    expect(resolveAuthToken({ PICPOCKET_MCP_TOKEN: LEGACY_AUTH_TOKEN }).isLegacyDefault).toBe(true);
  });
});

describe('DEFAULT_TOKEN_WARNING', () => {
  it('单行提示，指明如何设置环境变量，且不包含默认 Token 本身', () => {
    expect(DEFAULT_TOKEN_WARNING).not.toContain('\n');
    expect(DEFAULT_TOKEN_WARNING).toContain('PICPOCKET_MCP_TOKEN');
    expect(DEFAULT_TOKEN_WARNING).not.toContain(LEGACY_AUTH_TOKEN);
  });
});

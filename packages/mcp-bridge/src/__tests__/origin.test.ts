import { describe, it, expect } from 'vitest';
import { isAllowedBridgeOrigin } from '../origin';

describe('isAllowedBridgeOrigin', () => {
  it('放行任意 chrome 扩展来源，指定扩展 ID 时只放行该扩展', () => {
    expect(isAllowedBridgeOrigin('chrome-extension://abcdefghijklmnopabcdefghijklmnop')).toBe(true);
    expect(isAllowedBridgeOrigin('chrome-extension://abcdefghijklmnopabcdefghijklmnop', 'abcdefghijklmnopabcdefghijklmnop')).toBe(true);
    expect(isAllowedBridgeOrigin('chrome-extension://zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz', 'abcdefghijklmnopabcdefghijklmnop')).toBe(false);
  });

  it('放行本机开发页面，端口任意', () => {
    expect(isAllowedBridgeOrigin('http://localhost:5173')).toBe(true);
    expect(isAllowedBridgeOrigin('http://127.0.0.1:3000')).toBe(true);
    expect(isAllowedBridgeOrigin('http://[::1]:3000')).toBe(true);
  });

  it('拒绝名字里仅含 localhost / 127.0.0.1 的外部站点', () => {
    expect(isAllowedBridgeOrigin('https://localhost.evil.com')).toBe(false);
    expect(isAllowedBridgeOrigin('https://evil.com/localhost')).toBe(false);
    expect(isAllowedBridgeOrigin('http://127.0.0.1.evil.com')).toBe(false);
    expect(isAllowedBridgeOrigin('https://evil-localhost.com')).toBe(false);
  });

  it('拒绝空来源与无法解析的来源', () => {
    expect(isAllowedBridgeOrigin(undefined)).toBe(false);
    expect(isAllowedBridgeOrigin('')).toBe(false);
    expect(isAllowedBridgeOrigin('null')).toBe(false);
    expect(isAllowedBridgeOrigin('file://')).toBe(false);
  });
});

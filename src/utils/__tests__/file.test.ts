import { describe, it, expect } from 'vitest';
import { isLikelyImageBlob } from '../file';

describe('isLikelyImageBlob', () => {
  it('放行图片类型、无类型与 octet-stream', () => {
    expect(isLikelyImageBlob(new Blob(['x'], { type: 'image/png' }))).toBe(true);
    expect(isLikelyImageBlob(new Blob(['x'], { type: 'image/svg+xml' }))).toBe(true);
    expect(isLikelyImageBlob(new Blob(['x'], { type: 'application/octet-stream' }))).toBe(true);
    expect(isLikelyImageBlob(new Blob(['x']))).toBe(true);
  });

  it('拒绝防盗链拦截页与空内容', () => {
    expect(isLikelyImageBlob(new Blob(['<html>403</html>'], { type: 'text/html; charset=utf-8' }))).toBe(false);
    expect(isLikelyImageBlob(new Blob(['{"error":1}'], { type: 'application/json' }))).toBe(false);
    expect(isLikelyImageBlob(new Blob([], { type: 'image/png' }))).toBe(false);
  });
});

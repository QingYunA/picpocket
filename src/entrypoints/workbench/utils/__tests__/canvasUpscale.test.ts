import { describe, it, expect } from 'vitest';
import {
  MAX_UPSCALE_LONG_EDGE,
  resolveUpscaleSize,
  canUpscaleImage,
} from '../canvasImageUtils';

describe('canvasImageUtils - Image Upscale Guardrails', () => {
  it('MAX_UPSCALE_LONG_EDGE 应该等于 4096', () => {
    expect(MAX_UPSCALE_LONG_EDGE).toBe(4096);
  });

  describe('resolveUpscaleSize', () => {
    it('对于 1024x768 放大至 2048，长边应为 2048 且保持 4:3 纵横比', () => {
      const res = resolveUpscaleSize(1024, 768, 2048);
      expect(res.width).toBe(2048);
      expect(res.height).toBe(1536);
      expect(res.scale).toBe(2);
    });

    it('对于高图 768x1024 放大至 2048，长边(高)应为 2048', () => {
      const res = resolveUpscaleSize(768, 1024, 2048);
      expect(res.width).toBe(1536);
      expect(res.height).toBe(2048);
      expect(res.scale).toBe(2);
    });

    it('当目标长边超过 4096 时，必须强制截断至 4096', () => {
      const res = resolveUpscaleSize(1000, 1000, 8192);
      expect(res.width).toBe(4096);
      expect(res.height).toBe(4096);
      expect(res.scale).toBe(4.096);
    });

    it('防止零尺寸或负数异常输入', () => {
      const res = resolveUpscaleSize(0, 0, 2048);
      expect(res.width).toBe(2048);
      expect(res.height).toBe(2048);
    });
  });

  describe('canUpscaleImage', () => {
    it('原图长边未达到 4096 时，允许放大', () => {
      expect(canUpscaleImage(1024, 1024)).toBe(true);
      expect(canUpscaleImage(1086, 1448)).toBe(true);
      expect(canUpscaleImage(2048, 2048)).toBe(true);
    });

    it('原图长边已达到或超过 4096 时，禁止继续放大', () => {
      expect(canUpscaleImage(4096, 3000)).toBe(false);
      expect(canUpscaleImage(3000, 4096)).toBe(false);
      expect(canUpscaleImage(5000, 5000)).toBe(false);
    });

    it('指定目标档位时，原图长边必须严格小于目标档位且目标档位<=4096', () => {
      // 1024 可以放大到 2048 或 4096，但不能放大到 1024
      expect(canUpscaleImage(1024, 768, 1024)).toBe(false);
      expect(canUpscaleImage(1024, 768, 2048)).toBe(true);
      expect(canUpscaleImage(1024, 768, 4096)).toBe(true);

      // 2048 不能选择 1024 或 2048，只能选择 4096
      expect(canUpscaleImage(2048, 2048, 1024)).toBe(false);
      expect(canUpscaleImage(2048, 2048, 2048)).toBe(false);
      expect(canUpscaleImage(2048, 2048, 4096)).toBe(true);

      // 4096 不能选择任何档位
      expect(canUpscaleImage(4096, 4096, 4096)).toBe(false);
      expect(canUpscaleImage(4096, 4096, 8192)).toBe(false);
    });
  });
});

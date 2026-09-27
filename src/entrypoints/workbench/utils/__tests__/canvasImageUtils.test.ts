import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  rotateDataUrl90,
  cropDataUrl,
  upscaleDataUrl2x,
} from '../canvasImageUtils';

describe('canvasImageUtils', () => {
  let mockCanvas: any;
  let mockCtx: any;

  beforeEach(() => {
    mockCtx = {
      drawImage: vi.fn(),
      translate: vi.fn(),
      rotate: vi.fn(),
      imageSmoothingEnabled: false,
      imageSmoothingQuality: 'low',
    };

    mockCanvas = {
      width: 0,
      height: 0,
      getContext: vi.fn().mockReturnValue(mockCtx),
      toDataURL: vi.fn().mockReturnValue('data:image/png;base64,mocked_data_url'),
    };

    (globalThis as any).document = {
      createElement: vi.fn().mockImplementation((tag) => {
        if (tag === 'canvas') return mockCanvas;
        return {};
      }),
    };

    // Mock Image 全局构造函数
    globalThis.Image = class {
      crossOrigin = '';
      src = '';
      naturalWidth = 200;
      naturalHeight = 100;
      width = 200;
      height = 100;
      onload: (() => void) | null = null;
      onerror: ((err: any) => void) | null = null;
      constructor() {
        setTimeout(() => {
          if (this.onload) this.onload();
        }, 10);
      }
    } as any;
  });

  it('rotateDataUrl90 应该交换宽高并旋转画布', async () => {
    const res = await rotateDataUrl90('data:image/png;base64,test');
    expect(res).toBe('data:image/png;base64,mocked_data_url');
    // 原图 200x100，旋转后 canvas 应该为 100x200
    expect(mockCanvas.width).toBe(100);
    expect(mockCanvas.height).toBe(200);
    expect(mockCtx.translate).toHaveBeenCalledWith(50, 100);
    expect(mockCtx.rotate).toHaveBeenCalledWith((90 * Math.PI) / 180);
  });

  it('cropDataUrl 应该以裁切尺寸创建 canvas 并裁剪绘制', async () => {
    const res = await cropDataUrl('data:image/png;base64,test', { x: 10, y: 20, w: 80, h: 60 });
    expect(res).toBe('data:image/png;base64,mocked_data_url');
    expect(mockCanvas.width).toBe(80);
    expect(mockCanvas.height).toBe(60);
    expect(mockCtx.drawImage).toHaveBeenCalled();
  });

  it('upscaleDataUrl2x 应该将图像宽高翻倍并启用高质量平滑', async () => {
    const res = await upscaleDataUrl2x('data:image/png;base64,test');
    expect(res.dataUrl).toBe('data:image/png;base64,mocked_data_url');
    expect(res.width).toBe(400);
    expect(res.height).toBe(200);
    expect(mockCanvas.width).toBe(400);
    expect(mockCanvas.height).toBe(200);
    expect(mockCtx.imageSmoothingEnabled).toBe(true);
    expect(mockCtx.imageSmoothingQuality).toBe('high');
  });
});

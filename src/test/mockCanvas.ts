import { vi } from 'vitest';

export interface MockCanvasContext {
  drawImage: ReturnType<typeof vi.fn>;
  imageSmoothingEnabled: boolean;
  imageSmoothingQuality: string;
  clearRect?: ReturnType<typeof vi.fn>;
}

export interface MockCanvasElement {
  width: number;
  height: number;
  getContext: ReturnType<typeof vi.fn>;
  toDataURL: ReturnType<typeof vi.fn>;
  toBlob?: ReturnType<typeof vi.fn>;
}

export interface SetupCanvasMockOptions {
  defaultWidth?: number;
  defaultHeight?: number;
}

/**
 * 为 Node.js / happy-dom 测试环境配置通用的 Canvas 与 Image Mock 基座
 */
export function setupCanvasMock(options: SetupCanvasMockOptions = {}) {
  const defaultWidth = options.defaultWidth ?? 800;
  const defaultHeight = options.defaultHeight ?? 600;

  const mockCtx: MockCanvasContext = {
    drawImage: vi.fn(),
    imageSmoothingEnabled: true,
    imageSmoothingQuality: 'high',
    clearRect: vi.fn(),
  };

  const mockCanvas: MockCanvasElement = {
    width: 0,
    height: 0,
    getContext: vi.fn().mockReturnValue(mockCtx),
    toDataURL: vi.fn().mockImplementation((type: string, quality?: number) => {
      return `data:${type};base64,mocked_compressed_image_quality_${quality ?? 1}`;
    }),
    toBlob: vi.fn().mockImplementation((cb: (blob: Blob) => void, type?: string) => {
      cb(new Blob(['mocked_blob'], { type: type || 'image/png' }));
    }),
  };

  (globalThis as any).document = {
    ...(globalThis as any).document,
    createElement: vi.fn().mockImplementation((tag: string) => {
      if (tag === 'canvas') return mockCanvas;
      return {};
    }),
  };

  // 提供标准 Mock Image 类
  function setMockImageDimensions(width: number, height: number, errorTrigger = false) {
    (globalThis as any).Image = class {
      crossOrigin = '';
      src = '';
      naturalWidth = width;
      naturalHeight = height;
      width = width;
      height = height;
      onload: (() => void) | null = null;
      onerror: ((err: any) => void) | null = null;
      constructor() {
        setTimeout(() => {
          if (errorTrigger) {
            if (this.onerror) this.onerror(new Error('Mocked image load error'));
          } else {
            if (this.onload) this.onload();
          }
        }, 5);
      }
    };
  }

  // 初始化为默认尺寸
  setMockImageDimensions(defaultWidth, defaultHeight);

  return {
    mockCanvas,
    mockCtx,
    setMockImageDimensions,
  };
}

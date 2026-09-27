import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  calculateDownsampledDimensions,
  prepareReferenceImageForAi,
  prepareVisionImageForAi,
  getDataUrlByteLength,
  dataUrlToFile,
  AI_REF_MAX_DIMENSION,
  AI_REF_FALLBACK_DIMENSION,
  AI_REF_SAFE_BYTES,
} from '../imageCompression';



import { setupCanvasMock } from '@/test/mockCanvas';

describe('imageCompression for AI Reference Images', () => {
  let mockCanvas: any;
  let mockCtx: any;
  let setMockImageDimensions: (w: number, h: number, err?: boolean) => void;

  beforeEach(() => {
    const mockSetup = setupCanvasMock({ defaultWidth: 800, defaultHeight: 600 });
    mockCanvas = mockSetup.mockCanvas;
    mockCtx = mockSetup.mockCtx;
    setMockImageDimensions = mockSetup.setMockImageDimensions;
  });

  describe('calculateDownsampledDimensions', () => {
    it('当图片尺寸小于等于 1536 时应保持原样且 scaled 为 false', () => {
      const res = calculateDownsampledDimensions(1024, 768, 1536);
      expect(res.scaled).toBe(false);
      expect(res.width).toBe(1024);
      expect(res.height).toBe(768);
    });

    it('当宽图超过 1536 时应等比缩放且最长边为 1536', () => {
      // 3072 x 1536 -> 1536 x 768
      const res = calculateDownsampledDimensions(3072, 1536, 1536);
      expect(res.scaled).toBe(true);
      expect(res.width).toBe(1536);
      expect(res.height).toBe(768);
    });

    it('当长图超过 1536 时应等比缩放且最长边为 1536', () => {
      // 2000 x 4000 -> 768 x 1536
      const res = calculateDownsampledDimensions(2000, 4000, 1536);
      expect(res.scaled).toBe(true);
      expect(res.width).toBe(768);
      expect(res.height).toBe(1536);
    });

    it('正方形 4K (4096x4096) 应等比缩放为 1536x1536', () => {
      const res = calculateDownsampledDimensions(4096, 4096, 1536);
      expect(res.scaled).toBe(true);
      expect(res.width).toBe(1536);
      expect(res.height).toBe(1536);
    });
  });

  describe('prepareReferenceImageForAi', () => {
    it('对空输入或非 data: 字符串直接原样返回', async () => {
      expect(await prepareReferenceImageForAi('')).toBe('');
      expect(await prepareReferenceImageForAi('https://example.com/test.png')).toBe(
        'https://example.com/test.png'
      );
    });

    it('对体积小 (<1.2MB) 且分辨率在 1536 内的小图应 100% 原始无损直通，不调用 canvas', async () => {
      const smallDataUrl = 'data:image/png;base64,small_image_sample';
      const res = await prepareReferenceImageForAi(smallDataUrl);
      expect(res).toBe(smallDataUrl);
      expect(mockCanvas.toDataURL).not.toHaveBeenCalled();
    });

    it('当分辨率超过 1280 (如 3840x2160) 时应温和等比缩放并以 0.85 高画质导出', async () => {
      // 模拟 4K 大图
      setMockImageDimensions(3840, 2160);

      const hugeResDataUrl = 'data:image/png;base64,sample_4k_image_data';
      const res = await prepareReferenceImageForAi(hugeResDataUrl);

      expect(mockCanvas.width).toBe(1280);
      expect(mockCanvas.height).toBe(720); // 2160 * (1280 / 3840) = 720
      expect(mockCtx.drawImage).toHaveBeenCalled();
      expect(mockCanvas.toDataURL).toHaveBeenCalledWith('image/webp', 0.85);
      expect(res).toContain('mocked_compressed_image_quality_0.85');
    });

    it('当 Base64 体积超过安全阈值 (600KB 物理字节) 时也应触发高画质压缩', async () => {
      // 2MB 字符的 Base64 对应 1.5MB 真实物理字节，超出 600KB 安全阈值
      const largeBase64 = 'data:image/png;base64,' + 'A'.repeat(2 * 1024 * 1024);
      const res = await prepareReferenceImageForAi(largeBase64);

      expect(mockCanvas.toDataURL).toHaveBeenCalled();
      expect(res).toContain('mocked_compressed_image_quality_0.85');
    });

    it('当图片加载异常时，应优雅降级返回原图而不崩溃', async () => {
      setMockImageDimensions(800, 600, true);

      const res = await prepareReferenceImageForAi('data:image/png;base64,broken_data');
      expect(res).toBe('data:image/png;base64,broken_data');
    });

    it('当首次压缩后仍大于 750KB 时，自动执行 1024px 与 0.75 质量二级安全降级', async () => {
      setMockImageDimensions(3840, 2160);

      let callCount = 0;
      mockCanvas.toDataURL = vi.fn().mockImplementation((type: string, quality: number) => {
        callCount++;
        if (callCount === 1) {
          // 第一次返回一个超大 Base64 (1.5MB 字符 = 1.12MB 字节 > 750KB 硬阈值)
          return 'data:image/webp;base64,' + 'B'.repeat(1.5 * 1024 * 1024);
        }
        // 第二次返回正常缩减后的 Base64
        return `data:image/webp;base64,second_pass_quality_${quality}`;
      });

      const hugeInput = 'data:image/png;base64,' + 'A'.repeat(2 * 1024 * 1024);
      const res = await prepareReferenceImageForAi(hugeInput);

      expect(callCount).toBe(2);
      expect(mockCanvas.width).toBe(AI_REF_FALLBACK_DIMENSION);
      expect(mockCanvas.toDataURL).toHaveBeenLastCalledWith('image/webp', 0.75);
      expect(res).toContain('second_pass_quality_0.75');
    });


  });

  describe('getDataUrlByteLength', () => {
    it('精确计算包含和不包含 padding 的 Base64 字节长度', () => {
      expect(getDataUrlByteLength('')).toBe(0);
      expect(getDataUrlByteLength('not-a-data-url')).toBe(0);
      // 'AAAA' = 3 bytes
      expect(getDataUrlByteLength('data:image/png;base64,AAAA')).toBe(3);
      // 'AAA=' = 2 bytes (1 padding)
      expect(getDataUrlByteLength('data:image/png;base64,AAA=')).toBe(2);
      // 'AA==' = 1 byte (2 padding)
      expect(getDataUrlByteLength('data:image/png;base64,AA==')).toBe(1);
    });
  });

  describe('dataUrlToFile', () => {
    it('正确将 PNG DataURL 转换为 File 实例', () => {
      const dataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
      const file = dataUrlToFile(dataUrl, 'test.png');

      expect(file).toBeInstanceOf(File);
      expect(file.name).toBe('test.png');
      expect(file.type).toBe('image/png');
      expect(file.size).toBeGreaterThan(0);
    });

    it('正确提取 JPEG MIME 类型并生成正确的 File', () => {
      const dataUrl = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';
      const file = dataUrlToFile(dataUrl, 'sample.jpg');

      expect(file).toBeInstanceOf(File);
      expect(file.name).toBe('sample.jpg');
      expect(file.type).toBe('image/jpeg');
    });
  });

  describe('prepareVisionImageForAi', () => {
    it('小图 (<= 250KB) 直接输出 DataURL 免转码', async () => {
      const smallBlob = new Blob(['small_image_content'], { type: 'image/png' });
      const dataUrl = await prepareVisionImageForAi(smallBlob);
      expect(dataUrl).toContain('data:image/png;base64,');
    });

    it('大图自动等比缩放并压缩至安全尺寸', async () => {
      // 构造 > 250KB 的大图片
      const largeBytes = new Uint8Array(300 * 1024);
      const largeBlob = new Blob([largeBytes], { type: 'image/png' });
      setMockImageDimensions(2560, 1440);

      const dataUrl = await prepareVisionImageForAi(largeBlob, 1280);
      expect(mockCanvas.width).toBe(1280);
      expect(mockCanvas.height).toBe(720);
      expect(dataUrl).toBeTruthy();
    });
  });
});



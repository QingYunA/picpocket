/**
 * AI 参考图「高保真温和预处理」模块
 *
 * 设计原则：
 * 1. 绝对避免过度压缩：默认 90% 超高画质，杜绝宏块噪点与边缘伪影破坏扩散模型视觉先验；
 * 2. 贴合主流模型黄金分辨率：最长边上限设定为 1536px（与 FLUX.1、SDXL、Midjourney 原生尺寸上限对齐）；
 * 3. 安全区无损直通：小于 1.2MB 且尺寸在 1536 内的原图 100% 保留原始数据，零转码；
 * 4. 极罕见超限兜底：对复杂噪点大图，若输出仍超过 1.5MB 则自动执行 1280px 与 0.85 画质二级安全降级；
 * 5. 跨环境执行：支持 Chrome MV3 后台 Service Worker (OffscreenCanvas / createImageBitmap)
 *    与前台 DOM (Canvas / Image) 双环境，纯内存流转，零外部依赖。
 */

import { dataUrlToBlob } from '../db';

export const AI_REF_MAX_DIMENSION = 1280;
export const AI_REF_FALLBACK_DIMENSION = 1024;
export const AI_REF_SAFE_BYTES = 600 * 1024; // 600KB 物理字节阈值（Base64 后约 800KB，严格控制在 1MB 内）
export const AI_REF_TARGET_QUALITY = 0.85; // 85% 高画质
export const AI_REF_FALLBACK_QUALITY = 0.75; // 75% 兜底画质
export const AI_REF_HARD_LIMIT_BYTES = 750 * 1024; // 750KB 硬上限兜底

export interface DimensionResult {
  width: number;
  height: number;
  scaled: boolean;
}

/**
 * 依据 Base64 编码规则换算 DataURL 对应的实际二进制物理字节数
 */
export function getDataUrlByteLength(dataUrl: string): number {
  if (!dataUrl || typeof dataUrl !== 'string') return 0;
  const commaIdx = dataUrl.indexOf(',');
  if (commaIdx === -1) return 0;
  const base64Part = dataUrl.slice(commaIdx + 1);
  const paddingMatches = base64Part.match(/=+$/);
  const padding = paddingMatches ? paddingMatches[0].length : 0;
  return Math.max(0, Math.floor((base64Part.length * 3) / 4) - padding);
}

/**
 * 依据最大边长等比下采样尺寸，严格保持原始宽高比
 */
export function calculateDownsampledDimensions(
  width: number,
  height: number,
  maxDimension: number = AI_REF_MAX_DIMENSION
): DimensionResult {
  if (width <= 0 || height <= 0) {
    return { width, height, scaled: false };
  }

  const maxEdge = Math.max(width, height);
  if (maxEdge <= maxDimension) {
    return { width, height, scaled: false };
  }

  const ratio = maxDimension / maxEdge;
  const targetWidth = Math.max(1, Math.round(width * ratio));
  const targetHeight = Math.max(1, Math.round(height * ratio));

  return {
    width: targetWidth,
    height: targetHeight,
    scaled: true,
  };
}

/**
 * 将 Blob 转换回 DataURL，兼顾 Service Worker 与 DOM 环境
 */
export async function blobToDataUrl(blob: Blob): Promise<string> {
  if (typeof FileReader !== 'undefined') {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  const arrayBuffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    const byte = bytes[i];
    if (byte !== undefined) {
      binary += String.fromCharCode(byte);
    }
  }
  const base64 = btoa(binary);
  return `data:${blob.type || 'image/webp'};base64,${base64}`;
}

interface ImageSource {
  width: number;
  height: number;
  draw: (ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, w: number, h: number) => void;
  close?: () => void;
}

/**
 * 跨运行环境（Worker / DOM）获取图片源尺寸与绘制句柄
 */
async function getImageSource(dataUrl: string): Promise<ImageSource | null> {
  // 1. 优先使用 createImageBitmap (Chrome Service Worker 与现代浏览器标准)
  if (typeof createImageBitmap !== 'undefined') {
    try {
      const blob = dataUrlToBlob(dataUrl);
      const bitmap = await createImageBitmap(blob);
      return {
        width: bitmap.width,
        height: bitmap.height,
        draw: (ctx, w, h) => ctx.drawImage(bitmap, 0, 0, w, h),
        close: () => bitmap.close?.(),
      };
    } catch {
      // 容错降级
    }
  }

  // 2. DOM 环境降级使用 Image
  if (typeof Image !== 'undefined') {
    return new Promise((resolve) => {
      try {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.referrerPolicy = 'no-referrer';
        img.onload = () => {
          resolve({
            width: img.naturalWidth || img.width || 0,
            height: img.naturalHeight || img.height || 0,
            draw: (ctx, w, h) => ctx.drawImage(img, 0, 0, w, h),
          });
        };
        img.onerror = () => resolve(null);
        img.src = dataUrl;
      } catch {
        resolve(null);
      }
    });
  }

  return null;
}

/**
 * 统一跨环境渲染与画质导出，消除重复代码 (Duplicated Code)
 */
async function renderToDataUrl(
  source: ImageSource,
  width: number,
  height: number,
  quality: number
): Promise<string | null> {
  // 方案 A: OffscreenCanvas (Chrome Service Worker 首选)
  if (typeof OffscreenCanvas !== 'undefined') {
    const offscreen = new OffscreenCanvas(width, height);
    const ctx = offscreen.getContext('2d');
    if (ctx) {
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      source.draw(ctx, width, height);

      let blob: Blob | null = null;
      try {
        blob = await offscreen.convertToBlob({ type: 'image/webp', quality });
      } catch {
        blob = await offscreen.convertToBlob({ type: 'image/jpeg', quality });
      }
      if (blob) {
        return await blobToDataUrl(blob);
      }
    }
  }

  // 方案 B: DOM Canvas (前台窗口 / 侧边栏 / 标签页)
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      source.draw(ctx, width, height);

      let compressed = canvas.toDataURL('image/webp', quality);
      if (!compressed.startsWith('data:image/webp')) {
        compressed = canvas.toDataURL('image/jpeg', quality);
      }
      return compressed;
    }
  }

  return null;
}

/**
 * 为 AI 生图准备高保真、安全体积的参考图 DataURL
 */
export async function prepareReferenceImageForAi(
  dataUrl: string,
  options?: {
    maxDimension?: number;
    quality?: number;
  }
): Promise<string> {
  if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) {
    return dataUrl;
  }

  const maxDim = options?.maxDimension || AI_REF_MAX_DIMENSION;
  const quality = options?.quality ?? AI_REF_TARGET_QUALITY;

  const source = await getImageSource(dataUrl);
  if (!source || source.width <= 0 || source.height <= 0) {
    return dataUrl;
  }

  try {
    const naturalWidth = source.width;
    const naturalHeight = source.height;

    // 1. 免处理安全区判定：体积适中且宽高在 1536 范围内，100% 原始原图直通
    const byteSize = getDataUrlByteLength(dataUrl);
    const isSizeSafe = byteSize <= AI_REF_SAFE_BYTES;
    const isDimensionSafe = naturalWidth <= maxDim && naturalHeight <= maxDim;

    if (isSizeSafe && isDimensionSafe) {
      return dataUrl;
    }

    // 2. 计算高保真等比缩放尺寸
    const { width: targetWidth, height: targetHeight } = calculateDownsampledDimensions(
      naturalWidth,
      naturalHeight,
      maxDim
    );

    // 3. 执行第一次高保真导出 (90% Quality)
    let result = await renderToDataUrl(source, targetWidth, targetHeight, quality);
    if (!result) return dataUrl;

    // 4. 极罕见超限兜底：对极复杂噪点图，若依然超过 1.5MB，执行 1280px + 0.85 质量二级安全降级
    if (getDataUrlByteLength(result) > AI_REF_HARD_LIMIT_BYTES) {
      const fallbackDims = calculateDownsampledDimensions(
        naturalWidth,
        naturalHeight,
        AI_REF_FALLBACK_DIMENSION
      );
      const fallbackResult = await renderToDataUrl(
        source,
        fallbackDims.width,
        fallbackDims.height,
        AI_REF_FALLBACK_QUALITY
      );
      if (fallbackResult) {
        result = fallbackResult;
      }
    }

    return result;
  } catch (err) {
    console.warn('[imageCompression] 参考图预处理异常，回退原图:', err);
    return dataUrl;
  } finally {
    source.close?.();
  }
}

/**
 * 纯内存将 DataURL 转换为标准的 File 对象（用于以 FormData 上传）
 * 复用现有的 dataUrlToBlob，彻底消除重复代码
 */
export function dataUrlToFile(dataUrl: string, filename = 'reference.png'): File {
  const blob = dataUrlToBlob(dataUrl);
  return new File([blob], filename, { type: blob.type || 'image/png' });
}

/**
 * 为 AI 视觉反推瞬态准备轻量高保真 DataURL（最长边 1280px，质量 0.85）
 * 将超大原图（4MB-10MB）瞬态降采样至 ~150KB，极大缩短 Base64 序列化与网络长请求上行传输时间
 * 绝不修改本地 IndexedDB 高保真原图，严格遵循 ADR 0007 动静分离铁律。
 */
export async function prepareVisionImageForAi(
  blob: Blob,
  maxDimension = AI_REF_MAX_DIMENSION,
  quality = AI_REF_TARGET_QUALITY
): Promise<string> {
  // 若体积已经较小（<= 250KB），直接免转码输出 DataURL
  if (blob.size <= 250 * 1024) {
    return blobToDataUrl(blob);
  }

  const dataUrl = await blobToDataUrl(blob);
  const source = await getImageSource(dataUrl);
  if (!source || source.width <= 0 || source.height <= 0) {
    return dataUrl;
  }

  try {
    const { width: targetWidth, height: targetHeight, scaled } = calculateDownsampledDimensions(
      source.width,
      source.height,
      maxDimension
    );

    if (!scaled && blob.size <= 500 * 1024) {
      return dataUrl;
    }

    const compressed = await renderToDataUrl(source, targetWidth, targetHeight, quality);
    return compressed || dataUrl;
  } catch (err) {
    console.warn('[imageCompression] 视觉反推瞬态压缩异常，回退原图:', err);
    return dataUrl;
  } finally {
    source.close?.();
  }
}



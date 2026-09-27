/**
 * 纯本地 HTML5 Canvas 图像无损处理工具集
 * 包含顺时针旋转、矩形裁切、高质量双倍插值放大
 * 0 外部重量级依赖，0 网络消耗
 */

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.referrerPolicy = 'no-referrer';
    img.onload = () => resolve(img);
    img.onerror = (err) => reject(err);
    img.src = src;
  });
}

/**
 * 顺时针旋转 90 度
 */
export async function rotateDataUrl90(dataUrl: string): Promise<string> {
  const img = await loadImage(dataUrl);
  const canvas = document.createElement('canvas');
  // 90度后宽高互换
  canvas.width = img.height;
  canvas.height = img.width;
  const ctx = canvas.getContext('2d');
  if (!ctx) return dataUrl;

  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((90 * Math.PI) / 180);
  ctx.drawImage(img, -img.width / 2, -img.height / 2);

  return canvas.toDataURL('image/png');
}

export interface CropRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * 矩形裁切 (封装 CropRect 消除数据泥团)
 */
export async function cropDataUrl(
  dataUrl: string,
  rect: CropRect
): Promise<string> {
  const img = await loadImage(dataUrl);
  const sx = Math.max(0, rect.x);
  const sy = Math.max(0, rect.y);
  const sw = Math.max(1, Math.min(rect.w, img.width - sx));
  const sh = Math.max(1, Math.min(rect.h, img.height - sy));

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(sw);
  canvas.height = Math.round(sh);
  const ctx = canvas.getContext('2d');
  if (!ctx) return dataUrl;

  ctx.drawImage(
    img,
    sx,
    sy,
    sw,
    sh,
    0,
    0,
    canvas.width,
    canvas.height
  );

  return canvas.toDataURL('image/png');
}

/**
 * 图像高清放大绝对物理上限 (严格对齐 Infinite Canvas MAX_UPSCALE_LONG_EDGE = 4096，杜绝 16 亿像素打爆 GPU)
 */
export const MAX_UPSCALE_LONG_EDGE = 4096;

export interface ResolveUpscaleSizeResult {
  width: number;
  height: number;
  scale: number;
}

/**
 * 严格按照长边与物理上限计算目标放大尺寸 (等比缩放防变形防超限)
 */
export function resolveUpscaleSize(
  width: number,
  height: number,
  targetLongEdge: number
): ResolveUpscaleSizeResult {
  const safeW = Math.max(1, Math.round(width || 1024));
  const safeH = Math.max(1, Math.round(height || 1024));
  const currentLongEdge = Math.max(safeW, safeH);
  const target = Math.min(MAX_UPSCALE_LONG_EDGE, Math.max(1, Math.round(targetLongEdge)));
  const scale = target / currentLongEdge;
  return {
    width: Math.max(1, Math.round(safeW * scale)),
    height: Math.max(1, Math.round(safeH * scale)),
    scale,
  };
}

/**
 * 校验当前图像是否允许继续放大
 */
export function canUpscaleImage(
  width: number,
  height: number,
  targetLongEdge?: number
): boolean {
  const currentLongEdge = Math.max(width || 0, height || 0);
  if (currentLongEdge >= MAX_UPSCALE_LONG_EDGE) return false;
  if (targetLongEdge !== undefined) {
    return currentLongEdge < targetLongEdge && targetLongEdge <= MAX_UPSCALE_LONG_EDGE;
  }
  return true;
}

export type ImageUpscaleAlgorithm = 'high' | 'bilinear' | 'nearest';

/**
 * 将图像高质量插值放大至指定目标长边 (受 MAX_UPSCALE_LONG_EDGE = 4096 严格钳制)
 */
export async function upscaleDataUrlToTarget(
  dataUrl: string,
  targetLongEdge: number,
  algorithm: ImageUpscaleAlgorithm = 'high'
): Promise<{ dataUrl: string; width: number; height: number }> {
  const img = await loadImage(dataUrl);
  const { width: targetW, height: targetH } = resolveUpscaleSize(img.width, img.height, targetLongEdge);

  // 若已达标或无须放大，直接返回原图
  if (targetW <= img.width && targetH <= img.height) {
    return { dataUrl, width: img.width, height: img.height };
  }

  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return { dataUrl, width: img.width, height: img.height };
  }

  if (algorithm === 'nearest') {
    ctx.imageSmoothingEnabled = false;
  } else {
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = algorithm === 'bilinear' ? 'medium' : 'high';
  }
  ctx.drawImage(img, 0, 0, targetW, targetH);

  return {
    dataUrl: canvas.toDataURL('image/png'),
    width: targetW,
    height: targetH,
  };
}

/**
 * 2x 逐级插值放大 (自动钳制在 MAX_UPSCALE_LONG_EDGE = 4096 以内，杜绝无限制翻倍)
 */
export async function upscaleDataUrl2x(dataUrl: string): Promise<{ dataUrl: string; width: number; height: number }> {
  const img = await loadImage(dataUrl);
  const currentLong = Math.max(img.width, img.height);
  if (currentLong >= MAX_UPSCALE_LONG_EDGE) {
    return { dataUrl, width: img.width, height: img.height };
  }
  const nextTarget = Math.min(MAX_UPSCALE_LONG_EDGE, currentLong * 2);
  return upscaleDataUrlToTarget(dataUrl, nextTarget);
}

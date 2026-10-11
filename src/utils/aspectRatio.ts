import { ASPECT_RATIO_CONFIGS } from '../services/imageGenerator';
import type { ImageAspectRatio } from '../types';

/** 全部可用画幅，以 ASPECT_RATIO_CONFIGS 为唯一真源 */
export const ASPECT_RATIO_LIST = Object.keys(ASPECT_RATIO_CONFIGS) as ImageAspectRatio[];

const FALLBACK_RATIO: ImageAspectRatio = '1:1';

function isAspectRatio(value: unknown): value is ImageAspectRatio {
  return typeof value === 'string' && Object.hasOwn(ASPECT_RATIO_CONFIGS, value);
}

/** 画幅的像素标签（如 1792×1024），由 ASPECT_RATIO_CONFIGS 推导 */
export function formatRatioDimensions(ratio: ImageAspectRatio): string {
  const { width, height } = ASPECT_RATIO_CONFIGS[ratio];
  return `${width}×${height}`;
}

/**
 * 解析生图画幅：已保存的草稿画幅优先，其次是设置里的默认画幅，最后回退 1:1。
 * 草稿 / 设置里的无效值（旧版本残留）视为未设置。
 */
export function resolveAspectRatio(
  draftRatio: ImageAspectRatio | undefined,
  defaultRatio: ImageAspectRatio | undefined
): ImageAspectRatio {
  if (isAspectRatio(draftRatio)) return draftRatio;
  if (isAspectRatio(defaultRatio)) return defaultRatio;
  return FALLBACK_RATIO;
}

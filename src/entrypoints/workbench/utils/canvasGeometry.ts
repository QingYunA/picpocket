import type { ResizeCorner, SelectionBox } from '../types';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface NormalizedBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
}

/**
 * 归一化框选矩形 (兼容从任意方向拖拽拉出的框选区域)
 */
export function normalizeSelectionBox(box: SelectionBox): NormalizedBox {
  const minX = Math.min(box.startX, box.currentX);
  const maxX = Math.max(box.startX, box.currentX);
  const minY = Math.min(box.startY, box.currentY);
  const maxY = Math.max(box.startY, box.currentY);

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

/**
 * AABB 矩形碰撞检测：判定框选区域与目标卡片是否产生重叠或相交
 */
export function isBoxIntersecting(
  box: { minX: number; minY: number; maxX: number; maxY: number },
  rect: Rect
): boolean {
  const rectMinX = rect.x;
  const rectMaxX = rect.x + rect.width;
  const rectMinY = rect.y;
  const rectMaxY = rect.y + rect.height;

  // 只要任意一轴分离，则不相交
  if (box.maxX < rectMinX || box.minX > rectMaxX) return false;
  if (box.maxY < rectMinY || box.minY > rectMaxY) return false;

  return true;
}

/**
 * 四角拖拽缩放几何计算器
 */
export function calculateResize(params: {
  corner: ResizeCorner;
  initial: Rect;
  deltaX: number;
  deltaY: number;
  minWidth?: number;
  minHeight?: number;
}): Rect {
  const { corner, initial, deltaX, deltaY, minWidth = 120, minHeight = 80 } = params;

  let newX = initial.x;
  let newY = initial.y;
  let newW = initial.width;
  let newH = initial.height;

  switch (corner) {
    case 'bottom-right': {
      newW = Math.max(minWidth, initial.width + deltaX);
      newH = Math.max(minHeight, initial.height + deltaY);
      break;
    }
    case 'bottom-left': {
      const targetW = Math.max(minWidth, initial.width - deltaX);
      newX = initial.x + (initial.width - targetW);
      newW = targetW;
      newH = Math.max(minHeight, initial.height + deltaY);
      break;
    }
    case 'top-right': {
      newW = Math.max(minWidth, initial.width + deltaX);
      const targetH = Math.max(minHeight, initial.height - deltaY);
      newY = initial.y + (initial.height - targetH);
      newH = targetH;
      break;
    }
    case 'top-left': {
      const targetW = Math.max(minWidth, initial.width - deltaX);
      const targetH = Math.max(minHeight, initial.height - deltaY);
      newX = initial.x + (initial.width - targetW);
      newY = initial.y + (initial.height - targetH);
      newW = targetW;
      newH = targetH;
      break;
    }
  }

  return {
    x: Math.round(newX),
    y: Math.round(newY),
    width: Math.round(newW),
    height: Math.round(newH),
  };
}

/**
 * 网格对齐辅助纯函数
 */
export function snapToGrid(value: number, gridSize: number = 16): number {
  return Math.round(value / gridSize) * gridSize;
}

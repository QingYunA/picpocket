import type { ViewportTransform } from '../types';

export interface BoxItem {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * 智能自适应聚焦算法 (类似 tldraw zoomToFit / React Flow fitView)
 * 计算一组世界坐标卡片的整体包围盒，并自适应平滑居中在用户屏幕视口内
 */
export function calculateFitViewport(
  items: BoxItem[],
  viewportWidth: number,
  viewportHeight: number,
  padding = 80
): ViewportTransform {
  if (items.length === 0) {
    return { x: 60, y: 80, k: 1.0 };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const item of items) {
    minX = Math.min(minX, item.x);
    minY = Math.min(minY, item.y);
    maxX = Math.max(maxX, item.x + (item.width || 300));
    maxY = Math.max(maxY, item.y + (item.height || 300));
  }

  const boxW = Math.max(1, maxX - minX);
  const boxH = Math.max(1, maxY - minY);

  const availW = Math.max(100, viewportWidth - padding * 2);
  const availH = Math.max(100, viewportHeight - padding * 2);

  const scaleX = availW / boxW;
  const scaleY = availH / boxH;

  // 将自适应缩放比安全钳制在 [0.2, 1.2]
  const targetK = Math.min(Math.max(Math.min(scaleX, scaleY), 0.2), 1.2);

  // 计算居中偏移量
  const targetX = Math.round((viewportWidth - boxW * targetK) / 2 - minX * targetK);
  const targetY = Math.round((viewportHeight - boxH * targetK) / 2 - minY * targetK);

  return {
    x: Number.isFinite(targetX) ? targetX : 60,
    y: Number.isFinite(targetY) ? targetY : 80,
    k: Number(targetK.toFixed(2)),
  };
}

/**
 * 屏幕视口坐标转世界坐标
 */
export function screenToWorld(
  screenX: number,
  screenY: number,
  viewport: ViewportTransform
): { x: number; y: number } {
  const k = Math.max(0.001, viewport.k);
  return {
    x: Math.round((screenX - viewport.x) / k),
    y: Math.round((screenY - viewport.y) / k),
  };
}

/**
 * 画布图片网格排布坐标计算
 */
export function getGridCardPosition(
  index: number,
  baseX = 80,
  baseY = 100,
  cols = 3,
  cellWidth = 350,
  cellHeight = 420
): { x: number; y: number } {
  return {
    x: baseX + (index % cols) * cellWidth,
    y: baseY + Math.floor(index / cols) * cellHeight,
  };
}

/**
 * 视口悬浮控件物理安全边界钳制
 */
export function clampScreenPosition(
  x: number,
  y: number,
  screenWidth: number,
  screenHeight: number,
  cardWidth = 420,
  cardHeight = 540
): { x: number; y: number } {
  const minX = 16;
  const minY = 64;
  const maxX = Math.max(minX, screenWidth - cardWidth - 16);
  const maxY = Math.max(minY, screenHeight - cardHeight - 16);
  return {
    x: Math.min(Math.max(minX, Math.round(x)), maxX),
    y: Math.min(Math.max(minY, Math.round(y)), maxY),
  };
}

/**
 * 计算控制台卡片在当前视口宽度下的自适应尺寸
 */
export function getResponsiveCardWidth(
  screenWidth: number,
  isCollapsed = false
): number {
  if (isCollapsed) {
    return Math.min(260, Math.max(200, screenWidth - 32));
  }
  if (screenWidth < 768) {
    return Math.min(360, Math.max(280, screenWidth - 32));
  }
  return 420;
}

/**
 * 获取当前窗口尺寸（支持 SSR / 无 window 环境优雅降级）
 */
export function getViewportDimensions(): { width: number; height: number } {
  if (typeof window !== 'undefined') {
    return {
      width: window.innerWidth || 1440,
      height: window.innerHeight || 900,
    };
  }
  return { width: 1440, height: 900 };
}





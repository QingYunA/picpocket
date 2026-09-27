import { describe, it, expect } from 'vitest';
import {
  calculateFitViewport,
  screenToWorld,
  getGridCardPosition,
  clampScreenPosition,
  getResponsiveCardWidth,
  getViewportDimensions,
} from '../viewportUtils';

describe('calculateFitViewport', () => {
  it('当卡片列表为空时，应该返回默认视口位置与 100% 缩放', () => {
    const res = calculateFitViewport([], 1920, 1080);
    expect(res).toEqual({ x: 60, y: 80, k: 1.0 });
  });

  it('当有一组卡片时，应该正确计算整体包围盒并将它们居中', () => {
    const items = [
      { x: 100, y: 100, width: 300, height: 300 },
      { x: 500, y: 100, width: 300, height: 300 },
    ];
    // 总范围：x 100~800 (宽 700), y 100~400 (高 300)
    const res = calculateFitViewport(items, 1200, 800, 100);

    // 可用区域：宽 1200 - 200 = 1000, 高 800 - 200 = 600
    // scaleX = 1000 / 700 ≈ 1.428, scaleY = 600 / 300 = 2.0
    // 因最大缩放限制在 1.2，k 应为 1.2
    expect(res.k).toBe(1.2);
    expect(res.x).toBeGreaterThan(0);
    expect(res.y).toBeGreaterThan(0);
  });

  it('当卡片跨度极大时，应该安全缩小视口且不低于最小缩放限制 0.2', () => {
    const items = [
      { x: 0, y: 0, width: 10000, height: 10000 },
    ];
    const res = calculateFitViewport(items, 1000, 1000, 50);
    expect(res.k).toBe(0.2);
    expect(Number.isFinite(res.x)).toBe(true);
    expect(Number.isFinite(res.y)).toBe(true);
  });
});

describe('screenToWorld', () => {
  it('应该根据当前视口正确将屏幕像素转换为画布世界坐标', () => {
    const viewport = { x: 100, y: 50, k: 2.0 };
    const res = screenToWorld(300, 250, viewport);
    // (300 - 100) / 2 = 100, (250 - 50) / 2 = 100
    expect(res).toEqual({ x: 100, y: 100 });
  });

  it('当缩放比例为 1 时应为直接偏移转换', () => {
    const viewport = { x: 40, y: 60, k: 1.0 };
    const res = screenToWorld(200, 300, viewport);
    expect(res).toEqual({ x: 160, y: 240 });
  });
});

describe('getGridCardPosition', () => {
  it('应该按网格列数正确计算卡片坐标，并默认以安全原点落点', () => {
    const pos0 = getGridCardPosition(0);
    expect(pos0).toEqual({ x: 80, y: 100 });

    const pos1 = getGridCardPosition(1);
    expect(pos1).toEqual({ x: 430, y: 100 });

    const pos3 = getGridCardPosition(3);
    expect(pos3).toEqual({ x: 80, y: 520 });
  });
});

describe('clampScreenPosition', () => {
  it('当坐标越界时应该安全钳制在视口可见区域内', () => {
    // 屏幕 1000x800，卡片展开 420x540
    // minX = 16, minY = 64
    // maxX = 1000 - 420 - 16 = 564
    // maxY = 800 - 540 - 16 = 244
    const clampedOOB = clampScreenPosition(900, 700, 1000, 800, 420, 540);
    expect(clampedOOB).toEqual({ x: 564, y: 244 });

    const clampedUnderflow = clampScreenPosition(-100, 10, 1000, 800, 420, 540);
    expect(clampedUnderflow).toEqual({ x: 16, y: 64 });

    const normal = clampScreenPosition(100, 100, 1000, 800, 420, 540);
    expect(normal).toEqual({ x: 100, y: 100 });
  });

  it('在极窄分屏视口 (500px) 下，应该正确保证 maxX 不低于 minX 且能安全定位', () => {
    // 屏幕 500x700，卡片展开 420x540
    // minX = 16, minY = 64
    // maxX = 500 - 420 - 16 = 64
    const narrowPos = clampScreenPosition(200, 100, 500, 700, 420, 540);
    expect(narrowPos.x).toBe(64);
    expect(narrowPos.y).toBe(100);
  });
});

describe('getResponsiveCardWidth', () => {
  it('宽屏下展开态应该使用标准 420px 宽度', () => {
    expect(getResponsiveCardWidth(1440, false)).toBe(420);
    expect(getResponsiveCardWidth(800, false)).toBe(420);
  });

  it('分屏视口 (< 768px) 下展开态应该使用轻量 360px 宽度', () => {
    expect(getResponsiveCardWidth(600, false)).toBe(360);
    expect(getResponsiveCardWidth(500, false)).toBe(360);
  });

  it('在极窄屏幕 (< 392px) 下应该动态自适应可用空间，且有 280px 保底防线', () => {
    // 350 - 32 = 318
    expect(getResponsiveCardWidth(350, false)).toBe(318);
    // 300 - 32 = 268 < 280, 触达保底 280
    expect(getResponsiveCardWidth(300, false)).toBe(280);
  });

  it('折叠态应该使用紧凑胶囊宽度 (260px)，窄屏下亦能自适应缩放', () => {
    expect(getResponsiveCardWidth(1440, true)).toBe(260);
    expect(getResponsiveCardWidth(250, true)).toBe(218); // 250 - 32 = 218
  });
});

describe('getViewportDimensions', () => {
  it('应该正确返回视口宽度与高度，支持降级默认值', () => {
    const dim = getViewportDimensions();
    expect(dim.width).toBeGreaterThan(0);
    expect(dim.height).toBeGreaterThan(0);
  });
});

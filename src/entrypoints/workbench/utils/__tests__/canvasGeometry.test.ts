import { describe, it, expect } from 'vitest';
import {
  normalizeSelectionBox,
  isBoxIntersecting,
  calculateResize,
  snapToGrid,
  type Rect,
} from '../canvasGeometry';
import type { ResizeCorner, SelectionBox } from '../../types';

describe('canvasGeometry utils', () => {
  describe('normalizeSelectionBox', () => {
    it('should normalize coordinates regardless of dragging direction', () => {
      // 顺向拖拽 (从左上到右下)
      const forwardBox: SelectionBox = { startX: 10, startY: 20, currentX: 110, currentY: 120 };
      const norm1 = normalizeSelectionBox(forwardBox);
      expect(norm1).toEqual({
        minX: 10,
        minY: 20,
        maxX: 110,
        maxY: 120,
        width: 100,
        height: 100,
      });

      // 反向拖拽 (从右下到左上)
      const reverseBox: SelectionBox = { startX: 110, startY: 120, currentX: 10, currentY: 20 };
      const norm2 = normalizeSelectionBox(reverseBox);
      expect(norm2).toEqual({
        minX: 10,
        minY: 20,
        maxX: 110,
        maxY: 120,
        width: 100,
        height: 100,
      });
    });
  });

  describe('isBoxIntersecting (AABB collision)', () => {
    const box = { minX: 50, minY: 50, maxX: 150, maxY: 150 };

    it('should detect intersecting rect', () => {
      // 部分重叠
      const rect1: Rect = { x: 100, y: 100, width: 100, height: 100 };
      expect(isBoxIntersecting(box, rect1)).toBe(true);

      // 完全包含
      const rect2: Rect = { x: 60, y: 60, width: 20, height: 20 };
      expect(isBoxIntersecting(box, rect2)).toBe(true);

      // 外包围 box
      const rect3: Rect = { x: 0, y: 0, width: 300, height: 300 };
      expect(isBoxIntersecting(box, rect3)).toBe(true);
    });

    it('should return false for non-intersecting rect', () => {
      // 完全在左侧
      const rectLeft: Rect = { x: 0, y: 50, width: 40, height: 50 };
      expect(isBoxIntersecting(box, rectLeft)).toBe(false);

      // 完全在右侧
      const rectRight: Rect = { x: 160, y: 50, width: 40, height: 50 };
      expect(isBoxIntersecting(box, rectRight)).toBe(false);

      // 完全在上方
      const rectTop: Rect = { x: 50, y: 0, width: 50, height: 40 };
      expect(isBoxIntersecting(box, rectTop)).toBe(false);

      // 完全在下方
      const rectBottom: Rect = { x: 50, y: 160, width: 50, height: 40 };
      expect(isBoxIntersecting(box, rectBottom)).toBe(false);
    });
  });

  describe('calculateResize', () => {
    const initial: Rect = { x: 100, y: 100, width: 200, height: 150 };

    it('should resize from bottom-right corner', () => {
      const res = calculateResize({
        corner: 'bottom-right',
        initial,
        deltaX: 50,
        deltaY: 30,
      });
      expect(res).toEqual({
        x: 100,
        y: 100,
        width: 250,
        height: 180,
      });
    });

    it('should resize from top-left corner and adjust position', () => {
      const res = calculateResize({
        corner: 'top-left',
        initial,
        deltaX: 20,
        deltaY: 30,
      });
      expect(res).toEqual({
        x: 120,
        y: 130,
        width: 180,
        height: 120,
      });
    });

    it('should respect minWidth and minHeight constraints', () => {
      const res = calculateResize({
        corner: 'bottom-right',
        initial,
        deltaX: -300,
        deltaY: -300,
        minWidth: 100,
        minHeight: 80,
      });
      expect(res.width).toBe(100);
      expect(res.height).toBe(80);
    });
  });

  describe('snapToGrid', () => {
    it('should snap values to nearest grid step', () => {
      expect(snapToGrid(12, 16)).toBe(16);
      expect(snapToGrid(7, 16)).toBe(0);
      expect(snapToGrid(48, 24)).toBe(48);
    });
  });
});

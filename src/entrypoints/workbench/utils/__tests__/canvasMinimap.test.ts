import { describe, it, expect } from 'vitest';

describe('canvasMinimap math', () => {
  it('should correctly project world coordinates into minimap bounds', () => {
    const worldBounds = { x: 0, y: 0, w: 1000, h: 500 };
    const mapW = 200;
    const mapH = 100;
    const scale = Math.min(mapW / worldBounds.w, mapH / worldBounds.h); // 0.2
    expect(scale).toBe(0.2);

    const worldPoint = { x: 500, y: 250 };
    const mapX = (worldPoint.x - worldBounds.x) * scale;
    const mapY = (worldPoint.y - worldBounds.y) * scale;

    expect(mapX).toBe(100);
    expect(mapY).toBe(50);
  });
});

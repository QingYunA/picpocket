import React, { useMemo, useRef, useState, useCallback } from 'react';
import type { ViewportTransform, CanvasTheme } from '../types';

export interface MinimapNode {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  type?: 'image' | 'text';
}

export interface CanvasMinimapProps {
  nodes: MinimapNode[];
  viewport: ViewportTransform;
  theme: CanvasTheme;
  viewportSize: { width: number; height: number };
  onViewportChange: (viewport: ViewportTransform) => void;
}

const MAP_WIDTH = 220;
const MAP_HEIGHT = 140;

export const CanvasMinimap: React.FC<CanvasMinimapProps> = ({
  nodes,
  viewport,
  theme,
  viewportSize,
  onViewportChange,
}) => {
  const isLight = theme === 'light';
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  // 1. 计算所有卡片包围盒
  const { worldBounds, scale, offset } = useMemo(() => {
    if (!nodes.length) {
      return {
        worldBounds: { x: -500, y: -500, w: 1000, h: 1000 },
        scale: 0.14,
        offset: { x: 30, y: 0 },
      };
    }

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    nodes.forEach((node) => {
      minX = Math.min(minX, node.x);
      minY = Math.min(minY, node.y);
      maxX = Math.max(maxX, node.x + node.width);
      maxY = Math.max(maxY, node.y + node.height);
    });

    // 留出四周舒适边距
    minX -= 400;
    minY -= 400;
    maxX += 400;
    maxY += 400;

    const boundsW = maxX - minX;
    const boundsH = maxY - minY;
    const nextScale = Math.min(MAP_WIDTH / boundsW, MAP_HEIGHT / boundsH);
    const contentW = boundsW * nextScale;
    const contentH = boundsH * nextScale;

    return {
      worldBounds: { x: minX, y: minY, w: boundsW, h: boundsH },
      scale: nextScale,
      offset: { x: (MAP_WIDTH - contentW) / 2, y: (MAP_HEIGHT - contentH) / 2 },
    };
  }, [nodes]);

  // 世界坐标与小地图坐标互转
  const toMinimap = useCallback(
    (wx: number, wy: number) => {
      return {
        x: (wx - worldBounds.x) * scale + offset.x,
        y: (wy - worldBounds.y) * scale + offset.y,
      };
    },
    [offset.x, offset.y, scale, worldBounds.x, worldBounds.y]
  );

  const toWorld = useCallback(
    (mx: number, my: number) => {
      return {
        x: (mx - offset.x) / scale + worldBounds.x,
        y: (my - offset.y) / scale + worldBounds.y,
      };
    },
    [offset.x, offset.y, scale, worldBounds.x, worldBounds.y]
  );

  // 2. 当前视口在小地图中的矩形映射
  const viewportRect = useMemo(() => {
    const vx = -viewport.x / viewport.k;
    const vy = -viewport.y / viewport.k;
    const vw = viewportSize.width / viewport.k;
    const vh = viewportSize.height / viewport.k;

    const p1 = toMinimap(vx, vy);
    const p2 = toMinimap(vx + vw, vy + vh);

    return {
      x: p1.x,
      y: p1.y,
      w: Math.max(p2.x - p1.x, 6),
      h: Math.max(p2.y - p1.y, 6),
    };
  }, [toMinimap, viewport.k, viewport.x, viewport.y, viewportSize.height, viewportSize.width]);

  // 点击或拖拽小地图更新主视口
  const updateViewportFromEvent = (clientX: number, clientY: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const minimapX = clientX - rect.left;
    const minimapY = clientY - rect.top;
    const world = toWorld(minimapX, minimapY);

    onViewportChange({
      x: viewportSize.width / 2 - world.x * viewport.k,
      y: viewportSize.height / 2 - world.y * viewport.k,
      k: viewport.k,
    });
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setIsDragging(true);
    updateViewportFromEvent(e.clientX, e.clientY);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return;
    updateViewportFromEvent(e.clientX, e.clientY);
  };

  const handlePointerUp = () => {
    setIsDragging(false);
  };

  return (
    <div
      ref={containerRef}
      data-canvas-no-pan="true"
      className={`absolute bottom-5 left-5 z-40 rounded-2xl border shadow-2xl backdrop-blur-xl overflow-hidden cursor-crosshair select-none transition-colors ${
        isLight
          ? 'bg-white/90 border-slate-200/90 shadow-slate-300/50'
          : 'bg-zinc-900/90 border-zinc-800/90 shadow-black/80'
      }`}
      style={{
        width: MAP_WIDTH,
        height: MAP_HEIGHT,
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      {/* 节点微缩块 */}
      {nodes.map((node) => {
        const p = toMinimap(node.x, node.y);
        const w = Math.max(node.width * scale, 3);
        const h = Math.max(node.height * scale, 3);
        const isText = node.type === 'text';

        return (
          <div
            key={node.id}
            className={`absolute rounded-xs pointer-events-none transition-opacity ${
              isText
                ? 'bg-amber-400/70 dark:bg-amber-500/60'
                : 'bg-violet-500/70 dark:bg-violet-400/60'
            }`}
            style={{
              left: `${p.x}px`,
              top: `${p.y}px`,
              width: `${w}px`,
              height: `${h}px`,
            }}
          />
        );
      })}

      {/* 视口可视区框选 (带半透明填充与边界框) */}
      <div
        className="absolute border-2 border-violet-500 bg-violet-500/15 rounded-md pointer-events-none transition-all shadow-xs"
        style={{
          left: `${viewportRect.x}px`,
          top: `${viewportRect.y}px`,
          width: `${viewportRect.w}px`,
          height: `${viewportRect.h}px`,
        }}
      />
    </div>
  );
};

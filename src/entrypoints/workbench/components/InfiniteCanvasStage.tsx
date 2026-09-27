import React, { useRef, useState, useEffect, useCallback } from 'react';
import type {
  ViewportTransform,
  CanvasTheme,
  CanvasToolMode,
  CanvasBackgroundMode,
  SelectionBox,
} from '../types';

interface InfiniteCanvasStageProps {
  theme: CanvasTheme;
  viewport: ViewportTransform;
  tool?: CanvasToolMode;
  backgroundMode?: CanvasBackgroundMode;
  onViewportChange: (viewport: ViewportTransform) => void;
  onCanvasClick?: () => void;
  onSelectionBoxEnd?: (box: SelectionBox) => void;
  onContextMenu?: (e: React.MouseEvent<HTMLDivElement>) => void;
  onDoubleClickStage?: (
    worldX: number,
    worldY: number,
    screenX: number,
    screenY: number
  ) => void;
  onDropImage?: (imageDataUrlOrItem: string, worldX: number, worldY: number) => void;
  children: React.ReactNode;
}

export const InfiniteCanvasStage: React.FC<InfiniteCanvasStageProps> = ({
  theme,
  viewport,
  tool = 'select',
  backgroundMode = 'lines',
  onViewportChange,
  onCanvasClick,
  onSelectionBoxEnd,
  onContextMenu,
  onDoubleClickStage,
  onDropImage,
  children,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [marqueeBox, setMarqueeBox] = useState<{
    worldStartX: number;
    worldStartY: number;
    worldCurrentX: number;
    worldCurrentY: number;
    screenStartX: number;
    screenStartY: number;
    screenCurrentX: number;
    screenCurrentY: number;
  } | null>(null);

  const marqueeStateRef = useRef<{
    isMarquee: boolean;
    worldStartX: number;
    worldStartY: number;
    worldCurrentX: number;
    worldCurrentY: number;
    screenStartX: number;
    screenStartY: number;
    hasMoved: boolean;
  } | null>(null);

  const panState = useRef({
    isPanning: false,
    startX: 0,
    startY: 0,
    initialX: 0,
    initialY: 0,
    hasMoved: false,
    startedOnBackground: false,
  });

  const scaleRef = useRef(viewport.k);
  const frameRef = useRef<number | null>(null);
  const nextViewportRef = useRef<ViewportTransform | null>(null);

  useEffect(() => {
    scaleRef.current = viewport.k;
  }, [viewport.k]);

  useEffect(() => {
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, []);

  // 挂载原生非被动 wheel 监听，拦截触控板双指左右滑触发浏览器后退
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const preventWheelScroll = (e: WheelEvent) => {
      const target = e.target instanceof Element ? e.target : null;
      if (target?.closest('[data-canvas-no-pan], textarea, input, select, button, .thin-scrollbar')) return;
      e.preventDefault();
    };
    container.addEventListener('wheel', preventWheelScroll, { passive: false });
    return () => container.removeEventListener('wheel', preventWheelScroll);
  }, []);

  // 监听 Space 键平移切换
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat) return;
      const target = e.target instanceof Element ? e.target : null;
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement ||
        target?.closest("[contenteditable='true']")
      ) {
        return;
      }
      e.preventDefault();
      setIsSpacePressed(true);
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        const target = e.target instanceof Element ? e.target : null;
        if (
          !(
            e.target instanceof HTMLInputElement ||
            e.target instanceof HTMLTextAreaElement ||
            e.target instanceof HTMLSelectElement ||
            target?.closest("[contenteditable='true']")
          )
        ) {
          e.preventDefault();
        }
        setIsSpacePressed(false);
      }
    };

    const handleBlur = () => {
      setIsSpacePressed(false);
      panState.current.isPanning = false;
      setIsPanning(false);
      if (marqueeStateRef.current) {
        marqueeStateRef.current = null;
        setMarqueeBox(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
    };
  }, []);

  // 滚轮缩放处理（以当前光标为中心，放开至 0.05 ~ 5.0，缩放因子 1.1）
  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    const target = e.target instanceof Element ? e.target : null;
    if (target?.closest('[data-canvas-no-pan], textarea, input, select, button, .thin-scrollbar')) {
      return;
    }

    const delta = -e.deltaY;
    const factor = Math.pow(1.1, delta / 100);
    const newScale = Math.min(Math.max(viewport.k * factor, 0.05), 5.0);
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const worldX = (mouseX - viewport.x) / viewport.k;
    const worldY = (mouseY - viewport.y) / viewport.k;

    onViewportChange({
      x: mouseX - worldX * newScale,
      y: mouseY - worldY * newScale,
      k: newScale,
    });
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const target = e.target instanceof Element ? e.target : null;
    if (target?.closest('[data-canvas-no-pan], textarea, input, select, button, [role="button"]')) {
      return;
    }
    const isBackgroundClick = !target?.closest('[data-canvas-card]');
    const isPanMode = tool === 'pan' || isSpacePressed || e.button === 1;

    // 1. 抓手平移模式 (Space / 中键 / H 抓手工具)
    if (isPanMode) {
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      panState.current = {
        isPanning: true,
        startX: e.clientX,
        startY: e.clientY,
        initialX: viewport.x,
        initialY: viewport.y,
        hasMoved: false,
        startedOnBackground: isBackgroundClick,
      };
      setIsPanning(true);
      return;
    }

    // 2. 选择工具模式 (V) 在空白处按下左键 -> 启动 Marquee 矩形框选
    if (e.button === 0 && isBackgroundClick) {
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;

      const screenX = e.clientX - rect.left;
      const screenY = e.clientY - rect.top;
      const worldX = Math.round((screenX - viewport.x) / viewport.k);
      const worldY = Math.round((screenY - viewport.y) / viewport.k);

      marqueeStateRef.current = {
        isMarquee: true,
        worldStartX: worldX,
        worldStartY: worldY,
        worldCurrentX: worldX,
        worldCurrentY: worldY,
        screenStartX: screenX,
        screenStartY: screenY,
        hasMoved: false,
      };
      setMarqueeBox(null);
    }
  };

  const onCanvasClickRef = useRef(onCanvasClick);
  useEffect(() => {
    onCanvasClickRef.current = onCanvasClick;
  }, [onCanvasClick]);

  const onViewportChangeRef = useRef(onViewportChange);
  useEffect(() => {
    onViewportChangeRef.current = onViewportChange;
  }, [onViewportChange]);

  const onSelectionBoxEndRef = useRef(onSelectionBoxEnd);
  useEffect(() => {
    onSelectionBoxEndRef.current = onSelectionBoxEnd;
  }, [onSelectionBoxEnd]);

  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      // (1) 处理画布平移
      if (panState.current.isPanning) {
        const dx = e.clientX - panState.current.startX;
        const dy = e.clientY - panState.current.startY;
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
          panState.current.hasMoved = true;
        }

        nextViewportRef.current = {
          x: panState.current.initialX + dx,
          y: panState.current.initialY + dy,
          k: scaleRef.current,
        };

        if (frameRef.current) return;
        frameRef.current = requestAnimationFrame(() => {
          frameRef.current = null;
          if (nextViewportRef.current) {
            onViewportChangeRef.current(nextViewportRef.current);
          }
        });
        return;
      }

      // (2) 处理 Marquee 框选拖动
      if (marqueeStateRef.current?.isMarquee) {
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;

        const screenCurX = e.clientX - rect.left;
        const screenCurY = e.clientY - rect.top;
        const worldCurX = Math.round((screenCurX - viewport.x) / viewport.k);
        const worldCurY = Math.round((screenCurY - viewport.y) / viewport.k);

        const dx = screenCurX - marqueeStateRef.current.screenStartX;
        const dy = screenCurY - marqueeStateRef.current.screenStartY;
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
          marqueeStateRef.current.hasMoved = true;
        }

        marqueeStateRef.current.worldCurrentX = worldCurX;
        marqueeStateRef.current.worldCurrentY = worldCurY;

        setMarqueeBox({
          worldStartX: marqueeStateRef.current.worldStartX,
          worldStartY: marqueeStateRef.current.worldStartY,
          worldCurrentX: worldCurX,
          worldCurrentY: worldCurY,
          screenStartX: marqueeStateRef.current.screenStartX,
          screenStartY: marqueeStateRef.current.screenStartY,
          screenCurrentX: screenCurX,
          screenCurrentY: screenCurY,
        });
      }
    };

    const handlePointerUp = () => {
      // (1) 平移结束
      if (panState.current.isPanning) {
        panState.current.isPanning = false;
        setIsPanning(false);
      }

      // (2) 框选结束
      if (marqueeStateRef.current?.isMarquee) {
        const mq = marqueeStateRef.current;
        marqueeStateRef.current = null;
        setMarqueeBox(null);

        if (mq.hasMoved) {
          onSelectionBoxEndRef.current?.({
            startX: mq.worldStartX,
            startY: mq.worldStartY,
            currentX: mq.worldCurrentX,
            currentY: mq.worldCurrentY,
          });
        } else {
          onCanvasClickRef.current?.();
        }
      }
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };
  }, [viewport.x, viewport.y, viewport.k]);

  // 双击空白处
  const handleDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target instanceof Element ? e.target : null;
    if (target?.closest('[data-canvas-card], [data-canvas-no-pan], textarea, input, select, button')) {
      return;
    }
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const worldX = Math.round((mouseX - viewport.x) / viewport.k);
    const worldY = Math.round((mouseY - viewport.y) / viewport.k);
    onDoubleClickStage?.(worldX, worldY, e.clientX, e.clientY);
  };

  // 拖拽文件或图片进入舞台
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const worldX = Math.round((mouseX - viewport.x) / viewport.k);
    const worldY = Math.round((mouseY - viewport.y) / viewport.k);

    // 1. 优先检测 PicPocket 自定义格式或 URL
    const customItem = e.dataTransfer.getData('application/x-picpocket-item');
    if (customItem) {
      onDropImage?.(customItem, worldX, worldY);
      return;
    }

    const textUrl = e.dataTransfer.getData('text/plain');
    if (textUrl && (textUrl.startsWith('data:image/') || textUrl.startsWith('http'))) {
      onDropImage?.(textUrl, worldX, worldY);
      return;
    }

    // 2. 本地外部文件拖拽
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      if (file && file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = () => {
          if (typeof reader.result === 'string') {
            onDropImage?.(reader.result, worldX, worldY);
          }
        };
        reader.readAsDataURL(file);
      }
    }
  };

  const isLight = theme === 'light';

  // 背景网格渲染 (对齐原版 lines, dots, blank)
  const renderBackground = () => {
    if (backgroundMode === 'blank') return null;

    const gridSize = 48 * viewport.k;
    const gridX = viewport.x % gridSize;
    const gridY = viewport.y % gridSize;

    if (backgroundMode === 'dots') {
      const dotSize = viewport.k < 0.12 ? 0.8 : 1.15;
      return (
        <div
          className={`pointer-events-none absolute inset-0 ${isLight ? 'opacity-40' : 'opacity-25'}`}
          style={{
            backgroundImage: isLight
              ? `radial-gradient(circle, rgba(100, 116, 139, 0.4) ${dotSize}px, transparent ${dotSize + 0.2}px)`
              : `radial-gradient(circle, rgba(255, 255, 255, 0.4) ${dotSize}px, transparent ${dotSize + 0.2}px)`,
            backgroundSize: `${gridSize}px ${gridSize}px`,
            backgroundPosition: `${gridX}px ${gridY}px`,
          }}
        />
      );
    }

    // lines: 原版经典工程网格线条
    return (
      <div
        className={`pointer-events-none absolute inset-0 ${isLight ? 'opacity-30' : 'opacity-20'}`}
        style={{
          backgroundImage: isLight
            ? `linear-gradient(rgba(100, 116, 139, 0.25) 1px, transparent 1px), linear-gradient(90deg, rgba(100, 116, 139, 0.25) 1px, transparent 1px)`
            : `linear-gradient(rgba(255, 255, 255, 0.15) 1px, transparent 1px), linear-gradient(90deg, rgba(255, 255, 255, 0.15) 1px, transparent 1px)`,
          backgroundSize: `${gridSize}px ${gridSize}px`,
          backgroundPosition: `${gridX}px ${gridY}px`,
        }}
      />
    );
  };

  const isPanMode = tool === 'pan' || isSpacePressed;
  const cursorClass = isPanning
    ? 'cursor-grabbing'
    : isPanMode
    ? 'cursor-grab'
    : 'cursor-default';

  return (
    <div
      ref={containerRef}
      className={`relative h-full w-full select-none overflow-hidden transition-colors ${
        isLight ? 'bg-[#F8FAFC]' : 'bg-[#09090b]'
      } ${cursorClass}`}
      onPointerDown={handlePointerDown}
      onWheel={handleWheel}
      onDoubleClick={handleDoubleClick}
      onContextMenu={onContextMenu}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* 动态网格背景 */}
      {renderBackground()}

      {/* 画布世界舞台层 */}
      <div
        className="absolute origin-top-left will-change-transform"
        style={{
          transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.k})`,
        }}
      >
        {children}
      </div>

      {/* 框选矩形 (Marquee Selection Box) */}
      {marqueeBox && (
        <div
          className="pointer-events-none absolute z-40 border border-[#2f80ff] bg-[#2f80ff]/15 rounded"
          style={{
            left: `${Math.min(marqueeBox.screenStartX, marqueeBox.screenCurrentX)}px`,
            top: `${Math.min(marqueeBox.screenStartY, marqueeBox.screenCurrentY)}px`,
            width: `${Math.abs(marqueeBox.screenCurrentX - marqueeBox.screenStartX)}px`,
            height: `${Math.abs(marqueeBox.screenCurrentY - marqueeBox.screenStartY)}px`,
          }}
        />
      )}
    </div>
  );
};

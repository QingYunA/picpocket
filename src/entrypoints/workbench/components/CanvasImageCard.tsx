import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  Download,
  Trash2,
  Maximize2,
  RefreshCw,
  LoaderCircle,
  AlertCircle,
  Image as ImageIcon,
} from 'lucide-react';
import type { GeneratedImage, FolderItem, ImageAspectRatio } from '@/types';
import { useI18n } from '@/i18n';
import { UpgradeCreditsButton } from '@/components/UpgradeCreditsButton';
import type { CanvasTheme, CanvasNodeStatus, ResizeCorner } from '../types';
import { calculateResize } from '../utils/canvasGeometry';

export interface CanvasImageCardProps {
  id: string;
  title?: string;
  width?: number;
  height?: number;
  image?: GeneratedImage;
  status?: CanvasNodeStatus;
  prompt?: string;
  model?: string;
  aspectRatio?: ImageAspectRatio;
  referenceImages?: string[];
  error?: string;
  elapsedSec?: number;
  theme: CanvasTheme;
  folders?: FolderItem[];
  x: number;
  y: number;
  scale: number;
  isSelected: boolean;
  isPanMode?: boolean;
  onSelect: (multiSelect?: boolean) => void;
  onPositionChange: (x: number, y: number) => void;
  onResize?: (id: string, width: number, height: number, pos?: { x: number; y: number }) => void;
  onTitleChange?: (id: string, title: string) => void;
  onViewOriginal?: (image: GeneratedImage) => void;
  onSaveToGallery?: (image: GeneratedImage) => void;
  onSaveToFolder?: (image: GeneratedImage, folderId?: number | null) => void;
  onSetAsReference?: (image: GeneratedImage) => void;
  onCrop?: (id: string, image: GeneratedImage) => void;
  onRotate?: (id: string, image: GeneratedImage) => void;
  onUpscale?: (id: string, image: GeneratedImage) => void;
  onDownload?: (image: GeneratedImage) => void;
  onDelete: (id: string) => void;
  onRetry?: (cardId: string) => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  renderPromptPanel?: () => React.ReactNode;
}

export const CanvasImageCard: React.FC<CanvasImageCardProps> = ({
  id,
  title,
  width = 320,
  height = 320,
  image,
  status: rawStatus,
  prompt = '',
  model = 'flux-pro',
  aspectRatio = '1:1',
  referenceImages = [],
  error,
  elapsedSec = 0,
  theme,
  x,
  y,
  scale,
  isSelected,
  isPanMode = false,
  onSelect,
  onPositionChange,
  onResize,
  onTitleChange,
  onViewOriginal,
  onSaveToGallery,
  onSaveToFolder,
  onSetAsReference,
  onCrop,
  onRotate,
  onUpscale,
  onDownload,
  onDelete,
  onRetry,
  onMouseEnter,
  onMouseLeave,
  onContextMenu,
  renderPromptPanel,
}) => {
  const { t } = useI18n();
  const [isHovered, setIsHovered] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(title || '');

  const titleInputRef = useRef<HTMLInputElement>(null);
  const dragStartRef = useRef({ mouseX: 0, mouseY: 0, initialX: 0, initialY: 0 });

  const isLight = theme === 'light';
  const status: CanvasNodeStatus = rawStatus || (image ? 'success' : 'idle');

  useEffect(() => {
    setTitleDraft(title || '');
  }, [title]);

  useEffect(() => {
    if (isEditingTitle) {
      titleInputRef.current?.focus();
      titleInputRef.current?.select();
    }
  }, [isEditingTitle]);

  const finishTitleEditing = useCallback(() => {
    const nextTitle = titleDraft.trim() || title || t('workbench.untitledNode');
    setTitleDraft(nextTitle);
    setIsEditingTitle(false);
    if (nextTitle !== title) {
      onTitleChange?.(id, nextTitle);
    }
  }, [id, onTitleChange, t, title, titleDraft]);

  // 节点整体拖拽移动处理 (左键直接按住卡片拖动)
  const handlePointerDown = (e: React.PointerEvent) => {
    // 1. 若为鼠标中键或当前处于抓手模式，允许冒泡给舞台进行画布平移
    if (e.button === 1 || isPanMode) {
      return;
    }

    const target = e.target instanceof Element ? e.target : null;
    if (target?.closest('button, [role="button"], a, input, textarea, [data-canvas-no-pan], [data-resize-handle]')) {
      return;
    }

    const isMultiSelect = e.shiftKey || e.metaKey || e.ctrlKey;
    if (isMultiSelect) {
      e.stopPropagation();
      e.preventDefault();
      onSelect(true);
      return;
    }

    // 若未被选中，则激活单选；若已被选中，则保留选区支持成组拖拽
    if (!isSelected) {
      onSelect(false);
    }

    e.stopPropagation();
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);

    dragStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      initialX: x,
      initialY: y,
    };

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const dx = (moveEvent.clientX - dragStartRef.current.mouseX) / scale;
      const dy = (moveEvent.clientY - dragStartRef.current.mouseY) / scale;
      onPositionChange(
        Math.round(dragStartRef.current.initialX + dx),
        Math.round(dragStartRef.current.initialY + dy)
      );
    };

    const handlePointerUp = () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
  };

  // 四角 Resize 拖拽处理
  const handleResizeStart = (e: React.MouseEvent, corner: ResizeCorner) => {
    e.stopPropagation();
    e.preventDefault();
    onSelect();

    const startX = e.clientX;
    const startY = e.clientY;
    const startWidth = width;
    const startHeight = height;
    const startLeft = x;
    const startTop = y;

    const handleResizeMove = (moveEvent: MouseEvent) => {
      const deltaX = (moveEvent.clientX - startX) / scale;
      const deltaY = (moveEvent.clientY - startY) / scale;

      const result = calculateResize({
        corner,
        initial: {
          x: startLeft,
          y: startTop,
          width: startWidth,
          height: startHeight,
        },
        deltaX,
        deltaY,
        minWidth: 200,
        minHeight: 180,
      });

      onResize?.(id, result.width, result.height, { x: result.x, y: result.y });
    };

    const handleResizeEnd = () => {
      window.removeEventListener('mousemove', handleResizeMove);
      window.removeEventListener('mouseup', handleResizeEnd);
    };

    window.addEventListener('mousemove', handleResizeMove);
    window.addEventListener('mouseup', handleResizeEnd);
  };

  const selectionBlue = '#2f80ff';

  return (
    <div
      data-canvas-card="image"
      onPointerDown={handlePointerDown}
      onContextMenu={onContextMenu}
      onMouseEnter={() => {
        setIsHovered(true);
        onMouseEnter?.();
      }}
      onMouseLeave={() => {
        setIsHovered(false);
        onMouseLeave?.();
      }}
      style={{
        transform: `translate(${x}px, ${y}px)`,
        width: `${width}px`,
        height: `${height}px`,
        contain: 'layout style',
      }}
      className="absolute select-none group"
    >
      {/* 悬浮标题栏 (原版风格: 双击原地编辑改名) */}
      {(isSelected || isHovered || isEditingTitle) && (
        <div
          className="absolute left-3 top-[-28px] z-[65] max-w-[calc(100%-24px)] pointer-events-auto"
          onMouseDown={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {isEditingTitle ? (
            <input
              ref={titleInputRef}
              value={titleDraft}
              maxLength={64}
              className={`h-6 max-w-full border-0 border-b border-dashed bg-transparent px-0 text-left text-xs font-medium outline-none ${
                isLight ? 'border-slate-400 text-slate-800' : 'border-zinc-500 text-zinc-200'
              }`}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={finishTitleEditing}
              onKeyDown={(e) => {
                if (e.key === 'Enter') finishTitleEditing();
                if (e.key === 'Escape') {
                  setTitleDraft(title || '');
                  setIsEditingTitle(false);
                }
              }}
            />
          ) : (
            <button
              type="button"
              className={`block max-w-full truncate border-b border-dashed border-transparent px-0 py-0.5 text-left text-xs font-medium transition cursor-pointer ${
                isLight
                  ? 'text-slate-600 hover:text-slate-900 hover:border-slate-400'
                  : 'text-zinc-400 hover:text-zinc-100 hover:border-zinc-500'
              }`}
              title={t('workbench.renameHint')}
              onDoubleClick={(e) => {
                e.stopPropagation();
                setIsEditingTitle(true);
              }}
            >
              {title || t('workbench.untitledNode')}
            </button>
          )}
        </div>
      )}

      {/* 主卡片图元容器 (对齐原版 rounded-3xl 与选中蓝环) */}
      <div
        className={`relative h-full w-full rounded-3xl transition-shadow ${
          isLight ? 'bg-white' : 'bg-[#18181b]'
        }`}
        style={{
          border: isSelected ? `2px solid ${selectionBlue}` : isLight ? '2px solid #e2e8f0' : '2px solid #27272a',
          boxShadow: isSelected
            ? `0 0 0 1px ${selectionBlue}55, 0 18px 48px rgba(0,0,0,0.18)`
            : isLight
            ? '0 10px 30px rgba(0,0,0,0.06)'
            : '0 10px 30px rgba(0,0,0,0.35)',
        }}
      >
        {/* 卡片内容渲染 */}
        <div className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-[inherit]">
          {status === 'loading' ? (
            <div className="flex flex-col items-center justify-center gap-3 p-6 text-center">
              <div className="relative">
                <LoaderCircle className="w-10 h-10 text-[#2f80ff] animate-spin" />
              </div>
              <div className="space-y-1">
                <span className="text-xs font-medium tracking-wide">
                  {t('workbench.generating')}
                </span>
                {elapsedSec > 0 && (
                  <p className="text-[11px] font-mono opacity-60">
                    {elapsedSec}s
                  </p>
                )}
              </div>
            </div>
          ) : status === 'error' ? (
            <div className="flex flex-col items-center justify-center gap-3 p-6 text-center text-red-500">
              <AlertCircle className="w-10 h-10 stroke-1" />
              <div className="space-y-1 max-w-[240px]">
                <span className="text-xs font-semibold">{t('workbench.generationFailed')}</span>
                {error && (
                  <p className="text-[11px] line-clamp-3 opacity-80 break-words">
                    {error}
                  </p>
                )}
              </div>
              <UpgradeCreditsButton message={error} />
              {onRetry && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRetry(id);
                  }}
                  className="mt-1 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-red-500/10 hover:bg-red-500/20 text-red-500 transition-colors cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>{t('workbench.retry')}</span>
                </button>
              )}
            </div>
          ) : image?.dataUrl ? (
            <img
              src={image.dataUrl}
              alt={prompt || 'Canvas Node'}
              className="h-full w-full object-cover rounded-[inherit] pointer-events-none"
              referrerPolicy="no-referrer"
              onError={(e) => {
                (e.target as HTMLElement).style.display = 'none';
              }}
            />
          ) : (
            <div className="flex flex-col items-center justify-center gap-2 p-6 text-center opacity-40">
              <ImageIcon className="w-12 h-12 stroke-1" />
              <span className="text-xs">{t('workbench.promptPlaceholder')}</span>
            </div>
          )}
        </div>

        {/* 悬浮操作胶囊 (Hover 工具条，极简毛玻璃) */}
        {(isHovered || isSelected) && (
          <div
            className="absolute top-3 right-3 z-40 flex items-center gap-1 rounded-full p-1 border shadow-lg backdrop-blur-md transition-opacity bg-black/55 border-white/20 text-white"
            onMouseDown={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            {image && onViewOriginal && (
              <button
                type="button"
                onClick={() => onViewOriginal(image)}
                className="p-1.5 hover:bg-white/20 rounded-full transition-colors cursor-pointer"
                title={t('workbench.viewOriginal')}
              >
                <Maximize2 className="w-3.5 h-3.5" />
              </button>
            )}
            {image && onDownload && (
              <button
                type="button"
                onClick={() => onDownload(image)}
                className="p-1.5 hover:bg-white/20 rounded-full transition-colors cursor-pointer"
                title={t('workbench.downloadImage')}
              >
                <Download className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              type="button"
              onClick={() => onDelete(id)}
              className="p-1.5 hover:bg-red-500/80 rounded-full transition-colors cursor-pointer text-red-200 hover:text-white"
              title={t('workbench.nodeDelete')}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* 四角 ResizeHandle (自由拖拽调整宽高) */}
        <ResizeHandle corner="top-left" onMouseDown={(e) => handleResizeStart(e, 'top-left')} />
        <ResizeHandle corner="top-right" onMouseDown={(e) => handleResizeStart(e, 'top-right')} />
        <ResizeHandle corner="bottom-left" onMouseDown={(e) => handleResizeStart(e, 'bottom-left')} />
        <ResizeHandle corner="bottom-right" onMouseDown={(e) => handleResizeStart(e, 'bottom-right')} />
      </div>

      {/* 原生世界坐标提示词与参数面板 (挂载于卡片正下方，随卡片缩放平移 100% 绝对贴合) */}
      {isSelected && renderPromptPanel && (
        <div
          className="absolute left-1/2 top-full z-[70] -translate-x-1/2 pt-3 pointer-events-auto"
          onMouseDown={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {renderPromptPanel()}
        </div>
      )}
    </div>
  );
};

// 四角缩放把手组件 (对齐原版 28px 隐形触发区域)
function ResizeHandle({
  corner,
  onMouseDown,
}: {
  corner: ResizeCorner;
  onMouseDown: (event: React.MouseEvent) => void;
}) {
  const positionClass = {
    'top-left': '-left-[14px] -top-[14px] cursor-nwse-resize',
    'top-right': '-right-[14px] -top-[14px] cursor-nesw-resize',
    'bottom-left': '-bottom-[14px] -left-[14px] cursor-nesw-resize',
    'bottom-right': '-bottom-[14px] -right-[14px] cursor-nwse-resize',
  }[corner];

  return (
    <div
      data-resize-handle="true"
      className={`absolute z-50 size-7 ${positionClass}`}
      onMouseDown={onMouseDown}
    />
  );
}

import React from 'react';
import {
  Copy,
  FileText,
  RotateCw,
  ZoomIn,
  Camera,
  Grid2x2,
  Scissors,
  Download,
  BookmarkPlus,
  Trash2,
  Sparkles,
  Maximize2,
} from 'lucide-react';
import type { GeneratedImage } from '@/types';
import type { ViewportTransform, CanvasTheme } from '../types';
import { useI18n } from '@/i18n';

export interface CanvasNodeHoverToolbarProps {
  cardId: string;
  image: GeneratedImage;
  cardX: number;
  cardY: number;
  cardWidth?: number;
  viewport: ViewportTransform;
  theme: CanvasTheme;
  onCopyPrompt?: (prompt: string) => void;
  onReversePrompt?: (image: GeneratedImage) => void;
  onRotate?: (cardId: string, image: GeneratedImage) => void;
  onUpscale?: (cardId: string, image: GeneratedImage) => void;
  onAngle?: (cardId: string, image: GeneratedImage) => void;
  onSplit?: (cardId: string, image: GeneratedImage) => void;
  onCrop?: (cardId: string, image: GeneratedImage) => void;
  onSetAsReference?: (image: GeneratedImage) => void;
  onSaveToGallery?: (image: GeneratedImage) => void;
  onDownload?: (image: GeneratedImage) => void;
  onViewOriginal?: (image: GeneratedImage) => void;
  onDelete?: (cardId: string) => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

export const CanvasNodeHoverToolbar: React.FC<CanvasNodeHoverToolbarProps> = ({
  cardId,
  image,
  cardX,
  cardY,
  cardWidth = 320,
  viewport,
  theme,
  onCopyPrompt,
  onReversePrompt,
  onRotate,
  onUpscale,
  onAngle,
  onSplit,
  onCrop,
  onSetAsReference,
  onSaveToGallery,
  onDownload,
  onViewOriginal,
  onDelete,
  onMouseEnter,
  onMouseLeave,
}) => {
  const { t } = useI18n();
  const isLight = theme === 'light';

  // 计算屏幕物理绝对像素坐标（跟随卡片在世界中的位置与视口缩放），并做视口边界钳制防御
  const rawLeft = viewport.x + (cardX + cardWidth / 2) * viewport.k;
  const rawTop = viewport.y + cardY * viewport.k - 12;
  const maxW = typeof window !== 'undefined' ? window.innerWidth : 1440;
  const left = Math.max(200, Math.min(maxW - 200, rawLeft));
  const top = Math.max(64, rawTop);

  const btnClass = `p-1.5 rounded-xl transition-all cursor-pointer flex items-center justify-center shrink-0 ${
    isLight
      ? 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 active:bg-slate-200'
      : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 active:bg-zinc-700'
  }`;

  const hasPrompt = Boolean(image.prompt && image.prompt.trim());

  return (
    <div
      data-canvas-no-pan="true"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className={`absolute z-30 flex items-center gap-0.5 p-1 rounded-2xl border shadow-2xl backdrop-blur-xl transition-all -translate-x-1/2 -translate-y-full select-none pointer-events-auto ${
        isLight
          ? 'bg-white/95 border-slate-200/90 text-slate-800 shadow-slate-300/60'
          : 'bg-zinc-900/95 border-zinc-800/90 text-zinc-100 shadow-black/80'
      }`}
      style={{
        left: `${left}px`,
        top: `${top}px`,
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/* 1. 复制提示词 */}
      {onCopyPrompt && (
        <button
          type="button"
          onClick={() => hasPrompt && onCopyPrompt(image.prompt)}
          disabled={!hasPrompt}
          className={`${btnClass} ${!hasPrompt ? 'opacity-35 cursor-not-allowed' : ''}`}
          title={hasPrompt ? t('workbench.copyPrompt') : t('workbench.noPrompt')}
        >
          <Copy className="w-3.5 h-3.5" />
        </button>
      )}

      {/* 2. 视觉反推 */}
      {onReversePrompt && (
        <button
          type="button"
          onClick={() => onReversePrompt(image)}
          className={btnClass}
          title={t('workbench.reversePrompt')}
        >
          <FileText className="w-3.5 h-3.5 text-violet-500" />
        </button>
      )}

      {/* 3. 设为参考图 */}
      {onSetAsReference && (
        <button
          type="button"
          onClick={() => onSetAsReference(image)}
          className={btnClass}
          title={t('workbench.setAsReference')}
        >
          <Sparkles className="w-3.5 h-3.5 text-amber-500" />
        </button>
      )}

      <div className="h-3.5 w-px bg-current opacity-15 mx-0.5 shrink-0" />

      {/* 4. 相机视角转换 (Angle) */}
      {onAngle && (
        <button
          type="button"
          onClick={() => onAngle(cardId, image)}
          className={btnClass}
          title={t('workbench.cameraAngle')}
        >
          <Camera className="w-3.5 h-3.5 text-blue-500" />
        </button>
      )}

      {/* 5. 九宫格切图 (Split) */}
      {onSplit && (
        <button
          type="button"
          onClick={() => onSplit(cardId, image)}
          className={btnClass}
          title={t('workbench.splitGrid')}
        >
          <Grid2x2 className="w-3.5 h-3.5 text-emerald-500" />
        </button>
      )}

      {/* 6. 自由裁切 (Crop) */}
      {onCrop && (
        <button
          type="button"
          onClick={() => onCrop(cardId, image)}
          className={btnClass}
          title={t('workbench.crop')}
        >
          <Scissors className="w-3.5 h-3.5" />
        </button>
      )}

      {/* 7. 顺时针旋转 90° */}
      {onRotate && (
        <button
          type="button"
          onClick={() => onRotate(cardId, image)}
          className={btnClass}
          title={t('workbench.rotate90')}
        >
          <RotateCw className="w-3.5 h-3.5" />
        </button>
      )}

      {/* 8. 2x 高清插值放大 */}
      {onUpscale && (
        <button
          type="button"
          onClick={() => onUpscale(cardId, image)}
          className={btnClass}
          title={t('workbench.upscale2x')}
        >
          <ZoomIn className="w-3.5 h-3.5" />
        </button>
      )}

      <div className="h-3.5 w-px bg-current opacity-15 mx-0.5 shrink-0" />

      {/* 9. 查看原图 */}
      {onViewOriginal && (
        <button
          type="button"
          onClick={() => onViewOriginal(image)}
          className={btnClass}
          title={t('workbench.viewOriginal')}
        >
          <Maximize2 className="w-3.5 h-3.5" />
        </button>
      )}

      {/* 10. 存入图库 */}
      {onSaveToGallery && (
        <button
          type="button"
          onClick={() => onSaveToGallery(image)}
          className={`${btnClass} ${image.savedToGallery ? 'text-violet-500' : ''}`}
          title={image.savedToGallery ? t('workbench.savedToGallery') : t('workbench.saveToGallery')}
        >
          <BookmarkPlus className="w-3.5 h-3.5" />
        </button>
      )}

      {/* 11. 下载原图 */}
      {onDownload && (
        <button
          type="button"
          onClick={() => onDownload(image)}
          className={btnClass}
          title={t('common.download')}
        >
          <Download className="w-3.5 h-3.5" />
        </button>
      )}

      {/* 12. 从台面删除 */}
      {onDelete && (
        <button
          type="button"
          onClick={() => onDelete(cardId)}
          className={`p-1.5 rounded-xl transition-all cursor-pointer flex items-center justify-center shrink-0 ${
            isLight
              ? 'text-slate-400 hover:text-red-600 hover:bg-red-50'
              : 'text-zinc-500 hover:text-red-400 hover:bg-red-950/40'
          }`}
          title={t('common.delete')}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
};

import React, { useEffect } from 'react';
import {
  Copy,
  Trash2,
  Image as ImageIcon,
  StickyNote,
  Focus,
  Eraser,
  Download,
  ImagePlus,
} from 'lucide-react';
import { useI18n } from '@/i18n';
import type { CanvasTheme } from '../types';

export interface ContextMenuTarget {
  type: 'canvas' | 'node';
  nodeId?: string;
  x: number;
  y: number;
  worldX: number;
  worldY: number;
}

export interface CanvasContextMenuProps {
  target: ContextMenuTarget;
  theme: CanvasTheme;
  hasImageContent?: boolean;
  onClose: () => void;
  onDuplicate?: (nodeId: string) => void;
  onDelete?: (nodeId: string) => void;
  onSetAsReference?: (nodeId: string) => void;
  onDownload?: (nodeId: string) => void;
  onAddImageAt?: (wx: number, wy: number) => void;
  onAddNoteAt?: (wx: number, wy: number) => void;
  onResetView?: () => void;
  onClearStage?: () => void;
}

export const CanvasContextMenu: React.FC<CanvasContextMenuProps> = ({
  target,
  theme,
  hasImageContent = false,
  onClose,
  onDuplicate,
  onDelete,
  onSetAsReference,
  onDownload,
  onAddImageAt,
  onAddNoteAt,
  onResetView,
  onClearStage,
}) => {
  const { t } = useI18n();
  const isLight = theme === 'light';

  useEffect(() => {
    const handlePointerDown = () => {
      onClose();
    };
    window.addEventListener('pointerdown', handlePointerDown);
    return () => window.removeEventListener('pointerdown', handlePointerDown);
  }, [onClose]);

  const menuStyle = isLight
    ? 'bg-white/95 border-slate-200 text-slate-800 shadow-slate-300/80'
    : 'bg-[#18181b]/95 border-zinc-800 text-zinc-100 shadow-black/90';

  const hoverStyle = isLight ? 'hover:bg-slate-100' : 'hover:bg-zinc-800';

  return (
    <div
      data-canvas-no-pan="true"
      className={`fixed z-[99] min-w-[170px] overflow-hidden rounded-2xl border p-1.5 shadow-2xl backdrop-blur-2xl animate-in fade-in zoom-in-95 text-xs select-none ${menuStyle}`}
      style={{
        left: `${Math.min(target.x, typeof window !== 'undefined' ? window.innerWidth - 180 : target.x)}px`,
        top: `${Math.min(target.y, typeof window !== 'undefined' ? window.innerHeight - 220 : target.y)}px`,
      }}
      onContextMenu={(e) => e.preventDefault()}
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {target.type === 'node' && target.nodeId ? (
        <>
          {onDuplicate && (
            <button
              type="button"
              onClick={() => {
                onDuplicate(target.nodeId!);
                onClose();
              }}
              className={`flex w-full items-center gap-2 px-2.5 py-2 rounded-xl text-left transition-colors cursor-pointer ${hoverStyle}`}
            >
              <Copy className="w-3.5 h-3.5 opacity-70" />
              <span>{t('workbench.duplicateNode')}</span>
            </button>
          )}

          {hasImageContent && onSetAsReference && (
            <button
              type="button"
              onClick={() => {
                onSetAsReference(target.nodeId!);
                onClose();
              }}
              className={`flex w-full items-center gap-2 px-2.5 py-2 rounded-xl text-left transition-colors cursor-pointer ${hoverStyle}`}
            >
              <ImagePlus className="w-3.5 h-3.5 opacity-70 text-amber-500" />
              <span>{t('workbench.setAsReference')}</span>
            </button>
          )}

          {hasImageContent && onDownload && (
            <button
              type="button"
              onClick={() => {
                onDownload(target.nodeId!);
                onClose();
              }}
              className={`flex w-full items-center gap-2 px-2.5 py-2 rounded-xl text-left transition-colors cursor-pointer ${hoverStyle}`}
            >
              <Download className="w-3.5 h-3.5 opacity-70" />
              <span>{t('workbench.downloadImage')}</span>
            </button>
          )}

          <div className={`my-1 border-t ${isLight ? 'border-slate-100' : 'border-zinc-800'}`} />

          {onDelete && (
            <button
              type="button"
              onClick={() => {
                onDelete(target.nodeId!);
                onClose();
              }}
              className="flex w-full items-center gap-2 px-2.5 py-2 rounded-xl text-left transition-colors cursor-pointer text-red-500 hover:bg-red-500/10"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>{t('workbench.nodeDelete')}</span>
            </button>
          )}
        </>
      ) : (
        <>
          {onAddImageAt && (
            <button
              type="button"
              onClick={() => {
                onAddImageAt(target.worldX, target.worldY);
                onClose();
              }}
              className={`flex w-full items-center gap-2 px-2.5 py-2 rounded-xl text-left transition-colors cursor-pointer ${hoverStyle}`}
            >
              <ImageIcon className="w-3.5 h-3.5 text-[#2f80ff]" />
              <span>{t('workbench.newImageNode')}</span>
            </button>
          )}

          {onAddNoteAt && (
            <button
              type="button"
              onClick={() => {
                onAddNoteAt(target.worldX, target.worldY);
                onClose();
              }}
              className={`flex w-full items-center gap-2 px-2.5 py-2 rounded-xl text-left transition-colors cursor-pointer ${hoverStyle}`}
            >
              <StickyNote className="w-3.5 h-3.5 text-amber-500" />
              <span>{t('workbench.newNoteNode')}</span>
            </button>
          )}

          <div className={`my-1 border-t ${isLight ? 'border-slate-100' : 'border-zinc-800'}`} />

          {onResetView && (
            <button
              type="button"
              onClick={() => {
                onResetView();
                onClose();
              }}
              className={`flex w-full items-center gap-2 px-2.5 py-2 rounded-xl text-left transition-colors cursor-pointer ${hoverStyle}`}
            >
              <Focus className="w-3.5 h-3.5 opacity-70" />
              <span>{t('workbench.resetZoom')}</span>
            </button>
          )}

          {onClearStage && (
            <button
              type="button"
              onClick={() => {
                onClearStage();
                onClose();
              }}
              className="flex w-full items-center gap-2 px-2.5 py-2 rounded-xl text-left transition-colors cursor-pointer text-red-500 hover:bg-red-500/10"
            >
              <Eraser className="w-3.5 h-3.5" />
              <span>{t('workbench.clearStage')}</span>
            </button>
          )}
        </>
      )}
    </div>
  );
};

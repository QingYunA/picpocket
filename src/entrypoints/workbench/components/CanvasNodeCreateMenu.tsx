import React, { useEffect, useRef } from 'react';
import { Sparkles, StickyNote, FolderPlus, X } from 'lucide-react';
import { useI18n } from '@/i18n';
import type { CanvasTheme } from '../types';
import { clampScreenPosition, getViewportDimensions } from '../utils/viewportUtils';

export interface CanvasNodeCreateMenuProps {
  screenPosition: { x: number; y: number };
  worldPosition: { x: number; y: number };
  theme: CanvasTheme;
  onCreateGenerator: (worldX: number, worldY: number) => void;
  onCreateNote: (worldX: number, worldY: number) => void;
  onOpenGallery: () => void;
  onClose: () => void;
}

export const CanvasNodeCreateMenu: React.FC<CanvasNodeCreateMenuProps> = ({
  screenPosition,
  worldPosition,
  theme,
  onCreateGenerator,
  onCreateNote,
  onOpenGallery,
  onClose,
}) => {
  const { t } = useI18n();
  const isLight = theme === 'light';
  const menuRef = useRef<HTMLDivElement>(null);

  // 视口边界钳制防御（菜单宽 280px，高约 230px）
  const menuWidth = 280;
  const menuHeight = 230;
  const { width: maxW, height: maxH } = getViewportDimensions();
  const { x: left, y: top } = clampScreenPosition(
    screenPosition.x - 20,
    screenPosition.y - 20,
    maxW,
    maxH,
    menuWidth,
    menuHeight
  );

  // 点击外部或 Esc 键关闭
  useEffect(() => {
    const handlePointerDown = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  const itemClass = `w-full flex items-start gap-3 p-2.5 rounded-xl text-left transition-all cursor-pointer group ${
    isLight
      ? 'hover:bg-slate-100 text-slate-700 hover:text-slate-950'
      : 'hover:bg-zinc-800/80 text-zinc-300 hover:text-zinc-50'
  }`;

  return (
    <div
      ref={menuRef}
      data-canvas-no-pan="true"
      onPointerDown={(e) => e.stopPropagation()}
      className={`fixed z-50 w-[280px] p-2 rounded-2xl border shadow-2xl backdrop-blur-2xl transition-all animate-in fade-in zoom-in-95 duration-150 select-none pointer-events-auto ${
        isLight
          ? 'bg-white/95 border-slate-200/90 text-slate-800 shadow-slate-300/60'
          : 'bg-zinc-900/95 border-zinc-800/90 text-zinc-100 shadow-black/80'
      }`}
      style={{
        left: `${left}px`,
        top: `${top}px`,
      }}
    >
      {/* 顶部标题与关闭 */}
      <div className="flex items-center justify-between px-2 py-1 mb-1 border-b border-inherit/40">
        <span className="text-[11px] font-semibold tracking-wider uppercase opacity-50">
          {t('workbench.createMenuTitle')}
        </span>
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded-lg opacity-40 hover:opacity-100 transition-opacity cursor-pointer"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* 选项列表 */}
      <div className="space-y-1">
        {/* 1. AI 生图卡片 */}
        <button
          type="button"
          onClick={() => {
            onCreateGenerator(worldPosition.x, worldPosition.y);
            onClose();
          }}
          className={itemClass}
        >
          <div className="flex items-center justify-center w-8 h-8 rounded-xl bg-violet-500/15 text-violet-600 shrink-0 mt-0.5 group-hover:scale-105 transition-transform">
            <Sparkles className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold leading-tight">{t('workbench.createMenuGenerator')}</div>
            <div className="text-[11px] opacity-55 leading-normal mt-0.5">
              {t('workbench.createMenuGeneratorDesc')}
            </div>
          </div>
        </button>

        {/* 2. 灵感便签 */}
        <button
          type="button"
          onClick={() => {
            onCreateNote(worldPosition.x, worldPosition.y);
            onClose();
          }}
          className={itemClass}
        >
          <div className="flex items-center justify-center w-8 h-8 rounded-xl bg-amber-500/15 text-amber-500 shrink-0 mt-0.5 group-hover:scale-105 transition-transform">
            <StickyNote className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold leading-tight">{t('workbench.createMenuNote')}</div>
            <div className="text-[11px] opacity-55 leading-normal mt-0.5">
              {t('workbench.createMenuNoteDesc')}
            </div>
          </div>
        </button>

        {/* 3. 从素材库挑选 */}
        <button
          type="button"
          onClick={() => {
            onOpenGallery();
            onClose();
          }}
          className={itemClass}
        >
          <div className="flex items-center justify-center w-8 h-8 rounded-xl bg-blue-500/15 text-blue-500 shrink-0 mt-0.5 group-hover:scale-105 transition-transform">
            <FolderPlus className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold leading-tight">{t('workbench.createMenuGallery')}</div>
            <div className="text-[11px] opacity-55 leading-normal mt-0.5">
              {t('workbench.createMenuGalleryDesc')}
            </div>
          </div>
        </button>
      </div>
    </div>
  );
};

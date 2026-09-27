import React, { useRef, useState, useEffect } from 'react';
import {
  MousePointer2,
  Hand,
  Undo2,
  Redo2,
  Image as ImageIcon,
  StickyNote,
  Upload,
  Palette,
  Trash2,
  Eraser,
  Sun,
  Moon,
  CircleDot,
  Grid2x2,
  Square,
} from 'lucide-react';
import { useI18n } from '@/i18n';
import type { CanvasTheme, CanvasToolMode, CanvasBackgroundMode } from '../types';

export interface CanvasToolbarProps {
  canvasTool: CanvasToolMode;
  theme: CanvasTheme;
  backgroundMode: CanvasBackgroundMode;
  selectedCount: number;
  canUndo?: boolean;
  canRedo?: boolean;
  onCanvasToolChange: (tool: CanvasToolMode) => void;
  onThemeChange: (theme: CanvasTheme) => void;
  onBackgroundModeChange: (mode: CanvasBackgroundMode) => void;
  onAddImage: () => void;
  onAddNote: () => void;
  onUpload: () => void;
  onDeleteSelected: () => void;
  onClearStage: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
}

export const CanvasToolbar: React.FC<CanvasToolbarProps> = ({
  canvasTool,
  theme,
  backgroundMode,
  selectedCount,
  canUndo = false,
  canRedo = false,
  onCanvasToolChange,
  onThemeChange,
  onBackgroundModeChange,
  onAddImage,
  onAddNote,
  onUpload,
  onDeleteSelected,
  onClearStage,
  onUndo,
  onRedo,
}) => {
  const { t } = useI18n();
  const isLight = theme === 'light';
  const rootRef = useRef<HTMLDivElement>(null);
  const [appearanceOpen, setAppearanceOpen] = useState(false);

  // 点击外部关闭外观设置气泡
  useEffect(() => {
    if (!appearanceOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setAppearanceOpen(false);
      }
    };
    document.addEventListener('pointerdown', handlePointerDown, true);
    return () => document.removeEventListener('pointerdown', handlePointerDown, true);
  }, [appearanceOpen]);

  const dockStyle = isLight
    ? 'bg-white/90 border-slate-200 text-slate-700 shadow-slate-300/60'
    : 'bg-[#18181b]/90 border-zinc-800 text-zinc-300 shadow-black/80';

  const itemActiveStyle = 'bg-[#2f80ff] text-white';
  const itemHoverStyle = isLight ? 'hover:bg-slate-100 hover:text-slate-900' : 'hover:bg-zinc-800 hover:text-zinc-100';

  return (
    <div
      ref={rootRef}
      className="pointer-events-none absolute bottom-5 left-0 right-0 z-50 flex justify-center px-4"
    >
      <div
        className={`pointer-events-auto flex h-14 max-w-full items-center gap-1 overflow-x-auto rounded-2xl border px-2 shadow-2xl backdrop-blur-xl ${dockStyle}`}
      >
        {/* 选择工具 V */}
        <button
          type="button"
          onClick={() => onCanvasToolChange('select')}
          className={`flex h-10 w-10 items-center justify-center rounded-xl transition-all cursor-pointer ${
            canvasTool === 'select' ? itemActiveStyle : itemHoverStyle
          }`}
          title={t('workbench.toolSelect')}
        >
          <MousePointer2 className="w-4 h-4" />
        </button>

        {/* 抓手工具 H */}
        <button
          type="button"
          onClick={() => onCanvasToolChange('pan')}
          className={`flex h-10 w-10 items-center justify-center rounded-xl transition-all cursor-pointer ${
            canvasTool === 'pan' ? itemActiveStyle : itemHoverStyle
          }`}
          title={t('workbench.toolPan')}
        >
          <Hand className="w-4 h-4" />
        </button>

        <div className={`mx-1 h-5 w-[1px] ${isLight ? 'bg-slate-200' : 'bg-zinc-800'}`} />

        {/* 撤销 / 重做 */}
        <button
          type="button"
          disabled={!canUndo}
          onClick={onUndo}
          className={`flex h-10 w-10 items-center justify-center rounded-xl transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed ${itemHoverStyle}`}
          title={t('workbench.undo')}
        >
          <Undo2 className="w-4 h-4" />
        </button>

        <button
          type="button"
          disabled={!canRedo}
          onClick={onRedo}
          className={`flex h-10 w-10 items-center justify-center rounded-xl transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed ${itemHoverStyle}`}
          title={t('workbench.redo')}
        >
          <Redo2 className="w-4 h-4" />
        </button>

        <div className={`mx-1 h-5 w-[1px] ${isLight ? 'bg-slate-200' : 'bg-zinc-800'}`} />

        {/* 新增生图节点 */}
        <button
          type="button"
          onClick={onAddImage}
          className={`flex h-10 items-center gap-1.5 px-3 rounded-xl transition-all cursor-pointer text-xs font-medium ${itemHoverStyle}`}
          title={t('workbench.newImageNode')}
        >
          <ImageIcon className="w-4 h-4 text-[#2f80ff]" />
          <span>{t('workbench.imageNode')}</span>
        </button>

        {/* 新增灵感便签 */}
        <button
          type="button"
          onClick={onAddNote}
          className={`flex h-10 items-center gap-1.5 px-3 rounded-xl transition-all cursor-pointer text-xs font-medium ${itemHoverStyle}`}
          title={t('workbench.addTextNoteTooltip')}
        >
          <StickyNote className="w-4 h-4 text-amber-500" />
          <span>{t('workbench.addTextNote')}</span>
        </button>

        {/* 上传图片 */}
        <button
          type="button"
          onClick={onUpload}
          className={`flex h-10 items-center gap-1.5 px-3 rounded-xl transition-all cursor-pointer text-xs font-medium ${itemHoverStyle}`}
          title={t('workbench.uploadImage')}
        >
          <Upload className="w-4 h-4" />
          <span>{t('workbench.uploadImage')}</span>
        </button>

        <div className={`mx-1 h-5 w-[1px] ${isLight ? 'bg-slate-200' : 'bg-zinc-800'}`} />

        {/* 外观设置 */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setAppearanceOpen((prev) => !prev)}
            className={`flex h-10 w-10 items-center justify-center rounded-xl transition-all cursor-pointer ${
              appearanceOpen ? itemActiveStyle : itemHoverStyle
            }`}
            title={t('workbench.appearance')}
          >
            <Palette className="w-4 h-4" />
          </button>

          {appearanceOpen && (
            <div
              className={`absolute bottom-full mb-3 left-1/2 -translate-x-1/2 w-60 rounded-2xl border p-3 shadow-2xl backdrop-blur-2xl animate-in fade-in zoom-in-95 z-50 text-xs ${
                isLight ? 'bg-white/95 border-slate-200 text-slate-800' : 'bg-[#18181b]/95 border-zinc-800 text-zinc-100'
              }`}
            >
              <div className="font-semibold mb-2 opacity-70">{t('workbench.canvasAppearance')}</div>
              <div className="text-[11px] opacity-50 mb-1">{t('workbench.themeMode')}</div>
              <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-black/5 dark:bg-white/5 mb-3">
                <button
                  type="button"
                  onClick={() => onThemeChange('light')}
                  className={`flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer ${
                    isLight ? 'bg-white shadow text-slate-900' : 'opacity-60 hover:opacity-100'
                  }`}
                >
                  <Sun className="w-3.5 h-3.5" />
                  <span>{t('workbench.themeLight')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => onThemeChange('dark')}
                  className={`flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer ${
                    !isLight ? 'bg-zinc-800 shadow text-white' : 'opacity-60 hover:opacity-100'
                  }`}
                >
                  <Moon className="w-3.5 h-3.5" />
                  <span>{t('workbench.themeDark')}</span>
                </button>
              </div>

              <div className="text-[11px] opacity-50 mb-1">{t('workbench.gridStyle')}</div>
              <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-black/5 dark:bg-white/5">
                <button
                  type="button"
                  onClick={() => onBackgroundModeChange('lines')}
                  className={`flex items-center justify-center gap-1 py-1.5 rounded-lg text-[11px] transition cursor-pointer ${
                    backgroundMode === 'lines' ? 'bg-[#2f80ff] text-white font-medium shadow' : 'opacity-70 hover:opacity-100'
                  }`}
                >
                  <Grid2x2 className="w-3 h-3" />
                  <span>{t('workbench.gridLines')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => onBackgroundModeChange('dots')}
                  className={`flex items-center justify-center gap-1 py-1.5 rounded-lg text-[11px] transition cursor-pointer ${
                    backgroundMode === 'dots' ? 'bg-[#2f80ff] text-white font-medium shadow' : 'opacity-70 hover:opacity-100'
                  }`}
                >
                  <CircleDot className="w-3 h-3" />
                  <span>{t('workbench.gridDots')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => onBackgroundModeChange('blank')}
                  className={`flex items-center justify-center gap-1 py-1.5 rounded-lg text-[11px] transition cursor-pointer ${
                    backgroundMode === 'blank' ? 'bg-[#2f80ff] text-white font-medium shadow' : 'opacity-70 hover:opacity-100'
                  }`}
                >
                  <Square className="w-3 h-3" />
                  <span>{t('workbench.gridBlank')}</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 选区批量删除按钮 */}
        {selectedCount > 0 && (
          <>
            <div className={`mx-1 h-5 w-[1px] ${isLight ? 'bg-slate-200' : 'bg-zinc-800'}`} />
            <button
              type="button"
              onClick={onDeleteSelected}
              className="flex h-10 items-center gap-1.5 px-3 rounded-xl transition-all cursor-pointer text-xs font-medium bg-red-500/10 hover:bg-red-500 hover:text-white text-red-500"
              title={t('workbench.deleteSelected')}
            >
              <Trash2 className="w-4 h-4" />
              <span>{t('workbench.deleteCount', { count: selectedCount })}</span>
            </button>
          </>
        )}

        <div className={`mx-1 h-5 w-[1px] ${isLight ? 'bg-slate-200' : 'bg-zinc-800'}`} />

        {/* 清空台面 */}
        <button
          type="button"
          onClick={onClearStage}
          className={`flex h-10 w-10 items-center justify-center rounded-xl transition-all cursor-pointer hover:text-red-500 ${itemHoverStyle}`}
          title={t('workbench.clearStage')}
        >
          <Eraser className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

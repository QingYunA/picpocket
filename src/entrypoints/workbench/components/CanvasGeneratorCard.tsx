import React, { useRef, useState } from 'react';
import {
  Sparkles,
  Image as ImageIcon,
  X,
  RefreshCw,
  AlertCircle,
  GripHorizontal,
  Upload,
  Minus,
  Maximize2,
} from 'lucide-react';
import type { ImageAspectRatio } from '@/types';
import { useI18n } from '@/i18n';
import { readFileAsDataUrl } from '@/utils/file';
import { clampScreenPosition, getResponsiveCardWidth, getViewportDimensions } from '../utils/viewportUtils';
import { CONSOLE_HEIGHT_COLLAPSED, CONSOLE_HEIGHT_EXPANDED } from '../types';
import type { CanvasTheme } from '../types';
import { formatSafeErrorMessage } from '@/utils/errorMessage';
import { UpgradeCreditsButton } from '@/components/UpgradeCreditsButton';

interface CanvasGeneratorCardProps {
  theme: CanvasTheme;
  x: number;
  y: number;
  scale?: number;
  onPositionChange: (x: number, y: number) => void;
  prompt: string;
  onPromptChange: (prompt: string) => void;
  model: string;
  onModelChange: (model: string) => void;
  aspectRatio: ImageAspectRatio;
  onAspectRatioChange: (ratio: ImageAspectRatio) => void;
  count: number;
  onCountChange: (count: number) => void;
  referenceImages: string[];
  onReferenceImagesChange: (images: string[]) => void;
  isGenerating: boolean;
  elapsedSec: number;
  onGenerate: () => void;
  onAbort: () => void;
  errorMsg: string | null;
  feedbackMsg: string | null;
  onOpenSettings: () => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  transparent?: boolean;
  onTransparentChange?: (transparent: boolean) => void;
}

const RATIOS: { label: string; value: ImageAspectRatio }[] = [
  { label: '1:1', value: '1:1' },
  { label: '16:9', value: '16:9' },
  { label: '9:16', value: '9:16' },
  { label: '4:3', value: '4:3' },
  { label: '3:4', value: '3:4' },
];

export const CanvasGeneratorCard: React.FC<CanvasGeneratorCardProps> = ({
  theme,
  x,
  y,
  scale = 1.0,
  onPositionChange,
  prompt,
  onPromptChange,
  model,
  onModelChange,
  aspectRatio,
  onAspectRatioChange,
  count,
  onCountChange,
  referenceImages,
  onReferenceImagesChange,
  isGenerating,
  elapsedSec,
  onGenerate,
  onAbort,
  errorMsg,
  feedbackMsg,
  onOpenSettings,
  isCollapsed: externalIsCollapsed,
  onToggleCollapse: externalOnToggleCollapse,
  transparent = false,
  onTransparentChange,
}) => {
  const { t } = useI18n();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // 折叠状态（支持外部受控或内置状态）
  const [internalIsCollapsed, setInternalIsCollapsed] = useState(false);
  const isCollapsed = externalIsCollapsed !== undefined ? externalIsCollapsed : internalIsCollapsed;
  const toggleCollapse = externalOnToggleCollapse || (() => setInternalIsCollapsed((prev) => !prev));

  // 拖拽卡片头部移动位置 (视口层安全钳制，绝不被拖出屏幕外裁切)
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ mouseX: 0, mouseY: 0, initialX: 0, initialY: 0 });

  const isLight = theme === 'light';

  const handleHeaderPointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);

    setIsDragging(true);
    dragStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      initialX: x,
      initialY: y,
    };

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const dx = (moveEvent.clientX - dragStartRef.current.mouseX) / scale;
      const dy = (moveEvent.clientY - dragStartRef.current.mouseY) / scale;

      const { width: w, height: h } = getViewportDimensions();
      const cardW = getResponsiveCardWidth(w, isCollapsed);
      const cardH = isCollapsed ? CONSOLE_HEIGHT_COLLAPSED : CONSOLE_HEIGHT_EXPANDED;

      const clamped = clampScreenPosition(
        dragStartRef.current.initialX + dx,
        dragStartRef.current.initialY + dy,
        w,
        h,
        cardW,
        cardH
      );

      onPositionChange(clamped.x, clamped.y);
    };

    const handlePointerUp = () => {
      setIsDragging(false);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const files = Array.from(e.target.files).filter((f) => f.type.startsWith('image/'));
      if (files.length > 0) {
        const dataUrls = await Promise.all(files.map((f) => readFileAsDataUrl(f)));
        onReferenceImagesChange([...referenceImages, ...dataUrls]);
      }
    }
  };

  const handleRemoveRef = (idx: number) => {
    onReferenceImagesChange(referenceImages.filter((_, i) => i !== idx));
  };

  // 支持向参考图槽位直接拖入图片
  const handleRefDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const customItem = e.dataTransfer.getData('application/x-picpocket-item');
    if (customItem) {
      try {
        const parsed = JSON.parse(customItem);
        if (parsed.url) {
          onReferenceImagesChange([...referenceImages, parsed.url]);
          return;
        }
      } catch {}
    }
    const textUrl = e.dataTransfer.getData('text/plain');
    if (textUrl && (textUrl.startsWith('data:image/') || textUrl.startsWith('http'))) {
      onReferenceImagesChange([...referenceImages, textUrl]);
      return;
    }
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      if (file && file.type.startsWith('image/')) {
        readFileAsDataUrl(file).then((url) => {
          onReferenceImagesChange([...referenceImages, url]);
        });
      }
    }
  };

  const currentCardWidth = getResponsiveCardWidth(
    typeof window !== 'undefined' ? window.innerWidth : 1440,
    isCollapsed
  );

  if (isCollapsed) {
    return (
      <div
        data-canvas-card="generator"
        className={`absolute max-w-[calc(100vw-24px)] rounded-2xl border backdrop-blur-xl flex items-center gap-3 px-3.5 py-2 select-none shadow-xl transition-all ${
          isLight
            ? 'border-slate-200/90 bg-white/95 text-slate-800 shadow-slate-200/50 hover:border-violet-300'
            : 'border-zinc-800/90 bg-zinc-900/95 text-zinc-100 shadow-black/60 hover:border-violet-500/50'
        }`}
        style={{
          transform: `translate(${x}px, ${y}px)`,
          width: `${currentCardWidth}px`,
          zIndex: 35,
        }}
      >
        <div
          onPointerDown={handleHeaderPointerDown}
          className="flex items-center gap-2 cursor-grab active:cursor-grabbing py-0.5"
        >
          <GripHorizontal className="w-3.5 h-3.5 opacity-40" />
          <div className="flex items-center gap-1.5 font-semibold text-xs tracking-tight">
            <Sparkles className="w-3.5 h-3.5 text-violet-500" />
            <span>{t('workbench.generatorTitle')}</span>
          </div>
          <span className="text-[10px] opacity-60 font-mono px-1.5 py-0.5 rounded-md bg-black/5 dark:bg-white/5">
            {model}
          </span>
        </div>

        <div className="h-3 w-px bg-current opacity-15" />

        <button
          onClick={toggleCollapse}
          className="flex items-center gap-1 text-xs font-medium text-violet-600 dark:text-violet-400 hover:opacity-80 transition-opacity cursor-pointer whitespace-nowrap"
          title={t('workbench.expandConsole')}
        >
          <Maximize2 className="w-3 h-3" />
          <span>{t('workbench.expandConsole')}</span>
        </button>
      </div>
    );
  }

  return (
    <div
      data-canvas-card="generator"
      className={`absolute max-w-[calc(100vw-24px)] max-h-[calc(100vh-80px)] rounded-2xl border backdrop-blur-xl flex flex-col select-auto transition-shadow overflow-hidden ${
        isLight
          ? 'border-slate-200 bg-white/95 text-slate-800 shadow-xl shadow-slate-200/50'
          : 'border-zinc-800/80 bg-zinc-900/95 text-zinc-100 shadow-2xl shadow-black/60'
      }`}
      style={{
        transform: `translate(${x}px, ${y}px)`,
        width: `${currentCardWidth}px`,
        zIndex: 30,
      }}
    >
      {/* 卡片拖拽顶栏 */}
      <div
        onPointerDown={handleHeaderPointerDown}
        className={`flex items-center justify-between px-4 py-2.5 border-b cursor-grab active:cursor-grabbing select-none rounded-t-2xl shrink-0 ${
          isLight
            ? 'border-slate-200/80 bg-slate-50/80 text-slate-700'
            : 'border-zinc-800/80 bg-zinc-900/60 text-zinc-200'
        }`}
      >
        <div className="flex items-center gap-2">
          <GripHorizontal className="w-4 h-4 opacity-50" />
          <div className="flex items-center gap-1.5 font-semibold text-sm">
            <Sparkles className="w-4 h-4 text-violet-500" />
            <span>{t('workbench.generatorTitle')}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] opacity-70 font-mono">
            {model}
          </span>
          <button
            onClick={toggleCollapse}
            className={`p-1 rounded-lg transition-colors cursor-pointer ${
              isLight ? 'hover:bg-slate-200/60 text-slate-500' : 'hover:bg-zinc-800 text-zinc-400'
            }`}
            title={t('workbench.collapseConsole')}
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 控制台主体内容 (支持低矮视口纵向滚动，确保生成按钮始终可触达) */}
      <div className="p-4 space-y-4 flex-1 overflow-y-auto" data-canvas-no-pan="true">
        {/* 提示词输入区 */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs opacity-70">
            <span>{t('workbench.prompt')}</span>
            <span className="text-[11px]">Cmd + Enter</span>
          </div>
          <div className="relative">
            <textarea
              value={prompt}
              onChange={(e) => onPromptChange(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                  e.preventDefault();
                  if (!isGenerating && prompt.trim()) {
                    onGenerate();
                  }
                }
              }}
              placeholder={t('workbench.promptPlaceholder')}
              rows={4}
              className={`w-full resize-y rounded-xl border px-3.5 py-2.5 text-xs leading-relaxed outline-none transition-colors ${
                isLight
                  ? 'border-slate-200 bg-slate-50/80 text-slate-800 placeholder:text-slate-400 focus:border-violet-500 focus:bg-white'
                  : 'border-zinc-800 bg-zinc-950/80 text-zinc-100 placeholder:text-zinc-500 focus:border-violet-500'
              }`}
            />
          </div>
        </div>

        {/* 参考图区域 */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs opacity-70">
            <span>{t('workbench.referenceImage')}</span>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1 text-[11px] text-violet-500 hover:underline transition-colors cursor-pointer"
            >
              <Upload className="w-3 h-3" />
              <span>{t('workbench.uploadRef')}</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={handleFileChange}
            />
          </div>

          <div
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'copy';
            }}
            onDrop={handleRefDrop}
          >
            {referenceImages.length > 0 ? (
              <div className="flex items-center gap-2 overflow-x-auto py-1">
                {referenceImages.map((url, idx) => (
                  <div
                    key={idx}
                    className="relative group shrink-0 w-16 h-16 rounded-lg overflow-hidden border border-black/10 dark:border-white/10 bg-black/5"
                  >
                    <img
                      src={url}
                      alt={`Ref ${idx + 1}`}
                      referrerPolicy="no-referrer"
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).style.opacity = '0.3';
                      }}
                      className="w-full h-full object-cover"
                    />
                    <button
                      onClick={() => handleRemoveRef(idx)}
                      className="absolute top-1 right-1 p-0.5 rounded-full bg-black/70 text-white hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 cursor-pointer"
                      title={t('workbench.clearRef')}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div
                onClick={() => fileInputRef.current?.click()}
                className={`flex items-center justify-center gap-2 py-3 rounded-xl border border-dashed text-xs cursor-pointer transition-colors ${
                  isLight
                    ? 'border-slate-300 bg-slate-50/60 text-slate-500 hover:border-violet-400 hover:text-violet-600'
                    : 'border-zinc-800 bg-zinc-950/40 text-zinc-400 hover:border-zinc-700 hover:text-zinc-300'
                }`}
              >
                <ImageIcon className="w-4 h-4" />
                <span>{t('workbench.uploadRef')}</span>
              </div>
            )}
          </div>
        </div>

        {/* 画幅比例与生成数量 */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <div className="text-xs opacity-70">{t('workbench.aspectRatio')}</div>
            <div
              className={`flex items-center gap-1 p-1 rounded-xl border ${
                isLight ? 'bg-slate-100 border-slate-200' : 'bg-zinc-950/80 border-zinc-800/80'
              }`}
            >
              {RATIOS.map((r) => (
                <button
                  key={r.value}
                  onClick={() => onAspectRatioChange(r.value)}
                  className={`flex-1 py-1 text-[11px] font-medium rounded-lg transition-all cursor-pointer ${
                    aspectRatio === r.value
                      ? 'bg-violet-600 text-white shadow-xs'
                      : isLight
                      ? 'text-slate-600 hover:text-slate-900 hover:bg-white'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs opacity-70">
              <span>{t('generator.count')}</span>
              <span className="font-mono text-[11px] font-semibold text-violet-500">
                {t('workbench.countPill', { count })}
              </span>
            </div>
            <div
              className={`flex items-center gap-1 p-1 rounded-xl border ${
                isLight ? 'bg-slate-100 border-slate-200' : 'bg-zinc-950/80 border-zinc-800/80'
              }`}
            >
              {[1, 2, 3, 4].map((num) => (
                <button
                  key={num}
                  type="button"
                  onClick={() => onCountChange(num)}
                  className={`flex-1 py-1 text-[11px] font-medium rounded-lg transition-all cursor-pointer ${
                    count === num
                      ? isLight
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'bg-zinc-800 text-white shadow-xs'
                      : isLight
                      ? 'text-slate-600 hover:text-slate-900'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {num}
                </button>
              ))}

              <div className="h-3 w-px bg-current opacity-15 mx-0.5" />

              {/* 步进器微调 1~10 */}
              <div className="flex items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => onCountChange(Math.max(1, count - 1))}
                  disabled={count <= 1}
                  className="w-5 h-5 flex items-center justify-center rounded-md font-bold text-xs opacity-60 hover:opacity-100 disabled:opacity-20 cursor-pointer"
                  title="-1"
                >
                  -
                </button>
                <button
                  type="button"
                  onClick={() => onCountChange(Math.min(10, count + 1))}
                  disabled={count >= 10}
                  className="w-5 h-5 flex items-center justify-center rounded-md font-bold text-xs opacity-60 hover:opacity-100 disabled:opacity-20 cursor-pointer"
                  title="+1"
                >
                  +
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* 透明背景 (免抠) 开关 */}
        {onTransparentChange && (
          <div className="flex items-center justify-between px-1 py-0.5">
            <div className="flex items-center gap-1.5 text-xs opacity-80">
              <span className="font-medium">{t('workbench.transparentBg')}</span>
              <span className="text-[10px] opacity-60">({t('workbench.transparentBgDesc')})</span>
            </div>
            <button
              type="button"
              onClick={() => onTransparentChange(!transparent)}
              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                transparent ? 'bg-violet-600' : isLight ? 'bg-slate-300' : 'bg-zinc-700'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                  transparent ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        )}

        {/* 错误或成功提示 */}
        {errorMsg && (
          <div className="flex items-start gap-2 rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800/50 p-2.5 text-xs text-red-600 dark:text-red-300 max-h-20 overflow-y-auto break-all">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-500" />
            <div className="flex-1 leading-relaxed line-clamp-3 select-text">
              {formatSafeErrorMessage(errorMsg)}
            </div>
            <UpgradeCreditsButton message={errorMsg} />
          </div>
        )}
        {feedbackMsg && (
          <div className="flex items-center gap-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800/50 p-2.5 text-xs text-emerald-700 dark:text-emerald-300">
            <Sparkles className="w-4 h-4 shrink-0 text-emerald-500" />
            <div className="flex-1">{feedbackMsg}</div>
          </div>
        )}

        {/* 生成操作按钮 */}
        <div className="pt-1">
          {isGenerating ? (
            <div className="flex items-center gap-2">
              <button
                disabled
                className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-violet-600/50 px-4 py-2.5 text-xs font-semibold text-white cursor-not-allowed"
              >
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>
                  {t('workbench.generating')} ({elapsedSec}s)
                </span>
              </button>
              <button
                onClick={onAbort}
                className={`px-3 py-2.5 rounded-xl border text-xs font-medium transition-colors cursor-pointer ${
                  isLight
                    ? 'border-slate-300 bg-white hover:bg-slate-50 text-slate-700'
                    : 'border-zinc-700 bg-zinc-800 hover:bg-zinc-700 text-zinc-300'
                }`}
              >
                {t('common.cancel')}
              </button>
            </div>
          ) : (
            <button
              onClick={onGenerate}
              disabled={!prompt.trim()}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-violet-600 hover:bg-violet-700 active:bg-violet-800 disabled:opacity-40 disabled:pointer-events-none px-4 py-2.5 text-xs font-semibold text-white shadow-md shadow-violet-500/20 transition-all cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>{t('workbench.generateBtn')}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

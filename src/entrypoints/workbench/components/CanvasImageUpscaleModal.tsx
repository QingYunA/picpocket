import React, { useEffect, useMemo, useState } from 'react';
import { ImagePlus, X, Sparkles, AlertCircle } from 'lucide-react';
import { useI18n } from '@/i18n';
import type { CanvasTheme } from '../types';
import {
  MAX_UPSCALE_LONG_EDGE,
  resolveUpscaleSize,
  canUpscaleImage,
  loadImage,
  type ImageUpscaleAlgorithm,
} from '../utils/canvasImageUtils';

export interface CanvasImageUpscaleModalProps {
  open: boolean;
  dataUrl: string;
  theme: CanvasTheme;
  onClose: () => void;
  onConfirm: (targetLongEdge: number, algorithm: ImageUpscaleAlgorithm) => void;
}

const TARGET_OPTIONS = [
  { label: '1K', value: 1024 },
  { label: '2K', value: 2048 },
  { label: '4K', value: MAX_UPSCALE_LONG_EDGE },
];

export const CanvasImageUpscaleModal: React.FC<CanvasImageUpscaleModalProps> = ({
  open,
  dataUrl,
  theme,
  onClose,
  onConfirm,
}) => {
  const { t } = useI18n();
  const isLight = theme === 'light';

  const [imageMeta, setImageMeta] = useState<{ width: number; height: number } | null>(null);
  const [targetLongEdge, setTargetLongEdge] = useState<number>(2048);
  const [algorithm, setAlgorithm] = useState<ImageUpscaleAlgorithm>('high');

  // 读取图片尺寸 (复用带 referrerPolicy 守卫的 loadImage)
  useEffect(() => {
    if (!open || !dataUrl) {
      setImageMeta(null);
      return;
    }

    let isMounted = true;
    loadImage(dataUrl)
      .then((img) => {
        if (isMounted) {
          setImageMeta({ width: img.naturalWidth || img.width, height: img.naturalHeight || img.height });
        }
      })
      .catch((err) => {
        console.warn('Failed to load image for upscale meta:', err);
      });

    return () => {
      isMounted = false;
    };
  }, [open, dataUrl]);

  const sourceLongEdge = imageMeta ? Math.max(imageMeta.width, imageMeta.height) : 0;

  // 根据源图尺寸自动适配推荐目标档位
  useEffect(() => {
    if (!imageMeta) return;
    const nextTarget =
      TARGET_OPTIONS.find((opt) => sourceLongEdge < opt.value)?.value || MAX_UPSCALE_LONG_EDGE;
    setTargetLongEdge(nextTarget);
  }, [imageMeta, sourceLongEdge]);

  // 计算输出预测尺寸
  const outputSize = useMemo(() => {
    if (!imageMeta) return null;
    return resolveUpscaleSize(imageMeta.width, imageMeta.height, targetLongEdge);
  }, [imageMeta, targetLongEdge]);

  // 计算是否允许放大
  const canUpscale = Boolean(
    imageMeta && canUpscaleImage(imageMeta.width, imageMeta.height, targetLongEdge)
  );
  const reachedMax = Boolean(imageMeta && sourceLongEdge >= MAX_UPSCALE_LONG_EDGE);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        data-canvas-no-pan="true"
        onPointerDown={(e) => e.stopPropagation()}
        className={`w-full max-w-2xl rounded-2xl border p-6 shadow-2xl backdrop-blur-2xl transition-all ${
          isLight
            ? 'bg-white/95 border-slate-200 text-slate-900 shadow-slate-300/60'
            : 'bg-zinc-900/95 border-zinc-800 text-zinc-100 shadow-black/80'
        }`}
      >
        {/* 顶部标题与关闭按钮 */}
        <div className="flex items-center justify-between pb-4 border-b border-inherit/40">
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center w-8 h-8 rounded-xl bg-violet-500/15 text-violet-500">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-semibold leading-tight">
                {t('workbench.upscaleTitle')}
              </h2>
              <p className="text-xs opacity-50 mt-0.5">
                {t('workbench.upscaleSubtitle')}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg opacity-50 hover:opacity-100 transition-opacity cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 主体两列布局 */}
        <div className="grid grid-cols-1 md:grid-cols-[1fr_260px] gap-6 py-5">
          {/* 左侧：图像预览与当前尺寸 */}
          <div className="flex flex-col items-center justify-center p-4 rounded-xl border border-inherit/40 bg-black/5 dark:bg-black/20">
            <div className="relative flex items-center justify-center min-h-[220px] max-h-[280px] w-full">
              <img
                src={dataUrl}
                alt="Source preview"
                referrerPolicy="no-referrer"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.opacity = '0.3';
                }}
                className="max-h-[260px] max-w-full rounded-lg object-contain shadow-lg"
                draggable={false}
              />
            </div>
            <div className="mt-3 flex items-center justify-between w-full text-xs opacity-70 px-1">
              <span>{t('workbench.sourceResolution')}</span>
              <span className="font-semibold font-mono">
                {imageMeta ? `${imageMeta.width} × ${imageMeta.height} px` : t('common.loading')}
              </span>
            </div>
          </div>

          {/* 右侧：目标分辨率与算法配置 */}
          <div className="space-y-4">
            {/* 目标档位 */}
            <div className="space-y-2">
              <label className="text-xs font-medium opacity-70">
                {t('workbench.targetResolution')}
              </label>
              <div className="grid grid-cols-3 gap-2">
                {TARGET_OPTIONS.map((opt) => {
                  const isReached = Boolean(imageMeta && sourceLongEdge >= opt.value);
                  const isSelected = targetLongEdge === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      disabled={isReached}
                      onClick={() => setTargetLongEdge(opt.value)}
                      className={`py-2 px-2.5 rounded-xl border text-center transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed ${
                        isSelected
                          ? 'border-violet-500 bg-violet-500/10 text-violet-600 dark:text-violet-400 font-semibold shadow-sm'
                          : isLight
                          ? 'border-slate-200 hover:bg-slate-100 text-slate-700'
                          : 'border-zinc-800 hover:bg-zinc-800 text-zinc-300'
                      }`}
                    >
                      <div className="text-sm font-semibold">{opt.label}</div>
                      <div className="text-[10px] opacity-60 font-mono mt-0.5">{opt.value}px</div>
                    </button>
                  );
                })}
              </div>

              {reachedMax ? (
                <div className="flex items-center gap-1.5 text-xs text-amber-500 dark:text-amber-400 pt-1">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{t('workbench.maxResolutionReached')}</span>
                </div>
              ) : !canUpscale ? (
                <div className="text-[11px] text-amber-500 pt-0.5">
                  {t('workbench.selectHigherTarget')}
                </div>
              ) : null}
            </div>

            {/* 算法选择 */}
            <div className="space-y-2">
              <label className="text-xs font-medium opacity-70">
                {t('workbench.algorithm')}
              </label>
              <div className="space-y-1.5">
                {[
                  { id: 'high', label: t('workbench.algoHigh'), desc: t('workbench.algoHighDesc') },
                  { id: 'bilinear', label: t('workbench.algoBilinear'), desc: t('workbench.algoBilinearDesc') },
                  { id: 'nearest', label: t('workbench.algoNearest'), desc: t('workbench.algoNearestDesc') },
                ].map((algo) => {
                  const isSelected = algorithm === algo.id;
                  return (
                    <button
                      key={algo.id}
                      type="button"
                      onClick={() => setAlgorithm(algo.id as ImageUpscaleAlgorithm)}
                      className={`w-full flex flex-col items-start p-2 rounded-xl border text-left transition-all cursor-pointer ${
                        isSelected
                          ? 'border-violet-500 bg-violet-500/10 text-violet-600 dark:text-violet-400'
                          : isLight
                          ? 'border-slate-200 hover:bg-slate-100 text-slate-700'
                          : 'border-zinc-800 hover:bg-zinc-800 text-zinc-300'
                      }`}
                    >
                      <div className="text-xs font-medium">{algo.label}</div>
                      <div className="text-[10px] opacity-55 leading-tight mt-0.5">{algo.desc}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 预测输出尺寸 */}
            <div
              className={`p-3 rounded-xl border text-xs flex items-center justify-between ${
                isLight ? 'bg-slate-50 border-slate-200' : 'bg-zinc-800/40 border-zinc-800'
              }`}
            >
              <span className="opacity-60">{t('workbench.targetOutputSize')}</span>
              <span className="font-semibold font-mono">
                {outputSize ? `${outputSize.width} × ${outputSize.height} px` : t('common.loading')}
              </span>
            </div>
          </div>
        </div>

        {/* 底部按钮 */}
        <div className="flex items-center justify-end gap-3 pt-3 border-t border-inherit/40">
          <button
            type="button"
            onClick={onClose}
            className={`px-4 py-2 rounded-xl text-xs font-medium transition-colors cursor-pointer ${
              isLight
                ? 'hover:bg-slate-100 text-slate-600'
                : 'hover:bg-zinc-800 text-zinc-300'
            }`}
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            disabled={!canUpscale}
            onClick={() => {
              if (canUpscale) {
                onConfirm(targetLongEdge, algorithm);
                onClose();
              }
            }}
            className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 active:bg-violet-700 text-white text-xs font-medium shadow-lg shadow-violet-500/25 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ImagePlus className="w-3.5 h-3.5" />
            <span>{t('workbench.startUpscale')}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

import React, { useState, useRef, useEffect } from 'react';
import { X, Check, Crop } from 'lucide-react';
import { useI18n } from '@/i18n';
import { cropDataUrl, loadImage } from '../utils/canvasImageUtils';
import type { CanvasTheme } from '../types';

interface CanvasImageCropModalProps {
  theme: CanvasTheme;
  imageUrl: string;
  onConfirm: (croppedDataUrl: string, width: number, height: number) => void;
  onClose: () => void;
}

type AspectRatioOption = 'free' | '1:1' | '3:4' | '4:3' | '9:16' | '16:9';

export const CanvasImageCropModal: React.FC<CanvasImageCropModalProps> = ({
  theme,
  imageUrl,
  onConfirm,
  onClose,
}) => {
  const { t } = useI18n();
  const [selectedRatio, setSelectedRatio] = useState<AspectRatioOption>('1:1');
  const [isProcessing, setIsProcessing] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [imgNaturalSize, setImgNaturalSize] = useState<{ w: number; h: number }>({ w: 800, h: 800 });

  // 裁切框在图片自然坐标系下的矩形 (x, y, w, h)
  const [cropRect, setCropRect] = useState<{ x: number; y: number; w: number; h: number }>({
    x: 0,
    y: 0,
    w: 800,
    h: 800,
  });

  useEffect(() => {
    loadImage(imageUrl)
      .then((img) => {
        const w = img.naturalWidth || img.width || 800;
        const h = img.naturalHeight || img.height || 800;
        setImgNaturalSize({ w, h });

        // 默认根据 1:1 居中设定初始矩形
        const side = Math.min(w, h);
        setCropRect({
          x: Math.round((w - side) / 2),
          y: Math.round((h - side) / 2),
          w: side,
          h: side,
        });
      })
      .catch(() => {});
  }, [imageUrl]);

  const applyRatio = (ratio: AspectRatioOption) => {
    setSelectedRatio(ratio);
    const { w, h } = imgNaturalSize;
    if (ratio === 'free') {
      const freeW = Math.round(w * 0.85);
      const freeH = Math.round(h * 0.85);
      setCropRect({
        x: Math.round((w - freeW) / 2),
        y: Math.round((h - freeH) / 2),
        w: freeW,
        h: freeH,
      });
      return;
    }

    let targetRatio = 1;
    if (ratio === '1:1') targetRatio = 1;
    else if (ratio === '3:4') targetRatio = 3 / 4;
    else if (ratio === '4:3') targetRatio = 4 / 3;
    else if (ratio === '9:16') targetRatio = 9 / 16;
    else if (ratio === '16:9') targetRatio = 16 / 9;

    let cropW = w;
    let cropH = Math.round(w / targetRatio);
    if (cropH > h) {
      cropH = h;
      cropW = Math.round(h * targetRatio);
    }

    setCropRect({
      x: Math.round((w - cropW) / 2),
      y: Math.round((h - cropH) / 2),
      w: cropW,
      h: cropH,
    });
  };

  // 计算展示缩放比 (声明前置，供拖拽位移换算与视图渲染使用)
  const maxDisplayWidth = 520;
  const maxDisplayHeight = 420;
  const scale = Math.min(
    maxDisplayWidth / Math.max(1, imgNaturalSize.w),
    maxDisplayHeight / Math.max(1, imgNaturalSize.h),
    1
  );

  // 裁切框拖拽位移交互 (消除 pointer-events-none 并限制边界)
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef<{ startX: number; startY: number; initX: number; initY: number }>({
    startX: 0,
    startY: 0,
    initX: 0,
    initY: 0,
  });

  const handleBoxPointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    isDraggingRef.current = true;
    dragStartRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      initX: cropRect.x,
      initY: cropRect.y,
    };
  };

  const handleBoxPointerMove = (e: React.PointerEvent) => {
    if (!isDraggingRef.current) return;
    const dx = (e.clientX - dragStartRef.current.startX) / Math.max(0.001, scale);
    const dy = (e.clientY - dragStartRef.current.startY) / Math.max(0.001, scale);

    const maxX = Math.max(0, imgNaturalSize.w - cropRect.w);
    const maxY = Math.max(0, imgNaturalSize.h - cropRect.h);

    const newX = Math.max(0, Math.min(maxX, Math.round(dragStartRef.current.initX + dx)));
    const newY = Math.max(0, Math.min(maxY, Math.round(dragStartRef.current.initY + dy)));

    setCropRect((prev) => ({
      ...prev,
      x: newX,
      y: newY,
    }));
  };

  const handleBoxPointerUp = (e: React.PointerEvent) => {
    isDraggingRef.current = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}
  };

  const handleConfirm = async () => {
    setIsProcessing(true);
    try {
      const cropped = await cropDataUrl(imageUrl, cropRect);
      onConfirm(cropped, cropRect.w, cropRect.h);
    } catch {
      onClose();
    } finally {
      setIsProcessing(false);
    }
  };

  const isLight = theme === 'light';

  const displayW = Math.round(imgNaturalSize.w * scale);
  const displayH = Math.round(imgNaturalSize.h * scale);

  const rectStyle = {
    left: `${Math.round(cropRect.x * scale)}px`,
    top: `${Math.round(cropRect.y * scale)}px`,
    width: `${Math.round(cropRect.w * scale)}px`,
    height: `${Math.round(cropRect.h * scale)}px`,
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className={`w-full max-w-xl rounded-2xl p-5 shadow-2xl border transition-colors ${
          isLight
            ? 'bg-white border-slate-200 text-slate-900 shadow-slate-300/40'
            : 'bg-zinc-900 border-zinc-800 text-zinc-100 shadow-black/80'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 标题栏 */}
        <div className="flex items-center justify-between pb-3 border-b border-inherit">
          <div className="flex items-center gap-2 font-medium">
            <Crop className="w-4 h-4 text-violet-500" />
            <span>{t('workbench.cropModalTitle')}</span>
          </div>
          <button
            onClick={onClose}
            className={`p-1.5 rounded-lg transition-colors ${
              isLight ? 'hover:bg-slate-100 text-slate-500' : 'hover:bg-zinc-800 text-zinc-400'
            }`}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 比例选择器 */}
        <div className="flex items-center gap-1.5 py-3 overflow-x-auto">
          {(['free', '1:1', '3:4', '4:3', '9:16', '16:9'] as AspectRatioOption[]).map((r) => {
            const isSel = selectedRatio === r;
            const label = r === 'free' ? t('workbench.cropFree') : r;
            return (
              <button
                key={r}
                onClick={() => applyRatio(r)}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-all shrink-0 ${
                  isSel
                    ? 'bg-violet-600 text-white shadow-sm'
                    : isLight
                    ? 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>

        {/* 预览区域 */}
        <div
          ref={containerRef}
          className={`relative mx-auto my-2 flex items-center justify-center rounded-xl overflow-hidden p-2 select-none ${
            isLight ? 'bg-slate-100/70 border border-slate-200/60' : 'bg-zinc-950 border border-zinc-800/80'
          }`}
          style={{ minHeight: '320px' }}
        >
          <div
            className="relative"
            style={{ width: `${displayW}px`, height: `${displayH}px` }}
          >
            <img
              src={imageUrl}
              alt="Crop target"
              referrerPolicy="no-referrer"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.opacity = '0.3';
              }}
              className="w-full h-full object-contain pointer-events-none rounded"
            />
            {/* 裁切高亮框与网格导线 (支持拖拽移动选区) */}
            <div
              onPointerDown={handleBoxPointerDown}
              onPointerMove={handleBoxPointerMove}
              onPointerUp={handleBoxPointerUp}
              onPointerCancel={handleBoxPointerUp}
              className="absolute border-2 border-violet-500 shadow-[0_0_0_9999px_rgba(0,0,0,0.55)] cursor-move transition-all duration-75"
              style={rectStyle}
            >
              <div className="w-full h-full grid grid-cols-3 grid-rows-3 opacity-40">
                <div className="border-r border-b border-dashed border-white/60" />
                <div className="border-r border-b border-dashed border-white/60" />
                <div className="border-b border-dashed border-white/60" />
                <div className="border-r border-b border-dashed border-white/60" />
                <div className="border-r border-b border-dashed border-white/60" />
                <div className="border-b border-dashed border-white/60" />
                <div className="border-r border-dashed border-white/60" />
                <div className="border-r border-dashed border-white/60" />
                <div />
              </div>
            </div>
          </div>
        </div>

        {/* 底部按钮栏 */}
        <div className="flex items-center justify-end gap-2 pt-3 border-t border-inherit">
          <button
            onClick={onClose}
            className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              isLight ? 'hover:bg-slate-100 text-slate-600' : 'hover:bg-zinc-800 text-zinc-300'
            }`}
          >
            {t('workbench.cropCancel')}
          </button>
          <button
            onClick={handleConfirm}
            disabled={isProcessing}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-medium bg-violet-600 hover:bg-violet-700 text-white shadow-sm transition-all disabled:opacity-50"
          >
            <Check className="w-3.5 h-3.5" />
            <span>{t('workbench.cropApply')}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

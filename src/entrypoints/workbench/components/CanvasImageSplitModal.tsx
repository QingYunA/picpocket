import React, { useState } from 'react';
import { Grid2x2, X, Check, Rows, Columns } from 'lucide-react';
import { useI18n } from '@/i18n';
import type { GeneratedImage } from '@/types';
import type { CanvasTheme } from '../types';
import {
  splitImageDataUrl,
  type ImageSplitParams,
  type SplitResultPiece,
} from '../utils/canvasSplitUtils';

export interface CanvasImageSplitModalProps {
  image: GeneratedImage | null;
  open: boolean;
  theme: CanvasTheme;
  onClose: () => void;
  onConfirm: (sourceImage: GeneratedImage, pieces: SplitResultPiece[]) => void;
}

const PRESET_GRIDS = [
  { label: '2 × 2', rows: 2, cols: 2 },
  { label: '3 × 3', rows: 3, cols: 3 },
  { label: '1 × 2', rows: 1, cols: 2 },
  { label: '2 × 1', rows: 2, cols: 1 },
  { label: '1 × 3', rows: 1, cols: 3 },
  { label: '3 × 1', rows: 3, cols: 1 },
];

export const CanvasImageSplitModal: React.FC<CanvasImageSplitModalProps> = ({
  image,
  open,
  theme,
  onClose,
  onConfirm,
}) => {
  const { t } = useI18n();
  const [rows, setRows] = useState(2);
  const [cols, setCols] = useState(2);
  const [isSplitting, setIsSplitting] = useState(false);

  if (!open || !image) return null;

  const isLight = theme === 'light';
  const totalPieces = rows * cols;

  const handleApplySplit = async () => {
    setIsSplitting(true);
    try {
      const params: ImageSplitParams = {
        rows,
        columns: cols,
      };
      const pieces = await splitImageDataUrl(image.dataUrl, params);
      onConfirm(image, pieces);
    } catch (err) {
      console.error('Failed to split image:', err);
    } finally {
      setIsSplitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs select-none animate-in fade-in duration-200"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div
        className={`relative w-full max-w-2xl rounded-3xl border shadow-2xl overflow-hidden flex flex-col transition-colors ${
          isLight
            ? 'bg-white border-slate-200 text-slate-800'
            : 'bg-zinc-900 border-zinc-800 text-zinc-100'
        }`}
      >
        {/* 顶栏 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-inherit">
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center w-7 h-7 rounded-xl bg-emerald-500/10 text-emerald-500">
              <Grid2x2 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-semibold text-sm">{t('workbench.splitGridTitle')}</h3>
              <p className="text-[11px] opacity-60">{t('workbench.splitGridDesc')}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl opacity-60 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 主体两栏 */}
        <div className="p-6 grid grid-cols-1 md:grid-cols-[1fr_280px] gap-6 items-center">
          {/* 左侧：切图预览（带网格切线与序号） */}
          <div
            className={`flex flex-col items-center justify-center min-h-[320px] p-4 rounded-2xl border relative overflow-hidden ${
              isLight ? 'bg-slate-50 border-slate-200' : 'bg-zinc-950/60 border-zinc-800'
            }`}
          >
            <div className="relative max-w-[280px] max-h-[280px] rounded-xl overflow-hidden shadow-xl border border-black/10">
              <img
                src={image.dataUrl}
                alt="Split Preview"
                referrerPolicy="no-referrer"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.opacity = '0.3';
                }}
                className="w-full h-full object-contain block select-none"
                draggable={false}
              />

              {/* 网格切分线覆盖层 */}
              <div
                className="absolute inset-0 grid pointer-events-none"
                style={{
                  gridTemplateRows: `repeat(${rows}, 1fr)`,
                  gridTemplateColumns: `repeat(${cols}, 1fr)`,
                }}
              >
                {Array.from({ length: totalPieces }).map((_, idx) => (
                  <div
                    key={idx}
                    className="border border-emerald-500/70 bg-emerald-500/10 flex items-center justify-center relative"
                  >
                    <span className="text-[11px] font-mono font-bold text-white bg-black/60 px-1.5 py-0.5 rounded-md backdrop-blur-xs">
                      {idx + 1}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-3 text-[11px] opacity-60">
              {t('workbench.totalPieces', { count: totalPieces })}
            </div>
          </div>

          {/* 右侧：网格设置 */}
          <div className="space-y-4 text-xs">
            {/* 常用预设快捷按钮 */}
            <div className="space-y-1.5">
              <span className="font-medium opacity-80">{t('workbench.presetGrid')}</span>
              <div className="grid grid-cols-3 gap-1.5">
                {PRESET_GRIDS.map((preset) => {
                  const isActive = rows === preset.rows && cols === preset.cols;
                  return (
                    <button
                      key={preset.label}
                      onClick={() => {
                        setRows(preset.rows);
                        setCols(preset.cols);
                      }}
                      className={`py-1.5 rounded-xl font-mono font-medium transition-all cursor-pointer border ${
                        isActive
                          ? 'bg-emerald-600 border-emerald-500 text-white shadow-xs'
                          : isLight
                          ? 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                          : 'border-zinc-800 bg-zinc-950/60 hover:bg-zinc-800 text-zinc-300'
                      }`}
                    >
                      {preset.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 行列自定义调节 */}
            <div className="grid grid-cols-2 gap-3 pt-2">
              <div className="space-y-1.5">
                <div className="flex items-center gap-1 opacity-80">
                  <Rows className="w-3.5 h-3.5" />
                  <span className="font-medium">{t('workbench.rows')}</span>
                </div>
                <div
                  className={`flex items-center justify-between p-1 rounded-xl border ${
                    isLight ? 'bg-slate-100 border-slate-200' : 'bg-zinc-950 border-zinc-800'
                  }`}
                >
                  <button
                    onClick={() => setRows((r) => Math.max(1, r - 1))}
                    disabled={rows <= 1}
                    className="w-7 h-7 rounded-lg flex items-center justify-center font-bold disabled:opacity-30 cursor-pointer"
                  >
                    -
                  </button>
                  <span className="font-mono font-semibold">{rows}</span>
                  <button
                    onClick={() => setRows((r) => Math.min(6, r + 1))}
                    disabled={rows >= 6}
                    className="w-7 h-7 rounded-lg flex items-center justify-center font-bold disabled:opacity-30 cursor-pointer"
                  >
                    +
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center gap-1 opacity-80">
                  <Columns className="w-3.5 h-3.5" />
                  <span className="font-medium">{t('workbench.columns')}</span>
                </div>
                <div
                  className={`flex items-center justify-between p-1 rounded-xl border ${
                    isLight ? 'bg-slate-100 border-slate-200' : 'bg-zinc-950 border-zinc-800'
                  }`}
                >
                  <button
                    onClick={() => setCols((c) => Math.max(1, c - 1))}
                    disabled={cols <= 1}
                    className="w-7 h-7 rounded-lg flex items-center justify-center font-bold disabled:opacity-30 cursor-pointer"
                  >
                    -
                  </button>
                  <span className="font-mono font-semibold">{cols}</span>
                  <button
                    onClick={() => setCols((c) => Math.min(6, c + 1))}
                    disabled={cols >= 6}
                    className="w-7 h-7 rounded-lg flex items-center justify-center font-bold disabled:opacity-30 cursor-pointer"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 底栏按钮 */}
        <div
          className={`flex items-center justify-end gap-3 px-6 py-4 border-t ${
            isLight ? 'border-slate-100 bg-slate-50/50' : 'border-zinc-800/80 bg-zinc-900/50'
          }`}
        >
          <button
            onClick={onClose}
            className={`px-4 py-2 rounded-xl text-xs font-medium border transition-colors cursor-pointer ${
              isLight
                ? 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                : 'border-zinc-700 bg-zinc-800 hover:bg-zinc-700 text-zinc-300'
            }`}
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={handleApplySplit}
            disabled={isSplitting}
            className="flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 shadow-md shadow-emerald-500/20 transition-all cursor-pointer disabled:opacity-50"
          >
            <Check className="w-3.5 h-3.5" />
            <span>
              {isSplitting ? t('workbench.splitting') : t('workbench.confirmSplit')}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};

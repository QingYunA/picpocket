import React, { useState } from 'react';
import { RotateCcw, Sparkles, X, Camera } from 'lucide-react';
import { useI18n } from '@/i18n';
import type { GeneratedImage } from '@/types';
import type { CanvasTheme } from '../types';
import {
  DEFAULT_ANGLE_PARAMS,
  calculateAnglePreviewTransform,
  buildAnglePrompt,
  type CanvasImageAngleParams,
} from '../utils/canvasAngleUtils';

export interface CanvasImageAngleModalProps {
  image: GeneratedImage | null;
  open: boolean;
  theme: CanvasTheme;
  onClose: () => void;
  onConfirm: (image: GeneratedImage, params: CanvasImageAngleParams, generatedPrompt: string) => void;
}

export const CanvasImageAngleModal: React.FC<CanvasImageAngleModalProps> = ({
  image,
  open,
  theme,
  onClose,
  onConfirm,
}) => {
  const { t, language } = useI18n();
  const [params, setParams] = useState<CanvasImageAngleParams>(DEFAULT_ANGLE_PARAMS);

  if (!open || !image) return null;

  const isLight = theme === 'light';

  const updateParam = <K extends keyof CanvasImageAngleParams>(
    key: K,
    val: CanvasImageAngleParams[K]
  ) => {
    setParams((prev) => ({ ...prev, [key]: val }));
  };

  const handleReset = () => {
    setParams(DEFAULT_ANGLE_PARAMS);
  };

  const handleGenerate = () => {
    const anglePrompt = buildAnglePrompt(params, language === 'zh' ? 'zh' : 'en');
    onConfirm(image, params, anglePrompt);
  };

  const previewStyle = {
    transform: calculateAnglePreviewTransform(params),
    transition: 'transform 0.1s ease-out',
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
            <div className="flex items-center justify-center w-7 h-7 rounded-xl bg-blue-500/10 text-blue-500">
              <Camera className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-semibold text-sm">{t('workbench.cameraAngleTitle')}</h3>
              <p className="text-[11px] opacity-60">{t('workbench.cameraAngleDesc')}</p>
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
        <div className="p-6 grid grid-cols-1 md:grid-cols-[1fr_320px] gap-6 items-center">
          {/* 左侧：3D 视差预览舞台 */}
          <div
            className={`flex flex-col items-center justify-between min-h-[320px] p-4 rounded-2xl border ${
              isLight ? 'bg-slate-50 border-slate-200' : 'bg-zinc-950/60 border-zinc-800'
            }`}
          >
            <div className="flex-1 w-full flex items-center justify-center relative py-6">
              <div className="relative">
                <img
                  src={image.dataUrl}
                  alt="Angle Preview"
                  referrerPolicy="no-referrer"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.opacity = '0.3';
                  }}
                  className="w-44 h-44 rounded-2xl object-cover shadow-2xl select-none"
                  style={previewStyle}
                  draggable={false}
                />
                {/* 底部微型阴影底盘 */}
                <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 w-28 h-6 rounded-full bg-black/20 dark:bg-black/40 blur-md pointer-events-none" />
              </div>
            </div>

            <button
              onClick={handleReset}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors cursor-pointer ${
                isLight
                  ? 'border-slate-300 bg-white hover:bg-slate-100 text-slate-700'
                  : 'border-zinc-700 bg-zinc-800 hover:bg-zinc-700 text-zinc-300'
              }`}
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>{t('workbench.resetAngle')}</span>
            </button>
          </div>

          {/* 右侧：角度与参数滑动器 */}
          <div className="space-y-4 text-xs">
            {/* 1. 水平旋转角度 (-60° ~ +60°) */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-medium opacity-80">{t('workbench.horizontalAngle')}</span>
                <span className="font-mono font-semibold text-blue-500">
                  {params.horizontalAngle > 0 ? `+${params.horizontalAngle}°` : `${params.horizontalAngle}°`}
                </span>
              </div>
              <input
                type="range"
                min="-60"
                max="60"
                step="1"
                value={params.horizontalAngle}
                onChange={(e) => updateParam('horizontalAngle', Number(e.target.value))}
                className="w-full accent-blue-500 cursor-pointer"
              />
              <div className="flex justify-between text-[10px] opacity-40">
                <span>-60° ({t('workbench.angleLeft')})</span>
                <span>0°</span>
                <span>+60° ({t('workbench.angleRight')})</span>
              </div>
            </div>

            {/* 2. 俯仰角度 (-45° ~ +45°) */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-medium opacity-80">{t('workbench.pitchAngle')}</span>
                <span className="font-mono font-semibold text-blue-500">
                  {params.pitchAngle > 0 ? `+${params.pitchAngle}°` : `${params.pitchAngle}°`}
                </span>
              </div>
              <input
                type="range"
                min="-45"
                max="45"
                step="1"
                value={params.pitchAngle}
                onChange={(e) => updateParam('pitchAngle', Number(e.target.value))}
                className="w-full accent-blue-500 cursor-pointer"
              />
              <div className="flex justify-between text-[10px] opacity-40">
                <span>-45° ({t('workbench.angleLow')})</span>
                <span>0°</span>
                <span>+45° ({t('workbench.angleTopDown')})</span>
              </div>
            </div>

            {/* 3. 镜头距离 (1.0 ~ 10.0) */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-medium opacity-80">{t('workbench.cameraDistance')}</span>
                <span className="font-mono font-semibold text-blue-500">
                  {params.cameraDistance.toFixed(1)}
                </span>
              </div>
              <input
                type="range"
                min="1.0"
                max="10.0"
                step="0.1"
                value={params.cameraDistance}
                onChange={(e) => updateParam('cameraDistance', Number(e.target.value))}
                className="w-full accent-blue-500 cursor-pointer"
              />
            </div>

            {/* 4. 镜头焦段：标准 / 广角 */}
            <div className="space-y-1.5">
              <span className="font-medium opacity-80">{t('workbench.lensType')}</span>
              <div
                className={`grid grid-cols-2 gap-1 p-1 rounded-xl border ${
                  isLight ? 'bg-slate-100 border-slate-200' : 'bg-zinc-950 border-zinc-800'
                }`}
              >
                <button
                  onClick={() => updateParam('wideAngle', false)}
                  className={`py-1.5 rounded-lg font-medium transition-all cursor-pointer ${
                    !params.wideAngle
                      ? 'bg-blue-600 text-white shadow-xs'
                      : isLight
                      ? 'text-slate-600 hover:text-slate-900'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {t('workbench.standardLens')}
                </button>
                <button
                  onClick={() => updateParam('wideAngle', true)}
                  className={`py-1.5 rounded-lg font-medium transition-all cursor-pointer ${
                    params.wideAngle
                      ? 'bg-blue-600 text-white shadow-xs'
                      : isLight
                      ? 'text-slate-600 hover:text-slate-900'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {t('workbench.wideLens')}
                </button>
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
            onClick={handleGenerate}
            className="flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 shadow-md shadow-blue-500/20 transition-all cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>{t('workbench.generateNewAngle')}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

import React from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import type { ImageAspectRatio } from '@/types';
import { useI18n } from '@/i18n';

export interface GenerationControlsBarProps {
  aspectRatio: ImageAspectRatio;
  onChangeAspectRatio: (ratio: ImageAspectRatio) => void;
  quality: 'auto' | 'standard' | 'hd';
  onChangeQuality: (quality: 'auto' | 'standard' | 'hd') => void;
  count: number;
  onChangeCount: (count: number) => void;
  maxCount?: number;
  modelName?: string;
  showAdvanced: boolean;
  onToggleShowAdvanced: () => void;
  negativePrompt: string;
  onChangeNegativePrompt: (val: string) => void;
  disabled?: boolean;
}

export const ASPECT_RATIOS: {
  ratio: ImageAspectRatio;
  label: string;
  desc: string;
  tagKey: 'Square' | 'Wide' | 'Story' | 'Photo' | 'Portrait' | 'Ultrawide' | 'Poster';
}[] = [
  { ratio: '1:1', label: '1:1', desc: '1024×1024', tagKey: 'Square' },
  { ratio: '16:9', label: '16:9', desc: '1792×1024', tagKey: 'Wide' },
  { ratio: '9:16', label: '9:16', desc: '1024×1792', tagKey: 'Story' },
  { ratio: '4:3', label: '4:3', desc: '1024×768', tagKey: 'Photo' },
  { ratio: '3:4', label: '3:4', desc: '768×1024', tagKey: 'Portrait' },
  { ratio: '21:9', label: '21:9', desc: '1792×768', tagKey: 'Ultrawide' },
  { ratio: '2:3', label: '2:3', desc: '768×1152', tagKey: 'Poster' },
];

export const GenerationControlsBar: React.FC<GenerationControlsBarProps> = ({
  aspectRatio,
  onChangeAspectRatio,
  quality,
  onChangeQuality,
  count,
  onChangeCount,
  maxCount = 4,
  modelName = '',
  showAdvanced,
  onToggleShowAdvanced,
  negativePrompt,
  onChangeNegativePrompt,
  disabled = false,
}) => {
  const { t } = useI18n();

  const getAspectTag = (key: string): string => {
    switch (key) {
      case 'Square':
        return t('generator.tagSquare');
      case 'Wide':
        return t('generator.tagWide');
      case 'Story':
        return t('generator.tagStory');
      case 'Photo':
        return t('generator.tagPhoto');
      case 'Portrait':
        return t('generator.tagPortrait');
      case 'Ultrawide':
        return t('generator.tagWide21x9');
      case 'Poster':
        return t('generator.tagPoster2x3');
      default:
        return '';
    }
  };

  return (
    <div className="space-y-3">
      {/* Aspect Ratio Selector (7 Options) */}
      <div className="space-y-1.5">
        <label className="block text-[11px] font-semibold text-zinc-700">
          {t('generator.aspectRatio')}
        </label>
        <div className="grid grid-cols-4 sm:grid-cols-7 gap-1">
          {ASPECT_RATIOS.map((item) => {
            const active = aspectRatio === item.ratio;
            return (
              <button
                key={item.ratio}
                type="button"
                disabled={disabled}
                onClick={() => onChangeAspectRatio(item.ratio)}
                title={`${item.label} (${item.desc})`}
                className={`flex flex-col items-center justify-center py-1.5 px-0.5 rounded-lg border text-center transition-all cursor-pointer min-w-0 ${
                  active
                    ? 'border-zinc-900 bg-zinc-900 text-white shadow-2xs font-semibold'
                    : 'border-zinc-200 bg-zinc-50/70 text-zinc-700 hover:bg-white hover:border-zinc-300'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                <span className="text-[11px] font-medium leading-tight">{item.label}</span>
                <span className={`text-[9px] leading-none mt-0.5 ${active ? 'text-zinc-300' : 'text-zinc-400'}`}>
                  {getAspectTag(item.tagKey)}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Advanced collapsible */}
      <div>
        <button
          type="button"
          onClick={onToggleShowAdvanced}
          className="flex items-center gap-1 text-[11px] font-medium text-zinc-500 hover:text-zinc-800 transition-colors cursor-pointer"
        >
          {showAdvanced ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          <span>{t('generator.advancedOptions')}</span>
        </button>

        {showAdvanced && (
          <div className="mt-2 space-y-2.5 pt-2 border-t border-zinc-100 animate-in fade-in">
            {/* Quality selector */}
            <div className="flex items-center justify-between">
              <span className="text-xs text-zinc-700">{t('generator.quality')}</span>
              <div className="flex gap-1">
                {(['auto', 'standard', 'hd'] as const).map((q) => (
                  <button
                    key={q}
                    type="button"
                    disabled={disabled}
                    onClick={() => onChangeQuality(q)}
                    className={`px-2 py-0.5 rounded-md text-xs font-medium transition-all cursor-pointer ${
                      quality === q
                        ? 'bg-zinc-900 text-white shadow-2xs'
                        : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    {q === 'auto'
                      ? t('generator.qualityAuto')
                      : q === 'standard'
                      ? t('generator.qualityStandard')
                      : t('generator.qualityHd')}
                  </button>
                ))}
              </div>
            </div>

            {/* Count selector with model capability matrix defense */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1">
                <span className="text-xs text-zinc-700">{t('generator.count')}</span>
                {maxCount < 4 && (
                  <span className="text-[10px] text-amber-600">
                    {t('generator.modelMaxCountHint', { model: modelName || 'AI', maxCount })}
                  </span>
                )}
              </div>
              <div className="flex gap-1">
                {[1, 2, 4].map((n) => {
                  const isCountDisabled = disabled || n > maxCount;
                  return (
                    <button
                      key={n}
                      type="button"
                      disabled={isCountDisabled}
                      onClick={() => onChangeCount(n)}
                      title={n > maxCount ? t('generator.modelSingleImageOnly', { model: modelName || 'AI' }) : undefined}
                      className={`h-6 w-6 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                        count === n
                          ? 'bg-zinc-900 text-white'
                          : isCountDisabled
                          ? 'bg-zinc-100 text-zinc-300 cursor-not-allowed'
                          : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                      }`}
                    >
                      {n}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Negative prompt */}
            <div>
              <label className="block text-[11px] font-semibold text-zinc-600 mb-1">
                {t('generator.negativePrompt')}
              </label>
              <input
                type="text"
                disabled={disabled}
                value={negativePrompt}
                onChange={(e) => onChangeNegativePrompt(e.target.value)}
                placeholder={t('generator.negativePlaceholder')}
                className="w-full rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs text-zinc-800 placeholder:text-zinc-400 focus:border-zinc-900 focus:outline-none disabled:opacity-50"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

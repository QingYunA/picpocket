import React, { useRef, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowUp,
  ImagePlus,
  LoaderCircle,
  Sparkles,
  Square,
  X,
  ChevronDown,
  Layers,
  Maximize2,
} from 'lucide-react';
import type { ImageAspectRatio } from '@/types';
import { useI18n } from '@/i18n';
import { readFileAsDataUrl } from '@/utils/file';
import { CANVAS_RATIOS, type CanvasTheme } from '../types';

export interface CanvasNodePromptPanelProps {
  cardId: string;
  initialPrompt?: string;
  initialModel?: string;
  initialAspectRatio?: ImageAspectRatio;
  initialReferenceImages?: string[];
  isGenerating?: boolean;
  hasExistingImage?: boolean;
  theme: CanvasTheme;
  onGenerate: (params: {
    cardId: string;
    prompt: string;
    model: string;
    aspectRatio: ImageAspectRatio;
    referenceImages: string[];
  }) => void;
  onStop?: (cardId: string) => void;
  onPromptChange?: (cardId: string, prompt: string) => void;
  onConfigChange?: (
    cardId: string,
    patch: { model?: string; aspectRatio?: ImageAspectRatio; referenceImages?: string[] }
  ) => void;
}

const AVAILABLE_MODELS = [
  { id: 'flux-pro', label: 'FLUX.1 Pro' },
  { id: 'flux-schnell', label: 'FLUX Schnell' },
  { id: 'dall-e-3', label: 'DALL-E 3' },
  { id: 'stable-diffusion-3.5-large', label: 'SD 3.5 Large' },
  { id: 'recraft-v3', label: 'Recraft v3' },
];

export const CanvasNodePromptPanel: React.FC<CanvasNodePromptPanelProps> = ({
  cardId,
  initialPrompt = '',
  initialModel = 'flux-pro',
  initialAspectRatio = '1:1',
  initialReferenceImages = [],
  isGenerating = false,
  hasExistingImage = false,
  theme,
  onGenerate,
  onStop,
  onPromptChange,
  onConfigChange,
}) => {
  const { t } = useI18n();
  const isLight = theme === 'light';

  const [prompt, setPrompt] = useState(initialPrompt);
  const [model, setModel] = useState(initialModel);
  const [aspectRatio, setAspectRatio] = useState<ImageAspectRatio>(initialAspectRatio);
  const [referenceImages, setReferenceImages] = useState<string[]>(initialReferenceImages);
  const [showModelMenu, setShowModelMenu] = useState(false);
  const [showRatioMenu, setShowRatioMenu] = useState(false);
  const [isExpandedModalOpen, setIsExpandedModalOpen] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const modalTextareaRef = useRef<HTMLTextAreaElement>(null);
  const prevCardIdRef = useRef(cardId);

  // 仅当切换选中不同卡片时，回填该卡片的提示词与配置
  useEffect(() => {
    if (prevCardIdRef.current !== cardId) {
      prevCardIdRef.current = cardId;
      setPrompt(initialPrompt);
      setModel(initialModel);
      setAspectRatio(initialAspectRatio);
      setReferenceImages(initialReferenceImages);
    }
  }, [cardId, initialPrompt, initialModel, initialAspectRatio, initialReferenceImages]);

  useEffect(() => {
    if (isExpandedModalOpen) {
      setTimeout(() => {
        modalTextareaRef.current?.focus();
      }, 50);
    }
  }, [isExpandedModalOpen]);

  const handlePromptChange = (val: string) => {
    setPrompt(val);
    onPromptChange?.(cardId, val);
  };

  const handleModelSelect = (nextModel: string) => {
    setModel(nextModel);
    setShowModelMenu(false);
    onConfigChange?.(cardId, { model: nextModel });
  };

  const handleRatioSelect = (nextRatio: ImageAspectRatio) => {
    setAspectRatio(nextRatio);
    setShowRatioMenu(false);
    onConfigChange?.(cardId, { aspectRatio: nextRatio });
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const files = Array.from(e.target.files).filter((f) => f.type.startsWith('image/'));
      if (files.length > 0) {
        const dataUrls = await Promise.all(files.map((f) => readFileAsDataUrl(f)));
        const nextRefs = [...referenceImages, ...dataUrls];
        setReferenceImages(nextRefs);
        onConfigChange?.(cardId, { referenceImages: nextRefs });
      }
    }
  };

  const handleRemoveRef = (index: number) => {
    const nextRefs = referenceImages.filter((_, i) => i !== index);
    setReferenceImages(nextRefs);
    onConfigChange?.(cardId, { referenceImages: nextRefs });
  };

  const submit = () => {
    const text = prompt.trim();
    if (!text || isGenerating) return;
    if (isExpandedModalOpen) setIsExpandedModalOpen(false);
    onGenerate({
      cardId,
      prompt: text,
      model,
      aspectRatio,
      referenceImages,
    });
  };

  return (
    <>
      <div
        data-canvas-no-pan="true"
        onMouseDown={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        onWheel={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        className={`w-[540px] max-w-[90vw] p-3 rounded-2xl border shadow-2xl backdrop-blur-2xl transition-all select-none pointer-events-auto ${
          isLight
            ? 'bg-white/95 border-slate-200 text-slate-800 shadow-slate-300/70'
            : 'bg-[#18181b]/95 border-zinc-800 text-zinc-100 shadow-black/85'
        }`}
      >
        {/* 隐藏的本地图片选择器 */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={handleFileChange}
        />

        {/* 参考图缩略图条 (若有) */}
        {referenceImages.length > 0 && (
          <div className="flex items-center gap-2 mb-2 px-1 overflow-x-auto pb-1">
            {referenceImages.map((dataUrl, idx) => (
              <div
                key={idx}
                className="relative group shrink-0 w-11 h-11 rounded-lg overflow-hidden border border-inherit/60 bg-black/5"
              >
                <img
                  src={dataUrl}
                  alt={`ref-${idx}`}
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = 'none';
                  }}
                />
                <button
                  type="button"
                  onClick={() => handleRemoveRef(idx)}
                  className="absolute inset-0 flex items-center justify-center bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                  title={t('workbench.clearRef')}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className={`w-11 h-11 shrink-0 rounded-lg border border-dashed flex flex-col items-center justify-center transition-colors cursor-pointer ${
                isLight
                  ? 'border-slate-300 hover:border-blue-500 hover:bg-blue-50 text-slate-500'
                  : 'border-zinc-700 hover:border-blue-500 hover:bg-blue-950/20 text-zinc-400'
              }`}
              title={t('workbench.uploadRef')}
            >
              <ImagePlus className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* 多行提示词输入框 */}
        <div className="relative">
          <textarea
            ref={textareaRef}
            value={prompt}
            onChange={(e) => handlePromptChange(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.nativeEvent.isComposing || (e as any).isComposing) return;
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault();
                submit();
              }
            }}
            placeholder={
              hasExistingImage
                ? t('workbench.editImagePromptPlaceholder')
                : t('workbench.promptPlaceholder')
            }
            rows={4}
            className={`w-full resize-none rounded-xl border px-3 py-2.5 text-xs leading-relaxed outline-none transition-all ${
              isLight
                ? 'border-slate-200 bg-slate-50/80 text-slate-800 placeholder:text-slate-400 focus:border-[#2f80ff] focus:bg-white'
                : 'border-zinc-800 bg-zinc-950/80 text-zinc-100 placeholder:text-zinc-500 focus:border-[#2f80ff]'
            }`}
          />
        </div>

        {/* 底部功能工具栏 */}
        <div className="flex items-center justify-between gap-2 mt-2 pt-1 border-t border-inherit/40">
          <div className="flex items-center gap-1.5 min-w-0">
            {/* 全屏大文本编辑器展开按钮 */}
            <button
              type="button"
              onClick={() => setIsExpandedModalOpen(true)}
              className={`p-1.5 rounded-lg border text-xs transition-colors cursor-pointer shrink-0 ${
                isLight
                  ? 'border-slate-200 hover:bg-slate-100 text-slate-600'
                  : 'border-zinc-800 hover:bg-zinc-800 text-zinc-400'
              }`}
              title={t('workbench.expandEditor')}
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>

            {/* 参考图添加快捷按钮 (无图时显示) */}
            {referenceImages.length === 0 && (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className={`flex items-center gap-1 px-2 py-1 rounded-lg border text-[11px] transition-colors cursor-pointer shrink-0 ${
                  isLight
                    ? 'border-slate-200 hover:bg-slate-100 text-slate-600'
                    : 'border-zinc-800 hover:bg-zinc-800 text-zinc-400'
                }`}
                title={t('workbench.uploadRef')}
              >
                <ImagePlus className="w-3.5 h-3.5 text-amber-500" />
                <span className="hidden sm:inline">{t('workbench.referenceImage')}</span>
              </button>
            )}

            {/* 比例选择按钮 */}
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setShowRatioMenu(!showRatioMenu);
                  setShowModelMenu(false);
                }}
                className={`flex items-center gap-1 px-2 py-1 rounded-lg border text-[11px] font-mono transition-colors cursor-pointer shrink-0 ${
                  isLight
                    ? 'border-slate-200 hover:bg-slate-100 text-slate-700'
                    : 'border-zinc-800 hover:bg-zinc-800 text-zinc-300'
                }`}
              >
                <Layers className="w-3.5 h-3.5 opacity-60" />
                <span>{aspectRatio}</span>
                <ChevronDown className="w-3 h-3 opacity-50" />
              </button>

              {showRatioMenu && (
                <div
                  className={`absolute bottom-full left-0 mb-1.5 w-24 p-1 rounded-xl border shadow-xl backdrop-blur-xl z-50 text-xs space-y-0.5 animate-in fade-in zoom-in-95 ${
                    isLight ? 'bg-white border-slate-200 text-slate-800' : 'bg-zinc-900 border-zinc-800 text-zinc-100'
                  }`}
                >
                  {CANVAS_RATIOS.map((r) => (
                    <button
                      key={r.value}
                      type="button"
                      onClick={() => handleRatioSelect(r.value)}
                      className={`w-full text-left px-2 py-1 rounded-lg font-mono text-[11px] transition-colors cursor-pointer ${
                        aspectRatio === r.value
                          ? 'bg-[#2f80ff] text-white font-medium'
                          : isLight
                          ? 'hover:bg-slate-100'
                          : 'hover:bg-zinc-800'
                      }`}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* 模型选择按钮 */}
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setShowModelMenu(!showModelMenu);
                  setShowRatioMenu(false);
                }}
                className={`flex items-center gap-1 px-2 py-1 rounded-lg border text-[11px] transition-colors cursor-pointer max-w-[140px] truncate ${
                  isLight
                    ? 'border-slate-200 hover:bg-slate-100 text-slate-700'
                    : 'border-zinc-800 hover:bg-zinc-800 text-zinc-300'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                <span className="truncate">
                  {AVAILABLE_MODELS.find((m) => m.id === model)?.label || model}
                </span>
                <ChevronDown className="w-3 h-3 opacity-50 shrink-0" />
              </button>

              {showModelMenu && (
                <div
                  className={`absolute bottom-full left-0 mb-1.5 w-44 p-1 rounded-xl border shadow-xl backdrop-blur-xl z-50 text-xs space-y-0.5 animate-in fade-in zoom-in-95 ${
                    isLight ? 'bg-white border-slate-200 text-slate-800' : 'bg-zinc-900 border-zinc-800 text-zinc-100'
                  }`}
                >
                  {AVAILABLE_MODELS.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => handleModelSelect(m.id)}
                      className={`w-full text-left px-2 py-1.5 rounded-lg text-xs transition-colors cursor-pointer truncate ${
                        model === m.id
                          ? 'bg-[#2f80ff] text-white font-medium'
                          : isLight
                          ? 'hover:bg-slate-100'
                          : 'hover:bg-zinc-800'
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* 提交/生成按钮 */}
          <button
            type="button"
            onClick={() => (isGenerating ? onStop?.(cardId) : submit())}
            disabled={!isGenerating && !prompt.trim()}
            className={`h-8 min-w-8 px-3.5 rounded-full flex items-center justify-center gap-1 text-xs font-semibold shadow-md transition-all cursor-pointer shrink-0 disabled:opacity-40 disabled:cursor-not-allowed ${
              isGenerating
                ? 'bg-red-500 hover:bg-red-600 text-white animate-pulse'
                : 'bg-[#2f80ff] hover:bg-[#256ed9] text-white shadow-blue-500/25 active:scale-95'
            }`}
            title={isGenerating ? t('workbench.stopGeneration') : t('workbench.generate')}
          >
            {isGenerating ? (
              <>
                <LoaderCircle className="w-3.5 h-3.5 animate-spin" />
                <Square className="w-3 h-3 fill-current" />
                <span className="text-[11px] font-medium">{t('workbench.stop')}</span>
              </>
            ) : (
              <ArrowUp className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>

      {/* 全屏放大提示词编辑器 Modal (Screen HUD - 经 createPortal 穿透世界坐标缩放，直接挂载至 document.body) */}
      {isExpandedModalOpen && typeof document !== 'undefined' && createPortal(
        <div
          data-canvas-no-pan="true"
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onMouseDown={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          onWheel={(e) => e.stopPropagation()}
        >
          <div
            className={`w-full max-w-2xl rounded-2xl border shadow-2xl p-6 transition-all ${
              isLight ? 'bg-white border-slate-200 text-slate-800' : 'bg-[#18181b] border-zinc-800 text-zinc-100'
            }`}
          >
            <div className="flex items-center justify-between pb-4 border-b border-inherit/40 mb-4">
              <h3 className="text-base font-semibold">{t('workbench.editorTitle')}</h3>
              <button
                type="button"
                onClick={() => setIsExpandedModalOpen(false)}
                className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                  isLight ? 'hover:bg-slate-100 text-slate-500' : 'hover:bg-zinc-800 text-zinc-400'
                }`}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <textarea
              ref={modalTextareaRef}
              value={prompt}
              onChange={(e) => handlePromptChange(e.target.value)}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.nativeEvent.isComposing || (e as any).isComposing) return;
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                  e.preventDefault();
                  submit();
                }
              }}
              rows={12}
              className={`w-full resize-none rounded-xl border p-4 text-sm leading-relaxed outline-none transition-all ${
                isLight
                  ? 'border-slate-200 bg-slate-50 text-slate-800 placeholder:text-slate-400 focus:border-[#2f80ff] focus:bg-white'
                  : 'border-zinc-800 bg-zinc-950 text-zinc-100 placeholder:text-zinc-500 focus:border-[#2f80ff]'
              }`}
              placeholder={t('workbench.promptPlaceholder')}
            />

            <div className="flex items-center justify-between mt-4">
              <span className="text-xs opacity-60">
                {t('workbench.shortcutGenerate')}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsExpandedModalOpen(false)}
                  className={`px-4 py-2 rounded-xl text-xs font-medium border transition-colors cursor-pointer ${
                    isLight ? 'border-slate-200 hover:bg-slate-100' : 'border-zinc-700 hover:bg-zinc-800'
                  }`}
                >
                  {t('workbench.cropCancel')}
                </button>
                <button
                  type="button"
                  onClick={submit}
                  className="px-5 py-2 rounded-xl text-xs font-semibold bg-[#2f80ff] hover:bg-[#256ed9] text-white shadow-md cursor-pointer transition-all active:scale-95"
                >
                  {t('workbench.generateBtn')}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
};

import React, { useState } from 'react';
import {
  FolderPlus,
  Check,
  ImagePlus,
  Star,
  Copy,
  Download,
  FileText,
  ImageOff,
} from 'lucide-react';
import type { GeneratedImage, GenerationBatchTask } from '@/types';
import { useI18n } from '@/i18n';

export interface WorkbenchGalleryCardProps {
  image: GeneratedImage;
  task: GenerationBatchTask;
  onPreview: (img: GeneratedImage) => void;
  onSaveToGallery: (img: GeneratedImage, task: GenerationBatchTask) => void;
  onUseAsReference: (img: GeneratedImage) => void;
  onSaveToPrompts: (img: GeneratedImage, task: GenerationBatchTask) => void;
  onCopyImage: (img: GeneratedImage) => void;
  onDownload: (img: GeneratedImage) => void;
  isCopied: boolean;
}

export const WorkbenchGalleryCard: React.FC<WorkbenchGalleryCardProps> = ({
  image,
  task,
  onPreview,
  onSaveToGallery,
  onUseAsReference,
  onSaveToPrompts,
  onCopyImage,
  onDownload,
  isCopied,
}) => {
  const { t } = useI18n();
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);

  const handleCopyPrompt = async () => {
    const textToCopy = image.prompt || task.prompt;
    if (!textToCopy) return;
    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopiedPrompt(true);
      setTimeout(() => setCopiedPrompt(false), 2000);
    } catch (err) {
      console.warn('Failed to copy prompt:', err);
    }
  };

  const cardAspectRatio = image.aspectRatio ? image.aspectRatio.replace(':', '/') : '1/1';

  return (
    <div className="group relative rounded-xl overflow-hidden border border-zinc-200/80 bg-zinc-900 shadow-xs hover:shadow-md transition-all">
      {imageFailed ? (
        <div
          className="flex w-full items-center justify-center bg-zinc-100 text-zinc-300"
          style={{ aspectRatio: cardAspectRatio }}
        >
          <ImageOff className="h-6 w-6" />
        </div>
      ) : (
        <img
          src={image.dataUrl}
          alt={image.prompt || task.prompt}
          referrerPolicy="no-referrer"
          className="w-full object-cover transition-transform duration-300 group-hover:scale-102 cursor-pointer"
          style={{ aspectRatio: cardAspectRatio }}
          onClick={() => onPreview(image)}
          onError={() => setImageFailed(true)}
        />
      )}

      {/* Image Actions Bar */}
      {/* 两列网格里单张卡片只有约 130px 宽，操作按钮放不下一行时折行而不是被 overflow-hidden 裁掉 */}
      <div className="p-2 bg-white flex flex-wrap items-center justify-between gap-1 border-t border-zinc-100">
        <div className="flex items-center gap-1">
          {/* Save to gallery */}
          <button
            type="button"
            onClick={() => onSaveToGallery(image, task)}
            disabled={image.savedToGallery}
            className={`flex items-center gap-1 whitespace-nowrap rounded-md px-2 py-1 text-[10px] font-semibold transition-all shadow-2xs ${
              image.savedToGallery
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 cursor-default'
                : 'bg-zinc-900 text-white hover:bg-zinc-800 cursor-pointer'
            }`}
            title={image.savedToGallery ? t('generator.savedToGallery') : t('generator.saveToGallery')}
          >
            {image.savedToGallery ? (
              <>
                <Check className="h-3 w-3" />
                <span>{t('generator.savedToGallery')}</span>
              </>
            ) : (
              <>
                <FolderPlus className="h-3 w-3" />
                <span>{t('generator.saveToGallery')}</span>
              </>
            )}
          </button>

          {/* Flywheel: Use as reference image for next generation */}
          <button
            type="button"
            onClick={() => onUseAsReference(image)}
            className="flex items-center gap-1 rounded-md px-1.5 py-1 text-[10px] font-medium transition-all cursor-pointer border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 hover:border-zinc-300"
            title={t('generator.useAsReference')}
          >
            <ImagePlus className="h-3 w-3 text-sky-600" />
          </button>

          {/* Save to prompts */}
          <button
            type="button"
            onClick={() => onSaveToPrompts(image, task)}
            disabled={image.savedToPrompts}
            className={`flex items-center gap-1 rounded-md px-1.5 py-1 text-[10px] font-medium transition-all border ${
              image.savedToPrompts
                ? 'bg-amber-50 text-amber-700 border-amber-200 cursor-default'
                : 'bg-white text-zinc-600 border-zinc-200 hover:bg-zinc-50 cursor-pointer'
            }`}
            title={image.savedToPrompts ? t('generator.savedToPrompts') : t('generator.saveToPrompts')}
          >
            <Star
              className={`h-3 w-3 ${
                image.savedToPrompts ? 'fill-amber-400 text-amber-500' : ''
              }`}
            />
          </button>
        </div>

        <div className="ml-auto flex items-center gap-1">
          {/* Copy Prompt */}
          <button
            type="button"
            onClick={handleCopyPrompt}
            className="rounded-md p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 transition-colors cursor-pointer"
            title={copiedPrompt ? t('generator.copiedPrompt') : t('generator.copyPrompt')}
          >
            {copiedPrompt ? (
              <Check className="h-3.5 w-3.5 text-emerald-600" />
            ) : (
              <FileText className="h-3.5 w-3.5" />
            )}
          </button>

          {/* Copy image */}
          <button
            type="button"
            onClick={() => onCopyImage(image)}
            className="rounded-md p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 transition-colors cursor-pointer"
            title={t('generator.copyImage')}
          >
            {isCopied ? (
              <Check className="h-3.5 w-3.5 text-emerald-600" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
          </button>

          {/* Download */}
          <button
            type="button"
            onClick={() => onDownload(image)}
            className="rounded-md p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 transition-colors cursor-pointer"
            title={t('generator.download')}
          >
            <Download className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};

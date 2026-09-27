import React, { useRef, useState, useEffect } from 'react';
import { ImagePlus, ClipboardPaste, Upload, X, AlertCircle, Sparkles } from 'lucide-react';
import { useI18n } from '@/i18n';
import { readFileAsDataUrl } from '@/utils/file';

export interface ReferenceImagesTrayProps {
  referenceImages: string[];
  onAddImages: (urls: string[]) => void;
  onRemoveImage: (index: number) => void;
  onSetPrimary: (index: number) => void;
  onClearAll: () => void;
  onPreview: (url: string) => void;
  sendAsRef: boolean;
  onToggleSendAsRef: (val: boolean) => void;
  onReversePrompt?: (imageUrl: string) => void;
  isReversingPrompt?: boolean;
  disabled?: boolean;
  supportsImageToImage?: boolean;
  modelName?: string;
  onShowFeedback?: (msg: string) => void;
}

export const ReferenceImagesTray: React.FC<ReferenceImagesTrayProps> = ({
  referenceImages,
  onAddImages,
  onRemoveImage,
  onSetPrimary,
  onClearAll,
  onPreview,
  sendAsRef,
  onToggleSendAsRef,
  onReversePrompt,
  isReversingPrompt = false,
  disabled = false,
  supportsImageToImage = true,
  modelName = '',
  onShowFeedback,
}) => {
  const { t } = useI18n();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  // Auto defense: if model doesn't support image-to-image, automatically disable sendAsRef
  useEffect(() => {
    if (!supportsImageToImage && sendAsRef) {
      onToggleSendAsRef(false);
    }
  }, [supportsImageToImage, sendAsRef, onToggleSendAsRef]);

  const handleUploadFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const newUrls: string[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file && file.type.startsWith('image/')) {
        try {
          const dataUrl = await readFileAsDataUrl(file);
          newUrls.push(dataUrl);
        } catch (err) {
          console.warn('Failed to read image file:', err);
        }
      }
    }
    if (newUrls.length > 0) {
      onAddImages(newUrls);
    }
  };

  const handlePasteClipboard = async () => {
    try {
      if (!navigator.clipboard?.read) {
        onShowFeedback?.(t('generator.clipboardNotSupported'));
        return;
      }
      const items = await navigator.clipboard.read();
      const newUrls: string[] = [];
      for (const item of items) {
        const imageType = item.types.find((type) => type.startsWith('image/'));
        if (imageType) {
          const blob = await item.getType(imageType);
          const dataUrl = await readFileAsDataUrl(blob);
          newUrls.push(dataUrl);
        }
      }
      if (newUrls.length > 0) {
        onAddImages(newUrls);
      } else {
        onShowFeedback?.(t('generator.clipboardNoImage'));
      }
    } catch (err) {
      console.warn('Clipboard read error:', err);
      onShowFeedback?.(t('generator.clipboardReadFailed') + (err instanceof Error ? err.message : String(err)));
    }
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center">
        <div className="flex items-center gap-1.5">
          <label className="text-[11px] font-semibold text-zinc-700">
            {t('generator.referenceImage')}
          </label>
          {referenceImages.length > 0 && (
            <span className="text-[10px] font-mono text-zinc-500 bg-zinc-100 px-1.5 py-0.2 rounded">
              {referenceImages.length}
            </span>
          )}
        </div>

      </div>

      {/* Actions use their own row so labels remain readable in a narrow side panel. */}
      <div className={`grid gap-1 ${referenceImages.length > 0 && onReversePrompt ? 'grid-cols-3' : 'grid-cols-2'}`}>
          {referenceImages.length > 0 && onReversePrompt && (
            <button
              type="button"
              onClick={() => onReversePrompt(referenceImages[0]!)}
              disabled={disabled || isReversingPrompt}
              className="flex min-w-0 items-center justify-center gap-1 rounded-lg border border-sky-200/90 bg-sky-50 px-1 py-1.5 text-[10px] font-bold leading-tight text-sky-700 shadow-2xs transition-all hover:bg-sky-100 active:scale-95 cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
              title={t('generator.reverseFromRef')}
            >
              <Sparkles className={`h-2.5 w-2.5 text-sky-500 ${isReversingPrompt ? 'animate-spin' : ''}`} />
              <span>{isReversingPrompt ? t('generator.reversingRef') : t('generator.reverseFromRef')}</span>
            </button>
          )}
          <button
            type="button"
            onClick={handlePasteClipboard}
            disabled={disabled}
            className="flex min-w-0 items-center justify-center gap-1 rounded-lg bg-zinc-100 px-1 py-1.5 text-[10px] font-medium leading-tight text-zinc-600 transition-colors hover:bg-zinc-200 hover:text-zinc-900 cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
            title={t('generator.pasteClipboardTitle')}
          >
            <ClipboardPaste className="h-2.5 w-2.5" />
            <span>{t('generator.pasteClipboard')}</span>
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled}
            className="flex min-w-0 items-center justify-center gap-1 rounded-lg bg-zinc-100 px-1 py-1.5 text-[10px] font-medium leading-tight text-zinc-600 transition-colors hover:bg-zinc-200 hover:text-zinc-900 cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
            title={t('generator.uploadImagesTitle')}
          >
            <Upload className="h-2.5 w-2.5" />
            <span>{t('generator.uploadImage')}</span>
          </button>
      </div>

      {/* Model image-to-image warning banner */}
      {!supportsImageToImage && referenceImages.length > 0 && (
        <div className="flex items-center gap-1.5 px-2 py-1 bg-amber-50 border border-amber-200/70 rounded-lg text-[10px] text-amber-800">
          <AlertCircle className="h-3 w-3 shrink-0 text-amber-600" />
          <span>{t('generator.modelNoImageToImage', { model: modelName || 'AI' })}</span>
        </div>
      )}

      {/* Drop area & Reference images gallery */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragOver(true);
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragOver(false);
          handleUploadFiles(e.dataTransfer.files);
        }}
        className={`rounded-xl border transition-all p-2 ${
          isDragOver
            ? 'border-zinc-900 bg-zinc-100/80 ring-2 ring-zinc-900/10'
            : referenceImages.length > 0
            ? 'border-zinc-200/80 bg-zinc-50/50'
            : 'border-dashed border-zinc-200 bg-zinc-50/30'
        }`}
      >
        {referenceImages.length > 0 ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
              {referenceImages.map((imgUrl, index) => (
                <div
                  key={`${index}_${imgUrl.slice(0, 32)}`}
                  className="group relative h-14 w-14 shrink-0 rounded-lg overflow-hidden border border-zinc-200 bg-zinc-100 shadow-2xs"
                >
                  <div className="absolute inset-0 flex items-center justify-center bg-zinc-100 text-zinc-300">
                    <ImagePlus className="h-5 w-5 opacity-40" />
                  </div>
                  <img
                    src={imgUrl}
                    alt={`Reference ${index + 1}`}
                    referrerPolicy="no-referrer"
                    className="relative h-full w-full object-cover cursor-pointer"
                    onClick={() => onPreview(imgUrl)}
                    onError={(e) => {
                      e.currentTarget.style.opacity = '0';
                    }}
                  />
                  <span
                    onClick={() => onSetPrimary(index)}
                    title={index === 0 ? t('generator.mainReferenceBadge') : t('generator.setAsMainRef')}
                    className={`absolute left-1 top-1 rounded px-1 text-[8px] font-mono leading-tight cursor-pointer ${
                      index === 0 ? 'bg-sky-600 text-white font-bold' : 'bg-black/70 text-zinc-300 hover:bg-black'
                    }`}
                  >
                    {index === 0 ? t('generator.mainReferenceBadge') : `#${index + 1}`}
                  </span>
                  <button
                    type="button"
                    onClick={() => onRemoveImage(index)}
                    className="absolute right-1 top-1 hidden group-hover:flex h-4 w-4 items-center justify-center rounded-full bg-black/70 text-white hover:bg-red-600 transition-colors cursor-pointer"
                    title={t('generator.removeRef')}
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between pt-1 border-t border-zinc-200/60 text-[10px]">
              <label
                className={`inline-flex items-center gap-1.5 select-none ${
                  !supportsImageToImage
                    ? 'text-zinc-400 cursor-not-allowed'
                    : 'text-zinc-600 cursor-pointer'
                }`}
                title={!supportsImageToImage ? t('generator.modelNoImageToImage', { model: modelName || 'AI' }) : undefined}
              >
                <input
                  type="checkbox"
                  disabled={disabled || !supportsImageToImage}
                  checked={supportsImageToImage && sendAsRef}
                  onChange={(e) => onToggleSendAsRef(e.target.checked)}
                  className="h-3 w-3 rounded accent-zinc-900 cursor-pointer disabled:cursor-not-allowed"
                />
                <span>{t('generator.useAsImageToImage')}</span>
              </label>

              <button
                type="button"
                onClick={onClearAll}
                className="text-zinc-400 hover:text-red-600 transition-colors cursor-pointer"
              >
                {t('generator.clearReferences')}
              </button>
            </div>
          </div>
        ) : (
          <div
            onClick={() => fileInputRef.current?.click()}
            className="py-3 text-center text-xs text-zinc-400 hover:text-zinc-600 transition-colors cursor-pointer flex flex-col items-center gap-1"
          >
            <ImagePlus className="h-4 w-4 opacity-50" />
            <span className="text-[11px]">{t('generator.noReferences')}</span>
          </div>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          handleUploadFiles(e.target.files);
          e.target.value = '';
        }}
      />
    </div>
  );
};

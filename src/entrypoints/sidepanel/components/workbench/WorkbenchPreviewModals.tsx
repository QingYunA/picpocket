import React from 'react';
import { X, ImagePlus, Copy, Download } from 'lucide-react';
import type { GeneratedImage } from '@/types';
import { useI18n } from '@/i18n';

export interface WorkbenchPreviewModalsProps {
  previewRefUrl: string | null;
  onCloseRefPreview: () => void;
  previewImage: GeneratedImage | null;
  onCloseImagePreview: () => void;
  onUseAsReference: (img: GeneratedImage) => void;
  onCopyImage: (img: GeneratedImage) => void;
  onDownload: (img: GeneratedImage) => void;
}

export const WorkbenchPreviewModals: React.FC<WorkbenchPreviewModalsProps> = ({
  previewRefUrl,
  onCloseRefPreview,
  previewImage,
  onCloseImagePreview,
  onUseAsReference,
  onCopyImage,
  onDownload,
}) => {
  const { t } = useI18n();

  return (
    <>
      {/* Reference Image Large Preview Modal */}
      {previewRefUrl && (
        <div
          onClick={onCloseRefPreview}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative max-h-[85vh] max-w-md rounded-2xl overflow-hidden bg-zinc-950 shadow-2xl border border-zinc-800 animate-in zoom-in-95"
          >
            <button
              type="button"
              onClick={onCloseRefPreview}
              className="absolute right-3 top-3 z-10 rounded-full bg-black/50 p-1.5 text-white hover:bg-black/80 transition-colors cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
            <img
              src={previewRefUrl}
              alt="Reference Preview"
              className="max-h-[80vh] w-auto object-contain mx-auto"
            />
          </div>
        </div>
      )}

      {/* Generated Image Fullscreen Preview Modal */}
      {previewImage && (
        <div
          onClick={onCloseImagePreview}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative max-h-[90vh] max-w-lg rounded-2xl overflow-hidden bg-zinc-950 shadow-2xl border border-zinc-800 animate-in zoom-in-95"
          >
            <button
              type="button"
              onClick={onCloseImagePreview}
              className="absolute right-3 top-3 z-10 rounded-full bg-black/50 p-1.5 text-white hover:bg-black/80 transition-colors cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
            <img
              src={previewImage.dataUrl}
              alt="Enlarged preview"
              className="max-h-[75vh] w-auto object-contain mx-auto"
            />
            <div className="p-4 bg-zinc-900 text-white space-y-2">
              <p className="text-xs text-zinc-300 leading-relaxed font-sans">{previewImage.prompt}</p>
              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => onUseAsReference(previewImage)}
                  className="flex items-center gap-1 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-700 transition-colors cursor-pointer"
                >
                  <ImagePlus className="h-3.5 w-3.5 text-sky-400" />
                  <span>{t('generator.useAsReference')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => onCopyImage(previewImage)}
                  className="flex items-center gap-1 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-700 transition-colors cursor-pointer"
                >
                  <Copy className="h-3 w-3" />
                  <span>{t('generator.copyImage')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => onDownload(previewImage)}
                  className="flex items-center gap-1 rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-zinc-900 hover:bg-zinc-200 transition-colors cursor-pointer"
                >
                  <Download className="h-3 w-3" />
                  <span>{t('generator.download')}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

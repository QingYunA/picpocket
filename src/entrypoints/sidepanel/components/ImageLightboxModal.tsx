import React, { useState, useEffect } from 'react';
import { X, Copy, Download, Check, Sparkles, Maximize2 } from 'lucide-react';
import { useI18n } from '@/i18n';
import type { InspirationItem } from '@/types';
import { db } from '@/db';
import { isAiGeneratedItem, isAgentCollabItem } from '@/utils/itemHelpers';

export interface ImageLightboxModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: InspirationItem | null;
  masterPrompt?: string;
}

export const ImageLightboxModal: React.FC<ImageLightboxModalProps> = ({
  isOpen,
  onClose,
  item,
  masterPrompt,
}) => {
  const { t } = useI18n();
  const [imageUrl, setImageUrl] = useState<string>('');
  const [resolvedPrompt, setResolvedPrompt] = useState<string>(masterPrompt || '');
  const [copiedImage, setCopiedImage] = useState(false);
  const [copiedPrompt, setCopiedPrompt] = useState(false);

  useEffect(() => {
    if (!isOpen || !item) {
      setImageUrl('');
      setResolvedPrompt('');
      return;
    }
    const blob = item.originalBlob || item.thumbnailBlob;
    let url = '';
    if (blob) {
      url = URL.createObjectURL(blob);
      setImageUrl(url);
    }

    if (masterPrompt) {
      setResolvedPrompt(masterPrompt);
    } else if (item.id) {
      db.prompts
        .where('itemId')
        .equals(item.id)
        .first()
        .then((res) => {
          if (res?.masterPrompt) {
            setResolvedPrompt(res.masterPrompt);
          } else {
            setResolvedPrompt(item.pageTitle || '');
          }
        })
        .catch(() => {
          setResolvedPrompt(item.pageTitle || '');
        });
    } else {
      setResolvedPrompt(item.pageTitle || '');
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      if (url) URL.revokeObjectURL(url);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, item, masterPrompt, onClose]);

  if (!isOpen || !item) return null;

  const handleCopyImage = async () => {
    try {
      const blob = item.originalBlob || item.thumbnailBlob;
      if (!blob) return;

      // Ensure blob is PNG or supported image type for clipboard
      const clipboardItem = new ClipboardItem({ [blob.type || 'image/png']: blob });
      await navigator.clipboard.write([clipboardItem]);
      setCopiedImage(true);
      setTimeout(() => setCopiedImage(false), 2000);
    } catch (err) {
      console.warn('Direct image clipboard copy failed:', err);
      // Fallback: If clipboard write was blocked or unsupported, copy prompt text
      if (resolvedPrompt) {
        try {
          await navigator.clipboard.writeText(resolvedPrompt);
          setCopiedPrompt(true);
          setTimeout(() => setCopiedPrompt(false), 2000);
        } catch {
          // ignore
        }
      }
    }
  };

  const handleDownload = () => {
    if (!imageUrl) return;
    const a = document.createElement('a');
    a.href = imageUrl;
    a.download = `picpocket-${item.id || Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleCopyPrompt = () => {
    const text = resolvedPrompt || item.pageTitle || '';
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedPrompt(true);
    setTimeout(() => setCopiedPrompt(false), 2000);
  };

  const displayPrompt = resolvedPrompt.trim();
  const isAgent = isAgentCollabItem(item);
  const isAi = isAiGeneratedItem(item);
  const isAnalyzed = item.status === 'analyzed';
  const hasRealPrompt = Boolean(masterPrompt || (resolvedPrompt && (isAi || isAnalyzed)));

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex flex-col justify-between bg-black/85 backdrop-blur-md p-3 select-none animate-in fade-in duration-200"
    >
      {/* Top Action Bar */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex h-11 shrink-0 items-center justify-between px-2 text-white"
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="flex shrink-0 whitespace-nowrap items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 font-mono text-[10px] text-zinc-300 border border-white/10">
            <Maximize2 className="h-3 w-3 text-sky-400 shrink-0" />
            {item.width && item.height ? `${item.width} × ${item.height}` : t('inspector.originalBadge')}
          </span>
          {item.pageTitle && (
            <span className="truncate text-xs font-medium text-zinc-300 max-w-[180px]">
              {item.pageTitle}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={handleCopyImage}
            className="flex items-center gap-1 rounded-lg bg-white/10 hover:bg-white/20 px-2.5 py-1 text-xs text-white transition-colors cursor-pointer shrink-0"
            title={t('gallery.copyImage')}
          >
            {copiedImage ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
            <span className="hidden sm:inline">{copiedImage ? t('common.copied') : t('gallery.copyImage')}</span>
          </button>

          <button
            onClick={handleDownload}
            className="flex items-center gap-1 rounded-lg bg-white/10 hover:bg-white/20 px-2.5 py-1 text-xs text-white transition-colors cursor-pointer shrink-0"
            title={t('common.download')}
          >
            <Download className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{t('common.download')}</span>
          </button>

          <button
            onClick={onClose}
            className="rounded-lg bg-white/15 hover:bg-white/30 p-1.5 text-white transition-colors cursor-pointer ml-1 shrink-0"
            title={`${t('common.close')} (Esc)`}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Main Image Container */}
      <div
        onClick={onClose}
        className="flex flex-1 items-center justify-center p-2 min-h-0 overflow-hidden"
      >
        {imageUrl && (
          <img
            onClick={(e) => e.stopPropagation()}
            src={imageUrl}
            alt={item.pageTitle || t('gallery.untitled')}
            referrerPolicy="no-referrer"
            onError={(e) => {
              (e.currentTarget as HTMLElement).style.opacity = '0.5';
            }}
            className="max-h-[72vh] max-w-[calc(100vw-24px)] object-contain rounded-xl shadow-2xl border border-white/10"
          />
        )}
      </div>

      {/* Bottom Info & Prompt Bar */}
      {displayPrompt ? (
        <div
          onClick={(e) => e.stopPropagation()}
          className="rounded-xl border border-white/10 bg-zinc-900/90 p-2.5 text-white shadow-xl space-y-1 max-w-[calc(100vw-24px)] mx-auto w-full"
        >
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-semibold text-zinc-300 flex items-center gap-1.5 shrink-0">
              <Sparkles className="h-3 w-3 text-amber-400 shrink-0" />
              <span>
                {hasRealPrompt
                  ? isAgent
                    ? t('gallery.statusAgent')
                    : isAi
                    ? t('gallery.statusGenerated')
                    : isAnalyzed
                    ? t('gallery.statusAnalyzed')
                    : t('gallery.originalPromptTitle')
                  : t('gallery.imageDetails')}
              </span>
            </span>
            <button
              onClick={handleCopyPrompt}
              className="flex items-center gap-1 text-[10px] text-sky-400 hover:text-sky-300 transition-colors cursor-pointer shrink-0"
            >
              {copiedPrompt ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              <span>{copiedPrompt ? t('common.copied') : hasRealPrompt ? t('inspector.copyMaster') : t('common.copy')}</span>
            </button>
          </div>
          <p className="text-[11px] leading-relaxed text-zinc-300 line-clamp-2 select-text font-sans">
            {displayPrompt}
          </p>
        </div>
      ) : (
        <div className="h-2" />
      )}
    </div>
  );
};

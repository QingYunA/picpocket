import React, { useState } from 'react';
import {
  ArrowLeft,
  Copy,
  Check,
  Star,
  ExternalLink,
  Layers,
  Sparkles,
  Info,
  Wand2,
} from 'lucide-react';
import type { PromptItem } from '@/types';
import { toggleFavoritePrompt } from '@/db';
import { useI18n } from '@/i18n';

interface PromptDetailDrawerProps {
  item: PromptItem;
  onBack: () => void;
  onGenerate?: (item: PromptItem) => void;
}

export const PromptDetailDrawer: React.FC<PromptDetailDrawerProps> = ({ item, onBack, onGenerate }) => {
  const { t } = useI18n();
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [copiedBlock, setCopiedBlock] = useState<string | null>(null);
  const [isFav, setIsFav] = useState(Boolean(item.isFavorite));
  const [activeImage, setActiveImage] = useState<string>(
    item.coverUrl || item.referenceImageUrls?.[0] || ''
  );

  const handleCopyPrompt = () => {
    navigator.clipboard.writeText(item.prompt);
    setCopiedPrompt(true);
    setTimeout(() => setCopiedPrompt(false), 2000);
  };

  const handleCopyBlock = (text: string, blockName: string) => {
    navigator.clipboard.writeText(text);
    setCopiedBlock(blockName);
    setTimeout(() => setCopiedBlock(null), 1800);
  };

  const handleToggleFav = async () => {
    const updated = await toggleFavoritePrompt(item.id);
    setIsFav(updated);
  };

  const allImages = Array.from(
    new Set([item.coverUrl, ...(item.referenceImageUrls || [])].filter(Boolean))
  ) as string[];

  return (
    <div className="flex h-full w-full flex-col bg-white text-zinc-900 overflow-hidden animate-in slide-in-from-right-4 duration-200">
      {/* Header */}
      <div className="flex h-13 shrink-0 items-center justify-between border-b border-zinc-100 px-4">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 transition-colors cursor-pointer"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>{t('inspector.galleryBack')}</span>
        </button>

        <div className="flex items-center gap-1.5">
          {/* External Github / Source Link */}
          {item.githubUrl && (
            <a
              href={item.githubUrl}
              target="_blank"
              rel="noreferrer"
              className="rounded-md p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 transition-colors"
              title={t('prompts.sourceHome')}
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}

          {/* Favorite Toggle */}
          <button
            onClick={handleToggleFav}
            className={`rounded-md p-1.5 transition-colors cursor-pointer ${
              isFav ? 'text-amber-500 hover:bg-amber-50' : 'text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700'
            }`}
            title={isFav ? t('prompts.unfavorite') : t('prompts.favorite')}
          >
            <Star className={`h-4 w-4 ${isFav ? 'fill-current' : ''}`} />
          </button>
        </div>
      </div>

      {/* Main Scrollable Content */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {/* Main Preview Image */}
        {activeImage && (
          <div className="space-y-2">
            <div className="relative aspect-4/3 w-full overflow-hidden rounded-xl border border-zinc-200 bg-zinc-50 shadow-2xs">
              <img
                src={activeImage}
                alt={item.title}
                className="h-full w-full object-contain"
              />
            </div>

            {/* Multiple Reference Images Thumbnails */}
            {allImages.length > 1 && (
              <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
                {allImages.map((img, idx) => (
                  <button
                    key={idx}
                    onClick={() => setActiveImage(img)}
                    className={`relative h-12 w-12 shrink-0 overflow-hidden rounded-lg border transition-all cursor-pointer ${
                      activeImage === img
                        ? 'border-zinc-900 ring-2 ring-zinc-900/10 scale-95'
                        : 'border-zinc-200 opacity-70 hover:opacity-100'
                    }`}
                  >
                    <img src={img} alt={`Ref ${idx}`} className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Title, Category & Metadata */}
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="rounded-full bg-zinc-900 px-2 py-0.5 text-[10px] font-semibold text-white">
              {item.category === 'my-vault' ? t('prompts.myVault') : item.category}
            </span>
            {item.isCustom && (
              <span className="flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-800 border border-amber-200">
                <Sparkles className="h-2.5 w-2.5 text-amber-500" />
                <span>{t('prompts.myVault')}</span>
              </span>
            )}
            {item.author && (
              <span className="text-[10px] text-zinc-400">by @{item.author}</span>
            )}
          </div>

          <h2 className="text-base font-bold tracking-tight text-zinc-900">
            {item.title}
          </h2>

          {item.description && (
            <p className="text-xs text-zinc-500 leading-relaxed">
              {item.description}
            </p>
          )}

          {/* Tags */}
          {item.tags && item.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {item.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-md border border-zinc-200/80 bg-zinc-50 px-2 py-0.5 text-[10px] font-medium text-zinc-600"
                >
                  #{tag}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* 4D Prompt Blocks (If available from reverse-engineering) */}
        {item.blocks && (
          <div className="space-y-2 rounded-xl border border-zinc-200 bg-zinc-50/50 p-3.5">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-900">
              <Layers className="h-3.5 w-3.5 text-sky-500" />
              <span>{t('prompts.blocksTitle')}</span>
            </div>

            <div className="grid grid-cols-1 gap-2 pt-1">
              {[
                { key: 'subject', label: t('inspector.subjectTitle'), list: item.blocks.subject },
                { key: 'style', label: t('inspector.styleTitle'), list: item.blocks.style },
                { key: 'lighting', label: t('inspector.lightingTitle'), list: item.blocks.lighting },
                { key: 'composition', label: t('inspector.compositionTitle'), list: item.blocks.composition },
              ].map(({ key, label, list }) => {
                if (!list || list.length === 0) return null;
                return (
                  <BlockRow
                    key={key}
                    label={label}
                    items={list}
                    copiedRow={copiedBlock === key}
                    onCopyRow={() => handleCopyBlock(list.join(', '), key)}
                    onCopySingle={(singleText) => handleCopyBlock(singleText, `single-${singleText}`)}
                    copiedSingleKey={copiedBlock}
                  />
                );
              })}
            </div>
          </div>
        )}

        {/* Prompt Content Box */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs font-semibold text-zinc-700">
            <span>{t('prompts.promptText')}</span>
            <span className="text-[10px] font-normal text-zinc-400">
              {t('prompts.charCount', { count: item.prompt.length })}
            </span>
          </div>

          <div className="relative rounded-xl border border-zinc-200 bg-zinc-900 p-3 text-white font-mono text-xs leading-relaxed select-all">
            <p className="text-zinc-200 break-words whitespace-pre-wrap">{item.prompt}</p>
          </div>
        </div>

        {/* Generation Mode / Model Info (If present) */}
        {(item.imageModel || item.imageMode || item.imageSize) && (
          <div className="flex items-center gap-3 text-[11px] text-zinc-400 font-mono bg-zinc-50 p-2.5 rounded-lg border border-zinc-200">
            <Info className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
            <div className="flex flex-wrap gap-2">
              {item.imageModel && <span>Model: {item.imageModel}</span>}
              {item.imageMode && <span>Mode: {item.imageMode}</span>}
              {item.imageSize && <span>Size: {item.imageSize}</span>}
            </div>
          </div>
        )}
      </div>

      {/* Footer Actions */}
      <div className="border-t border-zinc-100 p-3 bg-white space-y-2">
        {onGenerate && (
          <button
            onClick={() => onGenerate(item)}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-zinc-900 via-zinc-800 to-zinc-900 py-2.5 text-xs font-bold text-white hover:opacity-95 transition-all active:scale-[0.99] shadow-sm cursor-pointer"
          >
            <Wand2 className="h-4 w-4 text-amber-300" />
            <span>{t('prompts.generateNow')}</span>
          </button>
        )}

        <button
          onClick={handleCopyPrompt}
          className="w-full flex items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-white py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 transition-all active:scale-[0.99] cursor-pointer shadow-2xs"
        >
          {copiedPrompt ? (
            <>
              <Check className="h-3.5 w-3.5 text-emerald-500" />
              <span>{t('prompts.copiedPrompt')}</span>
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5" />
              <span>{t('prompts.copyAll')}</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};

function BlockRow({
  label,
  items,
  copiedRow,
  onCopyRow,
  onCopySingle,
  copiedSingleKey,
}: {
  label: string;
  items: string[];
  copiedRow: boolean;
  onCopyRow: () => void;
  onCopySingle: (text: string) => void;
  copiedSingleKey: string | null;
}) {
  return (
    <div className="flex items-start justify-between gap-2 rounded-lg bg-white border border-zinc-200/80 p-2 text-xs">
      <div className="space-y-1 flex-1">
        <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">
          {label}
        </span>
        <div className="flex flex-wrap gap-1">
          {items.map((it, i) => {
            const isCopied = copiedSingleKey === `single-${it}`;
            return (
              <button
                key={i}
                type="button"
                onClick={() => onCopySingle(it)}
                className={`group flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[11px] font-medium transition-all cursor-pointer border ${
                  isCopied
                    ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                    : 'border-zinc-200/60 bg-zinc-100/80 text-zinc-700 hover:border-zinc-300 hover:bg-zinc-200/80'
                }`}
                title={`点击复制: ${it}`}
              >
                <span>{it}</span>
                {isCopied ? (
                  <Check className="h-2.5 w-2.5 text-emerald-600" />
                ) : (
                  <span className="text-[9px] text-zinc-300 group-hover:text-zinc-500">＋</span>
                )}
              </button>
            );
          })}
        </div>
      </div>
      <button
        onClick={onCopyRow}
        className="shrink-0 p-1 text-zinc-400 hover:text-zinc-800 transition-colors cursor-pointer rounded hover:bg-zinc-100"
        title="复制整行"
      >
        {copiedRow ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
      </button>
    </div>
  );
}

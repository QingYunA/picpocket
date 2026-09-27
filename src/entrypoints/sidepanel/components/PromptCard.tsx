import React, { useState } from 'react';
import { Copy, Check, Star, Sparkles, Image as ImageIcon, Wand2 } from 'lucide-react';
import type { PromptItem } from '@/types';
import { toggleFavoritePrompt } from '@/db';

import { useI18n } from '@/i18n';

interface PromptCardProps {
  item: PromptItem;
  onClick: () => void;
  onGenerate?: (item: PromptItem) => void;
}

export const PromptCard: React.FC<PromptCardProps> = ({ item, onClick, onGenerate }) => {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const [isFav, setIsFav] = useState(Boolean(item.isFavorite));
  const [imgError, setImgError] = useState(false);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(item.prompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const handleToggleFav = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = await toggleFavoritePrompt(item.id);
    setIsFav(updated);
  };

  const displayImage = !imgError ? item.coverUrl || item.referenceImageUrls?.[0] : null;
  const displayCategory = item.category === 'my-vault' ? t('prompts.myVault') : item.category;

  return (
    <div
      onClick={onClick}
      className="group relative flex flex-col overflow-hidden rounded-lg border border-zinc-200 bg-white hover:border-zinc-900 transition-all cursor-pointer shadow-2xs hover:shadow-xs"
    >
      {/* Thumbnail or Fallback */}
      <div className="relative aspect-4/3 w-full overflow-hidden bg-zinc-100 flex items-center justify-center">
        {displayImage ? (
          <img
            src={displayImage}
            alt={item.title}
            onError={() => setImgError(true)}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-103"
            loading="lazy"
          />
        ) : (
          <div className="flex flex-col items-center justify-center text-zinc-400 p-2 text-center">
            <ImageIcon className="h-6 w-6 mb-1 text-zinc-300" />
            <span className="text-[10px] line-clamp-1 font-mono">{displayCategory}</span>
          </div>
        )}

        {/* Category Pill */}
        <div className="absolute top-1.5 left-1.5">
          <span className="inline-flex items-center gap-1 rounded-full bg-black/60 backdrop-blur-xs px-1.5 py-0.5 text-[9px] font-medium text-white shadow-2xs">
            {item.isCustom && <Sparkles className="h-2.5 w-2.5 text-amber-400" />}
            <span className="max-w-[80px] truncate">{displayCategory}</span>
          </span>
        </div>

        {/* Favorite Star Button */}
        <button
          onClick={handleToggleFav}
          className={`absolute top-1.5 right-1.5 rounded-full p-1 transition-colors cursor-pointer ${
            isFav
              ? 'bg-amber-400 text-white shadow-xs'
              : 'bg-white/80 text-zinc-400 hover:text-amber-500 backdrop-blur-xs shadow-2xs'
          }`}
          title={isFav ? t('prompts.unfavorite') : t('prompts.favorite')}
        >
          <Star className={`h-3 w-3 ${isFav ? 'fill-current' : ''}`} />
        </button>

        {/* Actions Bar (Hovered) */}
        <div className="absolute bottom-1.5 right-1.5 flex items-center gap-1">
          {onGenerate && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onGenerate(item);
              }}
              className="rounded-md bg-zinc-900/90 hover:bg-zinc-900 text-white p-1.5 shadow-md backdrop-blur-xs transition-transform active:scale-95 cursor-pointer opacity-90 group-hover:opacity-100"
              title={t('prompts.generateNow')}
            >
              <Wand2 className="h-3 w-3 text-amber-300" />
            </button>
          )}

          <button
            onClick={handleCopy}
            className="rounded-md bg-zinc-900/90 hover:bg-zinc-900 text-white p-1.5 shadow-md backdrop-blur-xs transition-transform active:scale-95 cursor-pointer opacity-90 group-hover:opacity-100"
            title={copied ? t('prompts.copiedPrompt') : t('prompts.copyPrompt')}
          >
            {copied ? (
              <Check className="h-3 w-3 text-emerald-400" />
            ) : (
              <Copy className="h-3 w-3" />
            )}
          </button>
        </div>
      </div>

      {/* Title & Preview Content */}
      <div className="p-2 space-y-1">
        <h3 className="truncate text-xs font-semibold text-zinc-900 leading-tight">
          {item.title}
        </h3>
        <p className="line-clamp-2 text-[11px] text-zinc-500 leading-snug">
          {item.prompt}
        </p>

        {/* Tags */}
        {item.tags && item.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-1">
            {item.tags.slice(0, 2).map((tag) => (
              <span
                key={tag}
                className="rounded bg-zinc-100 px-1 py-0.2 text-[9px] text-zinc-500 font-medium"
              >
                #{tag}
              </span>
            ))}
            {item.tags.length > 2 && (
              <span className="text-[9px] text-zinc-400">+{item.tags.length - 2}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

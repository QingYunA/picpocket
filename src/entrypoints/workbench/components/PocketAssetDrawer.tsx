import React, { useState, useMemo, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Folder,
  Search,
  X,
  Plus,
  Image as ImageIcon,
  Sparkles,
} from 'lucide-react';
import { db } from '@/db';
import type { InspirationItem, FolderItem } from '@/types';
import { useI18n } from '@/i18n';
import { readFileAsDataUrl } from '@/utils/file';
import type { CanvasTheme } from '../types';

interface PocketAssetDrawerProps {
  isOpen: boolean;
  theme: CanvasTheme;
  onClose: () => void;
  onAddImageToCanvas: (dataUrl: string, item: InspirationItem) => void;
  onSetAsReference: (imageUrl: string) => void;
}

export const PocketAssetDrawer: React.FC<PocketAssetDrawerProps> = ({
  isOpen,
  theme,
  onClose,
  onAddImageToCanvas,
  onSetAsReference,
}) => {
  const { t } = useI18n();
  const [selectedFolderId, setSelectedFolderId] = useState<number | 'uncategorized' | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [dataUrlMap, setDataUrlMap] = useState<Record<number, string>>({});

  // 1. 实时读取文件夹列表
  const folders: FolderItem[] = useLiveQuery(() => db.folders.toArray(), []) || [];

  // 2. 实时读取素材图片列表 (取最近 200 条)
  const items: InspirationItem[] =
    useLiveQuery(
      () => db.items.orderBy('createdAt').reverse().limit(200).toArray(),
      []
    ) || [];

  // 异步将 Blob 转换为 DataURL 缓存 (遵循 AGENTS.md 规范：杜绝跨组件传递临时 Blob URL)
  useEffect(() => {
    let isCancelled = false;
    items.forEach((item) => {
      if (item.id && !dataUrlMap[item.id]) {
        const blob = item.thumbnailBlob || item.originalBlob;
        readFileAsDataUrl(blob)
          .then((url) => {
            if (!isCancelled) {
              setDataUrlMap((prev) => ({ ...prev, [item.id!]: url }));
            }
          })
          .catch(() => {});
      }
    });
    return () => {
      isCancelled = true;
    };
  }, [items, dataUrlMap]);

  // 过滤后的列表
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      // 文件夹过滤
      if (selectedFolderId !== null) {
        if (selectedFolderId === 'uncategorized') {
          if (item.folderId) return false;
        } else if (item.folderId !== selectedFolderId) {
          return false;
        }
      }
      // 搜索词过滤
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const titleMatch = (item.pageTitle || '').toLowerCase().includes(q);
        const tagMatch = item.tags?.some((tag) => tag.toLowerCase().includes(q));
        if (!titleMatch && !tagMatch) return false;
      }
      return true;
    });
  }, [items, selectedFolderId, searchQuery]);

  if (!isOpen) return null;

  const isLight = theme === 'light';

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, item: InspirationItem) => {
    const targetUrl = item.id ? dataUrlMap[item.id] || '' : '';
    if (!targetUrl) return;

    e.dataTransfer.setData('text/plain', targetUrl);
    e.dataTransfer.setData(
      'application/x-picpocket-item',
      JSON.stringify({
        id: item.id ? `item_${item.id}` : undefined,
        url: targetUrl,
        prompt: item.pageTitle || '',
        width: item.width || 1024,
        height: item.height || 1024,
      })
    );
    e.dataTransfer.effectAllowed = 'copy';
  };

  return (
    <aside
      className={`fixed top-14 left-0 bottom-0 w-80 max-w-[calc(100vw-32px)] z-30 flex flex-col shadow-2xl border-r backdrop-blur-xl transition-all duration-200 animate-in slide-in-from-left-4 ${
        isLight
          ? 'bg-white/90 border-slate-200 text-slate-800'
          : 'bg-zinc-950/90 border-zinc-800 text-zinc-100'
      }`}
    >
      {/* 顶部标题与关闭 */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-inherit shrink-0">
        <div className="flex items-center gap-2">
          <Folder className="w-4 h-4 text-violet-500" />
          <h2 className="text-sm font-semibold tracking-tight">
            {t('workbench.pocketDrawer')}
          </h2>
          <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-violet-500/10 text-violet-600 dark:text-violet-400 font-medium">
            {filteredItems.length}
          </span>
        </div>
        <button
          onClick={onClose}
          className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
            isLight
              ? 'hover:bg-slate-100 text-slate-500'
              : 'hover:bg-zinc-800 text-zinc-400'
          }`}
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* 搜索栏 */}
      <div className="px-3 pt-3 pb-2 shrink-0">
        <div
          className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border transition-colors ${
            isLight
              ? 'bg-slate-50 border-slate-200 focus-within:border-violet-500 focus-within:bg-white'
              : 'bg-zinc-900 border-zinc-800 focus-within:border-violet-500'
          }`}
        >
          <Search className="w-3.5 h-3.5 opacity-50 shrink-0" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('workbench.pocketDrawerSearchPlaceholder')}
            className="w-full bg-transparent text-xs outline-none placeholder:opacity-40"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')}>
              <X className="w-3 h-3 opacity-50 hover:opacity-100" />
            </button>
          )}
        </div>
      </div>

      {/* 文件夹分类胶囊 */}
      <div className="flex items-center gap-1.5 px-3 py-1.5 overflow-x-auto no-scrollbar shrink-0 border-b border-inherit">
        <button
          onClick={() => setSelectedFolderId(null)}
          className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors shrink-0 cursor-pointer ${
            selectedFolderId === null
              ? 'bg-violet-600 text-white shadow-sm'
              : isLight
              ? 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              : 'bg-zinc-900 text-zinc-400 hover:bg-zinc-800'
          }`}
        >
          {t('workbench.allFolders')}
        </button>
        <button
          onClick={() => setSelectedFolderId('uncategorized')}
          className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors shrink-0 cursor-pointer ${
            selectedFolderId === 'uncategorized'
              ? 'bg-violet-600 text-white shadow-sm'
              : isLight
              ? 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              : 'bg-zinc-900 text-zinc-400 hover:bg-zinc-800'
          }`}
        >
          {t('workbench.uncategorized')}
        </button>
        {folders.map((f) => {
          if (!f.id) return null;
          return (
            <button
              key={f.id}
              onClick={() => setSelectedFolderId(f.id!)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors shrink-0 flex items-center gap-1 cursor-pointer ${
                selectedFolderId === f.id
                  ? 'bg-violet-600 text-white shadow-sm'
                  : isLight
                  ? 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  : 'bg-zinc-900 text-zinc-400 hover:bg-zinc-800'
              }`}
            >
              <span>{f.name}</span>
            </button>
          );
        })}
      </div>

      {/* 底部拖拽提示 */}
      <div className="px-3 py-1.5 text-[11px] opacity-60 shrink-0 text-center">
        {t('workbench.dragToCanvasHint')}
      </div>

      {/* 缩略图网格流 */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
        {filteredItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 opacity-40 text-center">
            <ImageIcon className="w-8 h-8 mb-2 stroke-[1.5]" />
            <p className="text-xs">{t('workbench.pocketDrawerEmpty')}</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2.5">
            {filteredItems.map((item) => {
              const displayUrl = item.id ? dataUrlMap[item.id] : undefined;
              return (
                <div
                  key={item.id}
                  draggable={Boolean(displayUrl)}
                  onDragStart={(e) => handleDragStart(e, item)}
                  className={`group relative rounded-lg overflow-hidden border cursor-grab active:cursor-grabbing transition-all hover:scale-[1.02] hover:shadow-md ${
                    isLight
                      ? 'bg-slate-100 border-slate-200 hover:border-violet-300'
                      : 'bg-zinc-900 border-zinc-800 hover:border-violet-500/50'
                  }`}
                >
                  <div className="aspect-square w-full overflow-hidden bg-black/5 flex items-center justify-center">
                    {displayUrl ? (
                      <img
                        src={displayUrl}
                        alt={item.pageTitle || 'Asset'}
                        referrerPolicy="no-referrer"
                        loading="lazy"
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).style.opacity = '0.3';
                        }}
                        className="w-full h-full object-cover pointer-events-none"
                      />
                    ) : (
                      <ImageIcon className="w-5 h-5 opacity-30 animate-pulse" />
                    )}
                  </div>

                  {/* 悬浮快捷动作栏 */}
                  {displayUrl && (
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1.5 p-1.5">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onAddImageToCanvas(displayUrl, item);
                        }}
                        className="w-full flex items-center justify-center gap-1 px-2 py-1 rounded bg-violet-600 hover:bg-violet-700 text-white text-[11px] font-medium shadow cursor-pointer"
                      >
                        <Plus className="w-3 h-3" />
                        <span>{t('workbench.putOnCanvas')}</span>
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onSetAsReference(displayUrl);
                        }}
                        className="w-full flex items-center justify-center gap-1 px-2 py-1 rounded bg-white/20 hover:bg-white/30 text-white text-[11px] font-medium backdrop-blur-sm cursor-pointer"
                      >
                        <Sparkles className="w-3 h-3 text-amber-300" />
                        <span>{t('workbench.setAsReference')}</span>
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );
};

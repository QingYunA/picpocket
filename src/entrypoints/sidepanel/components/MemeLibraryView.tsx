import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  AlertCircle,
  CheckCircle2,
  Heart,
  ImageOff,
  LayoutDashboard,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  Smile,
  Trash2,
  X,
} from 'lucide-react';
import { db } from '@/db';
import type { MemeItem } from '@/types';
import { useI18n } from '@/i18n';
import { matchesMemeQuery } from '@/services/memeAdapters';
import {
  addCustomMemeSource,
  ensureDefaultMemeSources,
  isValidIndexUrl,
  refreshAllMemeSources,
  removeMemeSource,
  saveMemeToGallery,
  setMemeSourceEnabled,
  toggleMemeFavorite,
} from '@/services/memeRuntime';
import { openInfiniteCanvasPage } from '@/utils/navigation';

const ALL_SOURCES = '__ALL__';
const PAGE_SIZE = 60;

interface Feedback {
  msg: string;
  isError?: boolean;
}

const MemeCard: React.FC<{
  meme: MemeItem;
  busy: boolean;
  onSave: (meme: MemeItem) => void;
  onCanvas: (meme: MemeItem) => void;
  onFavorite: (meme: MemeItem) => void;
}> = ({ meme, busy, onSave, onCanvas, onFavorite }) => {
  const { t } = useI18n();
  const [failed, setFailed] = useState(false);
  const saved = typeof meme.savedItemId === 'number';

  return (
    <div className="group relative overflow-hidden rounded-lg border border-zinc-200 bg-white">
      <div className="flex aspect-square items-center justify-center bg-zinc-50">
        {failed ? (
          <div className="flex flex-col items-center gap-1 text-zinc-300">
            <ImageOff className="h-5 w-5" />
            <span className="text-[10px]">{t('memes.imageFailed')}</span>
          </div>
        ) : (
          <img
            src={meme.url}
            alt={meme.name}
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setFailed(true)}
            className="h-full w-full object-contain"
          />
        )}
      </div>
      <div className="truncate px-2 py-1 text-[11px] text-zinc-600" title={meme.name}>
        {meme.name}
      </div>

      <button
        onClick={() => onFavorite(meme)}
        title={meme.isFavorite ? t('memes.unfavorite') : t('memes.favorite')}
        className={`absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-white/90 shadow-2xs cursor-pointer ${
          meme.isFavorite ? 'text-rose-500' : 'text-zinc-400 opacity-0 group-hover:opacity-100 focus:opacity-100'
        }`}
      >
        <Heart className={`h-3.5 w-3.5 ${meme.isFavorite ? 'fill-current' : ''}`} />
      </button>

      <div className="absolute inset-x-0 bottom-7 flex justify-center gap-1 px-1.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        <button
          onClick={() => onSave(meme)}
          disabled={busy}
          className="flex items-center gap-1 whitespace-nowrap rounded-md bg-zinc-900/90 px-2 py-1 text-[10px] font-semibold text-white hover:bg-zinc-900 disabled:opacity-60 cursor-pointer"
        >
          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : saved ? <CheckCircle2 className="h-3 w-3" /> : null}
          <span>{saved ? t('memes.savedToGallery') : t('memes.saveToGallery')}</span>
        </button>
        <button
          onClick={() => onCanvas(meme)}
          disabled={busy}
          title={t('memes.sendToCanvas')}
          className="flex items-center gap-1 whitespace-nowrap rounded-md bg-indigo-600/90 px-2 py-1 text-[10px] font-semibold text-white hover:bg-indigo-600 disabled:opacity-60 cursor-pointer"
        >
          <LayoutDashboard className="h-3 w-3" />
          <span>{t('memes.sendToCanvas')}</span>
        </button>
      </div>
    </div>
  );
};

export const MemeLibraryView: React.FC = () => {
  const { t } = useI18n();
  const [searchQuery, setSearchQuery] = useState('');
  const [query, setQuery] = useState('');
  const [activeSource, setActiveSource] = useState(ALL_SOURCES);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [isSyncing, setIsSyncing] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [showSources, setShowSources] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const memes = useLiveQuery(() => db.memes.toArray()) ?? [];
  const sources = useLiveQuery(() => db.memeSources.toArray()) ?? [];

  useEffect(() => {
    ensureDefaultMemeSources().catch((err) => console.warn('Failed to init meme sources:', err));
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setQuery(searchQuery.trim()), 250);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
  }, []);

  const showFeedback = useCallback((next: Feedback) => {
    setFeedback(next);
    if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
    feedbackTimer.current = setTimeout(() => setFeedback(null), 4000);
  }, []);

  /** 本地库写入失败时给出提示，而不是抛成未捕获异常 */
  const guard = useCallback(
    (run: () => Promise<unknown>) => {
      run().catch((err) => {
        console.warn('Meme library action failed:', err);
        showFeedback({ msg: t('memes.actionFailed'), isError: true });
      });
    },
    [showFeedback, t]
  );

  // 分类 pills 基于「未选分类」的结果，选中一个分类后仍能切到其他分类
  const candidates = useMemo(() => {
    const enabled = new Set(sources.filter((s) => s.enabled).map((s) => s.id));
    return memes.filter((m) => {
      if (!enabled.has(m.sourceId)) return false;
      if (activeSource !== ALL_SOURCES && m.sourceId !== activeSource) return false;
      if (favoritesOnly && !m.isFavorite) return false;
      return matchesMemeQuery(m, query);
    }).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }, [memes, sources, activeSource, favoritesOnly, query]);

  const filtered = useMemo(
    () => (activeCategory ? candidates.filter((m) => m.tags.includes(activeCategory)) : candidates),
    [candidates, activeCategory]
  );

  useEffect(() => setVisible(PAGE_SIZE), [activeSource, favoritesOnly, activeCategory, query]);

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || visible >= filtered.length) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) setVisible((n) => n + PAGE_SIZE);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [visible, filtered.length]);

  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    candidates.forEach((m) => m.tags.forEach((tag) => counts.set(tag, (counts.get(tag) || 0) + 1)));
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 15);
  }, [candidates]);

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      const results = await refreshAllMemeSources();
      const ok = results.filter((r) => r.success);
      if (ok.length === 0) {
        showFeedback({ msg: results[0]?.lastError ? `${t('memes.syncFailed')} (${results[0].lastError})` : t('memes.syncFailed'), isError: true });
      } else {
        showFeedback({ msg: `${t('memes.syncSuccess')} (${ok.reduce((n, r) => n + r.count, 0)})` });
      }
    } catch {
      showFeedback({ msg: t('memes.syncFailed'), isError: true });
    } finally {
      setIsSyncing(false);
    }
  };

  const withBusy = async (meme: MemeItem, run: () => Promise<void>) => {
    setBusyId(meme.id);
    try {
      await run();
    } catch (err) {
      console.warn('Meme action failed:', err);
      showFeedback({ msg: t('memes.saveFailed'), isError: true });
    } finally {
      setBusyId(null);
    }
  };

  const handleSave = (meme: MemeItem) =>
    withBusy(meme, async () => {
      await saveMemeToGallery(meme);
      showFeedback({ msg: t('memes.savedToGallery') });
    });

  const handleCanvas = (meme: MemeItem) =>
    withBusy(meme, async () => {
      const itemId = await saveMemeToGallery(meme);
      await openInfiniteCanvasPage({ assetId: itemId });
    });

  const handleAddSource = async () => {
    if (!isValidIndexUrl(newUrl)) {
      showFeedback({ msg: t('memes.invalidUrl'), isError: true });
      return;
    }
    try {
      await addCustomMemeSource(newName, newUrl);
    } catch (err) {
      console.warn('Failed to add meme source:', err);
      showFeedback({ msg: t('memes.actionFailed'), isError: true });
      return;
    }
    setNewName('');
    setNewUrl('');
    await handleSync();
  };

  const sourceName = (id: string) => sources.find((s) => s.id === id)?.name || id;

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-white text-zinc-900">
      <div className="space-y-2 border-b border-zinc-100 bg-zinc-50/50 px-3 py-2">
        <div className="relative flex items-center">
          <Search className="absolute left-2.5 h-3.5 w-3.5 text-zinc-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('memes.searchPlaceholder')}
            className="w-full rounded-md border border-zinc-200 bg-white py-1 pl-8 pr-7 text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-900 focus:outline-none"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="absolute right-2 cursor-pointer text-zinc-400 hover:text-zinc-600" aria-label={t('common.close')}>
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <select
            value={activeSource}
            onChange={(e) => {
              setActiveSource(e.target.value);
              setActiveCategory(null);
            }}
            className="min-w-0 flex-1 rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-700 focus:outline-none"
          >
            <option value={ALL_SOURCES}>{t('memes.allSources')}</option>
            {sources.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <button
            onClick={() => setFavoritesOnly((v) => !v)}
            className={`flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2 py-1 text-[11px] font-medium cursor-pointer ${
              favoritesOnly ? 'bg-rose-500 text-white' : 'border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-100'
            }`}
          >
            <Heart className="h-3 w-3 fill-current" />
            <span>{t('memes.favorites')}</span>
          </button>
          <button
            onClick={() => setShowSources((v) => !v)}
            title={t('memes.manageSources')}
            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border cursor-pointer ${
              showSources ? 'border-zinc-900 bg-zinc-900 text-white' : 'border-zinc-200 bg-white text-zinc-500 hover:bg-zinc-100'
            }`}
          >
            <Settings2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {showSources && (
        <div className="max-h-72 space-y-2 overflow-y-auto border-b border-zinc-100 bg-zinc-50 px-3 py-2">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">{t('memes.sourcesTitle')}</div>
          {sources.map((s) => (
            <div key={s.id} className="rounded-md border border-zinc-200 bg-white px-2 py-1.5">
              <div className="flex items-center gap-2">
                <input type="checkbox" checked={s.enabled} onChange={(e) => guard(() => setMemeSourceEnabled(s.id, e.target.checked))} aria-label={t('memes.enabled')} className="cursor-pointer" />
                <span className="min-w-0 flex-1 truncate text-xs font-medium">{s.name}</span>
                <span className="shrink-0 text-[10px] text-zinc-400">{s.lastSuccessAt ? t('memes.sourceCount', { count: s.count ?? 0 }) : t('memes.neverSynced')}</span>
                {!s.builtIn && (
                  <button onClick={() => guard(() => removeMemeSource(s.id))} title={t('memes.remove')} className="shrink-0 cursor-pointer text-zinc-400 hover:text-red-500">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              {s.lastError && <div className="mt-1 break-all text-[10px] text-red-500">{s.lastError}</div>}
            </div>
          ))}
          <div className="space-y-1.5 rounded-md border border-dashed border-zinc-300 p-2">
            <div className="text-[11px] font-medium text-zinc-600">{t('memes.addSourceTitle')}</div>
            <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder={t('memes.sourceNamePlaceholder')} className="w-full rounded border border-zinc-200 bg-white px-2 py-1 text-xs focus:border-zinc-900 focus:outline-none" />
            <input value={newUrl} onChange={(e) => setNewUrl(e.target.value)} placeholder={t('memes.sourceUrlPlaceholder')} className="w-full rounded border border-zinc-200 bg-white px-2 py-1 text-xs focus:border-zinc-900 focus:outline-none" />
            <button onClick={handleAddSource} className="flex items-center gap-1 rounded bg-zinc-900 px-2.5 py-1 text-xs font-semibold text-white hover:bg-zinc-800 cursor-pointer">
              <Plus className="h-3 w-3" />
              <span>{t('memes.addSource')}</span>
            </button>
            <p className="break-all text-[10px] text-zinc-400">{t('memes.indexFormat')}</p>
          </div>
          <p className="text-[10px] text-zinc-400">{t('memes.copyrightNote')}</p>
        </div>
      )}

      {categories.length > 0 && (
        <div className="relative border-b border-zinc-50 bg-zinc-50/30">
          <div className="no-scrollbar flex gap-1 overflow-x-auto px-3 py-1.5">
            {categories.map(([tag, count]) => {
              const active = activeCategory === tag;
              return (
                <button
                  key={tag}
                  onClick={() => setActiveCategory(active ? null : tag)}
                  className={`flex shrink-0 items-center gap-0.5 whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-medium cursor-pointer ${
                    active ? 'bg-zinc-800 font-semibold text-white' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                  }`}
                >
                  <span>#{tag}</span>
                  <span className="text-[9px] opacity-70">({count})</span>
                </button>
              );
            })}
          </div>
          <div className="pointer-events-none absolute bottom-0 right-0 top-0 w-6 bg-gradient-to-l from-zinc-50/90 to-transparent" />
        </div>
      )}

      {feedback && (
        <div className={`flex items-center gap-1.5 border-b px-3 py-1.5 text-xs font-medium ${feedback.isError ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>
          {feedback.isError ? <AlertCircle className="h-3.5 w-3.5 shrink-0 text-red-500" /> : <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" />}
          <span className="min-w-0 break-words">{feedback.msg}</span>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-3 py-3">
        {filtered.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-4 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100 text-zinc-400">
              <Smile className="h-6 w-6" />
            </div>
            <p className="text-sm font-semibold text-zinc-700">{memes.length === 0 ? t('memes.emptyTitle') : t('memes.emptyNoMatch')}</p>
            {memes.length === 0 && (
              <>
                <p className="max-w-[260px] text-xs text-zinc-400">{t('memes.emptyDesc')}</p>
                <button
                  onClick={handleSync}
                  disabled={isSyncing}
                  className="mt-1 flex items-center gap-1.5 rounded-md bg-zinc-900 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-zinc-800 disabled:opacity-60 cursor-pointer"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                  <span>{isSyncing ? t('memes.syncing') : t('memes.syncAll')}</span>
                </button>
              </>
            )}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2.5">
              {filtered.slice(0, visible).map((meme) => (
                <MemeCard key={meme.id} meme={meme} busy={busyId === meme.id} onSave={handleSave} onCanvas={handleCanvas} onFavorite={(m) => guard(() => toggleMemeFavorite(m.id, !m.isFavorite))} />
              ))}
            </div>
            {visible < filtered.length && (
              <div ref={sentinelRef} className="flex h-10 items-center justify-center text-[11px] text-zinc-400">
                {t('memes.loadMore')}
              </div>
            )}
          </>
        )}
      </div>

      <footer className="flex h-7 shrink-0 items-center justify-between border-t border-zinc-100 bg-white px-3 text-[10px] text-zinc-400">
        <span className="min-w-0 truncate">
          {t('memes.cardCount', { count: filtered.length })}
          {activeSource !== ALL_SOURCES ? ` · ${sourceName(activeSource)}` : ''}
        </span>
        <button onClick={handleSync} disabled={isSyncing} className="flex shrink-0 items-center gap-1 text-zinc-500 hover:text-zinc-900 disabled:opacity-50 cursor-pointer" title={t('memes.syncAll')}>
          <RefreshCw className={`h-3 w-3 ${isSyncing ? 'animate-spin' : ''}`} />
          <span>{isSyncing ? t('memes.syncing') : t('memes.syncAll')}</span>
        </button>
      </footer>
    </div>
  );
};

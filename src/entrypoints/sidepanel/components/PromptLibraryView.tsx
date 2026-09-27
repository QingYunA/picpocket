import React, { useState, useMemo, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Search,
  RefreshCw,
  Sparkles,
  Layers,
  Star,
  Heart,
  CheckCircle2,
  AlertCircle,
  X,
  ChevronDown,
  Check,
  Compass,
} from 'lucide-react';
import type { PromptItem } from '@/types';
import { db } from '@/db';
import {
  refreshAllPromptSources,
  DEFAULT_PROMPT_SOURCES,
  cleanupDeprecatedSources,
} from '@/services/promptRuntime';
import { PICPOCKET_CURATED_PROMPTS } from '@/services/curatedPrompts';
import { useI18n } from '@/i18n';
import { PromptCard } from './PromptCard';
import { PromptDetailDrawer } from './PromptDetailDrawer';

const ALL_SOURCES_KEY = '__ALL__';
const VAULT_SOURCE_KEY = 'my-vault';
const FAVORITES_KEY = '__FAVORITES__';

interface PromptLibraryViewProps {
  onGeneratePrompt?: (prompt: string, referenceImage?: string) => void;
}

export const PromptLibraryView: React.FC<PromptLibraryViewProps> = ({ onGeneratePrompt }) => {
  const { t } = useI18n();

  const [selectedPrompt, setSelectedPrompt] = useState<PromptItem | null>(null);
  const [activeSource, setActiveSource] = useState<string>(ALL_SOURCES_KEY);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSourceMenuOpen, setIsSourceMenuOpen] = useState(false);
  const [syncFeedback, setSyncFeedback] = useState<{ msg: string; isError?: boolean } | null>(null);

  // 250ms Search Debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery.trim().toLowerCase());
    }, 250);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Live query from Dexie
  const promptItems = useLiveQuery(() => db.promptItems.toArray()) || [];
  const promptSources = useLiveQuery(() => db.promptSources.toArray()) || [];

  // Auto initialize default sources, clean up deprecated ones, and pre-populate curated prompt items in Dexie
  useEffect(() => {
    (async () => {
      // 1. Clean up deprecated older sources
      await cleanupDeprecatedSources();

      // 2. Initialize default sources if empty
      const sourceCount = await db.promptSources.count();
      if (sourceCount === 0) {
        await db.promptSources.bulkPut(DEFAULT_PROMPT_SOURCES);
      }
      const curatedItemCount = await db.promptItems.where('sourceId').equals('picpocket-curated').count();
      if (curatedItemCount === 0) {
        await db.promptItems.bulkPut(PICPOCKET_CURATED_PROMPTS);
      }
    })();
  }, []);

  const handleSyncAll = async () => {
    setIsSyncing(true);
    setSyncFeedback(null);
    try {
      const summary = await refreshAllPromptSources();
      if (summary.failureCount > 0 && summary.successCount === 0) {
        setSyncFeedback({ msg: t('prompts.syncFailed'), isError: true });
      } else {
        setSyncFeedback({
          msg: `${t('prompts.syncSuccess')} (${summary.total})`,
          isError: false,
        });
      }
    } catch {
      setSyncFeedback({ msg: t('prompts.syncFailed'), isError: true });
    } finally {
      setIsSyncing(false);
      setTimeout(() => setSyncFeedback(null), 4000);
    }
  };

  // Dynamic Sources List
  const sourcesList = useMemo(() => {
    const list: { id: string; name: string; count: number }[] = [
      { id: ALL_SOURCES_KEY, name: t('prompts.allSources'), count: promptItems.length },
      {
        id: VAULT_SOURCE_KEY,
        name: t('prompts.myVault'),
        count: promptItems.filter((i) => i.sourceId === VAULT_SOURCE_KEY || i.isCustom).length,
      },
      {
        id: FAVORITES_KEY,
        name: t('prompts.favorites'),
        count: promptItems.filter((i) => i.isFavorite).length,
      },
    ];

    // Collect counts per source
    const countsBySource: Record<string, number> = {};
    promptItems.forEach((item) => {
      if (item.sourceId !== VAULT_SOURCE_KEY) {
        countsBySource[item.sourceId] = (countsBySource[item.sourceId] || 0) + 1;
      }
    });

    const activeSourcesConfig = promptSources.length > 0 ? promptSources : DEFAULT_PROMPT_SOURCES;
    activeSourcesConfig.forEach((s) => {
      list.push({
        id: s.id,
        name: s.name,
        count: countsBySource[s.id] || 0,
      });
    });

    return list;
  }, [promptItems, promptSources, t]);

  const currentSource = useMemo(() => {
    return sourcesList.find((s) => s.id === activeSource) || sourcesList[0];
  }, [sourcesList, activeSource]);

  // Filter items based on active source, tag, and debounced search query
  const filteredPrompts = useMemo(() => {
    return promptItems.filter((item) => {
      // Source filter
      if (activeSource === VAULT_SOURCE_KEY) {
        if (item.sourceId !== VAULT_SOURCE_KEY && !item.isCustom) return false;
      } else if (activeSource === FAVORITES_KEY) {
        if (!item.isFavorite) return false;
      } else if (activeSource !== ALL_SOURCES_KEY) {
        if (item.sourceId !== activeSource) return false;
      }

      // Tag filter
      if (activeTag && !item.tags?.includes(activeTag)) {
        return false;
      }

      // Debounced search query filter
      if (debouncedQuery) {
        const textToSearch = [
          item.title,
          item.prompt,
          item.description,
          item.author,
          item.category,
          ...(item.tags || []),
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();

        if (!textToSearch.includes(debouncedQuery)) return false;
      }

      return true;
    });
  }, [promptItems, activeSource, activeTag, debouncedQuery]);

  // Dynamic Tags from filtered set
  const dynamicTags = useMemo(() => {
    const counts: Record<string, number> = {};
    filteredPrompts.forEach((item) => {
      item.tags?.forEach((t) => {
        counts[t] = (counts[t] || 0) + 1;
      });
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15);
  }, [filteredPrompts]);

  if (selectedPrompt) {
    return (
      <PromptDetailDrawer
        item={selectedPrompt}
        onBack={() => setSelectedPrompt(null)}
        onGenerate={(it) =>
          onGeneratePrompt?.(it.prompt, it.coverUrl || it.referenceImageUrls?.[0])
        }
      />
    );
  }

  return (
    <div className="flex h-full w-full flex-col bg-white overflow-hidden text-zinc-900">
      {/* Search Input Bar */}
      <div className="border-b border-zinc-100 px-3 py-2 bg-zinc-50/50">
        <div className="relative flex items-center">
          <Search className="absolute left-2.5 h-3.5 w-3.5 text-zinc-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('prompts.searchPlaceholder')}
            className="w-full rounded-md border border-zinc-200 bg-white pl-8 pr-7 py-1 text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-900 focus:outline-none"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2 text-zinc-400 hover:text-zinc-600 cursor-pointer"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Sources Vertical Selector Bar with Expandable Dropdown */}
      <div className="relative border-b border-zinc-100 bg-white z-20">
        <div className="flex items-center justify-between px-3 py-2 gap-2">
          {/* Main Dropdown Button for Active Source */}
          <button
            onClick={() => setIsSourceMenuOpen(!isSourceMenuOpen)}
            className="flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-zinc-50/80 px-2.5 py-1.5 text-xs font-semibold text-zinc-900 hover:bg-zinc-100 transition-all cursor-pointer shadow-2xs min-w-0"
            title={t('prompts.expandSourcesTitle')}
          >
            {activeSource === VAULT_SOURCE_KEY ? (
              <Star className="h-3.5 w-3.5 text-amber-400 fill-current shrink-0" />
            ) : activeSource === FAVORITES_KEY ? (
              <Heart className="h-3.5 w-3.5 text-rose-500 fill-current shrink-0" />
            ) : activeSource === ALL_SOURCES_KEY ? (
              <Compass className="h-3.5 w-3.5 text-sky-500 shrink-0" />
            ) : (
              <Sparkles className="h-3.5 w-3.5 text-violet-500 shrink-0" />
            )}
            <span className="truncate max-w-[125px]">{currentSource?.name || t('prompts.allSources')}</span>
            <span className="text-[10px] font-mono text-zinc-400">
              ({currentSource?.count ?? 0})
            </span>
            <ChevronDown
              className={`h-3.5 w-3.5 text-zinc-400 transition-transform duration-200 shrink-0 ${
                isSourceMenuOpen ? 'rotate-180 text-zinc-700' : ''
              }`}
            />
          </button>

          {/* Quick Filter Badges for Top Actions: Vault & Favorites */}
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => {
                setActiveSource(VAULT_SOURCE_KEY);
                setActiveTag(null);
                setIsSourceMenuOpen(false);
              }}
              className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors cursor-pointer ${
                activeSource === VAULT_SOURCE_KEY
                  ? 'bg-amber-400 text-zinc-900 font-semibold shadow-2xs'
                  : 'border border-zinc-200 bg-zinc-50 text-zinc-600 hover:bg-zinc-100'
              }`}
              title={t('prompts.myVault')}
            >
              <Star className="h-2.5 w-2.5 fill-current" />
              <span>{t('prompts.myVault')}</span>
            </button>
            <button
              onClick={() => {
                setActiveSource(FAVORITES_KEY);
                setActiveTag(null);
                setIsSourceMenuOpen(false);
              }}
              className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors cursor-pointer ${
                activeSource === FAVORITES_KEY
                  ? 'bg-rose-500 text-white font-semibold shadow-2xs'
                  : 'border border-zinc-200 bg-zinc-50 text-zinc-600 hover:bg-zinc-100'
              }`}
              title={t('prompts.favorites')}
            >
              <Heart className="h-2.5 w-2.5 fill-current" />
              <span>{t('prompts.favorites')}</span>
            </button>
          </div>
        </div>

        {/* Vertical Dropdown Drawer for All Sources */}
        {isSourceMenuOpen && (
          <div className="border-t border-zinc-100 bg-zinc-50/95 p-2 space-y-1 shadow-md max-h-64 overflow-y-auto animate-in fade-in slide-in-from-top-2 duration-150">
            <div className="flex items-center justify-between px-1 pb-1 text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">
              <span>{t('prompts.allSources')} ({sourcesList.length})</span>
              <button
                onClick={() => setIsSourceMenuOpen(false)}
                className="text-zinc-400 hover:text-zinc-600 cursor-pointer text-[10px]"
              >
                {t('prompts.collapseSources')}
              </button>
            </div>
            {sourcesList.map((src) => {
              const isActive = activeSource === src.id;
              return (
                <button
                  key={src.id}
                  onClick={() => {
                    setActiveSource(src.id);
                    setActiveTag(null);
                    setIsSourceMenuOpen(false);
                  }}
                  className={`w-full flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs transition-colors cursor-pointer ${
                    isActive
                      ? 'bg-zinc-900 text-white font-semibold shadow-2xs'
                      : 'bg-white hover:bg-zinc-100 text-zinc-700 border border-zinc-200/80 shadow-2xs'
                  }`}
                >
                  <div className="flex items-center gap-1.5 truncate">
                    {src.id === VAULT_SOURCE_KEY ? (
                      <Star className="h-3 w-3 text-amber-400 fill-current shrink-0" />
                    ) : src.id === FAVORITES_KEY ? (
                      <Heart className="h-3 w-3 text-rose-500 fill-current shrink-0" />
                    ) : src.id === ALL_SOURCES_KEY ? (
                      <Compass className={`h-3 w-3 shrink-0 ${isActive ? 'text-white' : 'text-sky-500'}`} />
                    ) : (
                      <Sparkles className={`h-3 w-3 shrink-0 ${isActive ? 'text-amber-300' : 'text-violet-500'}`} />
                    )}
                    <span className="truncate">{src.name}</span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 ml-2">
                    <span className={`text-[10px] font-mono ${isActive ? 'text-zinc-300' : 'text-zinc-400'}`}>
                      {t('prompts.itemsCount', { count: src.count })}
                    </span>
                    {isActive && <Check className="h-3.5 w-3.5 text-emerald-400" />}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Dynamic Tags Filter Cloud */}
      {dynamicTags.length > 0 && (
        <div className="relative border-b border-zinc-50 bg-zinc-50/30">
          <div className="flex shrink-0 gap-1 overflow-x-auto px-3 py-1.5 no-scrollbar">
            {dynamicTags.map(([tag, count]) => {
              const isTagActive = activeTag === tag;
              return (
                <button
                  key={tag}
                  onClick={() => setActiveTag(isTagActive ? null : tag)}
                  className={`flex shrink-0 items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors cursor-pointer whitespace-nowrap ${
                    isTagActive
                      ? 'bg-zinc-800 text-white font-semibold'
                      : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                  }`}
                >
                  <span>#{tag}</span>
                  <span className="text-[9px] opacity-70">({count})</span>
                </button>
              );
            })}
          </div>
          {/* Right edge soft gradient fade */}
          <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-6 bg-gradient-to-l from-zinc-50/90 to-transparent" />
        </div>
      )}

      {/* Feedback Banner */}
      {syncFeedback && (
        <div
          className={`flex items-center justify-between px-3 py-1.5 text-xs font-medium animate-in fade-in duration-200 ${
            syncFeedback.isError
              ? 'bg-red-50 text-red-700 border-b border-red-200'
              : 'bg-emerald-50 text-emerald-800 border-b border-emerald-200'
          }`}
        >
          <div className="flex items-center gap-1.5">
            {syncFeedback.isError ? (
              <AlertCircle className="h-3.5 w-3.5 text-red-500 shrink-0" />
            ) : (
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
            )}
            <span>{syncFeedback.msg}</span>
          </div>
          <button
            onClick={() => setSyncFeedback(null)}
            className="text-zinc-400 hover:text-zinc-700 cursor-pointer"
            aria-label={t('common.close')}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Grid Content */}
      <div className="flex-1 overflow-y-auto px-3 py-3">
        {filteredPrompts.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center px-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100 text-zinc-400">
              <Layers className="h-6 w-6" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-semibold text-zinc-700">
                {t('prompts.emptyTitle')}
              </p>
              <p className="text-xs text-zinc-400 max-w-[260px]">
                {t('prompts.emptyDesc')}
              </p>
            </div>

            {promptItems.length === 0 && (
              <button
                onClick={handleSyncAll}
                disabled={isSyncing}
                className="mt-2 flex items-center gap-1.5 rounded-md bg-zinc-900 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-zinc-800 transition-colors shadow-2xs cursor-pointer disabled:opacity-60"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                <span>{isSyncing ? t('prompts.syncing') : t('prompts.syncAll')}</span>
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2.5">
            {filteredPrompts.map((item) => (
              <PromptCard
                key={item.id}
                item={item}
                onClick={() => setSelectedPrompt(item)}
                onGenerate={(it) =>
                  onGeneratePrompt?.(it.prompt, it.coverUrl || it.referenceImageUrls?.[0])
                }
              />
            ))}
          </div>
        )}
      </div>

      {/* Footer Status Bar with Fast Sync Button */}
      <footer className="flex h-7 shrink-0 items-center justify-between border-t border-zinc-100 px-3 text-[10px] text-zinc-400 bg-white">
        <div className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
          <span>{t('prompts.cardCount', { count: filteredPrompts.length })}</span>
        </div>

        <button
          onClick={handleSyncAll}
          disabled={isSyncing}
          className="flex items-center gap-1 text-zinc-500 hover:text-zinc-900 transition-colors cursor-pointer disabled:opacity-50"
          title={t('prompts.syncAll')}
        >
          <RefreshCw className={`h-3 w-3 ${isSyncing ? 'animate-spin' : ''}`} />
          <span>{isSyncing ? t('prompts.syncing') : t('prompts.syncAll')}</span>
        </button>
      </footer>
    </div>
  );
};

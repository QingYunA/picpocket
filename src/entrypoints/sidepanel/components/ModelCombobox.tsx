import React, { useState, useRef, useEffect, useMemo } from 'react';
import { ChevronDown, Check, Search, AlertCircle, X, Loader2, CloudDownload } from 'lucide-react';
import { fetchAvailableModels } from '@/services/modelFetcher';
import { useI18n } from '@/i18n';

interface ModelComboboxProps {
  label: string;
  icon?: React.ReactNode;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  baseUrl: string;
  apiKey?: string;
  hint?: string;
}

export function ModelCombobox({
  label,
  icon,
  value,
  onChange,
  placeholder = 'deepseek-chat',
  baseUrl,
  apiKey,
  hint,
}: ModelComboboxProps) {
  const { t } = useI18n();
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fetchedModels, setFetchedModels] = useState<string[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Focus search input when dropdown opens
  useEffect(() => {
    if (!isOpen) return;
    const timer = setTimeout(() => searchInputRef.current?.focus(), 50);
    return () => clearTimeout(timer);
  }, [isOpen]);

  // Esc 收起下拉
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOpen]);

  const handleFetchModels = async () => {
    if (!baseUrl?.trim()) {
      setError(t('modelCombobox.baseUrlRequired'));
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const models = await fetchAvailableModels({
        baseUrl: baseUrl.trim(),
        apiKey: apiKey?.trim(),
      });
      setFetchedModels(models);
      setIsOpen(true);
      setSearchQuery('');
    } catch (err: any) {
      setError(err.message || t('modelCombobox.fetchFailed'));
    } finally {
      setIsLoading(false);
    }
  };

  const filteredModels = useMemo(() => {
    if (!searchQuery.trim()) return fetchedModels;
    const q = searchQuery.toLowerCase();
    return fetchedModels.filter((m) => m.toLowerCase().includes(q));
  }, [fetchedModels, searchQuery]);

  return (
    <div ref={containerRef} className={`space-y-1 relative ${isOpen ? 'z-30' : 'z-0'}`}>
      {/* Label and Fetch Action Bar */}
      <div className="flex items-center justify-between">
        <label className="text-xs font-semibold text-zinc-700 flex items-center gap-1">
          {icon}
          <span>{label}</span>
        </label>

        <button
          type="button"
          onClick={handleFetchModels}
          disabled={isLoading || !baseUrl?.trim()}
          className={`flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-md transition-all cursor-pointer ${
            isLoading
              ? 'bg-zinc-100 text-zinc-400 cursor-wait'
              : !baseUrl?.trim()
                ? 'text-zinc-300 cursor-not-allowed'
                : 'text-sky-600 hover:text-sky-700 hover:bg-sky-50 active:scale-95'
          }`}
          title={!baseUrl?.trim() ? t('modelCombobox.needBaseUrlTooltip') : t('modelCombobox.fetchTooltip')}
        >
          {isLoading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-sky-600" />
          ) : (
            <CloudDownload className="h-3.5 w-3.5" />
          )}
          <span>{isLoading ? t('modelCombobox.fetching') : t('modelCombobox.fetchBtn')}</span>
        </button>
      </div>

      {/* Model Input & Dropdown Toggle */}
      <div className="relative flex items-center">
        <input
          type="text"
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            if (error) setError(null);
          }}
          placeholder={placeholder}
          className="w-full rounded-lg border border-zinc-200 bg-zinc-50/50 px-3 py-2 pr-16 text-xs font-mono text-zinc-900 focus:border-zinc-900 focus:bg-white focus:outline-none transition-all shadow-2xs"
        />

        <div className="absolute right-1.5 flex items-center gap-1">
          {value && (
            <button
              type="button"
              onClick={() => onChange('')}
              className="p-1 text-zinc-400 hover:text-zinc-600 rounded cursor-pointer"
              title={t('modelCombobox.clear')}
              aria-label={t('modelCombobox.clear')}
            >
              <X className="h-3 w-3" />
            </button>
          )}

          {fetchedModels.length > 0 && (
            <button
              type="button"
              onClick={() => setIsOpen(!isOpen)}
              className={`p-1 rounded text-zinc-500 hover:bg-zinc-200/60 hover:text-zinc-900 transition-colors cursor-pointer ${
                isOpen ? 'bg-zinc-200 text-zinc-900' : ''
              }`}
              title={isOpen ? t('modelCombobox.collapse') : t('modelCombobox.expand', { count: fetchedModels.length })}
              aria-label={isOpen ? t('modelCombobox.collapse') : t('modelCombobox.expand', { count: fetchedModels.length })}
              aria-expanded={isOpen}
            >
              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>
          )}
        </div>
      </div>

      {/* Status Badges & Errors */}
      {error && (
        <div className="flex items-start gap-1 text-[11px] text-red-600 bg-red-50/80 border border-red-200/60 rounded-lg p-2 animate-in fade-in">
          <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-red-500" />
          <span className="leading-snug">{error}</span>
        </div>
      )}

      {!error && fetchedModels.length > 0 && (
        <div className="flex items-center justify-between text-[10px] text-zinc-400">
          <span className="flex items-center gap-1 text-emerald-600 font-medium">
            <Check className="h-3 w-3" />
            {t('modelCombobox.fetched', { count: fetchedModels.length })}
          </span>
          <button
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            className="text-sky-600 hover:underline cursor-pointer"
          >
            {isOpen ? t('modelCombobox.hideList') : t('modelCombobox.showList')}
          </button>
        </div>
      )}

      {hint && !error && fetchedModels.length === 0 && (
        <p className="text-[10px] text-zinc-400">{hint}</p>
      )}

      {/* Floating Dropdown Panel */}
      {isOpen && fetchedModels.length > 0 && (
        <div className="absolute left-0 right-0 top-full mt-1 z-40 rounded-xl border border-zinc-200 bg-white p-2 shadow-xl animate-in fade-in zoom-in-95">
          {/* Search Bar inside dropdown */}
          <div className="relative mb-2">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                // 回车直接选中第一个匹配项
                const first = filteredModels[0];
                if (e.key === 'Enter' && first) {
                  e.preventDefault();
                  onChange(first);
                  setIsOpen(false);
                }
              }}
              placeholder={t('modelCombobox.searchPlaceholder')}
              aria-label={t('modelCombobox.searchPlaceholder')}
              className="w-full rounded-md border border-zinc-200 bg-zinc-50 pl-7 pr-2 py-1 text-xs text-zinc-800 placeholder:text-zinc-400 focus:border-zinc-900 focus:bg-white focus:outline-none font-mono"
            />
          </div>

          {/* Model Items List */}
          <div className="max-h-48 overflow-y-auto space-y-0.5 no-scrollbar">
            {filteredModels.length === 0 ? (
              <div className="py-4 text-center text-xs text-zinc-400">{t('modelCombobox.noMatch')}</div>
            ) : (
              filteredModels.map((m) => {
                const isSelected = value === m;
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => {
                      onChange(m);
                      setIsOpen(false);
                    }}
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left text-xs font-mono transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-zinc-900 text-white font-semibold'
                        : 'text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900'
                    }`}
                  >
                    <span className="truncate pr-2">{m}</span>
                    {isSelected && <Check className="h-3 w-3 shrink-0 text-white" />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { ChevronDown, Search, Check, RefreshCw, Sparkles, Cpu, AlertCircle, X, ExternalLink } from 'lucide-react';
import { BrandIcon, guessBrandIcon } from './BrandIcon';
export { guessBrandIcon };
import presetModelsData from '@/config/presetModels.json';
import { fetchAvailableModels } from '@/services/modelFetcher';
import { useI18n } from '@/i18n';

export interface InlineModelPickerProps {
  capability: 'image' | 'vision';
  currentModel: string;
  onSelectModel: (model: string) => void;
  baseUrl: string;
  apiKey?: string;
  className?: string;
  align?: 'left' | 'right';
  onOpenSettings?: () => void;
  fullWidth?: boolean;
  allowedModels?: string[];
}

interface PresetItem {
  id: string;
  name: string;
  icon: string;
  baseUrl: string;
  defaultModel?: string;
  tag?: string;
  description?: string;
  badgeColor?: string;
}

export const InlineModelPicker: React.FC<InlineModelPickerProps> = ({
  capability,
  currentModel,
  onSelectModel,
  baseUrl,
  apiKey,
  className = '',
  align = 'right',
  onOpenSettings,
  fullWidth = false,
  allowedModels,
}) => {
  const { t } = useI18n();
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [dynamicModels, setDynamicModels] = useState<string[]>([]);

  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const presets: PresetItem[] = ((presetModelsData as any)[capability] || []).filter((preset: PresetItem) =>
    (capability !== 'image' || preset.baseUrl.replace(/\/+$/, '') === baseUrl.replace(/\/+$/, '')) &&
    (!allowedModels || !preset.defaultModel || allowedModels.includes(preset.defaultModel))
  );

  useEffect(() => {
    setDynamicModels([]);
    setFetchError(null);
    setSearchQuery('');
    setIsOpen(false);
  }, [baseUrl, apiKey]);

  // Find matching preset for current model
  const matchedPreset = useMemo(() => {
    return presets.find((p) => p.defaultModel && p.defaultModel.toLowerCase() === currentModel.toLowerCase());
  }, [presets, currentModel]);

  const currentIcon = matchedPreset?.icon || guessBrandIcon(currentModel);

  // Close dropdown on outside click or Escape
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // Auto focus search on open
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => searchInputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const handleFetchModels = async () => {
    if (!baseUrl?.trim()) {
      setFetchError(t('generator.noApiKeyHint'));
      return;
    }

    setIsLoadingModels(true);
    setFetchError(null);
    try {
      const models = await fetchAvailableModels({
        baseUrl: baseUrl.trim(),
        apiKey: apiKey?.trim(),
      });
      setDynamicModels(models);
      setSearchQuery('');
    } catch (err: any) {
      setFetchError(`${t('generator.fetchModelsFailed')}: ${err?.message || ''}`);
    } finally {
      setIsLoadingModels(false);
    }
  };

  // Combine candidate models: current model, dynamic models, and preset defaults
  const allCandidateModels = useMemo(() => {
    if (allowedModels) return allowedModels;
    const list = new Set<string>();
    if (currentModel) list.add(currentModel);
    for (const m of dynamicModels) list.add(m);
    for (const p of presets) {
      if (p.defaultModel) list.add(p.defaultModel);
    }
    return Array.from(list);
  }, [allowedModels, currentModel, dynamicModels, presets]);

  // Filter models based on search query
  const filteredModels = useMemo(() => {
    if (allowedModels) {
      const query = searchQuery.trim().toLowerCase();
      return allowedModels.filter((model) => model.toLowerCase().includes(query));
    }
    if (!searchQuery.trim()) {
      // When not searching, show current model and dynamic models to keep list clean
      const list = new Set<string>();
      if (currentModel) list.add(currentModel);
      for (const m of dynamicModels) list.add(m);
      return Array.from(list);
    }
    const q = searchQuery.toLowerCase();
    return allCandidateModels.filter((m) => m.toLowerCase().includes(q));
  }, [allowedModels, allCandidateModels, currentModel, dynamicModels, searchQuery]);

  const handleSelect = (model: string) => {
    const trimmed = model.trim();
    if (!trimmed) return;
    if (allowedModels && !allowedModels.includes(trimmed)) return;
    onSelectModel(trimmed);
    setIsOpen(false);
    setSearchQuery('');
  };

  // Keyboard Enter handler
  const handleKeyDownSearch = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      const q = searchQuery.trim();
      if (!q) return;
      if (filteredModels.length > 0) {
        // Prioritize first matched model
        handleSelect(filteredModels[0]!);
      } else if (!allowedModels) {
        // Custom user input
        handleSelect(q);
      }
    }
  };

  const refreshTitle = baseUrl?.trim()
    ? t('generator.refreshModelsTooltip', { baseUrl: baseUrl.trim() })
    : t('generator.noBaseUrlTooltip');

  return (
    <div ref={containerRef} className={`relative ${fullWidth ? 'block w-full' : 'inline-block'} text-left ${className}`}>
      {/* Pill Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-1.5 h-7 px-2.5 rounded-full border border-zinc-200 bg-white hover:border-zinc-300 hover:bg-zinc-50 text-zinc-800 text-xs font-medium shadow-2xs transition-all cursor-pointer select-none active:scale-98 ${
          fullWidth ? 'w-full max-w-none' : 'max-w-[130px] sm:max-w-[160px]'
        }`}
        title={currentModel}
      >
        <span className="shrink-0 flex items-center justify-center">
          {currentIcon ? (
            <BrandIcon icon={currentIcon} className="h-3.5 w-3.5" />
          ) : (
            <Sparkles className="h-3.5 w-3.5 text-amber-500" />
          )}
        </span>
        <span className="min-w-0 flex-1 truncate text-left text-[11px] font-medium leading-none">
          {matchedPreset?.tag || currentModel || (capability === 'image' ? t('options.image.modelEmpty') : t('options.vision.modelEmpty'))}
        </span>
        <ChevronDown className={`h-3 w-3 text-zinc-400 shrink-0 transition-transform duration-150 ${isOpen ? 'rotate-180 text-zinc-700' : ''}`} />
      </button>

      {/* Floating Popover Panel */}
      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-transparent"
            onClick={() => setIsOpen(false)}
          />
          <div
            className={`absolute ${
              align === 'left' ? 'left-0' : 'right-0'
            } top-full mt-1.5 z-50 w-[280px] max-w-[calc(100vw-24px)] rounded-2xl border border-zinc-200/90 bg-white p-2.5 shadow-xl text-zinc-900 animate-in fade-in zoom-in-95 duration-150 box-border`}
          >
          {/* Header & Fetch Action */}
          <div className="flex items-center justify-between pb-2 border-b border-zinc-100">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-800">
              <Cpu className="h-3.5 w-3.5 text-zinc-600" />
              <span>{capability === 'image' ? t('generator.modelLabel') : t('inspector.visionModel')}</span>
            </div>

            {!allowedModels && <button
              type="button"
              onClick={handleFetchModels}
              disabled={isLoadingModels || !baseUrl?.trim()}
              className="flex items-center gap-1 text-[10px] font-medium text-sky-600 hover:text-sky-700 hover:bg-sky-50 px-1.5 py-0.5 rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              title={refreshTitle}
            >
              <RefreshCw className={`h-3 w-3 ${isLoadingModels ? 'animate-spin' : ''}`} />
              <span>{t('generator.fetchModels')}</span>
            </button>}
          </div>

          {/* Search Input */}
          <div className="relative mt-2">
            <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-zinc-400" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={handleKeyDownSearch}
              placeholder={t('generator.searchModelPlaceholder')}
              className="w-full rounded-lg border border-zinc-200 bg-zinc-50 pl-8 pr-7 py-1.5 text-xs text-zinc-800 placeholder:text-zinc-400 focus:border-zinc-900 focus:bg-white focus:outline-none transition-all"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-2 text-zinc-400 hover:text-zinc-600 p-0.5 cursor-pointer"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>

          {/* Error Message if any */}
          {fetchError && (
            <div className="mt-1.5 flex items-center gap-1 text-[10px] text-red-600 bg-red-50 p-1.5 rounded-md border border-red-100">
              <AlertCircle className="h-3 w-3 shrink-0" />
              <span className="truncate">{fetchError}</span>
            </div>
          )}

          {/* Presets Quick Grid */}
          {!searchQuery && presets.some((p) => Boolean(p.defaultModel)) && (
            <div className="mt-2 pt-2 border-t border-zinc-100">
              <div className="text-[10px] font-semibold text-zinc-400 mb-1 px-1">
                {t('generator.presetModels')}
              </div>
              <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto pr-0.5">
                {presets.filter((p) => Boolean(p.defaultModel)).map((p) => {
                  const isSelected = p.defaultModel!.toLowerCase() === currentModel.toLowerCase();
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => handleSelect(p.defaultModel!)}
                      className={`flex items-center gap-1 px-2 py-0.5 rounded-md border text-[11px] font-medium transition-all cursor-pointer ${
                        isSelected
                          ? 'border-zinc-900 bg-zinc-900 text-white shadow-2xs'
                          : 'border-zinc-200 bg-zinc-50 text-zinc-700 hover:border-zinc-300 hover:bg-white'
                      }`}
                      title={`${p.name} - ${p.defaultModel}\n${p.description}`}
                    >
                      <BrandIcon icon={p.icon} className="h-3 w-3 shrink-0" />
                      <span className="truncate max-w-[100px]">{p.tag || p.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Filtered Candidate List */}
          <div className="mt-2 pt-2 border-t border-zinc-100 max-h-36 overflow-y-auto space-y-0.5 pr-0.5">
            {filteredModels.length > 0 ? (
              filteredModels.map((model) => {
                const isSelected = model.toLowerCase() === currentModel.toLowerCase();
                const icon = guessBrandIcon(model);
                return (
                  <button
                    key={model}
                    type="button"
                    onClick={() => handleSelect(model)}
                    className={`flex items-center justify-between w-full px-2 py-1.5 rounded-lg text-xs transition-colors cursor-pointer text-left ${
                      isSelected
                        ? 'bg-zinc-100 font-semibold text-zinc-900'
                        : 'hover:bg-zinc-50 text-zinc-700'
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate min-w-0">
                      {icon ? (
                        <BrandIcon icon={icon} className="h-3.5 w-3.5 shrink-0" />
                      ) : (
                        <Cpu className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
                      )}
                      <span className="truncate font-mono text-[11px]">{model}</span>
                    </div>
                    {isSelected && <Check className="h-3.5 w-3.5 text-emerald-600 shrink-0 ml-1.5" />}
                  </button>
                );
              })
            ) : (
              <div className="py-2 text-center text-xs text-zinc-400">
                <span>{t('generator.noMatchingModels')}</span>
              </div>
            )}
          </div>

          {/* Footer Settings Link */}
          {onOpenSettings && (
            <div className="mt-2 pt-2 border-t border-zinc-100 flex items-center justify-end">
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  onOpenSettings();
                }}
                className="flex items-center gap-1 text-[10px] text-zinc-400 hover:text-zinc-700 transition-colors cursor-pointer"
              >
                <span>{t('generator.configureApiCredentials')}</span>
                <ExternalLink className="h-2.5 w-2.5" />
              </button>
            </div>
          )}
        </div>
      </>
    )}
  </div>
);
};

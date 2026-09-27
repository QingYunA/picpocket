import React, { useState } from 'react';
import { AlertCircle, Check, Plus, RefreshCw, Search } from 'lucide-react';
import { fetchAvailableModels } from '@/services/modelFetcher';
import { useI18n } from '@/i18n';

interface ImageChannelModelsProps {
  baseUrl: string;
  apiKey: string;
  models: string[];
  defaultModel: string;
  suggestions: string[];
  onChange: (models: string[], defaultModel: string) => void;
}

export const ImageChannelModels: React.FC<ImageChannelModelsProps> = ({
  baseUrl, apiKey, models, defaultModel, suggestions, onChange,
}) => {
  const { t } = useI18n();
  const [available, setAvailable] = useState<string[]>(suggestions);
  const [query, setQuery] = useState('');
  const [manualModel, setManualModel] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const choices = Array.from(new Set([...models, ...available])).filter((model) =>
    model.toLowerCase().includes(query.trim().toLowerCase())
  );

  const toggleModel = (model: string) => {
    const next = models.includes(model) ? models.filter((item) => item !== model) : [...models, model];
    onChange(next, next.includes(defaultModel) ? defaultModel : (next[0] || ''));
  };

  const addManualModel = () => {
    const model = manualModel.trim();
    if (!model) return;
    if (!models.includes(model)) onChange([...models, model], defaultModel || model);
    setManualModel('');
    setQuery('');
  };

  const fetchModels = async () => {
    if (!baseUrl.trim()) return;
    setLoading(true);
    setError('');
    try {
      setAvailable(await fetchAvailableModels({ baseUrl, apiKey }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('options.image.fetchFailed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-2xl space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-medium text-zinc-600">{t('options.image.enabledModels', { count: models.length })}</span>
        <button type="button" onClick={fetchModels} disabled={loading || !baseUrl.trim()} className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold text-sky-700 hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-50">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          {loading ? t('options.image.fetchingModels') : t('options.image.fetchModels')}
        </button>
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          value={manualModel}
          onChange={(event) => setManualModel(event.target.value)}
          onKeyDown={(event) => { if (event.key === 'Enter') addManualModel(); }}
          placeholder={t('options.image.addModelPlaceholder')}
          aria-label={t('options.image.addModelPlaceholder')}
          className="min-w-0 flex-1 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-mono text-zinc-900 focus:border-zinc-900 focus:outline-none"
        />
        <button type="button" onClick={addManualModel} disabled={!manualModel.trim()} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-zinc-200 text-zinc-700 hover:bg-zinc-50 disabled:opacity-40" title={t('options.image.addModel')} aria-label={t('options.image.addModel')}>
          <Plus className="h-4 w-4" />
        </button>
      </div>
      <div className="overflow-hidden rounded-lg border border-zinc-200">
        <div className="relative border-b border-zinc-200">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('options.image.searchModels')}
            aria-label={t('options.image.searchModels')}
            className="w-full px-9 py-2.5 text-xs text-zinc-900 placeholder:text-zinc-500 focus:outline-none"
          />
        </div>
        <div className="max-h-72 overflow-y-auto overscroll-contain">
          {choices.length ? choices.map((model) => {
            const checked = models.includes(model);
            return (
              <div key={model} className="flex min-h-10 items-center gap-3 border-b border-zinc-100 px-3 py-2 last:border-b-0 hover:bg-zinc-50">
                <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5">
                  <input type="checkbox" checked={checked} onChange={() => toggleModel(model)} className="h-4 w-4 shrink-0 accent-zinc-900" />
                  <span className="min-w-0 break-all font-mono text-xs text-zinc-800">{model}</span>
                </label>
                {checked && (
                  <button type="button" onClick={() => onChange(models, model)} disabled={model === defaultModel} className={`shrink-0 rounded-md px-2 py-1 text-[11px] font-medium ${model === defaultModel ? 'bg-zinc-900 text-white' : 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900'}`}>
                    {model === defaultModel ? <span className="inline-flex items-center gap-1"><Check className="h-3 w-3" />{t('options.image.defaultModel')}</span> : t('options.image.setDefaultModel')}
                  </button>
                )}
              </div>
            );
          }) : <p className="px-3 py-5 text-center text-xs text-zinc-500">{t('options.image.noMatchingModels')}</p>}
        </div>
      </div>
      {error && <p role="alert" className="flex items-start gap-1.5 text-xs text-red-700"><AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{error}</p>}
    </div>
  );
};

import React, { useState } from 'react';
import { ConfigLayout } from '../../components/config-layout';
import { ConfigSection } from '../../components/config-section';
import { ConfigItem } from '../../components/config-item';
import { useI18n } from '@/i18n';
import type { UserSettings } from '@/types';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db';
import { refreshAllPromptSources } from '@/services/promptRuntime';
import { BUILTIN_REVERSE_PROMPT_PRESETS, getSystemPrompt } from '@/services/ai';
import {
  Layers,
  Sparkles,
  RefreshCw,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Sliders,
} from 'lucide-react';

interface PromptsPageProps {
  settings: UserSettings;
  onUpdateSettings: (updater: (prev: UserSettings) => UserSettings) => Promise<void>;
  highlightField?: string;
}

export const PromptsPage: React.FC<PromptsPageProps> = ({
  settings,
  onUpdateSettings,
  highlightField,
}) => {
  const { language, t } = useI18n();

  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatusMsg, setSyncStatusMsg] = useState<string | null>(null);

  const sources = useLiveQuery(() => db.promptSources.toArray()) || [];
  const currentPresetId = settings.reversePromptPresetId || BUILTIN_REVERSE_PROMPT_PRESETS[0]?.id || 'pure_aesthetics';
  const customPrompt = settings.customReversePrompt ?? '';

  const defaultPromptText = getSystemPrompt(language, currentPresetId);

  const handlePresetSelect = async (presetId: string) => {
    await onUpdateSettings((prev) => ({
      ...prev,
      reversePromptPresetId: presetId,
    }));
  };

  const handleCustomPromptChange = async (val: string) => {
    await onUpdateSettings((prev) => ({
      ...prev,
      customReversePrompt: val,
    }));
  };

  const handleResetPrompt = async () => {
    await onUpdateSettings((prev) => ({
      ...prev,
      customReversePrompt: '',
    }));
  };

  const handleToggleSource = async (sourceId: string, currentEnabled: boolean) => {
    await db.promptSources.update(sourceId, { enabled: !currentEnabled });
  };

  const handleSyncAll = async () => {
    setIsSyncing(true);
    setSyncStatusMsg(t('settings.syncingSources'));
    try {
      await refreshAllPromptSources();
      setSyncStatusMsg(t('settings.syncComplete'));
      setTimeout(() => setSyncStatusMsg(null), 3000);
    } catch (err) {
      setSyncStatusMsg(`${t('options.prompts.syncFailed')}${String(err)}`);
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <ConfigLayout
      title={t('options.prompts.title')}
      description={t('options.prompts.description')}
      actions={
        <button
          type="button"
          onClick={handleSyncAll}
          disabled={isSyncing}
          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-zinc-900 text-white hover:bg-zinc-800 disabled:opacity-50 transition-all cursor-pointer shadow-2xs"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
          <span>{isSyncing ? t('settings.syncingSources') : t('settings.syncAllSources')}</span>
        </button>
      }
    >
      {/* 1. Custom Reverse System Prompt Workshop */}
      <ConfigSection
        title={t('options.prompts.workshopTitle')}
        description={t('options.prompts.workshopDesc')}
        icon={<Sparkles className="h-4 w-4 text-amber-500" />}
        actions={
          customPrompt ? (
            <button
              type="button"
              onClick={handleResetPrompt}
              className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-900 transition-colors cursor-pointer"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>{t('options.prompts.resetToDefault')}</span>
            </button>
          ) : null
        }
      >
        {/* Preset Selector */}
        <ConfigItem
          title={t('options.prompts.presetTitle')}
          description={t('options.prompts.presetDesc')}
          orientation="vertical"
        >
          <div className="flex flex-wrap gap-2 pt-1">
            {BUILTIN_REVERSE_PROMPT_PRESETS.map((p) => {
              const isSelected = currentPresetId === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handlePresetSelect(p.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-zinc-900 text-white shadow-2xs'
                      : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                  }`}
                >
                  {language === 'zh' ? p.nameZh : p.nameEn}
                </button>
              );
            })}
          </div>
        </ConfigItem>

        {/* Textarea for System Prompt */}
        <ConfigItem
          title={t('options.prompts.editorTitle')}
          description={t('options.prompts.editorDesc')}
          orientation="vertical"
          highlight={highlightField === 'systemPrompt'}
        >
          <div className="space-y-2 pt-1">
            <textarea
              rows={12}
              value={customPrompt || defaultPromptText}
              onChange={(e) => handleCustomPromptChange(e.target.value)}
              placeholder={t('options.prompts.customSystemPromptPlaceholder')}
              className="w-full font-mono text-xs p-3.5 rounded-xl border border-zinc-200 bg-zinc-50/50 text-zinc-800 leading-relaxed focus:bg-white focus:border-zinc-900 focus:outline-none transition-all resize-y"
            />
            <div className="flex items-center justify-between text-[11px] text-zinc-400">
              <span>
                {customPrompt
                  ? t('options.prompts.customPromptEnabled')
                  : t('options.prompts.defaultPromptHint')}
              </span>
              <span>{(customPrompt || defaultPromptText).length} {t('options.prompts.charCount')}</span>
            </div>
          </div>
        </ConfigItem>
      </ConfigSection>

      {/* 2. Open Source Prompt Sources Management */}
      <ConfigSection
        title={t('settings.promptSourcesTitle')}
        description={t('settings.promptSourcesDesc')}
        icon={<Layers className="h-4 w-4 text-sky-500" />}
        actions={
          syncStatusMsg && (
            <span className="text-xs font-medium text-emerald-600 flex items-center gap-1">
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>{syncStatusMsg}</span>
            </span>
          )
        }
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 py-4">
          {sources.map((source) => (
            <div
              key={source.id}
              className={`p-4 rounded-xl border transition-all flex flex-col justify-between ${
                source.enabled
                  ? 'border-zinc-200 bg-white shadow-2xs'
                  : 'border-zinc-200/60 bg-zinc-50/60 opacity-60'
              }`}
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-zinc-900">{source.name}</span>
                    {source.builtIn && (
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-sky-50 text-sky-700 border border-sky-200/60">
                        {t('options.prompts.officialFeatured')}
                      </span>
                    )}
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={source.enabled}
                      onChange={() => handleToggleSource(source.id, source.enabled)}
                      className="sr-only peer"
                    />
                    <div className="w-8 h-4 bg-zinc-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-zinc-900" />
                  </label>
                </div>
                {source.homepage && (
                  <p className="text-[11px] text-zinc-500 line-clamp-1 leading-relaxed mb-3 truncate">
                    {source.homepage}
                  </p>
                )}
              </div>

              <div className="flex items-center justify-between text-[10px] text-zinc-400 pt-2 border-t border-zinc-100">
                <span>
                  {source.count !== undefined ? `${source.count} ${t('options.prompts.promptsCount')}` : t('options.prompts.notSynced')}
                </span>
                {source.lastSuccessAt ? (
                  <span>
                    {t('options.prompts.lastUpdated')}{new Date(source.lastSuccessAt).toLocaleDateString()}
                  </span>
                ) : (
                  <span>{t('options.prompts.neverSynced')}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </ConfigSection>
    </ConfigLayout>
  );
};

import React, { useState, useEffect, useRef } from 'react';
import { ConfigLayout } from '../../components/config-layout';
import { ConfigSection } from '../../components/config-section';
import { ConfigItem } from '../../components/config-item';
import { EntityEditorLayout, type EntityListItem } from '../../components/entity-editor-layout';
import { BrandIcon } from '@/entrypoints/sidepanel/components/BrandIcon';
import { ImageChannelModels } from './ImageChannelModels';
import { IMAGE_PROVIDERS, enabledImageModels, getImageChannels, imageModelsForProvider, withImageChannels } from '@/config/imageChannels';
import { useI18n, type TranslationKey } from '@/i18n';
import type { UserSettings, ImageAspectRatio, ImageChannel } from '@/types';
import { sanitizeHttpHeaderToken, sanitizeHttpUrl } from '@/utils/sanitize';
import { testApiEndpoint } from '../../utils/connectionTest';
import {
  Check,
  AlertCircle,
  Activity,
  Globe,
  Key,
  Wand2,
  Bookmark,
  Zap,
  LayoutGrid,
  Plus,
  Trash2,
  X,
} from 'lucide-react';

interface ImageModelPageProps {
  settings: UserSettings;
  onUpdateSettings: (updater: (prev: UserSettings) => UserSettings) => Promise<void>;
  initialProvider?: string;
  highlightField?: string;
}

const ASPECT_RATIO_OPTIONS: Array<{ value: ImageAspectRatio; labelKey: TranslationKey; sub: string }> = [
  { value: '1:1', labelKey: 'options.models.ratioSquare', sub: '1024×1024' },
  { value: '16:9', labelKey: 'options.models.ratioLandscape', sub: '1344×768' },
  { value: '9:16', labelKey: 'options.models.ratioPortrait', sub: '768×1344' },
  { value: '4:3', labelKey: 'options.models.ratioClassicWide', sub: '1152×864' },
  { value: '3:4', labelKey: 'options.models.ratioClassicTall', sub: '864×1152' },
];

export const ImageModelPage: React.FC<ImageModelPageProps> = ({
  settings,
  onUpdateSettings,
  initialProvider,
  highlightField,
}) => {
  const { t } = useI18n();

  const channels = getImageChannels(settings);
  const activeChannelId = settings.activeImageChannelId || channels[0]?.id;
  const [selectedChannelId, setSelectedChannelId] = useState<string>(() => {
    const initial = channels.find((channel) => channel.id === initialProvider || channel.providerId === initialProvider);
    return initial?.id || activeChannelId || '';
  });
  const [addingChannel, setAddingChannel] = useState(false);
  const [deletePending, setDeletePending] = useState(false);
  const [draft, setDraft] = useState<{ id: string; changes: Partial<ImageChannel> } | null>(null);
  const appliedProviderRef = useRef<string | undefined>(undefined);
  const editVersionRef = useRef(0);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    if (!channels.length) return;
    const requested = channels.find((channel) => channel.id === initialProvider || channel.providerId === initialProvider);
    if (initialProvider && requested && appliedProviderRef.current !== initialProvider) {
      appliedProviderRef.current = initialProvider;
      setSelectedChannelId(requested.id);
      return;
    }
    if (!initialProvider) appliedProviderRef.current = undefined;
    setSelectedChannelId((current) => channels.some((channel) => channel.id === current)
      ? current
      : activeChannelId || channels[0]!.id);
  }, [channels, initialProvider, activeChannelId]);

  const [showKey, setShowKey] = useState(false);
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'failed'>('idle');
  const [testMessage, setTestMessage] = useState('');
  const [testLatency, setTestLatency] = useState<number | null>(null);

  const displayedChannels = channels.map((channel) => draft?.id === channel.id ? { ...channel, ...draft.changes } : channel);
  const selectedChannel = displayedChannels.find((channel) => channel.id === selectedChannelId) || displayedChannels[0];
  const selectedProvider = IMAGE_PROVIDERS.find((provider) => provider.id === selectedChannel?.providerId);
  const recommendedModels = selectedChannel ? imageModelsForProvider(selectedChannel.providerId) : [];

  const railItems: EntityListItem[] = displayedChannels.map((channel) => {
    const provider = IMAGE_PROVIDERS.find((item) => item.id === channel.providerId);
    return {
      id: channel.id,
      name: channel.name,
      subtitle: enabledImageModels(channel).length
        ? t('options.image.enabledModels', { count: enabledImageModels(channel).length })
        : channel.baseUrl || t('options.image.modelEmpty'),
      icon: provider ? <BrandIcon icon={provider.icon} className="h-4 w-4" /> : <Globe className="h-4 w-4" />,
      isActive: channel.id === activeChannelId,
    };
  });

  const enqueueUpdate = (updater: (prev: UserSettings) => UserSettings): Promise<void> => {
    const operation = saveQueueRef.current.then(() => onUpdateSettings(updater));
    saveQueueRef.current = operation.catch(() => {});
    return operation;
  };

  const updateChannel = async (changes: Partial<ImageChannel>) => {
    if (!selectedChannel) return;
    const channelId = selectedChannel.id;
    const version = ++editVersionRef.current;
    setDraft((current) => ({
      id: channelId,
      changes: current?.id === channelId ? { ...current.changes, ...changes } : changes,
    }));
    setTestStatus('idle');
    try {
      await enqueueUpdate((prev) => withImageChannels(
        prev,
        getImageChannels(prev).map((channel) => channel.id === channelId ? { ...channel, ...changes } : channel),
        prev.activeImageChannelId || getImageChannels(prev)[0]?.id
      ));
    } finally {
      if (editVersionRef.current === version) setDraft(null);
    }
  };

  const addChannel = async (providerId: string) => {
    const provider = IMAGE_PROVIDERS.find((item) => item.id === providerId);
    const channel: ImageChannel = {
      id: crypto.randomUUID(),
      name: provider?.name || t('options.image.customChannel'),
      providerId,
      apiKey: '',
      baseUrl: provider?.baseUrl || '',
      model: imageModelsForProvider(providerId)[0]?.defaultModel || '',
      models: imageModelsForProvider(providerId)[0]?.defaultModel ? [imageModelsForProvider(providerId)[0]!.defaultModel] : [],
    };
    await enqueueUpdate((prev) => {
      const previous = getImageChannels(prev);
      return withImageChannels(prev, [...previous, channel], prev.activeImageChannelId || previous[0]?.id || channel.id);
    });
    setSelectedChannelId(channel.id);
    setAddingChannel(false);
    setDeletePending(false);
  };

  const setDefaultChannel = async () => {
    if (!selectedChannel) return;
    await enqueueUpdate((prev) => withImageChannels(prev, getImageChannels(prev), selectedChannel.id));
  };

  const deleteChannel = async () => {
    if (!selectedChannel) return;
    await enqueueUpdate((prev) => {
      const remaining = getImageChannels(prev).filter((channel) => channel.id !== selectedChannel.id);
      return withImageChannels(prev, remaining, prev.activeImageChannelId === selectedChannel.id ? remaining[0]?.id : prev.activeImageChannelId);
    });
    setDeletePending(false);
  };

  const handleAutoSaveGalleryToggle = async (enabled: boolean) => {
    await enqueueUpdate((prev) => ({ ...prev, autoSaveGeneratedToGallery: enabled }));
  };

  const handleAspectRatioChange = async (ratio: ImageAspectRatio) => {
    await enqueueUpdate((prev) => ({ ...prev, defaultImageAspectRatio: ratio }));
  };

  const handleTestConnection = async () => {
    setTestStatus('testing');
    setTestMessage(t('settings.testingConnection'));
    setTestLatency(null);

    if (!selectedChannel) return;
    const testKey = selectedChannel.apiKey || settings.apiKey;
    const testUrl = selectedChannel.baseUrl;
    const res = await testApiEndpoint(testUrl, testKey, t);
    setTestStatus(res.status);
    setTestMessage(res.message);
    setTestLatency(res.latency);
  };

  return (
    <ConfigLayout
      title={t('options.image.title')}
      description={t('options.image.description')}
      actions={<button type="button" onClick={() => setAddingChannel((open) => !open)} className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-3 py-2 text-xs font-semibold text-white hover:bg-zinc-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900"><Plus className="h-4 w-4" />{t('options.image.addChannel')}</button>}
    >
      {addingChannel && (
        <div className="border-b border-zinc-200 pb-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-zinc-900">{t('options.image.chooseProvider')}</h2>
            <button type="button" onClick={() => setAddingChannel(false)} title={t('options.image.cancel')} aria-label={t('options.image.cancel')} className="rounded-md p-1 text-zinc-500 hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-zinc-900"><X className="h-4 w-4" /></button>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {IMAGE_PROVIDERS.map((provider) => (
              <button key={provider.id} type="button" onClick={() => addChannel(provider.id)} className="flex items-center gap-3 rounded-lg border border-zinc-200 bg-white px-3 py-3 text-left text-xs font-medium text-zinc-800 hover:border-zinc-400 hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-zinc-900">
                <BrandIcon icon={provider.icon} className="h-5 w-5 shrink-0" />
                <span>{provider.name}</span>
              </button>
            ))}
            <button type="button" onClick={() => addChannel('custom')} className="flex items-center gap-3 rounded-lg border border-zinc-200 bg-white px-3 py-3 text-left text-xs font-medium text-zinc-800 hover:border-zinc-400 hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-zinc-900">
              <Globe className="h-5 w-5 shrink-0" />
              <span>{t('options.image.customChannel')}</span>
            </button>
          </div>
        </div>
      )}
      <EntityEditorLayout
        items={railItems}
        selectedId={selectedChannel?.id || ''}
        onSelectId={(id) => {
          setSelectedChannelId(id);
          setDeletePending(false);
          setTestStatus('idle');
          setTestMessage('');
          setTestLatency(null);
        }}
        railTitle={t('options.image.railTitle')}
      >
        {selectedChannel ? (
        <ConfigSection
          title={selectedChannel.name}
          description={selectedProvider?.name || t('options.image.customChannel')}
          icon={selectedProvider ? <BrandIcon icon={selectedProvider.icon} className="h-5 w-5" /> : <Globe className="h-5 w-5" />}
          badge={
            selectedChannel.id === activeChannelId ? (
              <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                <Check className="h-3 w-3" />
                <span>{t('options.image.activeBadge')}</span>
              </span>
            ) : (
              <button
                type="button"
                onClick={setDefaultChannel}
                className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-0.5 rounded-lg bg-zinc-900 text-white hover:bg-zinc-800 shadow-2xs transition-colors cursor-pointer"
              >
                <Zap className="h-3 w-3 text-amber-400" />
                <span>{t('options.image.setAsDefaultBtn')}</span>
              </button>
            )
          }
          actions={<button type="button" onClick={() => setDeletePending(true)} title={t('options.image.deleteChannel')} aria-label={t('options.image.deleteChannel')} className="rounded-md p-2 text-zinc-500 hover:bg-zinc-100 hover:text-red-700 focus-visible:outline-2 focus-visible:outline-red-600"><Trash2 className="h-4 w-4" /></button>}
        >
          {deletePending && <div className="flex flex-wrap items-center justify-between gap-3 py-3 text-xs text-red-700"><span>{t('options.image.deleteConfirm')}</span><div className="flex gap-2"><button type="button" onClick={() => setDeletePending(false)} className="rounded-md border border-zinc-200 px-3 py-1.5 text-zinc-700">{t('options.image.cancel')}</button><button type="button" onClick={deleteChannel} className="rounded-md bg-red-600 px-3 py-1.5 font-semibold text-white">{t('options.image.deleteChannel')}</button></div></div>}
          <ConfigItem title={t('options.image.channelName')} description={t('options.image.channelNameHint')} icon={<Globe className="h-4 w-4" />} orientation="vertical">
            <input type="text" maxLength={32} value={selectedChannel.name} onChange={(e) => updateChannel({ name: e.target.value })} className="w-full max-w-2xl rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-900 focus:border-zinc-900 focus:outline-none" />
          </ConfigItem>
          {/* Image API Key */}
          <ConfigItem
            title={t('settings.imageApiKeyLabel')}
            description={t('settings.imageApiKeyHint')}
            icon={<Key className="h-4 w-4" />}
            orientation="vertical"
            highlight={highlightField === 'imageApiKey'}
            id="field-imageApiKey"
          >
            <div className="w-full max-w-2xl space-y-1.5">
              <div className="relative">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={selectedChannel.apiKey}
                  onChange={(e) => updateChannel({ apiKey: e.target.value })}
                  onBlur={() => {
                    if (selectedChannel.apiKey) {
                      updateChannel({ apiKey: sanitizeHttpHeaderToken(selectedChannel.apiKey) });
                    }
                  }}
                  placeholder={settings.apiKey ? t('settings.inheritMainKeyPlaceholder') : 'sk-...'}
                  className="w-full rounded-xl border border-zinc-200 bg-zinc-50/50 px-3.5 py-2.5 pr-14 text-xs font-mono text-zinc-900 focus:border-zinc-900 focus:bg-white focus:outline-none transition-all shadow-2xs"
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-zinc-400 hover:text-zinc-700 font-medium px-1 cursor-pointer"
                >
                  {showKey ? t('settings.hideKey') : t('settings.showKey')}
                </button>
              </div>
              {Boolean(selectedChannel.apiKey && /[^\x20-\x7E]/.test(selectedChannel.apiKey)) && (
                <p className="flex items-center gap-1 text-[11px] text-amber-600">
                  <AlertCircle className="h-3 w-3 shrink-0" />
                  <span>{t('settings.cleanTokenNotice')}</span>
                </p>
              )}
            </div>
          </ConfigItem>

          {/* Image Base URL */}
          <ConfigItem
            title={t('settings.imageBaseUrlLabel')}
            description={t('settings.imageBaseUrlHint')}
            icon={<Globe className="h-4 w-4" />}
            orientation="vertical"
          >
            <div className="w-full max-w-2xl">
              <input
                type="text"
                value={selectedChannel.baseUrl}
                onChange={(e) => updateChannel({ baseUrl: e.target.value })}
                onBlur={() => {
                  if (selectedChannel.baseUrl) {
                    updateChannel({ baseUrl: sanitizeHttpUrl(selectedChannel.baseUrl) });
                  }
                }}
                placeholder={selectedProvider?.baseUrl || 'https://api.example.com/v1'}
                className="w-full rounded-xl border border-zinc-200 bg-zinc-50/50 px-3.5 py-2.5 text-xs font-mono text-zinc-900 focus:border-zinc-900 focus:bg-white focus:outline-none transition-all shadow-2xs"
              />
            </div>
          </ConfigItem>

          {/* Image Model with Dynamic Fetch */}
          <ConfigItem
            title={t('options.image.channelModelsTitle')}
            description={t('options.image.channelModelHint')}
            icon={<Wand2 className="h-4 w-4" />}
            orientation="vertical"
          >
            <div className="w-full max-w-2xl">
              <ImageChannelModels
                key={`${selectedChannel.id}:${selectedChannel.baseUrl}`}
                baseUrl={selectedChannel.baseUrl}
                apiKey={selectedChannel.apiKey || settings.apiKey}
                models={enabledImageModels(selectedChannel)}
                defaultModel={selectedChannel.model}
                suggestions={recommendedModels.map((model) => model.defaultModel)}
                onChange={(models, model) => updateChannel({ models, model })}
              />
            </div>
          </ConfigItem>

          {/* Connection Test Probe */}
          <ConfigItem
            title={t('settings.testConnection')}
            description={t('options.image.testConnectionDesc')}
            icon={<Activity className="h-4 w-4" />}
            orientation="vertical"
          >
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 pt-1">
              <button
                type="button"
                onClick={handleTestConnection}
                disabled={testStatus === 'testing' || !selectedChannel.baseUrl.trim()}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold bg-zinc-900 hover:bg-zinc-800 text-white transition-colors disabled:opacity-50 cursor-pointer shadow-2xs"
              >
                <Activity className={`h-3.5 w-3.5 ${testStatus === 'testing' ? 'animate-spin' : ''}`} />
                <span>
                  {testStatus === 'testing' ? t('settings.testingConnection') : t('settings.testConnection')}
                </span>
              </button>

              {testStatus !== 'idle' && (
                <div
                  className={`flex items-center gap-1.5 text-xs px-3.5 py-2 rounded-xl border ${
                    testStatus === 'success'
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200/60'
                      : testStatus === 'failed'
                      ? 'bg-red-50 text-red-700 border-red-200/60'
                      : 'bg-zinc-50 text-zinc-600 border-zinc-200'
                  }`}
                >
                  {testStatus === 'success' ? (
                    <Check className="h-3.5 w-3.5 shrink-0" />
                  ) : testStatus === 'failed' ? (
                    <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  ) : null}
                  <span>{testMessage}</span>
                  {testLatency !== null && (
                    <span className="font-mono text-[10px] text-zinc-400 ml-1">
                      ({testLatency}ms)
                    </span>
                  )}
                </div>
              )}
            </div>
          </ConfigItem>
        </ConfigSection>
        ) : (
          <div className="flex min-h-52 flex-col items-center justify-center border-y border-zinc-200 px-6 py-10 text-center">
            <Globe className="mb-3 h-6 w-6 text-zinc-400" />
            <h2 className="text-sm font-semibold text-zinc-900">{t('options.image.emptyTitle')}</h2>
            <p className="mt-1 text-xs text-zinc-500">{t('options.image.emptyDescription')}</p>
            <button type="button" onClick={() => setAddingChannel(true)} className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-2 text-xs font-semibold text-white hover:bg-zinc-800"><Plus className="h-4 w-4" />{t('options.image.addChannel')}</button>
          </div>
        )}
      </EntityEditorLayout>
      <ConfigSection title={t('options.image.preferencesTitle')}>
        <ConfigItem
          title={t('settings.autoSaveGalleryTitle')}
          description={t('settings.autoSaveGalleryDesc')}
          icon={<Bookmark className="h-4 w-4" />}
        >
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={settings.autoSaveGeneratedToGallery ?? false}
              onChange={(e) => handleAutoSaveGalleryToggle(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-10 h-5 bg-zinc-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-zinc-900" />
          </label>
        </ConfigItem>
        <ConfigItem
          title={t('options.models.aspectRatioTitle')}
          description={t('options.models.aspectRatioDesc')}
          icon={<LayoutGrid className="h-4 w-4" />}
          orientation="vertical"
        >
          <div className="flex flex-wrap gap-2.5 pt-1">
            {ASPECT_RATIO_OPTIONS.map((opt) => {
              const isSelected = (settings.defaultImageAspectRatio || '1:1') === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => handleAspectRatioChange(opt.value)}
                  className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-zinc-900 text-white border-zinc-900 shadow-2xs'
                      : 'bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-50'
                  }`}
                >
                  <span>{t(opt.labelKey)}</span>
                  <span className={`text-[10px] ${isSelected ? 'text-zinc-300' : 'text-zinc-400'}`}>
                    {opt.sub}
                  </span>
                </button>
              );
            })}
          </div>
        </ConfigItem>
      </ConfigSection>
    </ConfigLayout>
  );
};

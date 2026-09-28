import React, { useEffect, useRef, useState } from 'react';
import { ConfigLayout } from '../../components/config-layout';
import { ConfigSection } from '../../components/config-section';
import { ConfigItem } from '../../components/config-item';
import { EntityEditorLayout, type EntityListItem } from '../../components/entity-editor-layout';
import { BrandIcon } from '@/entrypoints/sidepanel/components/BrandIcon';
import { ModelCombobox } from '@/entrypoints/sidepanel/components/ModelCombobox';
import { VISION_PROVIDERS, getConfiguredVisionChannels, withVisionChannels } from '@/config/visionChannels';
import { currentChannelModel } from '@/config/channelSelection';
import { PICPOCKET_CHANNEL_ID, hostedVisionModel } from '@/config/hostedModels';
import { Logo } from '@/components/Logo';
import { PicPocketChannelPanel } from '../../components/picpocket-channel-panel';
import { useI18n } from '@/i18n';
import type { UserSettings, VisionChannel } from '@/types';
import { sanitizeHttpHeaderToken, sanitizeHttpUrl } from '@/utils/sanitize';
import { testApiEndpoint } from '../../utils/connectionTest';
import { Activity, AlertCircle, Check, Cpu, Globe, Key, Plus, Trash2, X, Zap } from 'lucide-react';

interface VisionModelPageProps {
  settings: UserSettings;
  onUpdateSettings: (updater: (prev: UserSettings) => UserSettings) => Promise<void>;
  initialProvider?: string;
  highlightField?: string;
}

export const VisionModelPage: React.FC<VisionModelPageProps> = ({
  settings,
  onUpdateSettings,
  initialProvider,
  highlightField,
}) => {
  const { t } = useI18n();
  const channels = getConfiguredVisionChannels(settings);
  const activeChannelId = currentChannelModel(settings, 'vision').channelId;
  // 编辑、添加渠道时保持当前使用的渠道不变
  const keepActive = (prev: UserSettings) => currentChannelModel(prev, 'vision').channelId;
  const [selectedChannelId, setSelectedChannelId] = useState(() => {
    const initial = channels.find((channel) => channel.id === initialProvider || channel.providerId === initialProvider);
    return initial?.id || activeChannelId || '';
  });
  const [addingChannel, setAddingChannel] = useState(false);
  const [deletePending, setDeletePending] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'failed'>('idle');
  const [testMessage, setTestMessage] = useState('');
  const [testLatency, setTestLatency] = useState<number | null>(null);
  const [draft, setDraft] = useState<{ id: string; changes: Partial<VisionChannel> } | null>(null);
  const appliedProviderRef = useRef<string | undefined>(undefined);
  const editVersionRef = useRef(0);
  const testRequestRef = useRef(0);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    const requested = channels.find((channel) => channel.id === initialProvider || channel.providerId === initialProvider);
    if (initialProvider && requested && appliedProviderRef.current !== initialProvider) {
      appliedProviderRef.current = initialProvider;
      setSelectedChannelId(requested.id);
      return;
    }
    if (!initialProvider) appliedProviderRef.current = undefined;
    setSelectedChannelId((current) => current === PICPOCKET_CHANNEL_ID || channels.some((channel) => channel.id === current)
      ? current
      : activeChannelId);
  }, [channels, initialProvider, activeChannelId]);

  const displayedChannels = channels.map((channel) => draft?.id === channel.id ? { ...channel, ...draft.changes } : channel);
  const picpocketSelected = selectedChannelId === PICPOCKET_CHANNEL_ID || !displayedChannels.length;
  const selectedChannel = picpocketSelected ? undefined : displayedChannels.find((channel) => channel.id === selectedChannelId) || displayedChannels[0];
  const providerFor = (channel: VisionChannel) => VISION_PROVIDERS.find((provider) =>
    provider.id === channel.providerId && provider.baseUrl === channel.baseUrl.trim().replace(/\/+$/, '')
  );
  const selectedProvider = selectedChannel ? providerFor(selectedChannel) : undefined;
  const picpocketModel = hostedVisionModel(settings.hostedVisionModel);
  const railItems: EntityListItem[] = [{
    id: PICPOCKET_CHANNEL_ID,
    name: t('channels.picpocketName'),
    subtitle: picpocketModel,
    icon: <Logo size={16} />,
    isActive: activeChannelId === PICPOCKET_CHANNEL_ID,
  }, ...displayedChannels.map((channel) => {
    const provider = providerFor(channel);
    return {
      id: channel.id,
      name: channel.name,
      subtitle: channel.model || channel.baseUrl || t('options.vision.modelEmpty'),
      icon: provider ? <BrandIcon icon={provider.icon} className="h-4 w-4" /> : <Globe className="h-4 w-4" />,
      isActive: channel.id === activeChannelId,
    };
  })];

  const resetTest = () => {
    testRequestRef.current += 1;
    setTestStatus('idle');
    setTestMessage('');
    setTestLatency(null);
  };

  const enqueueUpdate = (updater: (prev: UserSettings) => UserSettings): Promise<void> => {
    const operation = saveQueueRef.current.then(() => onUpdateSettings(updater));
    saveQueueRef.current = operation.catch(() => {});
    return operation;
  };

  const updateChannel = async (changes: Partial<VisionChannel>) => {
    if (!selectedChannel) return;
    const channelId = selectedChannel.id;
    const version = ++editVersionRef.current;
    setDraft((current) => ({
      id: channelId,
      changes: current?.id === channelId ? { ...current.changes, ...changes } : changes,
    }));
    resetTest();
    try {
      await enqueueUpdate((prev) => withVisionChannels(
        prev,
        getConfiguredVisionChannels(prev).map((channel) => channel.id === channelId ? { ...channel, ...changes } : channel),
        keepActive(prev)
      ));
    } finally {
      if (editVersionRef.current === version) setDraft(null);
    }
  };

  const addChannel = async (providerId: string) => {
    const provider = VISION_PROVIDERS.find((item) => item.id === providerId);
    const channel: VisionChannel = {
      id: crypto.randomUUID(),
      name: provider?.name || t('options.vision.customChannel'),
      providerId,
      apiKey: '',
      baseUrl: provider?.baseUrl || '',
      model: '',
    };
    await enqueueUpdate((prev) => withVisionChannels(prev, [...getConfiguredVisionChannels(prev), channel], keepActive(prev)));
    setSelectedChannelId(channel.id);
    setAddingChannel(false);
    setDeletePending(false);
    resetTest();
  };

  const setDefaultChannel = async () => {
    const targetId = selectedChannel?.id ?? PICPOCKET_CHANNEL_ID;
    await enqueueUpdate((prev) => withVisionChannels(prev, getConfiguredVisionChannels(prev), targetId));
  };

  const selectPicpocketModel = async (model: string) => {
    await enqueueUpdate((prev) => ({ ...prev, hostedVisionModel: model }));
  };

  const deleteChannel = async () => {
    if (!selectedChannel) return;
    await enqueueUpdate((prev) => {
      const remaining = getConfiguredVisionChannels(prev).filter((channel) => channel.id !== selectedChannel.id);
      // 删掉的是当前使用的渠道时回到 PicPocket 官方渠道
      const active = keepActive(prev);
      return withVisionChannels(prev, remaining, active === selectedChannel.id ? PICPOCKET_CHANNEL_ID : active);
    });
    setDeletePending(false);
    resetTest();
  };

  const handleTestConnection = async () => {
    if (!selectedChannel) return;
    const requestId = ++testRequestRef.current;
    setTestStatus('testing');
    setTestMessage(t('settings.testingConnection'));
    setTestLatency(null);
    const result = await testApiEndpoint(selectedChannel.baseUrl, selectedChannel.apiKey, t);
    if (testRequestRef.current !== requestId) return;
    setTestStatus(result.status);
    setTestMessage(result.message);
    setTestLatency(result.latency);
  };

  return (
    <ConfigLayout
      title={t('options.vision.title')}
      description={t('options.vision.description')}
      actions={(
        <button type="button" onClick={() => setAddingChannel((open) => !open)} className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-3 py-2 text-xs font-semibold text-white hover:bg-zinc-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900">
          <Plus className="h-4 w-4" />{t('options.vision.addChannel')}
        </button>
      )}
    >
      {addingChannel && (
        <div className="border-b border-zinc-200 pb-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-zinc-900">{t('options.vision.chooseProvider')}</h2>
            <button type="button" onClick={() => setAddingChannel(false)} title={t('options.vision.cancel')} aria-label={t('options.vision.cancel')} className="rounded-md p-1 text-zinc-500 hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-zinc-900"><X className="h-4 w-4" /></button>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {VISION_PROVIDERS.map((provider) => (
              <button key={provider.id} type="button" onClick={() => addChannel(provider.id)} className="flex items-center gap-3 rounded-lg border border-zinc-200 bg-white px-3 py-3 text-left text-xs font-medium text-zinc-800 hover:border-zinc-400 hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-zinc-900">
                <BrandIcon icon={provider.icon} className="h-5 w-5 shrink-0" />
                <span>{provider.name}</span>
              </button>
            ))}
            <button type="button" onClick={() => addChannel('custom')} className="flex items-center gap-3 rounded-lg border border-zinc-200 bg-white px-3 py-3 text-left text-xs font-medium text-zinc-800 hover:border-zinc-400 hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-zinc-900">
              <Globe className="h-5 w-5 shrink-0" />
              <span>{t('options.vision.customChannel')}</span>
            </button>
          </div>
        </div>
      )}

      <EntityEditorLayout
        items={railItems}
        selectedId={selectedChannel?.id || PICPOCKET_CHANNEL_ID}
        onSelectId={(id) => {
          setSelectedChannelId(id);
          setDeletePending(false);
          resetTest();
        }}
        railTitle={t('options.vision.railTitle')}
      >
        {selectedChannel ? (
          <ConfigSection
            title={selectedChannel.name}
            description={selectedProvider?.description || t('options.vision.customChannel')}
            icon={selectedProvider ? <BrandIcon icon={selectedProvider.icon} className="h-5 w-5" /> : <Globe className="h-5 w-5" />}
            badge={selectedChannel.id === activeChannelId ? (
              <span className="flex items-center gap-1 rounded-full border border-emerald-200/60 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                <Check className="h-3 w-3" />{t('options.vision.activeBadge')}
              </span>
            ) : (
              <button type="button" onClick={setDefaultChannel} className="flex items-center gap-1 rounded-lg bg-zinc-900 px-2.5 py-0.5 text-[11px] font-semibold text-white hover:bg-zinc-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900">
                <Zap className="h-3 w-3 text-amber-400" />{t('options.vision.setAsDefaultBtn')}
              </button>
            )}
            actions={<button type="button" onClick={() => setDeletePending(true)} title={t('options.vision.deleteChannel')} aria-label={t('options.vision.deleteChannel')} className="rounded-md p-2 text-zinc-500 hover:bg-zinc-100 hover:text-red-700 focus-visible:outline-2 focus-visible:outline-red-600"><Trash2 className="h-4 w-4" /></button>}
          >
            {deletePending && (
              <div className="flex flex-wrap items-center justify-between gap-3 py-3 text-xs text-red-700">
                <span>{t('options.vision.deleteConfirm')}</span>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setDeletePending(false)} className="rounded-md border border-zinc-200 px-3 py-1.5 text-zinc-700">{t('options.vision.cancel')}</button>
                  <button type="button" onClick={deleteChannel} className="rounded-md bg-red-600 px-3 py-1.5 font-semibold text-white">{t('options.vision.deleteChannel')}</button>
                </div>
              </div>
            )}
            <ConfigItem title={t('options.vision.channelName')} description={t('options.vision.channelNameHint')} icon={<Globe className="h-4 w-4" />} orientation="vertical">
              <input type="text" maxLength={32} value={selectedChannel.name} onChange={(event) => updateChannel({ name: event.target.value })} className="w-full max-w-2xl rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-900 focus:border-zinc-900 focus:outline-none" />
            </ConfigItem>
            <ConfigItem title={t('settings.apiKeyLabel')} description={t('options.vision.apiKeyHint')} icon={<Key className="h-4 w-4" />} orientation="vertical" highlight={highlightField === 'apiKey'} id="field-apiKey">
              <div className="w-full max-w-2xl space-y-1.5">
                <div className="relative">
                  <input
                    type={showKey ? 'text' : 'password'}
                    value={selectedChannel.apiKey}
                    onChange={(event) => updateChannel({ apiKey: event.target.value })}
                    onBlur={() => {
                      if (selectedChannel.apiKey) updateChannel({ apiKey: sanitizeHttpHeaderToken(selectedChannel.apiKey) });
                    }}
                    placeholder={t('settings.apiKeyPlaceholder')}
                    className="w-full rounded-xl border border-zinc-200 bg-zinc-50/50 px-3.5 py-2.5 pr-14 font-mono text-xs text-zinc-900 shadow-2xs transition-all focus:border-zinc-900 focus:bg-white focus:outline-none"
                  />
                  <button type="button" onClick={() => setShowKey((shown) => !shown)} className="absolute right-3 top-1/2 -translate-y-1/2 px-1 text-[11px] font-medium text-zinc-400 hover:text-zinc-700">
                    {showKey ? t('settings.hideKey') : t('settings.showKey')}
                  </button>
                </div>
                {Boolean(selectedChannel.apiKey && /[^\x20-\x7E]/.test(selectedChannel.apiKey)) && (
                  <p className="flex items-center gap-1 text-[11px] text-amber-600"><AlertCircle className="h-3 w-3 shrink-0" />{t('settings.cleanTokenNotice')}</p>
                )}
              </div>
            </ConfigItem>
            <ConfigItem title={t('settings.baseUrlLabel')} description={t('options.vision.baseUrlHint')} icon={<Globe className="h-4 w-4" />} orientation="vertical">
              <input
                type="text"
                value={selectedChannel.baseUrl}
                onChange={(event) => updateChannel({ baseUrl: event.target.value })}
                onBlur={() => {
                  const baseUrl = sanitizeHttpUrl(selectedChannel.baseUrl);
                  const nextProvider = VISION_PROVIDERS.find((provider) => provider.baseUrl === baseUrl);
                  const previousProvider = VISION_PROVIDERS.find((provider) => provider.id === selectedChannel.providerId);
                  const usesPresetName = selectedChannel.name === previousProvider?.name || selectedChannel.name === t('options.vision.customChannel');
                  let name = selectedChannel.name;
                  if (usesPresetName) {
                    try {
                      name = nextProvider?.name || new URL(baseUrl).host || t('options.vision.customChannel');
                    } catch {
                      name = t('options.vision.customChannel');
                    }
                  }
                  updateChannel({ baseUrl, providerId: nextProvider?.id || 'custom', name });
                }}
                placeholder={selectedProvider?.baseUrl || 'https://api.example.com/v1'}
                className="w-full max-w-2xl rounded-xl border border-zinc-200 bg-zinc-50/50 px-3.5 py-2.5 font-mono text-xs text-zinc-900 shadow-2xs transition-all focus:border-zinc-900 focus:bg-white focus:outline-none"
              />
            </ConfigItem>
            <ConfigItem title={t('settings.modelLabel')} description={t('options.vision.modelHint')} icon={<Cpu className="h-4 w-4" />} orientation="vertical">
              <div className="w-full max-w-2xl">
                <ModelCombobox
                  key={`${selectedChannel.id}:${selectedChannel.baseUrl}`}
                  label=""
                  value={selectedChannel.model}
                  onChange={(model) => updateChannel({ model })}
                  placeholder={t('options.vision.modelPlaceholder')}
                  baseUrl={selectedChannel.baseUrl}
                  apiKey={selectedChannel.apiKey}
                />
              </div>
            </ConfigItem>
            <ConfigItem title={t('settings.testConnection')} description={t('options.vision.testConnectionDesc')} icon={<Activity className="h-4 w-4" />} orientation="vertical">
              <div className="flex flex-col items-start gap-3 pt-1 sm:flex-row sm:items-center">
                <button type="button" onClick={handleTestConnection} disabled={testStatus === 'testing' || !selectedChannel.baseUrl.trim()} className="flex items-center gap-2 rounded-xl bg-zinc-900 px-4 py-2.5 text-xs font-semibold text-white shadow-2xs transition-colors hover:bg-zinc-800 disabled:opacity-50">
                  <Activity className={`h-3.5 w-3.5 ${testStatus === 'testing' ? 'animate-spin' : ''}`} />
                  {testStatus === 'testing' ? t('settings.testingConnection') : t('settings.testConnection')}
                </button>
                {testStatus !== 'idle' && (
                  <div className={`flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-xs ${testStatus === 'success' ? 'border-emerald-200/60 bg-emerald-50 text-emerald-700' : testStatus === 'failed' ? 'border-red-200/60 bg-red-50 text-red-700' : 'border-zinc-200 bg-zinc-50 text-zinc-600'}`}>
                    {testStatus === 'success' && <Check className="h-3.5 w-3.5 shrink-0" />}
                    {testStatus === 'failed' && <AlertCircle className="h-3.5 w-3.5 shrink-0" />}
                    <span>{testMessage}</span>
                    {testLatency !== null && <span className="ml-1 font-mono text-[10px] opacity-70">({testLatency}ms)</span>}
                  </div>
                )}
              </div>
            </ConfigItem>
          </ConfigSection>
        ) : (
          <PicPocketChannelPanel
            capability="vision"
            isActive={activeChannelId === PICPOCKET_CHANNEL_ID}
            model={picpocketModel}
            onSetActive={setDefaultChannel}
            onSelectModel={selectPicpocketModel}
          />
        )}
      </EntityEditorLayout>
    </ConfigLayout>
  );
};

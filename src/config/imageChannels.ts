import presetModels from './presetModels.json';
import { PICPOCKET_CHANNEL_ID } from './hostedModels';
import type { ImageChannel, UserSettings } from '../types';

export const IMAGE_PROVIDERS = [
  { id: 'siliconflow', name: '硅基流动', icon: 'brand:siliconflow', baseUrl: 'https://api.siliconflow.cn/v1' },
  { id: 'openai', name: 'OpenAI', icon: 'simple-icons:openai', baseUrl: 'https://api.openai.com/v1' },
  { id: 'xai', name: 'xAI', icon: 'simple-icons:x', baseUrl: 'https://api.x.ai/v1' },
  { id: 'zhipu', name: '智谱 AI', icon: 'brand:zhipu', baseUrl: 'https://open.bigmodel.cn/api/paas/v4' },
  { id: 'dashscope', name: '阿里云百炼', icon: 'brand:qwen', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1' },
] as const;

export const imageModelsForProvider = (providerId: string) => {
  const provider = IMAGE_PROVIDERS.find((item) => item.id === providerId);
  return provider ? presetModels.image.filter((model) => model.baseUrl === provider.baseUrl) : [];
};

export const enabledImageModels = (channel: ImageChannel): string[] =>
  Array.from(new Set((channel.models || [channel.model]).map((model) => model.trim()).filter(Boolean)));

export const getImageChannels = (settings: UserSettings): ImageChannel[] => {
  if (settings.imageChannels) return settings.imageChannels;
  if (!settings.imageApiKey && !settings.imageBaseUrl && !settings.imageModel && !settings.apiKey) return [];

  const baseUrl = settings.imageBaseUrl || settings.baseUrl || '';
  const provider = IMAGE_PROVIDERS.find((item) => item.baseUrl === baseUrl.replace(/\/+$/, ''));
  return [{
    id: 'legacy-image',
    name: provider?.name || 'Custom',
    providerId: provider?.id || 'custom',
    apiKey: settings.imageApiKey || '',
    baseUrl,
    model: settings.imageModel || 'dall-e-3',
    models: [settings.imageModel || 'dall-e-3'],
  }];
};

export const getActiveImageChannel = (settings: UserSettings): ImageChannel | undefined => {
  const channels = getImageChannels(settings);
  return channels.find((channel) => channel.id === settings.activeImageChannelId) || channels[0];
};

export const withImageChannels = (
  settings: UserSettings,
  channels: ImageChannel[],
  activeId: string | undefined
): UserSettings => {
  const normalized = channels.map((channel) => {
    const models = enabledImageModels(channel);
    return { ...channel, models, model: models.includes(channel.model) ? channel.model : (models[0] || '') };
  });
  if (activeId === PICPOCKET_CHANNEL_ID) {
    return { ...settings, imageChannels: normalized, activeImageChannelId: PICPOCKET_CHANNEL_ID, imageApiKey: '', imageBaseUrl: '', imageModel: '' };
  }
  const active = normalized.find((channel) => channel.id === activeId) || normalized[0];
  return {
    ...settings,
    imageChannels: normalized,
    activeImageChannelId: active?.id,
    imageApiKey: active?.apiKey || '',
    imageBaseUrl: active?.baseUrl || '',
    imageModel: active?.model || '',
  };
};

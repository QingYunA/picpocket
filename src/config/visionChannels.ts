import presetModels from './presetModels.json';
import type { UserSettings, VisionChannel } from '@/types';

export const VISION_PROVIDERS = presetModels.vision;

export const getVisionChannels = (settings: UserSettings): VisionChannel[] => {
  if (settings.visionChannels) return settings.visionChannels;

  const baseUrl = settings.baseUrl || '';
  const provider = VISION_PROVIDERS.find((item) => item.baseUrl === baseUrl.trim().replace(/\/+$/, ''));
  let customName = 'Custom';
  try {
    customName = new URL(baseUrl).host || customName;
  } catch {
    // Keep an invalid legacy address available for correction.
  }

  return [{
    id: 'legacy-vision',
    name: provider?.name || customName,
    providerId: provider?.id || 'custom',
    apiKey: settings.apiKey || '',
    baseUrl,
    model: settings.model || '',
  }];
};

export const withVisionChannels = (
  settings: UserSettings,
  channels: VisionChannel[],
  activeId: string | undefined
): UserSettings => {
  const active = channels.find((channel) => channel.id === activeId) || channels[0];
  return {
    ...settings,
    visionChannels: channels,
    activeVisionChannelId: active?.id,
    apiKey: active?.apiKey || '',
    baseUrl: active?.baseUrl || '',
    model: active?.model || '',
  };
};

import type { UserSettings } from '../types';
import { imageChannelMode, visionChannelMode } from './channelMode';
import { PICPOCKET_CHANNEL_ID, getHostedCatalog, hostedImageModel, hostedVisionModel } from './hostedModels';
import { enabledImageModels, getImageChannels, withImageChannels } from './imageChannels';
import { getConfiguredVisionChannels, withVisionChannels } from './visionChannels';

export type ModelCapability = 'vision' | 'image';

/** 选择器里的一组：一个渠道和它可选的模型 */
export interface ChannelModelGroup {
  channelId: string;
  /** PicPocket 渠道的名称由界面按语言显示，这里为空 */
  name: string;
  providerId: string;
  models: string[];
  missingKey: boolean;
}

export interface ChannelModelSelection {
  channelId: string;
  model: string;
}

const picpocketGroup = (models: readonly string[]): ChannelModelGroup => ({
  channelId: PICPOCKET_CHANNEL_ID,
  name: '',
  providerId: PICPOCKET_CHANNEL_ID,
  models: [...models],
  missingKey: false,
});

export function channelModelGroups(settings: UserSettings, capability: ModelCapability): ChannelModelGroup[] {
  if (capability === 'vision') {
    const own = getConfiguredVisionChannels(settings).map((channel) => ({
      channelId: channel.id,
      name: channel.name,
      providerId: channel.providerId,
      models: channel.model.trim() ? [channel.model.trim()] : [],
      missingKey: !channel.apiKey.trim(),
    }));
    return [picpocketGroup(getHostedCatalog().vision), ...own];
  }
  const own = getImageChannels(settings).map((channel) => ({
    channelId: channel.id,
    name: channel.name,
    providerId: channel.providerId,
    models: enabledImageModels(channel),
    missingKey: !(channel.apiKey || settings.apiKey || '').trim(),
  }));
  return [picpocketGroup(getHostedCatalog().image), ...own];
}

export function currentChannelModel(settings: UserSettings, capability: ModelCapability): ChannelModelSelection {
  if (capability === 'vision') {
    const mode = visionChannelMode(settings);
    return mode.kind === 'picpocket'
      ? { channelId: PICPOCKET_CHANNEL_ID, model: hostedVisionModel(settings.hostedVisionModel) }
      : { channelId: mode.channel.id, model: settings.model || mode.channel.model };
  }
  const mode = imageChannelMode(settings);
  return mode.kind === 'picpocket'
    ? { channelId: PICPOCKET_CHANNEL_ID, model: hostedImageModel(settings.hostedImageModel) }
    : { channelId: mode.channel.id, model: settings.imageModel || mode.channel.model };
}

/** 切换到某个渠道的某个模型，返回完整的新设置（渠道列表、当前渠道与扁平字段保持一致） */
export function selectChannelModel(
  settings: UserSettings,
  capability: ModelCapability,
  selection: ChannelModelSelection
): UserSettings {
  const { channelId, model } = selection;
  if (capability === 'vision') {
    if (channelId === PICPOCKET_CHANNEL_ID) {
      return { ...withVisionChannels(settings, getConfiguredVisionChannels(settings), PICPOCKET_CHANNEL_ID), hostedVisionModel: model };
    }
    const channels = getConfiguredVisionChannels(settings).map((channel) => (channel.id === channelId ? { ...channel, model } : channel));
    return withVisionChannels(settings, channels, channelId);
  }
  if (channelId === PICPOCKET_CHANNEL_ID) {
    return { ...withImageChannels(settings, getImageChannels(settings), PICPOCKET_CHANNEL_ID), hostedImageModel: model };
  }
  const channels = getImageChannels(settings).map((channel) => (channel.id === channelId ? { ...channel, model } : channel));
  return withImageChannels(settings, channels, channelId);
}

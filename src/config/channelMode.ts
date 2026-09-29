import type { ImageChannel, UserSettings, VisionChannel } from '../types';
import { getConfiguredVisionChannels, getVisionChannels, withVisionChannels } from './visionChannels';
import { getImageChannels, withImageChannels } from './imageChannels';
import { PICPOCKET_CHANNEL_ID } from './hostedModels';

export { PICPOCKET_CHANNEL_ID };

/**
 * 当前实际使用的渠道：
 * - picpocket：PicPocket 官方托管
 * - own：用户自己的渠道和 Key
 * - missing-key：选中了自己的渠道但没填 Key（不会悄悄改走托管，由界面提示去填）
 */
export type ChannelMode<C> =
  | { kind: 'picpocket' }
  | { kind: 'own'; channel: C }
  | { kind: 'missing-key'; channel: C };

function resolveMode<C extends { id: string }>(
  channels: C[],
  selectedId: string | undefined,
  hasKey: (channel: C) => boolean
): ChannelMode<C> {
  if (selectedId === PICPOCKET_CHANNEL_ID) return { kind: 'picpocket' };
  const selected = selectedId ? channels.find((channel) => channel.id === selectedId) : undefined;
  if (selected) return hasKey(selected) ? { kind: 'own', channel: selected } : { kind: 'missing-key', channel: selected };
  // 从未选过渠道：已有可用 Key 的渠道优先，否则用 PicPocket
  const usable = channels.find(hasKey);
  return usable ? { kind: 'own', channel: usable } : { kind: 'picpocket' };
}

export function visionChannelMode(settings: UserSettings): ChannelMode<VisionChannel> {
  return resolveMode(getVisionChannels(settings), settings.activeVisionChannelId, (channel) => Boolean(channel.apiKey.trim()));
}

/** channelId 用于画布等指定渠道的调用；省略时用当前选中的生图渠道 */
export function imageChannelMode(settings: UserSettings, channelId?: string): ChannelMode<ImageChannel> {
  // 旧版生图渠道没有单独的 Key 时沿用通用 Key，这里保持一致
  const hasKey = (channel: ImageChannel) => Boolean((channel.apiKey || settings.apiKey || '').trim());
  return resolveMode(getImageChannels(settings), channelId ?? settings.activeImageChannelId, hasKey);
}

/**
 * 引入 PicPocket 渠道前，选中的渠道没填 Key 时会悄悄改走托管。
 * 升级后一次性把这类用户切到 PicPocket 渠道，保持他们原来的实际行为；返回需要写入的设置，已迁移过返回 null。
 */
export function migrateToPicpocketChannel(settings: UserSettings): Partial<UserSettings> | null {
  if (settings.picpocketChannelMigrated) return null;
  let patch: Partial<UserSettings> = { picpocketChannelMigrated: true };

  if (visionChannelMode(settings).kind === 'missing-key') {
    const next = withVisionChannels(settings, getConfiguredVisionChannels(settings), PICPOCKET_CHANNEL_ID);
    patch = { ...patch, visionChannels: next.visionChannels, activeVisionChannelId: next.activeVisionChannelId, apiKey: next.apiKey, baseUrl: next.baseUrl, model: next.model };
  }
  if (imageChannelMode(settings).kind === 'missing-key') {
    const next = withImageChannels(settings, getImageChannels(settings), PICPOCKET_CHANNEL_ID);
    patch = { ...patch, imageChannels: next.imageChannels, activeImageChannelId: next.activeImageChannelId, imageApiKey: next.imageApiKey, imageBaseUrl: next.imageBaseUrl, imageModel: next.imageModel };
  }
  return patch;
}

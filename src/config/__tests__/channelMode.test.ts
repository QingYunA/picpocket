import { describe, expect, it } from 'vitest';
import {
  PICPOCKET_CHANNEL_ID,
  imageChannelMode,
  migrateToPicpocketChannel,
  visionChannelMode,
} from '../channelMode';
import { withImageChannels } from '../imageChannels';
import { withVisionChannels } from '../visionChannels';
import type { ImageChannel, UserSettings, VisionChannel } from '@/types';

const base: UserSettings = { apiKey: '', baseUrl: '', model: '', autoAnalyzeOnCapture: false, language: 'zh' };

const deepseek: VisionChannel = {
  id: 'ds', name: 'DeepSeek', providerId: 'deepseek-official', apiKey: '', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat',
};
const openaiImage: ImageChannel = {
  id: 'oa', name: 'OpenAI', providerId: 'openai', apiKey: 'sk-img', baseUrl: 'https://api.openai.com/v1', model: 'dall-e-3', models: ['dall-e-3'],
};

describe('visionChannelMode', () => {
  it('uses PicPocket for a fresh install with nothing configured', () => {
    expect(visionChannelMode(base).kind).toBe('picpocket');
  });

  it('uses PicPocket when it is the selected channel, even if another channel has a key', () => {
    const settings = withVisionChannels(base, [{ ...deepseek, apiKey: 'sk-ds' }], PICPOCKET_CHANNEL_ID);
    expect(settings.activeVisionChannelId).toBe(PICPOCKET_CHANNEL_ID);
    expect(settings.apiKey).toBe('');
    expect(visionChannelMode(settings).kind).toBe('picpocket');
  });

  it('reports a missing key instead of silently falling back to PicPocket', () => {
    const settings = withVisionChannels(base, [deepseek], 'ds');
    const mode = visionChannelMode(settings);
    expect(mode.kind).toBe('missing-key');
    expect(mode.kind === 'missing-key' && mode.channel.name).toBe('DeepSeek');
  });

  it('uses the selected own channel when it has a key', () => {
    const settings = withVisionChannels(base, [{ ...deepseek, apiKey: 'sk-ds' }], 'ds');
    expect(visionChannelMode(settings).kind).toBe('own');
  });

  it('keeps legacy single-key settings on the own channel', () => {
    expect(visionChannelMode({ ...base, apiKey: 'sk-legacy', baseUrl: 'https://api.deepseek.com/v1' }).kind).toBe('own');
  });
});

describe('imageChannelMode', () => {
  it('uses PicPocket when no image channel exists', () => {
    expect(imageChannelMode(base).kind).toBe('picpocket');
  });

  it('uses PicPocket when selected, ignoring a vision key that legacy image calls used to borrow', () => {
    const settings = withImageChannels({ ...base, apiKey: 'sk-vision' }, [openaiImage], PICPOCKET_CHANNEL_ID);
    expect(settings.activeImageChannelId).toBe(PICPOCKET_CHANNEL_ID);
    expect(imageChannelMode(settings).kind).toBe('picpocket');
  });

  it('honours an explicit channel id over the selected channel', () => {
    const settings = withImageChannels(base, [openaiImage], PICPOCKET_CHANNEL_ID);
    expect(imageChannelMode(settings, 'oa').kind).toBe('own');
    expect(imageChannelMode(settings, PICPOCKET_CHANNEL_ID).kind).toBe('picpocket');
  });

  it('reports a missing key for a selected image channel without credentials', () => {
    const settings = withImageChannels(base, [{ ...openaiImage, apiKey: '' }], 'oa');
    expect(imageChannelMode(settings).kind).toBe('missing-key');
  });
});

describe('migrateToPicpocketChannel', () => {
  it('moves users whose selected channels had no key (they were already on hosted AI) to PicPocket once', () => {
    const settings = withImageChannels(withVisionChannels(base, [deepseek], 'ds'), [{ ...openaiImage, apiKey: '' }], 'oa');
    const patch = migrateToPicpocketChannel(settings)!;
    expect(patch.activeVisionChannelId).toBe(PICPOCKET_CHANNEL_ID);
    expect(patch.activeImageChannelId).toBe(PICPOCKET_CHANNEL_ID);
    expect(patch.picpocketChannelMigrated).toBe(true);
    expect(migrateToPicpocketChannel({ ...settings, ...patch })).toBeNull();
  });

  it('leaves working own channels untouched', () => {
    const settings = withVisionChannels(base, [{ ...deepseek, apiKey: 'sk-ds' }], 'ds');
    const patch = migrateToPicpocketChannel(settings)!;
    expect(patch).toEqual({ picpocketChannelMigrated: true });
  });
});

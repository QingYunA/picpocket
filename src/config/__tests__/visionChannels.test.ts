import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, getUserSettings, resetInMemoryStorageForTesting, saveUserSettings } from '@/utils/storage';
import { getVisionChannels, withVisionChannels } from '../visionChannels';

describe('vision channels', () => {
  it('keeps a private legacy endpoint as a custom channel', () => {
    const settings = {
      ...DEFAULT_SETTINGS,
      apiKey: 'private-key',
      baseUrl: 'http://10.25.210.205:31000/v1',
      model: 'deepseek-flash',
    };
    expect(getVisionChannels(settings)).toEqual([expect.objectContaining({
      providerId: 'custom',
      apiKey: 'private-key',
      baseUrl: 'http://10.25.210.205:31000/v1',
      model: 'deepseek-flash',
    })]);
    expect(getVisionChannels(settings)[0]?.name).not.toBe('DeepSeek 官方');
  });

  it('uses the official preset only for the actual official URL', () => {
    expect(getVisionChannels(DEFAULT_SETTINGS)[0]).toMatchObject({
      providerId: 'deepseek-official',
      baseUrl: 'https://api.deepseek.com/v1',
    });
  });

  it('switches the active endpoint and keeps other credentials intact', () => {
    const first = { id: 'one', name: 'One', providerId: 'custom', apiKey: 'key-1', baseUrl: 'https://one.test/v1', model: 'model-1' };
    const second = { ...first, id: 'two', apiKey: 'key-2', baseUrl: 'https://two.test/v1', model: 'model-2' };
    const settings = withVisionChannels(DEFAULT_SETTINGS, [first, second], 'two');
    expect(settings).toMatchObject({ activeVisionChannelId: 'two', apiKey: 'key-2', baseUrl: 'https://two.test/v1', model: 'model-2' });
    expect(settings.visionChannels?.[0]).toEqual(first);
  });

  it('persists an inspector model change on the active channel', async () => {
    resetInMemoryStorageForTesting();
    const channel = { id: 'one', name: 'One', providerId: 'custom', apiKey: 'key', baseUrl: 'https://one.test/v1', model: 'old-model' };
    await saveUserSettings(withVisionChannels(DEFAULT_SETTINGS, [channel], channel.id));
    await saveUserSettings({ model: 'new-model' });
    expect((await getUserSettings()).visionChannels?.[0]?.model).toBe('new-model');
  });
});

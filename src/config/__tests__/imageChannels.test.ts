import { describe, expect, it } from 'vitest';
import { getActiveImageChannel, getImageChannels, withImageChannels } from '../imageChannels';
import { DEFAULT_SETTINGS, getUserSettings, resetInMemoryStorageForTesting, saveUserSettings } from '@/utils/storage';

describe('image channels', () => {
  it('keeps a legacy image configuration available as one channel', () => {
    const settings = { ...DEFAULT_SETTINGS, imageApiKey: 'old-key', imageBaseUrl: 'https://api.x.ai/v1', imageModel: 'grok-imagine' };
    expect(getImageChannels(settings)).toEqual([expect.objectContaining({
      id: 'legacy-image', providerId: 'xai', apiKey: 'old-key', model: 'grok-imagine',
    })]);
    expect(getImageChannels({ ...DEFAULT_SETTINGS, imageApiKey: 'old-key' })[0]?.model).toBe('dall-e-3');
    expect(getImageChannels({ ...DEFAULT_SETTINGS, apiKey: 'shared-key' })[0]).toMatchObject({
      id: 'legacy-image', baseUrl: DEFAULT_SETTINGS.baseUrl, model: 'dall-e-3',
    });
  });

  it('switches the active channel without changing other channel credentials', () => {
    const first = { id: 'one', name: 'One', providerId: 'custom', apiKey: 'key-1', baseUrl: 'https://one.test/v1', model: 'model-1' };
    const second = { ...first, id: 'two', name: 'Two', apiKey: 'key-2', baseUrl: 'https://two.test/v1', model: 'model-2' };
    const settings = withImageChannels(DEFAULT_SETTINGS, [first, second], 'two');
    expect(getActiveImageChannel(settings)).toMatchObject(second);
    expect(settings).toMatchObject({ imageApiKey: 'key-2', imageBaseUrl: 'https://two.test/v1', imageModel: 'model-2' });
    expect(settings.imageChannels?.[0]).toMatchObject(first);
  });

  it('keeps a workbench model change on the active channel', async () => {
    resetInMemoryStorageForTesting();
    const first = { id: 'one', name: 'One', providerId: 'custom', apiKey: 'key-1', baseUrl: 'https://one.test/v1', model: 'model-1' };
    const second = { ...first, id: 'two', name: 'Two', model: 'model-2', models: ['model-2', 'new-model'] };
    await saveUserSettings(withImageChannels(DEFAULT_SETTINGS, [first, second], 'two'));
    await saveUserSettings({ imageModel: 'new-model' });
    const saved = await getUserSettings();
    expect(saved.imageChannels?.map((channel) => channel.model)).toEqual(['model-1', 'new-model']);
  });

  it('does not re-enable a model removed from the active channel', async () => {
    resetInMemoryStorageForTesting();
    const channel = { id: 'one', name: 'One', providerId: 'custom', apiKey: 'key', baseUrl: 'https://one.test/v1', model: 'model-1', models: ['model-1'] };
    await saveUserSettings(withImageChannels(DEFAULT_SETTINGS, [channel], channel.id));
    await saveUserSettings({ imageModel: 'removed-model' });
    const saved = await getUserSettings();
    expect(saved.imageModel).toBe('model-1');
    expect(saved.imageChannels?.[0]?.models).toEqual(['model-1']);
  });

  it('preserves multiple enabled models and picks a new default when one is removed', () => {
    const channel = { id: 'one', name: 'One', providerId: 'custom', apiKey: 'key', baseUrl: 'https://one.test/v1', model: 'model-2', models: ['model-1', 'model-2'] };
    const configured = withImageChannels(DEFAULT_SETTINGS, [channel], channel.id);
    expect(configured.imageChannels?.[0]?.models).toEqual(['model-1', 'model-2']);
    const removed = withImageChannels(configured, [{ ...channel, models: ['model-1'] }], channel.id);
    expect(removed.imageChannels?.[0]?.model).toBe('model-1');
    expect(removed.imageModel).toBe('model-1');
  });
});

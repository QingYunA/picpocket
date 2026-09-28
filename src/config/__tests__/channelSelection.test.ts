import { describe, expect, it } from 'vitest';
import { channelModelGroups, currentChannelModel, selectChannelModel } from '../channelSelection';
import { DEFAULT_HOSTED_VISION_MODEL, HOSTED_IMAGE_MODELS, PICPOCKET_CHANNEL_ID } from '../hostedModels';
import { imageChannelMode, visionChannelMode } from '../channelMode';
import { withImageChannels } from '../imageChannels';
import { withVisionChannels } from '../visionChannels';
import type { UserSettings } from '../../types';

const base: UserSettings = { apiKey: '', baseUrl: '', model: '', autoAnalyzeOnCapture: false, language: 'zh' };
const deepseek = { id: 'ds', name: 'DeepSeek', providerId: 'deepseek-official', apiKey: 'sk-ds', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' };
const openai = { id: 'oa', name: 'OpenAI', providerId: 'openai', apiKey: '', baseUrl: 'https://api.openai.com/v1', model: 'dall-e-3', models: ['dall-e-3', 'gpt-image-2'] };

describe('channelModelGroups', () => {
  it('always lists PicPocket first and hides the empty legacy placeholder', () => {
    const groups = channelModelGroups(base, 'vision');
    expect(groups.map((group) => group.channelId)).toEqual([PICPOCKET_CHANNEL_ID]);
  });

  it('lists own channels with their models and flags missing keys', () => {
    const settings = withImageChannels(base, [openai], 'oa');
    const [picpocket, own] = channelModelGroups(settings, 'image');
    expect(picpocket!.models).toEqual([...HOSTED_IMAGE_MODELS]);
    expect(own).toMatchObject({ channelId: 'oa', name: 'OpenAI', models: ['dall-e-3', 'gpt-image-2'], missingKey: true });
  });
});

describe('currentChannelModel', () => {
  it('reports the PicPocket default model on a fresh install', () => {
    expect(currentChannelModel(base, 'vision')).toEqual({ channelId: PICPOCKET_CHANNEL_ID, model: DEFAULT_HOSTED_VISION_MODEL });
  });

  it('reports the selected own channel and its model', () => {
    const settings = withVisionChannels(base, [deepseek], 'ds');
    expect(currentChannelModel(settings, 'vision')).toEqual({ channelId: 'ds', model: 'deepseek-chat' });
  });
});

describe('selectChannelModel', () => {
  it('switches to PicPocket and remembers the hosted model without touching own channels', () => {
    const settings = withVisionChannels(base, [deepseek], 'ds');
    const next = selectChannelModel(settings, 'vision', { channelId: PICPOCKET_CHANNEL_ID, model: 'kimi-k3' });
    expect(visionChannelMode(next).kind).toBe('picpocket');
    expect(next.hostedVisionModel).toBe('kimi-k3');
    expect(next.visionChannels).toEqual([deepseek]);
  });

  it('switches back to an own channel and updates its model', () => {
    const onPicpocket = withImageChannels(base, [{ ...openai, apiKey: 'sk-oa' }], PICPOCKET_CHANNEL_ID);
    const next = selectChannelModel(onPicpocket, 'image', { channelId: 'oa', model: 'gpt-image-2' });
    expect(imageChannelMode(next).kind).toBe('own');
    expect(next.imageModel).toBe('gpt-image-2');
    expect(next.imageApiKey).toBe('sk-oa');
  });

  it('does not mutate the input settings', () => {
    const settings = withVisionChannels(base, [deepseek], 'ds');
    const snapshot = structuredClone(settings);
    selectChannelModel(settings, 'vision', { channelId: 'ds', model: 'deepseek-reasoner' });
    expect(settings).toEqual(snapshot);
  });
});

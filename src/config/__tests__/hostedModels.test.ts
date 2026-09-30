import { afterEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_HOSTED_IMAGE_MODEL,
  DEFAULT_HOSTED_VISION_MODEL,
  HOSTED_IMAGE_MODELS,
  HOSTED_VISION_MODELS,
  applyHostedCatalog,
  getHostedCatalog,
  hostedImageModel,
  hostedImageSupportsEdit,
  hostedVisionModel,
} from '../hostedModels';

describe('hosted model catalog', () => {
  it('keeps the built-in fallback in step with the seed catalog in picpocket-cloud', () => {
    expect(HOSTED_VISION_MODELS).toEqual([
      'deepseek-flash', 'qwen3.7-plus', 'gemini-3.8-flash', 'gpt-6-sol', 'claude-sonnet-5',
      'gemini-3.1-pro', 'glm-5.3-flash', 'kimi-k3', 'minimax-m3',
    ]);
    expect(HOSTED_IMAGE_MODELS).toEqual([
      'gpt-image-2.5-sunburst', 'gpt-image-2.5-flare', 'gpt-image-2', 'grok-imagine-image-2.0', 'nano-banana-pro', 'seedream-5-pro',
      'qwen-image-2.0', 'z-image-turbo', 'wan2.7-image',
    ]);
    expect(HOSTED_VISION_MODELS).toContain(DEFAULT_HOSTED_VISION_MODEL);
    expect(HOSTED_IMAGE_MODELS).toContain(DEFAULT_HOSTED_IMAGE_MODEL);
  });
});

describe('hostedVisionModel', () => {
  it('returns the first candidate that is in the catalog', () => {
    expect(hostedVisionModel('deepseek-chat', 'kimi-k3')).toBe('kimi-k3');
    expect(hostedVisionModel('Claude-Sonnet-5')).toBe('claude-sonnet-5');
  });

  it('falls back to the default for bring-your-own or empty model names', () => {
    expect(hostedVisionModel('deepseek-chat', undefined, '')).toBe(DEFAULT_HOSTED_VISION_MODEL);
    expect(hostedVisionModel()).toBe(DEFAULT_HOSTED_VISION_MODEL);
  });
});

describe('hostedImageModel', () => {
  it('keeps a catalog model and replaces anything else with the default', () => {
    expect(hostedImageModel('seedream-5-pro')).toBe('seedream-5-pro');
    expect(hostedImageModel('dall-e-3', 'nano-banana-pro')).toBe('nano-banana-pro');
    expect(hostedImageModel('flux-2-klein')).toBe(DEFAULT_HOSTED_IMAGE_MODEL);
  });
});

describe('applyHostedCatalog (server-driven catalog)', () => {
  const pricing = (image: string[], defaultImageModel?: string) => ({
    defaultVisionModel: 'deepseek-flash',
    defaultImageModel,
    vision: [{ id: 'deepseek-flash' }, { id: 'kimi-k3' }],
    image: image.map((id) => ({ id })),
  });
  afterEach(() => {
    applyHostedCatalog({ defaultVisionModel: DEFAULT_HOSTED_VISION_MODEL, defaultImageModel: DEFAULT_HOSTED_IMAGE_MODEL, vision: HOSTED_VISION_MODELS.map((id) => ({ id })), image: HOSTED_IMAGE_MODELS.map((id) => ({ id })) });
  });

  it('replaces the lists and default with what the server enables', () => {
    applyHostedCatalog(pricing(['new-image', 'gpt-image-2'], 'new-image'));
    expect(getHostedCatalog().image).toEqual(['new-image', 'gpt-image-2']);
    expect(hostedImageModel('new-image')).toBe('new-image');
    expect(hostedImageModel('seedream-5-pro')).toBe('new-image');
  });

  it('sends a model the server has retired back to the default', () => {
    applyHostedCatalog(pricing(['gpt-image-2'], 'gpt-image-2'));
    expect(hostedImageModel('nano-banana-pro')).toBe('gpt-image-2');
    expect(hostedImageModel(undefined)).toBe('gpt-image-2');
  });

  it('uses the first model when the server default is missing from the list', () => {
    applyHostedCatalog(pricing(['a', 'b'], 'gone'));
    expect(getHostedCatalog().defaultImage).toBe('a');
  });

  it('ignores an empty catalog instead of leaving the picker blank', () => {
    const before = getHostedCatalog();
    applyHostedCatalog(pricing([]));
    expect(getHostedCatalog()).toBe(before);
  });
});

describe('hostedImageSupportsEdit', () => {
  it('knows which hosted models cannot take reference images, and follows the server list', () => {
    expect(hostedImageSupportsEdit('GPT-Image-2')).toBe(true);
    applyHostedCatalog({ vision: [{ id: 'deepseek-flash' }], image: [{ id: 'a', supportsEdit: false }, { id: 'b', supportsEdit: true }] });
    expect(hostedImageSupportsEdit('a')).toBe(false);
    expect(hostedImageSupportsEdit('b')).toBe(true);
    expect(hostedImageSupportsEdit('unknown-model')).toBe(true);
    applyHostedCatalog({ vision: HOSTED_VISION_MODELS.map((id) => ({ id })), image: HOSTED_IMAGE_MODELS.map((id) => ({ id })) });
  });
});

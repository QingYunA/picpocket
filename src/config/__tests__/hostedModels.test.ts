import { describe, expect, it } from 'vitest';
import {
  DEFAULT_HOSTED_IMAGE_MODEL,
  DEFAULT_HOSTED_VISION_MODEL,
  HOSTED_IMAGE_MODELS,
  HOSTED_VISION_MODELS,
  hostedImageModel,
  hostedVisionModel,
} from '../hostedModels';

describe('hosted model catalog', () => {
  it('lists nine vision models and six image models', () => {
    expect(HOSTED_VISION_MODELS).toHaveLength(9);
    expect(HOSTED_IMAGE_MODELS).toHaveLength(6);
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

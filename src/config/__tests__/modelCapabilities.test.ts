import { describe, it, expect } from 'vitest';
import { getModelCapability, KNOWN_MODEL_CAPABILITIES } from '../modelCapabilities';

describe('modelCapabilities config', () => {
  it('should identify dall-e-3 capability correctly', () => {
    const cap = getModelCapability('dall-e-3');
    expect(cap.maxCount).toBe(1);
    expect(cap.supportsImageToImage).toBe(false);
  });

  it('should identify case-insensitive or prefixed dall-e-3 correctly', () => {
    const cap = getModelCapability('openai/DALL-E-3-hd');
    expect(cap.maxCount).toBe(1);
    expect(cap.supportsImageToImage).toBe(false);
  });

  it('should identify flux capability correctly', () => {
    const cap = getModelCapability('flux-1-schnell');
    expect(cap.maxCount).toBe(4);
    expect(cap.supportsImageToImage).toBe(true);
  });

  it('should fallback to safe default for unknown models', () => {
    const cap = getModelCapability('my-custom-lora-model');
    expect(cap.maxCount).toBe(4);
    expect(cap.supportsImageToImage).toBe(true);
  });
});

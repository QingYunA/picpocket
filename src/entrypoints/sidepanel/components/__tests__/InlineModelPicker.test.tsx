import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { guessBrandIcon } from '../InlineModelPicker';

describe('InlineModelPicker and brand icon inference', () => {
  it('correctly infers brand icon from model string', () => {
    expect(guessBrandIcon('black-forest-labs/FLUX.1-schnell')).toBe('brand:flux');
    expect(guessBrandIcon('dall-e-3')).toBe('simple-icons:openai');
    expect(guessBrandIcon('gpt-4o-mini')).toBe('simple-icons:openai');
    expect(guessBrandIcon('deepseek-v4-flash-vision-exp')).toBe('simple-icons:deepseek');
    expect(guessBrandIcon('Qwen/Qwen2.5-VL-72B-Instruct')).toBe('brand:qwen');
    expect(guessBrandIcon('glm-4v-plus')).toBe('brand:zhipu');
    expect(guessBrandIcon('kimi-k3')).toBe('brand:kimi');
    expect(guessBrandIcon('step-3.7-flash')).toBe('brand:stepfun');
    expect(guessBrandIcon('mimo-v2.5-pro')).toBe('simple-icons:xiaomi');
    expect(guessBrandIcon('grok-imagine')).toBe('simple-icons:x');
    expect(guessBrandIcon('unknown-private-model')).toBe('');
  });
});

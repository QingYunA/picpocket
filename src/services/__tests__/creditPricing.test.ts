import { describe, expect, it } from 'vitest';
import { formatCreditCost, imageCreditCost, isShortOnCredits, scaleCreditCost, visionCreditCost, type CreditPricing } from '../creditPricing';

const pricing: CreditPricing = {
  defaultVisionModel: 'deepseek-flash',
  vision: [
    { id: 'deepseek-flash', min: 1, max: 2 },
    { id: 'glm-5.3-flash', min: 1, max: 1 },
  ],
  image: [
    { id: 'gpt-image-2.5-sunburst', credits: 15 },
    { id: 'nano-banana-pro', credits: 20, credits4k: 32 },
  ],
};

describe('imageCreditCost', () => {
  it('returns the fixed per-image cost', () => {
    expect(imageCreditCost(pricing, 'gpt-image-2.5-sunburst')).toEqual({ min: 15, max: 15 });
  });

  it('spans the 4K price for models that have one, since the size is not known up front', () => {
    expect(imageCreditCost(pricing, 'nano-banana-pro')).toEqual({ min: 20, max: 32 });
  });

  it('is null for unknown models or before pricing has loaded', () => {
    expect(imageCreditCost(pricing, 'some-own-model')).toBeNull();
    expect(imageCreditCost(null, 'gpt-image-2.5-sunburst')).toBeNull();
    expect(imageCreditCost(pricing, undefined)).toBeNull();
  });

  it('matches model ids case-insensitively, like the hosted catalog', () => {
    expect(imageCreditCost(pricing, 'GPT-Image-2.5-Sunburst')).toEqual({ min: 15, max: 15 });
  });
});

describe('visionCreditCost', () => {
  it('returns the min-max range', () => {
    expect(visionCreditCost(pricing, 'deepseek-flash')).toEqual({ min: 1, max: 2 });
    expect(visionCreditCost(pricing, 'glm-5.3-flash')).toEqual({ min: 1, max: 1 });
  });

  it('is null for unknown models or before pricing has loaded', () => {
    expect(visionCreditCost(pricing, 'gpt-4o')).toBeNull();
    expect(visionCreditCost(null, 'deepseek-flash')).toBeNull();
  });
});

describe('formatCreditCost', () => {
  it('writes a single number when min equals max, otherwise a range', () => {
    expect(formatCreditCost({ min: 15, max: 15 })).toBe('15');
    expect(formatCreditCost({ min: 1, max: 8 })).toBe('1–8');
  });
});

describe('scaleCreditCost', () => {
  it('multiplies both ends of the range by the number of images', () => {
    expect(scaleCreditCost({ min: 15, max: 15 }, 3)).toEqual({ min: 45, max: 45 });
    expect(scaleCreditCost({ min: 20, max: 32 }, 2)).toEqual({ min: 40, max: 64 });
  });

  it('treats a missing, zero, negative or fractional count as at least one whole image', () => {
    expect(scaleCreditCost({ min: 15, max: 15 }, 0)).toEqual({ min: 15, max: 15 });
    expect(scaleCreditCost({ min: 15, max: 15 }, -2)).toEqual({ min: 15, max: 15 });
    expect(scaleCreditCost({ min: 15, max: 15 }, Number.NaN)).toEqual({ min: 15, max: 15 });
    expect(scaleCreditCost({ min: 15, max: 15 }, 2.9)).toEqual({ min: 30, max: 30 });
  });
});

describe('isShortOnCredits', () => {
  it('is true only when the balance cannot cover even the cheapest outcome', () => {
    expect(isShortOnCredits(2, { min: 15, max: 15 })).toBe(true);
    expect(isShortOnCredits(20, { min: 20, max: 32 })).toBe(false);
    expect(isShortOnCredits(19, { min: 20, max: 32 })).toBe(true);
  });

  it('is false while the cost is unknown', () => {
    expect(isShortOnCredits(0, null)).toBe(false);
  });
});

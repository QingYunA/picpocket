import { describe, expect, it } from 'vitest';
import { formatCreditsCompact } from '../credits';

describe('formatCreditsCompact', () => {
  it('shows small balances as-is', () => {
    expect(formatCreditsCompact(0)).toBe('0');
    expect(formatCreditsCompact(2)).toBe('2');
    expect(formatCreditsCompact(999)).toBe('999');
  });

  it('abbreviates thousands to one decimal, dropping a trailing .0', () => {
    expect(formatCreditsCompact(1000)).toBe('1k');
    expect(formatCreditsCompact(1100)).toBe('1.1k');
    expect(formatCreditsCompact(3000)).toBe('3k');
    expect(formatCreditsCompact(9949)).toBe('9.9k');
  });

  it('rounds to whole thousands from 10k up', () => {
    expect(formatCreditsCompact(10000)).toBe('10k');
    expect(formatCreditsCompact(12500)).toBe('13k');
  });

  it('never rounds up into a longer label than it started with', () => {
    expect(formatCreditsCompact(9950)).toBe('10k');
    expect(formatCreditsCompact(999.6)).toBe('1k');
  });

  it('treats negative or non-finite values as 0', () => {
    expect(formatCreditsCompact(-5)).toBe('0');
    expect(formatCreditsCompact(Number.NaN)).toBe('0');
  });
});

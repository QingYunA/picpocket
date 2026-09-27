import { describe, it, expect } from 'vitest';
import { inlineIcon } from '../inlineIcons';

describe('inlineIcon', () => {
  it('renders lucide-style geometry with a uniform stroke width of 2', () => {
    const svg = inlineIcon('check', 12);
    expect(svg).toContain('width="12"');
    expect(svg).toContain('stroke-width="2"');
    expect(svg).toContain('stroke-linecap="round"');
    expect(svg).toContain('stroke="currentColor"');
    expect(svg).toContain('M20 6 9 17l-5-5');
  });

  it('applies a custom stroke color', () => {
    expect(inlineIcon('x', 10, '#0284C7')).toContain('stroke="#0284C7"');
  });
});

import { describe, it, expect } from 'vitest';
import { NAV_GROUPS } from '../nav-items';
import { zh } from '@/i18n/locales/zh';
import { en } from '@/i18n/locales/en';

describe('Options Navigation Items', () => {
  it('should have all clean and concise labels without wordy affixes', () => {
    expect(zh.options.nav.mcp).toBe('MCP');
    expect(en.options.nav.mcp).toBe('MCP');

    expect(zh.options.nav.general).toBe('常规');
    expect(en.options.nav.general).toBe('General');

    expect(zh.options.nav.modelsVision).toBe('视觉反推');
    expect(en.options.nav.modelsVision).toBe('Vision');

    expect(zh.options.nav.modelsImage).toBe('图像生成');
    expect(en.options.nav.modelsImage).toBe('Image');

    expect(zh.options.nav.prompts).toBe('提示词');
    expect(en.options.nav.prompts).toBe('Prompts');

    expect(zh.options.nav.storage).toBe('存储');
    expect(en.options.nav.storage).toBe('Storage');

    expect(zh.options.nav.pro).toBe('兑换码');
    expect(en.options.nav.pro).toBe('Redeem Code');
  });

  it('should not contain badge on mcp navigation item to maintain clean aesthetic', () => {
    const allItems = NAV_GROUPS.flatMap((g) => g.items);
    const mcpItem = allItems.find((item) => item.id === 'mcp');
    expect(mcpItem).toBeDefined();
    expect(mcpItem?.badge).toBeUndefined();
  });
});

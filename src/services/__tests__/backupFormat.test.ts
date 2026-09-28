import { describe, it, expect } from 'vitest';
import { mergeSettings, sniffImageMime, toPortableSettings } from '../backupFormat';

describe('backup settings portability', () => {
  const settings = {
    apiKey: 'sk-vision',
    imageApiKey: 'sk-image',
    language: 'zh',
    imageChannels: [{ id: 'c1', name: 'Main', apiKey: 'sk-c1', model: 'm' }],
    mcpSettings: { enabled: true, port: 1, authToken: 'tok' },
    proMembership: { isPro: true, licenseKey: 'LIC' },
  };

  it('never writes credentials or membership state into a backup', () => {
    const portable = toPortableSettings(settings);
    expect(JSON.stringify(portable)).not.toMatch(/sk-|tok|LIC/);
    expect(portable).toMatchObject({ language: 'zh', imageChannels: [{ id: 'c1', name: 'Main', model: 'm' }], mcpSettings: { enabled: true, port: 1 } });
    expect(portable.proMembership).toBeUndefined();
  });

  it('keeps local credentials when restoring portable settings', () => {
    const local = { ...settings, language: 'en', imageChannels: [{ id: 'c1', name: 'Old', apiKey: 'sk-local', model: 'x' }] };
    const merged = mergeSettings(local, toPortableSettings(settings));
    expect(merged).toMatchObject({
      apiKey: 'sk-vision',
      language: 'zh',
      imageChannels: [{ id: 'c1', name: 'Main', apiKey: 'sk-local', model: 'm' }],
      mcpSettings: { authToken: 'tok', enabled: true },
      proMembership: { isPro: true, licenseKey: 'LIC' },
    });
  });

  it('ignores membership state even if an old backup contains it', () => {
    const merged = mergeSettings({ language: 'en' }, { proMembership: { isPro: true } });
    expect(merged.proMembership).toBeUndefined();
  });
});

describe('sniffImageMime', () => {
  it('detects formats by content rather than file name', () => {
    expect(sniffImageMime(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
    expect(sniffImageMime(new TextEncoder().encode('GIF89a'))).toBe('image/gif');
    expect(sniffImageMime(new TextEncoder().encode('RIFF\0\0\0\0WEBPVP8'))).toBe('image/webp');
  });
});

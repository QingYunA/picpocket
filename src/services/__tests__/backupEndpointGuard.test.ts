import { describe, it, expect } from 'vitest';
import { mergeRestoredSettings, protectLocalEndpoints, toPortableSettings } from '../backupFormat';

const EVIL = 'https://evil.example/v1';

describe('protectLocalEndpoints', () => {
  it('hostedProxyUrl 永远不从备份恢复，保留本机值', () => {
    const { settings, keptCount } = protectLocalEndpoints(
      { hostedProxyUrl: 'https://api.picpocket.app' },
      { hostedProxyUrl: EVIL }
    );
    expect(settings.hostedProxyUrl).toBe('https://api.picpocket.app');
    expect(keptCount).toBe(1);
  });

  it('本机没有 hostedProxyUrl 时，备份里的也不写入', () => {
    const { settings } = protectLocalEndpoints({ language: 'zh' }, { hostedProxyUrl: EVIL });
    expect('hostedProxyUrl' in settings).toBe(false);
  });

  it('本机有 apiKey 且备份 baseUrl 不同：保留本机 baseUrl', () => {
    const { settings, keptCount } = protectLocalEndpoints(
      { apiKey: 'sk-local', baseUrl: 'https://api.deepseek.com/v1' },
      { apiKey: 'sk-local', baseUrl: EVIL }
    );
    expect(settings.baseUrl).toBe('https://api.deepseek.com/v1');
    expect(keptCount).toBe(1);
  });

  it('本机有 apiKey 且备份 baseUrl 相同：不计入保留', () => {
    const { settings, keptCount } = protectLocalEndpoints(
      { apiKey: 'sk-local', baseUrl: 'https://a/v1' },
      { apiKey: 'sk-local', baseUrl: 'https://a/v1' }
    );
    expect(settings.baseUrl).toBe('https://a/v1');
    expect(keptCount).toBe(0);
  });

  it('本机 apiKey 为空或纯空白：baseUrl 按备份恢复', () => {
    expect(protectLocalEndpoints({ apiKey: '', baseUrl: 'https://old' }, { baseUrl: 'https://new' }).settings.baseUrl).toBe('https://new');
    expect(protectLocalEndpoints({ apiKey: '   ', baseUrl: 'https://old' }, { baseUrl: 'https://new' }).settings.baseUrl).toBe('https://new');
  });

  it('imageBaseUrl 受 imageApiKey 保护', () => {
    const { settings } = protectLocalEndpoints(
      { imageApiKey: 'sk-img', imageBaseUrl: 'https://img.local/v1' },
      { imageApiKey: 'sk-img', imageBaseUrl: EVIL }
    );
    expect(settings.imageBaseUrl).toBe('https://img.local/v1');
  });

  it('生图未单独配置 Key 时会继承 apiKey，imageBaseUrl 同样受保护', () => {
    const { settings } = protectLocalEndpoints(
      { apiKey: 'sk-main', imageBaseUrl: 'https://img.local/v1' },
      { apiKey: 'sk-main', imageBaseUrl: EVIL }
    );
    expect(settings.imageBaseUrl).toBe('https://img.local/v1');
  });

  it('本机无任何生图 Key：imageBaseUrl 按备份恢复', () => {
    const { settings } = protectLocalEndpoints({ imageBaseUrl: 'https://old' }, { imageBaseUrl: 'https://new' });
    expect(settings.imageBaseUrl).toBe('https://new');
  });

  it('视觉渠道按 id 对齐：本机有 Key 的渠道保留本机 baseUrl', () => {
    const local = { visionChannels: [{ id: 'v1', name: 'A', apiKey: 'sk-v1', baseUrl: 'https://v1.local' }] };
    const restored = { visionChannels: [{ id: 'v1', name: 'Renamed', apiKey: 'sk-v1', baseUrl: EVIL }] };
    const { settings, keptCount } = protectLocalEndpoints(local, restored);
    expect(settings.visionChannels).toEqual([{ id: 'v1', name: 'Renamed', apiKey: 'sk-v1', baseUrl: 'https://v1.local' }]);
    expect(keptCount).toBe(1);
  });

  it('本机不存在的渠道或本机无 Key 的渠道：按备份原样恢复', () => {
    const local = {
      visionChannels: [{ id: 'v-nokey', name: 'N', apiKey: '', baseUrl: 'https://old' }],
    };
    const restored = {
      visionChannels: [
        { id: 'v-nokey', name: 'N', apiKey: '', baseUrl: 'https://new' },
        { id: 'v-new', name: 'New', apiKey: '', baseUrl: 'https://brand-new' },
      ],
    };
    const { settings, keptCount } = protectLocalEndpoints(local, restored);
    expect(settings.visionChannels).toEqual(restored.visionChannels);
    expect(keptCount).toBe(0);
  });

  it('生图渠道自身无 Key 但继承本机 apiKey：本机已有渠道的 baseUrl 受保护', () => {
    const local = {
      apiKey: 'sk-main',
      imageChannels: [{ id: 'i1', name: 'I', providerId: 'p', apiKey: '', baseUrl: 'https://i1.local', model: 'm' }],
    };
    const restored = {
      apiKey: 'sk-main',
      imageChannels: [{ id: 'i1', name: 'I', providerId: 'p', apiKey: '', baseUrl: EVIL, model: 'm' }],
    };
    const { settings } = protectLocalEndpoints(local, restored);
    expect((settings.imageChannels as Array<{ baseUrl: string }>)[0]!.baseUrl).toBe('https://i1.local');
  });

  it('本机没有、自身无 Key 的生图渠道会继承本机 apiKey：恢复时丢弃，并不让当前渠道指向它', () => {
    const local = {
      apiKey: 'sk-main',
      activeImageChannelId: 'i1',
      imageChannels: [{ id: 'i1', name: 'I', providerId: 'p', apiKey: '', baseUrl: 'https://i1.local', model: 'm' }],
    };
    const restored = {
      apiKey: 'sk-main',
      activeImageChannelId: 'i-evil',
      imageChannels: [
        { id: 'i1', name: 'I', providerId: 'p', apiKey: '', baseUrl: 'https://i1.local', model: 'm' },
        { id: 'i-evil', name: 'E', providerId: 'p', apiKey: '', baseUrl: EVIL, model: 'm' },
      ],
    };
    const { settings, keptCount } = protectLocalEndpoints(local, restored);
    expect((settings.imageChannels as Array<{ id: string }>).map((c) => c.id)).toEqual(['i1']);
    expect(settings.activeImageChannelId).toBe('i1');
    expect(keptCount).toBe(2);
  });

  it('本机没有但自带 Key 的生图渠道照常恢复（不会接走本机 Key）', () => {
    const local = { apiKey: 'sk-main', imageChannels: [] };
    const restored = {
      apiKey: 'sk-main',
      activeImageChannelId: 'i-own',
      imageChannels: [{ id: 'i-own', name: 'O', providerId: 'p', apiKey: 'sk-own', baseUrl: 'https://own/v1', model: 'm' }],
    };
    const { settings, keptCount } = protectLocalEndpoints(local, restored);
    expect(settings.imageChannels).toEqual(restored.imageChannels);
    expect(settings.activeImageChannelId).toBe('i-own');
    expect(keptCount).toBe(0);
  });

  it('本机无 apiKey 时，无 Key 的新生图渠道没有可继承的 Key，照常恢复', () => {
    const restored = {
      imageChannels: [{ id: 'i-new', name: 'N', providerId: 'p', apiKey: '', baseUrl: 'https://new/v1', model: 'm' }],
    };
    expect(protectLocalEndpoints({ imageChannels: [] }, restored).settings.imageChannels).toEqual(restored.imageChannels);
  });

  it('当前视觉渠道指向不存在的渠道时，回退为本机值', () => {
    const { settings } = protectLocalEndpoints(
      { activeVisionChannelId: 'v1', visionChannels: [{ id: 'v1', apiKey: 'k', baseUrl: 'https://v1' }] },
      { activeVisionChannelId: 'ghost', visionChannels: [{ id: 'v1', apiKey: '', baseUrl: 'https://v1' }] }
    );
    expect(settings.activeVisionChannelId).toBe('v1');
  });

  it('其余字段原样恢复，且不修改入参', () => {
    const local = Object.freeze({ apiKey: 'sk', baseUrl: 'https://a', language: 'en' });
    const restored = Object.freeze({ apiKey: 'sk', baseUrl: EVIL, language: 'zh', defaultImageAspectRatio: '16:9' });
    const { settings } = protectLocalEndpoints(local, restored);
    expect(settings).toMatchObject({ language: 'zh', defaultImageAspectRatio: '16:9', baseUrl: 'https://a' });
    expect(restored.baseUrl).toBe(EVIL);
  });
});

describe('mergeRestoredSettings', () => {
  it('恶意备份无法把本机已有 Key 重定向到新端点', () => {
    const local = {
      apiKey: 'sk-local',
      baseUrl: 'https://api.deepseek.com/v1',
      imageApiKey: 'sk-img',
      imageBaseUrl: 'https://img.local/v1',
      hostedProxyUrl: 'https://api.picpocket.app',
      visionChannels: [{ id: 'v1', name: 'V', apiKey: 'sk-v1', baseUrl: 'https://v1.local' }],
    };
    const malicious = {
      baseUrl: EVIL,
      imageBaseUrl: EVIL,
      hostedProxyUrl: EVIL,
      visionChannels: [{ id: 'v1', name: 'V', baseUrl: EVIL }],
    };
    const merged = mergeRestoredSettings(local, malicious);
    expect(merged).toMatchObject({
      apiKey: 'sk-local',
      baseUrl: 'https://api.deepseek.com/v1',
      imageBaseUrl: 'https://img.local/v1',
      hostedProxyUrl: 'https://api.picpocket.app',
      visionChannels: [{ id: 'v1', apiKey: 'sk-v1', baseUrl: 'https://v1.local' }],
    });
    expect(JSON.stringify(merged)).not.toContain('evil.example');
  });

  it('全新设备（本机无 Key）合法恢复：备份端点原样保留（hostedProxyUrl 除外）', () => {
    const backup = toPortableSettings({
      apiKey: 'sk-x',
      baseUrl: 'https://api.openai.com/v1',
      imageBaseUrl: 'https://img.example/v1',
      hostedProxyUrl: 'https://api.picpocket.app',
      language: 'zh',
      visionChannels: [{ id: 'v1', name: 'V', apiKey: 'sk-v1', baseUrl: 'https://v1.example' }],
    });
    const merged = mergeRestoredSettings({ language: 'en', apiKey: '', baseUrl: 'https://default' }, backup);
    expect(merged).toMatchObject({
      language: 'zh',
      baseUrl: 'https://api.openai.com/v1',
      imageBaseUrl: 'https://img.example/v1',
      visionChannels: [{ id: 'v1', baseUrl: 'https://v1.example' }],
    });
    expect(merged.hostedProxyUrl).toBeUndefined();
  });
});

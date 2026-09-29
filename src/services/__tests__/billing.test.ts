import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { UserSettings } from '@/types';
import {
  SUBSCRIPTION_PLANS,
  buildPayPalCheckoutUrl,
  activateLicenseKey,
  getProMembership,
  isProExpired,
  hasVisionAccess,
  hasImageGenAccess,
  channelAccessBlock,
  DEFAULT_HOSTED_PROXY_URL,
  buildHostedProxyHeaders,
  getLicenseErrorKey,
} from '../billing';

// Mock storage
let mockStorage: Record<string, any> = {};

vi.mock('../../utils/storage', () => ({
  getUserSettings: vi.fn(async () => mockStorage.userSettings || {}),
  saveUserSettings: vi.fn(async (newSettings) => {
    mockStorage.userSettings = { ...mockStorage.userSettings, ...newSettings };
    return mockStorage.userSettings;
  }),
}));

// Mock supabase
vi.mock('../supabase', () => ({
  isSupabaseConfigured: vi.fn(() => false), // 默认走离线降级分支
  getSupabaseConfig: vi.fn(() => ({
    url: 'https://xyacwmkqoizuxlqtywoa.supabase.co',
    anonKey: 'mock-anon-key',
  })),
  supabase: {
    from: vi.fn(),
    rpc: vi.fn(),
  },
}));

import { supabase, isSupabaseConfigured } from '../supabase';

describe('Billing & Pro Membership Service', () => {
  beforeEach(() => {
    mockStorage = {};
  });

  it('should have valid monthly and yearly subscription plans', () => {
    expect(SUBSCRIPTION_PLANS.length).toBe(2);
    const monthly = SUBSCRIPTION_PLANS[0]!;
    const yearly = SUBSCRIPTION_PLANS[1]!;
    expect(monthly.id).toBe('monthly');
    expect(monthly.priceZh).toBe('¥29');
    expect(yearly.id).toBe('yearly');
    expect(yearly.priceZh).toBe('¥238');
    expect(yearly.savings).toBe('省 30%');
  });

  it('should construct valid PayPal subscription checkout URL', () => {
    const yearly = SUBSCRIPTION_PLANS.find((p) => p.id === 'yearly')!;
    const url = buildPayPalCheckoutUrl(yearly);
    expect(url).toContain('https://www.paypal.com/checkoutnow');
    expect(url).toContain(yearly.paypalPlanId);
    expect(url).toContain('PicPocket');
  });

  it('should expose valid default hosted proxy url', () => {
    expect(DEFAULT_HOSTED_PROXY_URL).toContain('/functions/v1/ai-proxy');
  });

  it('builds hosted proxy headers that pass the Supabase gateway and identify the license', () => {
    // 网关要求 apikey + Authorization，缺失时直接 401，请求到不了 ai-proxy
    expect(buildHostedProxyHeaders('PP-SAMPLE-CODE', 'vision')).toEqual({
      apikey: 'mock-anon-key',
      Authorization: 'Bearer mock-anon-key',
      'X-License-Key': 'PP-SAMPLE-CODE',
      'X-Request-Type': 'vision',
    });
    expect(buildHostedProxyHeaders('PP-SAMPLE-CODE', 'image-generation')['X-Request-Type']).toBe('image-generation');
  });

  it('should reject invalid license key format', async () => {
    const result = await activateLicenseKey('BAD');
    expect(result.success).toBe(false);
    expect(result.message).toContain('激活码格式无效');
  });

  it('never activates a code locally when the hosted service is not configured', async () => {
    for (const code of ['PP-SAMPLE-CODE', 'REDNOTE-CREATOR-LISA', 'PP-PRO-YEAR-XYZ789']) {
      const res = await activateLicenseKey(code);
      expect(res.success).toBe(false);
      expect(res.errorCode).toBe('server');
    }
    expect(mockStorage.userSettings?.proMembership).toBeUndefined();
    expect((await getProMembership()).isPro).toBe(false);
  });

  it('should correctly detect expired or zero-quota membership with isProExpired', () => {
    expect(isProExpired(undefined)).toBe(true);
    expect(isProExpired({ isPro: false })).toBe(true);
    expect(isProExpired({ isPro: true, expiresAt: Date.now() - 1000 })).toBe(true);
    expect(isProExpired({ isPro: true, quotaRemaining: 0 })).toBe(true);
    expect(
      isProExpired({
        isPro: true,
        visionQuotaRemaining: 0,
        imageQuotaRemaining: 0,
      })
    ).toBe(true);
    // 只要其中一项还有额度，不算整体过期
    expect(
      isProExpired({
        isPro: true,
        visionQuotaRemaining: 10,
        imageQuotaRemaining: 0,
      })
    ).toBe(false);
    expect(
      isProExpired({
        isPro: true,
        visionQuotaRemaining: 0,
        imageQuotaRemaining: 5,
      })
    ).toBe(false);
    expect(isProExpired({ isPro: true, expiresAt: Date.now() + 10000, quotaRemaining: 50 })).toBe(false);
  });

  it('should accurately evaluate hasVisionAccess and hasImageGenAccess with dual quotas', () => {
    // 1. 无 Key 无 Pro
    expect(hasVisionAccess(null)).toBe(false);
    expect(hasVisionAccess({ apiKey: '', baseUrl: '', model: '', autoAnalyzeOnCapture: false, language: 'zh' })).toBe(false);
    expect(hasImageGenAccess({ apiKey: '', baseUrl: '', model: '', autoAnalyzeOnCapture: false, language: 'zh' })).toBe(false);

    // 2. 自备 Key 模式 (BYOK)
    const byokSettings = {
      apiKey: 'sk-test-byok-key',
      baseUrl: 'https://api.deepseek.com/v1',
      model: 'deepseek-chat',
      autoAnalyzeOnCapture: false,
      language: 'zh' as const,
    };
    expect(hasVisionAccess(byokSettings)).toBe(true);
    expect(hasImageGenAccess(byokSettings)).toBe(true);

    // 3. Pro 激活免配置模式 (双额度正常)
    const proSettings = {
      apiKey: '',
      baseUrl: '',
      model: '',
      autoAnalyzeOnCapture: false,
      language: 'zh' as const,
      proMembership: {
        isPro: true,
        licenseKey: 'VIP-BLOGGER-666',
        tier: 'blogger' as const,
        visionQuotaRemaining: 1000,
        imageQuotaRemaining: 200,
        expiresAt: Date.now() + 100000,
      },
    };
    expect(hasVisionAccess(proSettings)).toBe(true);
    expect(hasImageGenAccess(proSettings)).toBe(true);

    // 4. 反推用尽但生图仍有配额
    const visionExhaustedSettings = {
      ...proSettings,
      proMembership: {
        ...proSettings.proMembership,
        visionQuotaRemaining: 0,
        imageQuotaRemaining: 50,
      },
    };
    expect(hasVisionAccess(visionExhaustedSettings)).toBe(false);
    expect(hasImageGenAccess(visionExhaustedSettings)).toBe(true);

    // 5. 生图用尽但反推仍有配额
    const imageExhaustedSettings = {
      ...proSettings,
      proMembership: {
        ...proSettings.proMembership,
        visionQuotaRemaining: 500,
        imageQuotaRemaining: 0,
      },
    };
    expect(hasVisionAccess(imageExhaustedSettings)).toBe(true);
    expect(hasImageGenAccess(imageExhaustedSettings)).toBe(false);

    // 6. 全部用尽
    const allExhaustedSettings = {
      ...proSettings,
      proMembership: {
        ...proSettings.proMembership,
        visionQuotaRemaining: 0,
        imageQuotaRemaining: 0,
      },
    };
    expect(hasVisionAccess(allExhaustedSettings)).toBe(false);
    expect(hasImageGenAccess(allExhaustedSettings)).toBe(false);
  });

  describe('remote verification via verify_license RPC', () => {
    beforeEach(() => {
      vi.mocked(isSupabaseConfigured).mockReturnValue(true);
      vi.mocked(supabase.rpc).mockReset();
      vi.mocked(supabase.from).mockReset();
    });

    afterEach(() => {
      vi.mocked(isSupabaseConfigured).mockReturnValue(false);
    });

    it('activates using the row returned by verify_license and never reads the licenses table', async () => {
      vi.mocked(supabase.rpc).mockResolvedValue({
        data: [
          {
            key: 'PP-REAL-CODE',
            tier: 'pro',
            vision_total_quota: 300,
            vision_remaining_quota: 120,
            image_total_quota: 50,
            image_remaining_quota: 7,
            expires_at: null,
            note: null,
          },
        ],
        error: null,
      } as any);

      const res = await activateLicenseKey(' pp-real-code ');
      expect(supabase.rpc).toHaveBeenCalledWith('verify_license', { license_key: 'PP-REAL-CODE' });
      expect(supabase.from).not.toHaveBeenCalled();
      expect(res.success).toBe(true);
      expect(res.membership?.licenseKey).toBe('PP-REAL-CODE');
      expect(res.membership?.visionQuotaRemaining).toBe(120);
      expect(res.membership?.imageQuotaRemaining).toBe(7);
      expect(mockStorage.userSettings.proMembership.licenseKey).toBe('PP-REAL-CODE');
    });

    it('rejects unknown, expired or exhausted codes instead of activating them offline', async () => {
      vi.mocked(supabase.rpc).mockResolvedValue({ data: [], error: null } as any);

      const res = await activateLicenseKey('VIP-MADE-UP-CODE');
      expect(res.success).toBe(false);
      expect(res.errorCode).toBe('invalid');
      expect(res.membership).toBeUndefined();
      expect(mockStorage.userSettings?.proMembership).toBeUndefined();
    });

    it('does not grant a membership when verification fails, and tells network from server errors', async () => {
      vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: { message: 'TypeError: Failed to fetch', code: '' } } as any);
      const res = await activateLicenseKey('PP-SAMPLE-CODE');
      expect(res.success).toBe(false);
      expect(res.errorCode).toBe('network');

      vi.mocked(supabase.rpc).mockRejectedValue(new Error('Failed to fetch'));
      const res2 = await activateLicenseKey('PP-SAMPLE-CODE');
      expect(res2.success).toBe(false);
      expect(res2.errorCode).toBe('network');

      vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: { message: 'Could not find the function', code: 'PGRST202' } } as any);
      const res3 = await activateLicenseKey('PP-SAMPLE-CODE');
      expect(res3.success).toBe(false);
      expect(res3.errorCode).toBe('server');

      expect(mockStorage.userSettings?.proMembership).toBeUndefined();
    });

    it('reports expired and used-up codes specifically', async () => {
      const base = {
        key: 'PP-OLD',
        tier: 'pro',
        total_quota: null,
        remaining_quota: null,
        vision_total_quota: 10,
        image_total_quota: 10,
        note: null,
      };
      vi.mocked(supabase.rpc).mockResolvedValue({
        data: [{ ...base, vision_remaining_quota: 5, image_remaining_quota: 5, expires_at: '2020-01-01T00:00:00Z' }],
        error: null,
      } as any);
      expect((await activateLicenseKey('PP-OLD')).errorCode).toBe('expired');

      vi.mocked(supabase.rpc).mockResolvedValue({
        data: [{ ...base, vision_remaining_quota: 0, image_remaining_quota: 0, expires_at: null }],
        error: null,
      } as any);
      expect((await activateLicenseKey('PP-OLD')).errorCode).toBe('exhausted');
      expect(mockStorage.userSettings?.proMembership).toBeUndefined();
    });

    it('maps every error code to a translation key', () => {
      expect(getLicenseErrorKey('invalid')).toBe('subscription.invalidKey');
      expect(getLicenseErrorKey('expired')).toBe('subscription.codeExpired');
      expect(getLicenseErrorKey('exhausted')).toBe('subscription.codeExhausted');
      expect(getLicenseErrorKey('network')).toBe('subscription.verifyNetworkError');
      expect(getLicenseErrorKey('server')).toBe('subscription.verifyServerError');
    });
  });
});

describe('channelAccessBlock', () => {
  const base: UserSettings = { apiKey: '', baseUrl: '', model: '', autoAnalyzeOnCapture: false, language: 'zh' };

  it('names the selected channel when its key is missing', () => {
    const settings: UserSettings = {
      ...base,
      visionChannels: [{ id: 'ds', name: 'DeepSeek', providerId: 'deepseek-official', apiKey: '', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' }],
      activeVisionChannelId: 'ds',
    };
    expect(channelAccessBlock(settings, 'vision', true)).toEqual({ key: 'billing.hostedErrors.channelMissingKey', params: { name: 'DeepSeek' } });
    expect(hasVisionAccess(settings, true)).toBe(false);
  });

  it('asks to sign in on the PicPocket channel without an account or redeem code', () => {
    expect(channelAccessBlock(base, 'image', false)).toEqual({ key: 'billing.hostedErrors.needCredentials' });
    expect(channelAccessBlock(base, 'image', true)).toBeNull();
    expect(hasImageGenAccess(base, true)).toBe(true);
  });

  it('allows an own channel that has a key', () => {
    expect(channelAccessBlock({ ...base, apiKey: 'sk-legacy', baseUrl: 'https://api.deepseek.com/v1' }, 'vision', false)).toBeNull();
  });
});

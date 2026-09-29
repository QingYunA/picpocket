import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../supabase', () => ({
  supabase: { auth: { getSession: vi.fn() } },
  getSupabaseConfig: () => ({ url: 'https://example.supabase.co', anonKey: 'sb_publishable_test' }),
}));

import { supabase } from '../supabase';
import {
  getAccountAccessToken,
  hostedCreditError,
  hostedHeaders,
  readCreditBalance,
  resolveHostedCredential,
  CREDIT_BALANCE_KEY,
} from '../hostedAccount';
import { isInsufficientCreditsMessage } from '../../utils/errorMessage';
import type { UserSettings } from '../../types';

const signedIn = () => vi.mocked(supabase.auth.getSession).mockResolvedValue({ data: { session: { access_token: 'jwt-1' } }, error: null } as any);
const withLicense = (membership: Record<string, unknown>) => ({ proMembership: { isPro: true, ...membership } }) as unknown as UserSettings;

function mockStorage() {
  const store: Record<string, unknown> = {};
  (globalThis as any).chrome = {
    storage: {
      local: {
        get: vi.fn(async (key: string) => ({ [key]: store[key] })),
        set: vi.fn(async (items: Record<string, unknown>) => Object.assign(store, items)),
      },
    },
  };
  return store;
}

describe('hosted account credentials', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns the current access token, or null when signed out', async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValue({ data: { session: { access_token: 'jwt-1' } }, error: null } as any);
    expect(await getAccountAccessToken()).toBe('jwt-1');
    vi.mocked(supabase.auth.getSession).mockResolvedValue({ data: { session: null }, error: null } as any);
    expect(await getAccountAccessToken()).toBeNull();
    vi.mocked(supabase.auth.getSession).mockRejectedValue(new Error('storage unavailable'));
    expect(await getAccountAccessToken()).toBeNull();
  });

  it('sends the user token instead of a redeem code', () => {
    expect(hostedHeaders({ kind: 'account', accessToken: 'jwt-1' }, 'vision')).toEqual({
      apikey: 'sb_publishable_test',
      Authorization: 'Bearer jwt-1',
      'X-Request-Type': 'vision',
    });
  });
});

describe('resolveHostedCredential precedence', () => {
  beforeEach(() => vi.clearAllMocks());

  it('prefers a usable redeem code and never bills credits for it', async () => {
    signedIn();
    const cred = await resolveHostedCredential(withLicense({ licenseKey: 'PP-1', visionQuotaRemaining: 3 }), 'vision');
    expect(cred).toEqual({ kind: 'license', licenseKey: 'PP-1' });
    expect(supabase.auth.getSession).not.toHaveBeenCalled();
  });

  it('falls back to account credits when the redeem code quota for this request type is used up', async () => {
    signedIn();
    const settings = withLicense({ licenseKey: 'PP-1', visionQuotaRemaining: 0, imageQuotaRemaining: 5 });
    expect(await resolveHostedCredential(settings, 'vision')).toEqual({ kind: 'account', accessToken: 'jwt-1' });
    expect(await resolveHostedCredential(settings, 'image-generation')).toEqual({ kind: 'license', licenseKey: 'PP-1' });
  });

  it('never sends a request without credentials when the redeem code itself is missing', async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValue({ data: { session: null }, error: null } as any);
    expect(await resolveHostedCredential(withLicense({ visionQuotaRemaining: 3 }), 'vision')).toBeNull();
  });

  it('ignores expired redeem codes', async () => {
    signedIn();
    const cred = await resolveHostedCredential(withLicense({ licenseKey: 'PP-1', expiresAt: Date.now() - 1000 }), 'vision');
    expect(cred?.kind).toBe('account');
  });
});

describe('hosted credit responses', () => {
  it('caches the balance reported by the gateway', async () => {
    const store = mockStorage();
    await readCreditBalance(new Headers({ 'X-Credits-Balance': '42' }));
    expect(store[CREDIT_BALANCE_KEY]).toMatchObject({ balance: 42 });
    await readCreditBalance(new Headers());
    expect(store[CREDIT_BALANCE_KEY]).toMatchObject({ balance: 42 });
  });

  it('explains insufficient credits and unavailable hosted service in the user language', () => {
    expect(hostedCreditError(402, JSON.stringify({ code: 'insufficient_credits', balance: 3, required: 8 }), 'en')?.message).toMatch(/Not enough credits.*3.*8/);
    expect(hostedCreditError(402, JSON.stringify({ code: 'insufficient_credits', balance: 3, required: 8 }))?.message).toMatch(/积分不足.*3.*8/);
    expect(hostedCreditError(429, JSON.stringify({ code: 'rate_limited' }))?.message).toMatch(/太频繁/);
    expect(hostedCreditError(400, JSON.stringify({ code: 'unsupported_model' }))?.message).toMatch(/模型/);
    expect(hostedCreditError(503, '{}')?.message).toMatch(/暂不可用/);
    expect(hostedCreditError(500, 'boom')).toBeNull();
  });

  it('only tags the insufficient-credits error so the UI can offer an upgrade action', () => {
    const insufficient = hostedCreditError(402, JSON.stringify({ code: 'insufficient_credits', balance: 3, required: 8 }), 'en');
    expect(isInsufficientCreditsMessage(insufficient?.message)).toBe(true);
    expect(isInsufficientCreditsMessage(hostedCreditError(429, '{}', 'en')?.message)).toBe(false);
    expect(isInsufficientCreditsMessage(hostedCreditError(503, '{}', 'en')?.message)).toBe(false);
  });
});

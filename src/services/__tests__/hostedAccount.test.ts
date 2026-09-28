import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../supabase', () => ({
  supabase: { auth: { getSession: vi.fn() } },
  getSupabaseConfig: () => ({ url: 'https://example.supabase.co', anonKey: 'sb_publishable_test' }),
}));

import { supabase } from '../supabase';
import {
  accountHostedHeaders,
  getAccountAccessToken,
  hostedCreditError,
  readCreditBalance,
  CREDIT_BALANCE_KEY,
} from '../hostedAccount';

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
    expect(accountHostedHeaders('jwt-1', 'vision')).toEqual({
      apikey: 'sb_publishable_test',
      Authorization: 'Bearer jwt-1',
      'X-Request-Type': 'vision',
    });
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

  it('explains insufficient credits and unavailable hosted service', () => {
    expect(hostedCreditError(402, JSON.stringify({ code: 'insufficient_credits', balance: 3, required: 8 }))?.message).toMatch(/积分不足.*3.*8/);
    expect(hostedCreditError(429, JSON.stringify({ code: 'rate_limited' }))?.message).toMatch(/太频繁/);
    expect(hostedCreditError(400, JSON.stringify({ code: 'unsupported_model' }))?.message).toMatch(/模型/);
    expect(hostedCreditError(503, '{}')?.message).toMatch(/暂不可用/);
    expect(hostedCreditError(500, 'boom')).toBeNull();
  });
});

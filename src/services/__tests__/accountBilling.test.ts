import { describe, it, expect, beforeEach, vi } from 'vitest';

const { FakeFunctionsHttpError } = vi.hoisted(() => ({
  FakeFunctionsHttpError: class extends Error {
    constructor(public context: Response) {
      super('Edge Function returned a non-2xx status code');
    }
  },
}));

vi.mock('@supabase/supabase-js', () => ({ FunctionsHttpError: FakeFunctionsHttpError }));
vi.mock('../supabase', () => ({ supabase: { functions: { invoke: vi.fn() } } }));

import { supabase } from '../supabase';
import { BillingError, fetchEntitlement, manageSubscription, requestCheckoutUrl, subscriptionSku, yearlySavingsPercent } from '../accountBilling';

describe('plan catalog helpers', () => {
  it('builds subscription skus', () => {
    expect(subscriptionSku('pro', 'year')).toBe('pro_year');
    expect(subscriptionSku('plus', 'month')).toBe('plus_month');
  });
  it('computes the yearly discount', () => {
    expect(yearlySavingsPercent('plus')).toBe(17);
  });
});

describe('billing requests', () => {
  beforeEach(() => vi.clearAllMocks());

  it('fetches the entitlement with GET', async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValue({ data: { plan: 'pro', balance: 10 }, error: null } as any);
    await expect(fetchEntitlement()).resolves.toMatchObject({ plan: 'pro', balance: 10 });
    expect(supabase.functions.invoke).toHaveBeenCalledWith('get-entitlement', { method: 'GET' });
  });

  it('returns the checkout url', async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValue({ data: { url: 'https://pay.example/x' }, error: null } as any);
    await expect(requestCheckoutUrl('paypal', 'credits_300')).resolves.toBe('https://pay.example/x');
    expect(supabase.functions.invoke).toHaveBeenCalledWith('create-checkout', { body: { provider: 'paypal', sku: 'credits_300' } });
  });

  it('turns server error codes into BillingError', async () => {
    const context = new Response(JSON.stringify({ code: 'subscribed_elsewhere', provider: 'waffo' }), { status: 409 });
    vi.mocked(supabase.functions.invoke).mockResolvedValue({ data: null, error: new FakeFunctionsHttpError(context) } as any);
    await expect(requestCheckoutUrl('paypal', 'pro_month')).rejects.toMatchObject({ code: 'subscribed_elsewhere' });
  });

  it('reports network failures distinctly', async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValue({ data: null, error: new Error('Failed to send a request') } as any);
    const err = await manageSubscription('cancel').catch((e) => e);
    expect(err).toBeInstanceOf(BillingError);
    expect(err.code).toBe('network');
  });
});

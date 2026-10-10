import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../supabase', () => ({
  supabase: {
    auth: {
      signInWithOtp: vi.fn(),
      verifyOtp: vi.fn(),
      signOut: vi.fn(),
      getSession: vi.fn(),
    },
  },
}));

import { supabase } from '../supabase';
import {
  sendEmailCode,
  verifyEmailCode,
  toAccountUser,
} from '../auth';

const fakeUser = {
  id: 'user-1',
  email: 'ada@example.com',
  app_metadata: { provider: 'github' },
  user_metadata: { user_name: 'ada', avatar_url: 'https://avatars.example.com/ada.png' },
};

describe('email one-time code', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rejects malformed emails without calling the server', async () => {
    await expect(sendEmailCode('not-an-email')).rejects.toMatchObject({ code: 'invalid_email' });
    expect(supabase.auth.signInWithOtp).not.toHaveBeenCalled();
  });

  it('sends a code to a normalized email and allows sign-up', async () => {
    vi.mocked(supabase.auth.signInWithOtp).mockResolvedValue({ data: {}, error: null } as any);
    await sendEmailCode('  Ada@Example.com ');
    expect(supabase.auth.signInWithOtp).toHaveBeenCalledWith({ email: 'ada@example.com', options: { shouldCreateUser: true } });
  });

  it('maps rate limiting to a dedicated error code', async () => {
    vi.mocked(supabase.auth.signInWithOtp).mockResolvedValue({ data: {}, error: { status: 429, message: 'Email rate limit exceeded' } } as any);
    await expect(sendEmailCode('ada@example.com')).rejects.toMatchObject({ code: 'rate_limited' });
  });

  it('verifies a 6-digit code and returns the user', async () => {
    vi.mocked(supabase.auth.verifyOtp).mockResolvedValue({ data: { user: { ...fakeUser, app_metadata: { provider: 'email' }, user_metadata: {} } }, error: null } as any);
    const user = await verifyEmailCode('ada@example.com', ' 123456 ');
    expect(supabase.auth.verifyOtp).toHaveBeenCalledWith({ email: 'ada@example.com', token: '123456', type: 'email' });
    expect(user.email).toBe('ada@example.com');
    expect(user.name).toBe('ada');
  });

  it('reports network failures during verification as network, not as a wrong code', async () => {
    vi.mocked(supabase.auth.verifyOtp).mockResolvedValue({ data: { user: null }, error: { status: 0, message: 'TypeError: Failed to fetch' } } as any);
    await expect(verifyEmailCode('ada@example.com', '123456')).rejects.toMatchObject({ code: 'network' });
    vi.mocked(supabase.auth.verifyOtp).mockResolvedValue({ data: { user: null }, error: { status: 503, message: 'Service Unavailable' } } as any);
    await expect(verifyEmailCode('ada@example.com', '123456')).rejects.toMatchObject({ code: 'unknown' });
  });

  it('rejects wrong or expired codes with invalid_code', async () => {
    await expect(verifyEmailCode('ada@example.com', '12ab')).rejects.toMatchObject({ code: 'invalid_code' });
    vi.mocked(supabase.auth.verifyOtp).mockResolvedValue({ data: { user: null }, error: { status: 403, message: 'Token has expired or is invalid' } } as any);
    await expect(verifyEmailCode('ada@example.com', '123456')).rejects.toMatchObject({ code: 'invalid_code' });
  });
});

describe('toAccountUser', () => {
  it('prefers full_name and picture from Google metadata', () => {
    expect(
      toAccountUser({ id: 'u', email: 'g@example.com', app_metadata: { provider: 'google' }, user_metadata: { full_name: 'Grace Hopper', picture: 'https://pic' } } as any)
    ).toEqual({ id: 'u', email: 'g@example.com', name: 'Grace Hopper', avatarUrl: 'https://pic', provider: 'google' });
  });
});

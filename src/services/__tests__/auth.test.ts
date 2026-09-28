import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../supabase', () => ({
  supabase: {
    auth: {
      signInWithOAuth: vi.fn(),
      exchangeCodeForSession: vi.fn(),
      signInWithOtp: vi.fn(),
      verifyOtp: vi.fn(),
      signOut: vi.fn(),
      getSession: vi.fn(),
    },
  },
}));

import { supabase } from '../supabase';
import {
  extractAuthCallback,
  signInWithOAuth,
  sendEmailCode,
  verifyEmailCode,
  toAccountUser,
  AuthError,
} from '../auth';

const REDIRECT = 'https://lnmihmfcdidmggghgnkfghbpeaekdlea.chromiumapp.org/';

function mockIdentity(launch: (opts: { url: string; interactive: boolean }) => Promise<string | undefined>) {
  (globalThis as any).chrome = {
    identity: {
      getRedirectURL: vi.fn(() => REDIRECT),
      launchWebAuthFlow: vi.fn(launch),
    },
  };
}

const fakeUser = {
  id: 'user-1',
  email: 'ada@example.com',
  app_metadata: { provider: 'github' },
  user_metadata: { user_name: 'ada', avatar_url: 'https://avatars.example.com/ada.png' },
};

describe('extractAuthCallback', () => {
  it('reads the PKCE code from the query string', () => {
    expect(extractAuthCallback(`${REDIRECT}?code=abc123`)).toEqual({ code: 'abc123' });
  });

  it('reads provider errors from query or hash', () => {
    expect(extractAuthCallback(`${REDIRECT}?error=access_denied&error_description=User+denied`).error).toBe('User denied');
    expect(extractAuthCallback(`${REDIRECT}#error=server_error&error_description=boom`).error).toBe('boom');
  });
});

describe('signInWithOAuth', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => {
    delete (globalThis as any).chrome;
  });

  it('runs the PKCE flow through chrome.identity and returns the signed-in user', async () => {
    vi.mocked(supabase.auth.signInWithOAuth).mockResolvedValue({ data: { provider: 'github', url: 'https://auth.example.com/authorize' }, error: null } as any);
    vi.mocked(supabase.auth.exchangeCodeForSession).mockResolvedValue({ data: { session: {}, user: fakeUser }, error: null } as any);
    mockIdentity(async () => `${REDIRECT}?code=xyz`);

    const user = await signInWithOAuth('github');

    expect(supabase.auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'github',
      options: { redirectTo: REDIRECT, skipBrowserRedirect: true },
    });
    expect((globalThis as any).chrome.identity.launchWebAuthFlow).toHaveBeenCalledWith({ url: 'https://auth.example.com/authorize', interactive: true });
    expect(supabase.auth.exchangeCodeForSession).toHaveBeenCalledWith('xyz');
    expect(user).toEqual({ id: 'user-1', email: 'ada@example.com', name: 'ada', avatarUrl: 'https://avatars.example.com/ada.png', provider: 'github' });
  });

  it('reports cancellation when the user closes the auth window', async () => {
    vi.mocked(supabase.auth.signInWithOAuth).mockResolvedValue({ data: { url: 'https://auth.example.com/authorize' }, error: null } as any);
    mockIdentity(async () => {
      throw new Error('The user did not approve access.');
    });

    await expect(signInWithOAuth('google')).rejects.toMatchObject({ code: 'cancelled' });
    expect(supabase.auth.exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it('surfaces provider errors from the callback URL', async () => {
    vi.mocked(supabase.auth.signInWithOAuth).mockResolvedValue({ data: { url: 'https://auth.example.com/authorize' }, error: null } as any);
    mockIdentity(async () => `${REDIRECT}?error=access_denied&error_description=denied`);

    await expect(signInWithOAuth('google')).rejects.toBeInstanceOf(AuthError);
    expect(supabase.auth.exchangeCodeForSession).not.toHaveBeenCalled();
  });
});

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

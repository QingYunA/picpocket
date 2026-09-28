import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../supabase', () => ({
  supabase: { auth: { signInWithIdToken: vi.fn() } },
}));

import { supabase } from '../supabase';
import { completeGoogleWebSignIn, startGoogleWebSignIn, WEB_SIGN_IN_URL } from '../googleWebSignIn';

const SENDER = { url: `${WEB_SIGN_IN_URL}?nonce=abc`, origin: 'https://www.picpocket.top' };
const fakeUser = { id: 'u1', email: 'g@example.com', app_metadata: { provider: 'google' }, user_metadata: { full_name: 'Grace', picture: 'https://pic' } };

function mockChrome() {
  const session: Record<string, unknown> = {};
  (globalThis as any).chrome = {
    runtime: { id: 'bncoffcoihlpfbicajogmpcdckcfpnfa' },
    tabs: { create: vi.fn(async () => ({ id: 7 })) },
    storage: {
      session: {
        get: vi.fn(async (key: string) => ({ [key]: session[key] })),
        set: vi.fn(async (items: Record<string, unknown>) => Object.assign(session, items)),
        remove: vi.fn(async (key: string) => {
          delete session[key];
        }),
      },
    },
  };
  return session;
}

async function sha256Hex(text: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

describe('Google sign-in through picpocket.top', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('opens the website with a hashed nonce and remembers the raw nonce', async () => {
    const session = mockChrome();
    await startGoogleWebSignIn();

    const { url } = (globalThis as any).chrome.tabs.create.mock.calls[0][0];
    const opened = new URL(url);
    expect(`${opened.origin}${opened.pathname}`).toBe(WEB_SIGN_IN_URL);
    expect(opened.searchParams.get('ext')).toBe('bncoffcoihlpfbicajogmpcdckcfpnfa');
    const pending = Object.values(session)[0] as { nonce: string };
    expect(opened.searchParams.get('nonce')).toBe(await sha256Hex(pending.nonce));
    expect(pending.nonce).toMatch(/^[0-9a-f]{64}$/);
  });

  it('exchanges the ID token with the raw nonce exactly once', async () => {
    const session = mockChrome();
    await startGoogleWebSignIn();
    const { nonce } = Object.values(session)[0] as { nonce: string };
    vi.mocked(supabase.auth.signInWithIdToken).mockResolvedValue({ data: { user: fakeUser, session: {} }, error: null } as any);

    const user = await completeGoogleWebSignIn({ type: 'picpocket:google-id-token', idToken: 'jwt' }, SENDER);

    expect(supabase.auth.signInWithIdToken).toHaveBeenCalledWith({ provider: 'google', token: 'jwt', nonce });
    expect(user).toMatchObject({ id: 'u1', name: 'Grace', provider: 'google' });
    await expect(completeGoogleWebSignIn({ type: 'picpocket:google-id-token', idToken: 'jwt' }, SENDER)).rejects.toMatchObject({ code: 'provider_error' });
    expect(supabase.auth.signInWithIdToken).toHaveBeenCalledTimes(1);
  });

  it('ignores tokens sent from any other origin', async () => {
    mockChrome();
    await startGoogleWebSignIn();
    await expect(
      completeGoogleWebSignIn({ type: 'picpocket:google-id-token', idToken: 'jwt' }, { url: 'https://evil.example/auth/extension', origin: 'https://evil.example' })
    ).rejects.toMatchObject({ code: 'provider_error' });
    expect(supabase.auth.signInWithIdToken).not.toHaveBeenCalled();
  });

  it('rejects a sign-in that was started too long ago', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    mockChrome();
    await startGoogleWebSignIn();
    vi.setSystemTime(Date.now() + 11 * 60_000);
    await expect(completeGoogleWebSignIn({ type: 'picpocket:google-id-token', idToken: 'jwt' }, SENDER)).rejects.toMatchObject({ code: 'provider_error' });
    expect(supabase.auth.signInWithIdToken).not.toHaveBeenCalled();
  });

  it('rejects malformed messages', async () => {
    mockChrome();
    await startGoogleWebSignIn();
    await expect(completeGoogleWebSignIn({ type: 'picpocket:google-id-token' }, SENDER)).rejects.toMatchObject({ code: 'provider_error' });
  });
});

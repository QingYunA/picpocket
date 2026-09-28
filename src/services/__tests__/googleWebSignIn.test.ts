import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../supabase', () => ({
  supabase: { auth: { signInWithIdToken: vi.fn() } },
}));

import { supabase } from '../supabase';
import {
  cancelGoogleWebSignIn,
  completeGoogleWebSignIn,
  handleExternalSignIn,
  handleSignInTabRemoved,
  startGoogleWebSignIn,
  WEB_SIGN_IN_URL,
} from '../googleWebSignIn';

const TAB_ID = 7;
const SENDER = { url: `${WEB_SIGN_IN_URL}?nonce=abc`, tab: { id: TAB_ID } } as chrome.runtime.MessageSender;
const MESSAGE = { type: 'picpocket:google-id-token', idToken: 'jwt' };
const fakeUser = { id: 'u1', email: 'g@example.com', app_metadata: { provider: 'google' }, user_metadata: { full_name: 'Grace', picture: 'https://pic' } };

function mockChrome() {
  const session: Record<string, unknown> = {};
  const chromeMock = {
    runtime: { id: 'bncoffcoihlpfbicajogmpcdckcfpnfa', sendMessage: vi.fn(async () => undefined) },
    tabs: { create: vi.fn(async () => ({ id: TAB_ID })), remove: vi.fn(async () => undefined) },
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
  (globalThis as any).chrome = chromeMock;
  return { session, chromeMock };
}

const pendingNonce = (session: Record<string, unknown>) => (Object.values(session)[0] as { nonce: string }).nonce;

async function sha256Hex(text: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

describe('Google sign-in through picpocket.top', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('opens the website with a hashed nonce and the extension language', async () => {
    const { session, chromeMock } = mockChrome();
    await startGoogleWebSignIn('zh');

    const opened = new URL((chromeMock.tabs.create.mock.calls[0] as unknown as [{ url: string }])[0].url);
    expect(`${opened.origin}${opened.pathname}`).toBe(WEB_SIGN_IN_URL);
    expect(opened.searchParams.get('ext')).toBe('bncoffcoihlpfbicajogmpcdckcfpnfa');
    expect(opened.searchParams.get('lang')).toBe('zh');
    expect(pendingNonce(session)).toMatch(/^[0-9a-f]{64}$/);
    expect(opened.searchParams.get('nonce')).toBe(await sha256Hex(pendingNonce(session)));
  });

  it('exchanges the ID token with the raw nonce exactly once', async () => {
    const { session } = mockChrome();
    await startGoogleWebSignIn('en');
    const nonce = pendingNonce(session);
    vi.mocked(supabase.auth.signInWithIdToken).mockResolvedValue({ data: { user: fakeUser, session: {} }, error: null } as any);

    const user = await completeGoogleWebSignIn(MESSAGE, SENDER);

    expect(supabase.auth.signInWithIdToken).toHaveBeenCalledWith({ provider: 'google', token: 'jwt', nonce });
    expect(user).toMatchObject({ id: 'u1', name: 'Grace', provider: 'google' });
    await expect(completeGoogleWebSignIn(MESSAGE, SENDER)).rejects.toMatchObject({ code: 'expired' });
    expect(supabase.auth.signInWithIdToken).toHaveBeenCalledTimes(1);
  });

  it('only exchanges one of two concurrent deliveries of the same token', async () => {
    mockChrome();
    await startGoogleWebSignIn('en');
    vi.mocked(supabase.auth.signInWithIdToken).mockResolvedValue({ data: { user: fakeUser, session: {} }, error: null } as any);
    const results = await Promise.allSettled([completeGoogleWebSignIn(MESSAGE, SENDER), completeGoogleWebSignIn(MESSAGE, SENDER)]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(supabase.auth.signInWithIdToken).toHaveBeenCalledTimes(1);
  });

  it('accepts the trailing-slash URL Vercel also serves', async () => {
    mockChrome();
    await startGoogleWebSignIn('en');
    vi.mocked(supabase.auth.signInWithIdToken).mockResolvedValue({ data: { user: fakeUser, session: {} }, error: null } as any);
    await expect(completeGoogleWebSignIn(MESSAGE, { ...SENDER, url: `${WEB_SIGN_IN_URL}/?nonce=a` })).resolves.toBeTruthy();
  });

  it('ignores tokens from another origin or from a tab it did not open', async () => {
    mockChrome();
    await startGoogleWebSignIn('en');
    await expect(completeGoogleWebSignIn(MESSAGE, { url: 'https://evil.example/auth/extension', tab: { id: TAB_ID } } as chrome.runtime.MessageSender)).rejects.toMatchObject({ code: 'provider_error' });
    await expect(completeGoogleWebSignIn(MESSAGE, { ...SENDER, tab: { id: 99 } } as chrome.runtime.MessageSender)).rejects.toMatchObject({ code: 'provider_error' });
    expect(supabase.auth.signInWithIdToken).not.toHaveBeenCalled();
  });

  it('rejects a sign-in that was started too long ago', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    mockChrome();
    await startGoogleWebSignIn('en');
    vi.setSystemTime(Date.now() + 11 * 60_000);
    await expect(completeGoogleWebSignIn(MESSAGE, SENDER)).rejects.toMatchObject({ code: 'expired' });
    expect(supabase.auth.signInWithIdToken).not.toHaveBeenCalled();
  });

  it('cancelling closes the sign-in tab and invalidates the nonce', async () => {
    const { chromeMock } = mockChrome();
    await startGoogleWebSignIn('en');
    await cancelGoogleWebSignIn();
    expect(chromeMock.tabs.remove).toHaveBeenCalledWith(TAB_ID);
    await expect(completeGoogleWebSignIn(MESSAGE, SENDER)).rejects.toMatchObject({ code: 'expired' });
  });

  it('starting again closes the previous sign-in tab', async () => {
    const { chromeMock } = mockChrome();
    await startGoogleWebSignIn('en');
    await startGoogleWebSignIn('en');
    expect(chromeMock.tabs.remove).toHaveBeenCalledWith(TAB_ID);
    expect(chromeMock.tabs.create).toHaveBeenCalledTimes(2);
  });

  it('reports cancellation when the user closes the sign-in tab', async () => {
    const { chromeMock, session } = mockChrome();
    await startGoogleWebSignIn('en');
    await handleSignInTabRemoved(123);
    expect(chromeMock.runtime.sendMessage).not.toHaveBeenCalled();
    await handleSignInTabRemoved(TAB_ID);
    expect(chromeMock.runtime.sendMessage).toHaveBeenCalledWith({ action: 'GOOGLE_SIGN_IN_RESULT', ok: false, code: 'cancelled' });
    expect(Object.keys(session)).toHaveLength(0);
  });

  it('handleExternalSignIn closes the tab and broadcasts the result', async () => {
    const { chromeMock } = mockChrome();
    await startGoogleWebSignIn('en');
    vi.mocked(supabase.auth.signInWithIdToken).mockResolvedValue({ data: { user: fakeUser, session: {} }, error: null } as any);
    await expect(handleExternalSignIn(MESSAGE, SENDER)).resolves.toEqual({ ok: true });
    expect(chromeMock.tabs.remove).toHaveBeenCalledWith(TAB_ID);
    expect(chromeMock.runtime.sendMessage).toHaveBeenCalledWith({ action: 'GOOGLE_SIGN_IN_RESULT', ok: true });

    await expect(handleExternalSignIn(MESSAGE, SENDER)).resolves.toEqual({ ok: false, code: 'expired' });
  });

  it('rejects malformed messages', async () => {
    mockChrome();
    await startGoogleWebSignIn('en');
    await expect(completeGoogleWebSignIn({ type: 'picpocket:google-id-token' }, SENDER)).rejects.toMatchObject({ code: 'provider_error' });
  });
});

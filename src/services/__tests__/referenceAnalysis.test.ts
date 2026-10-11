import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  parseStartReferenceAnalysisMessage,
  startReferenceAnalysis,
  cancelReferenceAnalysis,
  checkReferenceAnalysisStatus,
  reconcileReferenceAnalysis,
  loadReferenceImageBlob,
  type ReferenceAnalysisDeps,
} from '../referenceAnalysis';
import { REFERENCE_ANALYSIS_WINDOW_MS } from '@/utils/referenceAnalysisRecovery';
import type { ActiveReferenceAnalysisState, ReferenceAnalysisFinishedMessage, UserSettings } from '@/types';

const NOW = 1_700_000_000_000;
const PNG_DATA_URL = 'data:image/png;base64,iVBORw0KGgo=';

function makeDeps(over: Partial<ReferenceAnalysisDeps> = {}) {
  let persisted: ActiveReferenceAnalysisState | null = null;
  const broadcasts: ReferenceAnalysisFinishedMessage[] = [];
  const stopKeepAlive = vi.fn();
  const deps: ReferenceAnalysisDeps = {
    active: new Map(),
    now: () => NOW,
    getSettings: vi.fn(async () => ({ model: 'm' }) as UserSettings),
    loadImage: vi.fn(async () => new Blob(['x'], { type: 'image/png' })),
    analyze: vi.fn(async () => ({ masterPrompt: 'a cat on a sofa' })),
    readState: vi.fn(async () => persisted),
    writeState: vi.fn(async (s: ActiveReferenceAnalysisState) => {
      persisted = s;
    }),
    clearState: vi.fn(async (id?: string) => {
      if (!id || persisted?.requestId === id) persisted = null;
    }),
    broadcast: vi.fn((m: ReferenceAnalysisFinishedMessage) => {
      broadcasts.push(m);
    }),
    startKeepAlive: vi.fn(() => stopKeepAlive),
    ...over,
  };
  return { deps, broadcasts, stopKeepAlive, getPersisted: () => persisted, setPersisted: (s: ActiveReferenceAnalysisState | null) => (persisted = s) };
}

describe('parseStartReferenceAnalysisMessage', () => {
  it('accepts a data URL payload and keeps the client start time', () => {
    const r = parseStartReferenceAnalysisMessage(
      { action: 'START_REFERENCE_ANALYSIS', requestId: 'r1', imageUrl: PNG_DATA_URL, startTime: NOW - 500, promptSnapshot: 'p' },
      NOW
    );
    expect(r).toEqual({ ok: true, value: { requestId: 'r1', imageUrl: PNG_DATA_URL, startTime: NOW - 500, promptSnapshot: 'p' } });
  });

  it('accepts http(s) image URLs and defaults the start time to now', () => {
    const r = parseStartReferenceAnalysisMessage({ requestId: 'r1', imageUrl: 'https://cdn.example.com/a.png' }, NOW);
    expect(r).toMatchObject({ ok: true, value: { startTime: NOW } });
  });

  it('clamps a future start time to now', () => {
    const r = parseStartReferenceAnalysisMessage({ requestId: 'r1', imageUrl: PNG_DATA_URL, startTime: NOW + 99_999 }, NOW);
    expect(r).toMatchObject({ ok: true, value: { startTime: NOW } });
  });

  it.each([
    [null],
    ['str'],
    [{ imageUrl: PNG_DATA_URL }],
    [{ requestId: '', imageUrl: PNG_DATA_URL }],
    [{ requestId: 42, imageUrl: PNG_DATA_URL }],
    [{ requestId: 'r1' }],
    [{ requestId: 'r1', imageUrl: '' }],
    [{ requestId: 'r1', imageUrl: 'blob:chrome-extension://x/1' }],
    [{ requestId: 'r1', imageUrl: 'javascript:alert(1)' }],
    [{ requestId: 'r1', imageUrl: 'file:///etc/passwd' }],
  ])('rejects invalid payload %j', (raw) => {
    expect(parseStartReferenceAnalysisMessage(raw, NOW).ok).toBe(false);
  });
});

describe('startReferenceAnalysis', () => {
  let ctx: ReturnType<typeof makeDeps>;
  beforeEach(() => {
    ctx = makeDeps();
  });

  it('runs the happy path: persists running, analyzes, persists done and broadcasts success', async () => {
    const { response, completion } = await startReferenceAnalysis(
      { requestId: 'r1', imageUrl: PNG_DATA_URL, promptSnapshot: 'old' },
      ctx.deps
    );
    expect(response).toEqual({ success: true, requestId: 'r1' });
    expect(ctx.deps.active.has('r1')).toBe(true);
    expect(ctx.deps.writeState).toHaveBeenCalledWith({ requestId: 'r1', startTime: NOW, status: 'running', promptSnapshot: 'old' });

    await completion;

    expect(ctx.deps.loadImage).toHaveBeenCalledWith(PNG_DATA_URL, expect.any(AbortSignal));
    expect(ctx.deps.analyze).toHaveBeenCalledWith(expect.any(Blob), expect.objectContaining({ model: 'm' }), expect.any(AbortSignal));
    expect(ctx.getPersisted()).toEqual({
      requestId: 'r1',
      startTime: NOW,
      status: 'done',
      promptSnapshot: 'old',
      masterPrompt: 'a cat on a sofa',
    });
    expect(ctx.broadcasts).toEqual([{ action: 'REFERENCE_ANALYSIS_FINISHED', requestId: 'r1', status: 'success', masterPrompt: 'a cat on a sofa' }]);
    expect(ctx.deps.active.size).toBe(0);
    expect(ctx.stopKeepAlive).toHaveBeenCalledTimes(1);
  });

  it('persists failed and broadcasts the error when analysis throws', async () => {
    ctx = makeDeps({ analyze: vi.fn(async () => { throw new Error('API 401'); }) });
    const { response, completion } = await startReferenceAnalysis({ requestId: 'r1', imageUrl: PNG_DATA_URL }, ctx.deps);
    expect(response.success).toBe(true);
    await completion;
    expect(ctx.getPersisted()).toMatchObject({ status: 'failed', error: 'API 401' });
    expect(ctx.broadcasts).toEqual([{ action: 'REFERENCE_ANALYSIS_FINISHED', requestId: 'r1', status: 'failed', error: 'API 401' }]);
    expect(ctx.deps.active.size).toBe(0);
    expect(ctx.stopKeepAlive).toHaveBeenCalledTimes(1);
  });

  it('treats an empty masterPrompt as a failure without an error text (panel falls back to its own copy)', async () => {
    ctx = makeDeps({ analyze: vi.fn(async () => ({ masterPrompt: '' })) });
    const { completion } = await startReferenceAnalysis({ requestId: 'r1', imageUrl: PNG_DATA_URL }, ctx.deps);
    await completion;
    expect(ctx.getPersisted()?.status).toBe('failed');
    expect(ctx.broadcasts[0]).toEqual({ action: 'REFERENCE_ANALYSIS_FINISHED', requestId: 'r1', status: 'failed' });
  });

  it('fails when the image cannot be loaded and never calls analyze', async () => {
    ctx = makeDeps({ loadImage: vi.fn(async () => { throw new Error('bad image'); }) });
    const { completion } = await startReferenceAnalysis({ requestId: 'r1', imageUrl: PNG_DATA_URL }, ctx.deps);
    await completion;
    expect(ctx.deps.analyze).not.toHaveBeenCalled();
    expect(ctx.broadcasts[0]).toMatchObject({ status: 'failed', error: 'bad image' });
  });

  it('rejects an invalid payload without registering anything', async () => {
    const { response, completion } = await startReferenceAnalysis({ requestId: 'r1', imageUrl: 'blob:x' }, ctx.deps);
    expect(response.success).toBe(false);
    expect(completion).toBeUndefined();
    expect(ctx.deps.active.size).toBe(0);
    expect(ctx.deps.writeState).not.toHaveBeenCalled();
  });

  it('is idempotent for a duplicate request id', async () => {
    ctx.deps.active.set('r1', new AbortController());
    const { response, completion } = await startReferenceAnalysis({ requestId: 'r1', imageUrl: PNG_DATA_URL }, ctx.deps);
    expect(response).toEqual({ success: true, requestId: 'r1', alreadyRunning: true });
    expect(completion).toBeUndefined();
    expect(ctx.deps.analyze).not.toHaveBeenCalled();
  });

  it('refuses a second concurrent request with a different id (single persisted slot)', async () => {
    ctx.deps.active.set('other', new AbortController());
    const { response } = await startReferenceAnalysis({ requestId: 'r2', imageUrl: PNG_DATA_URL }, ctx.deps);
    expect(response.success).toBe(false);
    expect(ctx.deps.active.has('r2')).toBe(false);
  });

  it('registers synchronously, before any await, so a duplicate message cannot slip through', async () => {
    const p1 = startReferenceAnalysis({ requestId: 'r1', imageUrl: PNG_DATA_URL }, ctx.deps);
    expect(ctx.deps.active.has('r1')).toBe(true);
    const p2 = startReferenceAnalysis({ requestId: 'r1', imageUrl: PNG_DATA_URL }, ctx.deps);
    expect((await p2).response).toMatchObject({ alreadyRunning: true });
    await (await p1).completion;
    expect(ctx.deps.analyze).toHaveBeenCalledTimes(1);
  });

  it('releases the registration when settings cannot be loaded', async () => {
    ctx = makeDeps({ getSettings: vi.fn(async () => { throw new Error('storage down'); }) });
    const { response } = await startReferenceAnalysis({ requestId: 'r1', imageUrl: PNG_DATA_URL }, ctx.deps);
    expect(response).toMatchObject({ success: false, error: expect.stringContaining('storage down') });
    expect(ctx.deps.active.size).toBe(0);
  });

  it('still analyzes when persisting the running state fails', async () => {
    ctx = makeDeps({ writeState: vi.fn(async () => { throw new Error('quota'); }) });
    const { response, completion } = await startReferenceAnalysis({ requestId: 'r1', imageUrl: PNG_DATA_URL }, ctx.deps);
    expect(response.success).toBe(true);
    await completion;
    expect(ctx.broadcasts[0]).toMatchObject({ status: 'success' });
  });

  it('swallows a cancellation: no failed state is persisted and no failure is broadcast by the run', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    ctx = makeDeps({
      analyze: vi.fn(async (_b, _s, signal) => {
        await gate;
        if (signal.aborted) throw new DOMException('aborted', 'AbortError');
        return { masterPrompt: 'late' };
      }),
    });
    const { completion } = await startReferenceAnalysis({ requestId: 'r1', imageUrl: PNG_DATA_URL }, ctx.deps);
    await cancelReferenceAnalysis({ requestId: 'r1' }, ctx.deps);
    release();
    await completion;
    expect(ctx.getPersisted()).toBeNull();
    expect(ctx.broadcasts).toEqual([{ action: 'REFERENCE_ANALYSIS_FINISHED', requestId: 'r1', status: 'cancelled' }]);
    expect(ctx.deps.active.size).toBe(0);
    expect(ctx.stopKeepAlive).toHaveBeenCalledTimes(1);
  });
});

describe('cancelReferenceAnalysis', () => {
  it('aborts the controller, clears the state and broadcasts cancelled', async () => {
    const ctx = makeDeps();
    const controller = new AbortController();
    ctx.deps.active.set('r1', controller);
    ctx.setPersisted({ requestId: 'r1', startTime: NOW, status: 'running' });
    const res = await cancelReferenceAnalysis({ requestId: 'r1' }, ctx.deps);
    expect(res).toEqual({ success: true });
    expect(controller.signal.aborted).toBe(true);
    expect(ctx.getPersisted()).toBeNull();
    expect(ctx.broadcasts).toEqual([{ action: 'REFERENCE_ANALYSIS_FINISHED', requestId: 'r1', status: 'cancelled' }]);
  });

  it('rejects a missing request id', async () => {
    const ctx = makeDeps();
    expect((await cancelReferenceAnalysis({}, ctx.deps)).success).toBe(false);
  });
});

describe('reconcileReferenceAnalysis / checkReferenceAnalysisStatus', () => {
  it('reports running while the service worker still holds the task', async () => {
    const ctx = makeDeps();
    ctx.deps.active.set('r1', new AbortController());
    ctx.setPersisted({ requestId: 'r1', startTime: NOW - 1000, status: 'running' });
    const res = await checkReferenceAnalysisStatus({ requestId: 'r1' }, ctx.deps);
    expect(res).toMatchObject({ isRunning: true, state: { status: 'running' } });
  });

  it('settles a running state lost to a service worker restart into failed', async () => {
    const ctx = makeDeps();
    ctx.setPersisted({ requestId: 'r1', startTime: NOW - 1000, status: 'running', promptSnapshot: 'p' });
    const res = await checkReferenceAnalysisStatus({ requestId: 'r1' }, ctx.deps);
    expect(res.isRunning).toBe(false);
    expect(res.state).toMatchObject({ requestId: 'r1', status: 'failed', promptSnapshot: 'p' });
    expect(res.state?.error).toBeTruthy();
    expect(ctx.getPersisted()).toMatchObject({ status: 'failed' });
  });

  it('settles a state older than the window into failed even if memory claims it', async () => {
    const ctx = makeDeps();
    ctx.deps.active.set('r1', new AbortController());
    ctx.setPersisted({ requestId: 'r1', startTime: NOW - REFERENCE_ANALYSIS_WINDOW_MS - 1, status: 'running' });
    const res = await checkReferenceAnalysisStatus({ requestId: 'r1' }, ctx.deps);
    expect(res.state?.status).toBe('failed');
  });

  it('returns settled states untouched', async () => {
    const ctx = makeDeps();
    const done: ActiveReferenceAnalysisState = { requestId: 'r1', startTime: NOW - 5000, status: 'done', masterPrompt: 'x' };
    ctx.setPersisted(done);
    const res = await checkReferenceAnalysisStatus({ requestId: 'r1' }, ctx.deps);
    expect(res).toEqual({ isRunning: false, state: done });
    expect(ctx.deps.writeState).not.toHaveBeenCalled();
  });

  it('reports no state when none is persisted or the id differs', async () => {
    const ctx = makeDeps();
    expect(await checkReferenceAnalysisStatus({ requestId: 'r1' }, ctx.deps)).toEqual({ isRunning: false, state: null });
    ctx.setPersisted({ requestId: 'zzz', startTime: NOW, status: 'done', masterPrompt: 'x' });
    expect(await checkReferenceAnalysisStatus({ requestId: 'r1' }, ctx.deps)).toEqual({ isRunning: false, state: null });
  });

  it('cold-start reconcile settles an orphaned running state but leaves a live one alone', async () => {
    const orphan = makeDeps();
    orphan.setPersisted({ requestId: 'r1', startTime: NOW - 1000, status: 'running' });
    await reconcileReferenceAnalysis(orphan.deps);
    expect(orphan.getPersisted()?.status).toBe('failed');

    const live = makeDeps();
    live.deps.active.set('r1', new AbortController());
    live.setPersisted({ requestId: 'r1', startTime: NOW - 1000, status: 'running' });
    await reconcileReferenceAnalysis(live.deps);
    expect(live.getPersisted()?.status).toBe('running');
  });
});

describe('loadReferenceImageBlob', () => {
  const signal = new AbortController().signal;

  it('decodes data URLs locally without any fetch (no fetch(dataUrl) in the service worker)', async () => {
    const fetchImpl = vi.fn();
    const blob = await loadReferenceImageBlob(PNG_DATA_URL, signal, fetchImpl as unknown as typeof fetch);
    expect(blob.size).toBeGreaterThan(0);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('fetches http(s) images and rejects non-image responses', async () => {
    const okFetch = vi.fn(async () => new Response(new Blob(['x'], { type: 'image/jpeg' })));
    expect((await loadReferenceImageBlob('https://a.test/x.jpg', signal, okFetch as unknown as typeof fetch)).type).toBe('image/jpeg');

    const htmlFetch = vi.fn(async () => new Response(new Blob(['<html>'], { type: 'text/html' })));
    await expect(loadReferenceImageBlob('https://a.test/x.jpg', signal, htmlFetch as unknown as typeof fetch)).rejects.toThrow();

    const notOk = vi.fn(async () => new Response('', { status: 403 }));
    await expect(loadReferenceImageBlob('https://a.test/x.jpg', signal, notOk as unknown as typeof fetch)).rejects.toThrow(/403/);
  });

  it('rejects an empty data URL payload', async () => {
    await expect(loadReferenceImageBlob('data:image/png;base64,', signal)).rejects.toThrow();
  });
});

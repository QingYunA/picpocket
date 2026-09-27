import { describe, it, expect, vi, afterEach } from 'vitest';
import { createTimeoutSignal, isTimeoutAbort, withRequestTimeout } from '../requestTimeout';

describe('createTimeoutSignal', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('aborts with a TimeoutError after the given duration', () => {
    vi.useFakeTimers();
    const { signal, dispose } = createTimeoutSignal(undefined, 1000);
    expect(signal.aborted).toBe(false);
    vi.advanceTimersByTime(1000);
    expect(signal.aborted).toBe(true);
    expect(isTimeoutAbort(signal)).toBe(true);
    dispose();
  });

  it('follows the parent signal when the user cancels', () => {
    const parent = new AbortController();
    const { signal, dispose } = createTimeoutSignal(parent.signal, 60_000);
    parent.abort();
    expect(signal.aborted).toBe(true);
    expect(isTimeoutAbort(signal)).toBe(false);
    dispose();
  });

  it('is already aborted when the parent signal is already aborted', () => {
    const parent = new AbortController();
    parent.abort();
    const { signal, dispose } = createTimeoutSignal(parent.signal, 60_000);
    expect(signal.aborted).toBe(true);
    dispose();
  });

  it('withRequestTimeout translates a timeout into the given readable error', async () => {
    vi.useFakeTimers();
    const pending = withRequestTimeout(undefined, 1000, '请求超时了', (signal) =>
      new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
      })
    );
    const assertion = expect(pending).rejects.toThrow('请求超时了');
    await vi.advanceTimersByTimeAsync(1000);
    await assertion;
  });

  it('withRequestTimeout rethrows the original error on user cancel', async () => {
    const parent = new AbortController();
    const pending = withRequestTimeout(parent.signal, 60_000, '请求超时了', (signal) =>
      new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
      })
    );
    parent.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('withRequestTimeout resolves normally when the request finishes in time', async () => {
    await expect(withRequestTimeout(undefined, 1000, 'x', async () => 42)).resolves.toBe(42);
  });

  it('does not fire the timeout after dispose', () => {
    vi.useFakeTimers();
    const { signal, dispose } = createTimeoutSignal(undefined, 1000);
    dispose();
    vi.advanceTimersByTime(5000);
    expect(signal.aborted).toBe(false);
  });
});

import { describe, it, expect } from 'vitest';
import {
  classifyReferenceAnalysis,
  REFERENCE_ANALYSIS_WINDOW_MS,
  resolveReferenceAnalysisOnMount,
  shouldApplyRecoveredPrompt,
} from '../referenceAnalysisRecovery';
import type { ActiveReferenceAnalysisState } from '@/types';

const NOW = 1_700_000_000_000;
const running = (over: Partial<ActiveReferenceAnalysisState> = {}): ActiveReferenceAnalysisState => ({
  requestId: 'r1',
  startTime: NOW - 10_000,
  status: 'running',
  ...over,
});

describe('classifyReferenceAnalysis', () => {
  it('returns none when nothing is persisted', () => {
    expect(classifyReferenceAnalysis(null, { now: NOW, isActiveInMemory: false })).toBe('none');
  });

  it('keeps a running task that the service worker still holds in memory', () => {
    expect(classifyReferenceAnalysis(running(), { now: NOW, isActiveInMemory: true })).toBe('running');
  });

  it('marks a running task the service worker no longer holds as interrupted', () => {
    expect(classifyReferenceAnalysis(running(), { now: NOW, isActiveInMemory: false })).toBe('interrupted');
  });

  it('falls back to the time window when the service worker cannot be asked', () => {
    expect(classifyReferenceAnalysis(running(), { now: NOW, isActiveInMemory: undefined })).toBe('running');
    expect(
      classifyReferenceAnalysis(running({ startTime: NOW - REFERENCE_ANALYSIS_WINDOW_MS }), {
        now: NOW,
        isActiveInMemory: undefined,
      })
    ).toBe('timed-out');
  });

  it('times out a task that outlives the window even if memory still holds it', () => {
    expect(
      classifyReferenceAnalysis(running({ startTime: NOW - REFERENCE_ANALYSIS_WINDOW_MS - 1 }), {
        now: NOW,
        isActiveInMemory: true,
      })
    ).toBe('timed-out');
  });

  it('reports settled states regardless of memory', () => {
    expect(
      classifyReferenceAnalysis(running({ status: 'done', masterPrompt: 'x' }), { now: NOW, isActiveInMemory: false })
    ).toBe('completed');
    expect(classifyReferenceAnalysis(running({ status: 'failed' }), { now: NOW, isActiveInMemory: false })).toBe('failed');
  });
});

describe('resolveReferenceAnalysisOnMount', () => {
  const stored = running();

  it('prefers the service worker state and liveness when it can be reached', () => {
    expect(resolveReferenceAnalysisOnMount(stored, { isRunning: true, state: stored }, NOW)).toEqual({
      verdict: 'running',
      state: stored,
    });
    const settled = { ...stored, status: 'failed' as const, error: 'restarted' };
    expect(resolveReferenceAnalysisOnMount(stored, { isRunning: false, state: settled }, NOW)).toEqual({
      verdict: 'failed',
      state: settled,
    });
  });

  it('finds a result that landed while the panel was closed', () => {
    const done = { ...stored, status: 'done' as const, masterPrompt: 'x' };
    expect(resolveReferenceAnalysisOnMount(stored, { isRunning: false, state: done }, NOW).verdict).toBe('completed');
  });

  it('treats a state the service worker no longer knows about as gone', () => {
    expect(resolveReferenceAnalysisOnMount(stored, { isRunning: false, state: null }, NOW).verdict).toBe('none');
  });

  it('falls back to the persisted state and the time window when the service worker is unreachable', () => {
    expect(resolveReferenceAnalysisOnMount(stored, null, NOW)).toEqual({ verdict: 'running', state: stored });
    const old = running({ startTime: NOW - REFERENCE_ANALYSIS_WINDOW_MS - 1 });
    expect(resolveReferenceAnalysisOnMount(old, null, NOW).verdict).toBe('timed-out');
  });

  it('returns none when nothing is persisted', () => {
    expect(resolveReferenceAnalysisOnMount(null, null, NOW).verdict).toBe('none');
  });
});

describe('shouldApplyRecoveredPrompt', () => {
  it('applies when the prompt box is untouched since the request started', () => {
    expect(shouldApplyRecoveredPrompt('old text', 'old text')).toBe(true);
  });

  it('applies when the prompt box was empty and still is', () => {
    expect(shouldApplyRecoveredPrompt(undefined, '')).toBe(true);
  });

  it('refuses to overwrite text the user typed after the request started', () => {
    expect(shouldApplyRecoveredPrompt('old text', 'old text edited')).toBe(false);
    expect(shouldApplyRecoveredPrompt(undefined, 'typed')).toBe(false);
  });
});

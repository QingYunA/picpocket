import { describe, it, expect } from 'vitest';
import {
  classifyGeneratingTask,
  FOREGROUND_GENERATION_WINDOW_MS,
  STALE_GENERATION_GRACE_MS,
  START_IN_FLIGHT_GRACE_MS,
} from '../generationRecovery';

const BOOT = 1_000_000_000;

describe('classifyGeneratingTask', () => {
  it('keeps tasks that are still running in the background memory', () => {
    expect(
      classifyGeneratingTask({ createdAt: BOOT - 600_000 }, { now: BOOT, bootTime: BOOT, isActiveInMemory: true })
    ).toBe('keep');
  });

  it('keeps tasks created just before boot whose start message may still be in flight', () => {
    expect(
      classifyGeneratingTask(
        { createdAt: BOOT - STALE_GENERATION_GRACE_MS + 1 },
        { now: BOOT, bootTime: BOOT, isActiveInMemory: false }
      )
    ).toBe('keep');
  });

  it('marks background tasks lost by a cold start as interrupted', () => {
    expect(
      classifyGeneratingTask({ createdAt: BOOT - 60_000 }, { now: BOOT, bootTime: BOOT, isActiveInMemory: false })
    ).toBe('interrupted');
  });

  it('keeps foreground tasks inside their execution window', () => {
    expect(
      classifyGeneratingTask(
        { createdAt: BOOT - 60_000, executor: 'foreground' },
        { now: BOOT, bootTime: BOOT, isActiveInMemory: false }
      )
    ).toBe('keep');
  });

  it('times out foreground tasks whose page died and never finished', () => {
    expect(
      classifyGeneratingTask(
        { createdAt: BOOT - FOREGROUND_GENERATION_WINDOW_MS - 1, executor: 'foreground' },
        { now: BOOT, bootTime: BOOT, isActiveInMemory: false }
      )
    ).toBe('timed-out');
  });

  it('keeps a young background task whose start message has not been sent yet', () => {
    // SW 早已启动（宽限期不适用），但任务刚创建、仍在写库，尚未发出 START
    expect(
      classifyGeneratingTask(
        { createdAt: BOOT - START_IN_FLIGHT_GRACE_MS + 1 },
        { now: BOOT, bootTime: BOOT - 3_600_000, isActiveInMemory: false }
      )
    ).toBe('keep');
  });
});

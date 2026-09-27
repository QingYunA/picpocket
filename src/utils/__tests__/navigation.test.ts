import { describe, it, expect, vi, beforeEach } from 'vitest';
import { openInfiniteCanvasPage, openOptionsPage, openWorkbenchPage } from '../navigation';

describe('openOptionsPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should reuse existing options tab and update URL if tab already exists', async () => {
    const fakeUpdate = vi.fn().mockResolvedValue({});
    const fakeWindowUpdate = vi.fn().mockResolvedValue({});
    const fakeQuery = vi.fn().mockResolvedValue([{ id: 101, windowId: 202 }]);
    const fakeCreate = vi.fn();

    (globalThis as any).chrome = {
      runtime: {
        getURL: (path: string) => `chrome-extension://test-id/${path}`,
        openOptionsPage: vi.fn(),
      },
      tabs: {
        query: fakeQuery,
        update: fakeUpdate,
        create: fakeCreate,
      },
      windows: {
        update: fakeWindowUpdate,
      },
    };

    await openOptionsPage({ route: '/mcp' });

    expect(fakeQuery).toHaveBeenCalledWith({
      url: 'chrome-extension://test-id/options.html*',
    });
    expect(fakeUpdate).toHaveBeenCalledWith(101, {
      active: true,
      url: 'chrome-extension://test-id/options.html#/mcp',
    });
    expect(fakeWindowUpdate).toHaveBeenCalledWith(202, { focused: true });
    expect(fakeCreate).not.toHaveBeenCalled();
  });

  it('should only activate existing tab without modifying url if route is omitted', async () => {
    const fakeUpdate = vi.fn().mockResolvedValue({});
    const fakeWindowUpdate = vi.fn().mockResolvedValue({});
    const fakeQuery = vi.fn().mockResolvedValue([{ id: 101, windowId: 202 }]);

    (globalThis as any).chrome = {
      runtime: {
        getURL: (path: string) => `chrome-extension://test-id/${path}`,
      },
      tabs: {
        query: fakeQuery,
        update: fakeUpdate,
      },
      windows: {
        update: fakeWindowUpdate,
      },
    };

    await openOptionsPage();

    expect(fakeUpdate).toHaveBeenCalledWith(101, {
      active: true,
    });
    expect(fakeWindowUpdate).toHaveBeenCalledWith(202, { focused: true });
  });

  it('should create new tab if no existing options tab found', async () => {
    const fakeUpdate = vi.fn();
    const fakeQuery = vi.fn().mockResolvedValue([]);
    const fakeCreate = vi.fn().mockResolvedValue({});

    (globalThis as any).chrome = {
      runtime: {
        getURL: (path: string) => `chrome-extension://test-id/${path}`,
      },
      tabs: {
        query: fakeQuery,
        update: fakeUpdate,
        create: fakeCreate,
      },
    };

    await openOptionsPage({ route: 'models/vision' });

    expect(fakeCreate).toHaveBeenCalledWith({
      active: true,
      url: 'chrome-extension://test-id/options.html#/models/vision',
    });
  });

  it('should fallback to chrome.runtime.openOptionsPage if chrome.tabs is unavailable or throws', async () => {
    const fakeOpen = vi.fn().mockResolvedValue({});

    (globalThis as any).chrome = {
      runtime: {
        getURL: (path: string) => `chrome-extension://test-id/${path}`,
        openOptionsPage: fakeOpen,
      },
      tabs: undefined,
    };

    await openOptionsPage();

    expect(fakeOpen).toHaveBeenCalled();
  });
});

describe('openWorkbenchPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should create new workbench tab with handoff draft stashed in storage', async () => {
    const fakeQuery = vi.fn().mockResolvedValue([]);
    const fakeCreate = vi.fn().mockResolvedValue({});
    const fakeStorageSet = vi.fn().mockResolvedValue({});

    (globalThis as any).chrome = {
      runtime: {
        getURL: (path: string) => `chrome-extension://test-id/${path}`,
      },
      tabs: {
        query: fakeQuery,
        update: vi.fn(),
        create: fakeCreate,
      },
      storage: {
        local: {
          set: fakeStorageSet,
        },
      },
    };

    await openWorkbenchPage({
      prompt: 'cyberpunk cat',
      model: 'grok-imagine',
      aspectRatio: '16:9',
    });

    expect(fakeStorageSet).toHaveBeenCalledWith({
      pending_workbench_handoff: expect.objectContaining({
        prompt: 'cyberpunk cat',
        model: 'grok-imagine',
        aspectRatio: '16:9',
      }),
    });
    expect(fakeCreate).toHaveBeenCalledWith({
      active: true,
      url: expect.stringMatching(/chrome-extension:\/\/test-id\/workbench\.html#handoff=/),
    });
  });

  it('should activate existing workbench tab when already open', async () => {
    const fakeQuery = vi.fn().mockResolvedValue([{ id: 88, windowId: 99 }]);
    const fakeUpdate = vi.fn().mockResolvedValue({});
    const fakeWindowUpdate = vi.fn().mockResolvedValue({});

    (globalThis as any).chrome = {
      runtime: {
        getURL: (path: string) => `chrome-extension://test-id/${path}`,
      },
      tabs: {
        query: fakeQuery,
        update: fakeUpdate,
        create: vi.fn(),
      },
      windows: {
        update: fakeWindowUpdate,
      },
      storage: {
        local: {
          set: vi.fn().mockResolvedValue({}),
        },
      },
    };

    await openWorkbenchPage();

    expect(fakeQuery).toHaveBeenCalledWith({
      url: 'chrome-extension://test-id/workbench.html*',
    });
    expect(fakeUpdate).toHaveBeenCalledWith(88, { active: true });
    expect(fakeWindowUpdate).toHaveBeenCalledWith(99, { focused: true });
  });
});

describe('openInfiniteCanvasPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('stores an asset ID and opens the upstream canvas page', async () => {
    const set = vi.fn().mockResolvedValue(undefined);
    const create = vi.fn().mockResolvedValue({});
    (globalThis as any).chrome = {
      runtime: { getURL: (path: string) => `chrome-extension://test-id/${path}` },
      storage: { local: { set } },
      tabs: {
        query: vi.fn().mockResolvedValue([]),
        update: vi.fn(),
        create,
      },
    };

    await openInfiniteCanvasPage({ assetId: 42 });

    expect(set).toHaveBeenCalledWith({
      picpocket_infinite_canvas_handoff_v1: expect.objectContaining({ assetId: 42 }),
    });
    expect(create).toHaveBeenCalledWith({
      active: true,
      url: 'chrome-extension://test-id/canvas/index.html#/canvas?mode=recent',
    });
  });

  it('focuses an open canvas project without reloading it', async () => {
    const update = vi.fn().mockResolvedValue({});
    (globalThis as any).chrome = {
      runtime: { getURL: (path: string) => `chrome-extension://test-id/${path}` },
      storage: { local: { set: vi.fn().mockResolvedValue(undefined) } },
      tabs: {
        query: vi.fn().mockResolvedValue([
          {
            id: 7,
            windowId: 9,
            url: 'chrome-extension://test-id/canvas/index.html#/canvas/project-1',
          },
        ]),
        update,
        create: vi.fn(),
      },
      windows: { update: vi.fn().mockResolvedValue({}) },
    };

    await openInfiniteCanvasPage({ assetId: 42 });

    expect(update).toHaveBeenCalledWith(7, { active: true });
  });
});

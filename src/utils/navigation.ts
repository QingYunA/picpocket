export interface OpenOptionsPageOptions {
  route?: string; // 例如: '/models/vision' 或 'models/vision?highlight=apiKey'
}

/**
 * 智能打开并激活 PicPocket Options 设置中心
 * 
 * 1. 支持单例复用：先检索是否已存在 options.html 标签页，若存在则激活并聚焦该窗口，切换对应路由，避免重复开多个 tab
 * 2. 支持深度链接（Deep Linking）：可指定 route（如 /mcp, /models/vision 等）
 * 3. 兜底优雅降级：在不支持 chrome.tabs 调用的受限上下文中回退到 chrome.runtime.openOptionsPage()
 */
export async function openOptionsPage(options?: OpenOptionsPageOptions): Promise<void> {
  let cleanRoute = options?.route?.trim() || '';
  if (cleanRoute && !cleanRoute.startsWith('/')) {
    cleanRoute = '/' + cleanRoute;
  }
  const hash = cleanRoute ? `#${cleanRoute}` : '';
  const targetUrl = typeof chrome !== 'undefined' && chrome.runtime?.getURL
    ? chrome.runtime.getURL(`options.html${hash}`)
    : `options.html${hash}`;

  try {
    if (typeof chrome !== 'undefined' && chrome.tabs?.query && chrome.tabs?.update) {
      const pattern = chrome.runtime.getURL('options.html*');
      const existingTabs = await chrome.tabs.query({ url: pattern });

      if (existingTabs.length > 0 && existingTabs[0]) {
        const tab = existingTabs[0];
        const updateProps: chrome.tabs.UpdateProperties = { active: true };
        if (cleanRoute) {
          updateProps.url = targetUrl;
        }
        if (tab.id !== undefined) {
          await chrome.tabs.update(tab.id, updateProps);
        }
        if (tab.windowId !== undefined && chrome.windows?.update) {
          try {
            await chrome.windows.update(tab.windowId, { focused: true });
          } catch {
            // ignore window focus error
          }
        }
        return;
      }

      if (chrome.tabs.create) {
        await chrome.tabs.create({ active: true, url: targetUrl });
        return;
      }
    }
  } catch (error) {
    console.warn('[PicPocket navigation] Failed to open tab via chrome.tabs, falling back:', error);
  }

  // 兜底回退
  if (typeof chrome !== 'undefined' && chrome.runtime?.openOptionsPage) {
    await chrome.runtime.openOptionsPage();
  } else if (typeof window !== 'undefined') {
    window.open(targetUrl, '_blank');
  }
}

export interface OpenInfiniteCanvasPageOptions {
  assetId?: number;
  prompt?: string;
  referenceImage?: string;
}

const INFINITE_CANVAS_HANDOFF_KEY = 'picpocket_infinite_canvas_handoff_v1';

export async function openInfiniteCanvasPage(
  options: OpenInfiniteCanvasPageOptions = {}
): Promise<void> {
  const hasHandoff = Boolean(
    typeof options.assetId === 'number' || options.prompt || options.referenceImage
  );
  if (hasHandoff && typeof chrome !== 'undefined' && chrome.storage?.local) {
    await chrome.storage.local.set({
      [INFINITE_CANVAS_HANDOFF_KEY]: {
        ...options,
        timestamp: Date.now(),
      },
    });
  }

  const targetUrl =
    typeof chrome !== 'undefined' && chrome.runtime?.getURL
      ? chrome.runtime.getURL('canvas/index.html#/canvas?mode=recent')
      : 'canvas/index.html#/canvas?mode=recent';

  if (typeof chrome !== 'undefined' && chrome.tabs?.query && chrome.tabs?.update) {
    const pattern = chrome.runtime.getURL('canvas/index.html*');
    const existingTabs = await chrome.tabs.query({ url: pattern });
    const existing = existingTabs[0];
    if (existing?.id !== undefined) {
      const isInsideProject = existing.url?.includes('#/canvas/') ?? false;
      await chrome.tabs.update(existing.id, {
        active: true,
        ...(!isInsideProject ? { url: targetUrl } : {}),
      });
      if (existing.windowId !== undefined && chrome.windows?.update) {
        await chrome.windows.update(existing.windowId, { focused: true }).catch(() => {});
      }
      return;
    }
    if (chrome.tabs.create) {
      await chrome.tabs.create({ active: true, url: targetUrl });
      return;
    }
  }

  if (typeof window !== 'undefined') window.open(targetUrl, '_blank');
}

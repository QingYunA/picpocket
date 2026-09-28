import { defineBackground } from 'wxt/utils/define-background';
import {
  db,
  createThumbnail,
  dataUrlToBlob,
  updateGenerationTask,
  saveGeneratedImageToGallery,
} from '../db';
import { getTranslation } from '../i18n';
import { AuthError } from '../services/auth';
import { completeGoogleWebSignIn, GOOGLE_SIGN_IN_RESULT, isGoogleIdTokenMessage } from '../services/googleWebSignIn';
import {
  getUserSettings,
  onLanguageChange,
  setActiveGeneration,
  clearActiveGeneration,
  getActiveGeneration,
  setActiveAnalysis,
  clearActiveAnalysis,
  getActiveAnalysis,
  getActiveFolder,
  setPendingAutoAnalyzeItemId,
} from '../utils/storage';
import {
  generateImagesWithReport,
  finalizeGenerationTaskSuccess,
  toPartialFailure,
} from '../services/imageGenerator';
import {
  analyzeImageWithAI,
  completeChatWithAI,
  getSystemPrompt,
} from '../services/ai';
import type {
  Language,
  ImageGenerationParams,
  UserSettings,
  PromptResult,
  GenerationBatchTask,
} from '../types';
import { CAPTURE_TAGS, withAnalyzedTag } from '../utils/itemHelpers';
import { classifyGeneratingTask, GENERATION_ACTIVE_WINDOW_MS } from '../utils/generationRecovery';

export default defineBackground(() => {
  // 串行化菜单重建：顶层启动、onInstalled 与设置变更可能同时触发，
  // 并发的 removeAll -> create 会交错产生 duplicate id 错误
  let contextMenuQueue: Promise<void> = Promise.resolve();
  function updateContextMenus(lang?: Language): Promise<void> {
    contextMenuQueue = contextMenuQueue
      .then(() => rebuildContextMenus(lang))
      .catch((err) => console.warn('Failed to update context menus:', err));
    return contextMenuQueue;
  }

  async function rebuildContextMenus(lang?: Language) {
    if (!chrome.contextMenus) return;
    const settings = await getUserSettings();
    const currentLang = lang || settings.language || 'zh';
    const mode = settings.contextMenuMode || 'dual-menu';

    const analyzeTitle = getTranslation(currentLang, 'contextMenu.captureAndAnalyze');
    const collectTitle = getTranslation(currentLang, 'contextMenu.collectOnly');

    await new Promise<void>((resolve) => chrome.contextMenus.removeAll(() => resolve()));
    if (mode === 'direct-analyze') {
      // Single top-level item: Chrome will NEVER collapse this into a submenu!
      chrome.contextMenus.create({
        id: 'promptsnap-collect-and-analyze',
        title: analyzeTitle,
        contexts: ['image'],
      });
    } else if (mode === 'direct-collect') {
      // Single top-level item: Direct collect without secondary expansion
      chrome.contextMenus.create({
        id: 'promptsnap-collect-only',
        title: collectTitle,
        contexts: ['image'],
      });
    } else {
      // Dual menu mode: 先保存后反推
      chrome.contextMenus.create({
        id: 'promptsnap-collect-only',
        title: collectTitle,
        contexts: ['image'],
      });
      chrome.contextMenus.create({
        id: 'promptsnap-collect-and-analyze',
        title: analyzeTitle,
        contexts: ['image'],
      });
    }
  }

  // Configure side panel behavior: open on action button click
  chrome.runtime.onInstalled.addListener(() => {
    if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
      chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((err) => {
        console.warn('Failed to setPanelBehavior:', err);
      });
    }

    updateContextMenus();
  });

  // Also initialize on startup
  updateContextMenus();

  // Listen for storage changes to update context menus immediately
  chrome.storage?.onChanged?.addListener((changes, areaName) => {
    if (areaName === 'local' && changes.promptsnap_settings) {
      updateContextMenus();
    }
  });

  onLanguageChange((newLang) => {
    updateContextMenus(newLang);
  });

  // Handle Context Menu clicks
  chrome.contextMenus?.onClicked.addListener(async (info, tab) => {
    if (!info.srcUrl) return;

    if (info.menuItemId === 'promptsnap-collect-only') {
      try {
        await captureAndSaveImage(
          info.srcUrl,
          tab?.url || '',
          tab?.title || '',
          false,
          tab?.id
        );
      } catch (err) {
        console.error('Failed to collect image:', err);
      }
    } else if (info.menuItemId === 'promptsnap-collect-and-analyze') {
      // Synchronously open sidepanel while user gesture token is still active
      if (tab?.id && chrome.sidePanel?.open) {
        chrome.sidePanel.open({ tabId: tab.id }).catch(() => {});
      }
      try {
        await captureAndSaveImage(
          info.srcUrl,
          tab?.url || '',
          tab?.title || '',
          true,
          tab?.id
        );
      } catch (err) {
        console.error('Failed to collect and analyze image:', err);
      }
    }
  });

  // 官网登录页交回的 Google ID Token：换取会话后关闭登录标签页，并通知扩展页面结果
  chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
    if (!isGoogleIdTokenMessage(message)) return false;
    completeGoogleWebSignIn(message, sender)
      .then(() => {
        sendResponse({ ok: true });
        if (sender.tab?.id !== undefined) chrome.tabs.remove(sender.tab.id).catch(() => {});
        chrome.runtime.sendMessage({ action: GOOGLE_SIGN_IN_RESULT, ok: true }).catch(() => {});
      })
      .catch((err: unknown) => {
        const code = err instanceof AuthError ? err.code : 'unknown';
        sendResponse({ ok: false, code });
        chrome.runtime.sendMessage({ action: GOOGLE_SIGN_IN_RESULT, ok: false, code }).catch(() => {});
      });
    return true;
  });

  // Handle messages from content script or sidepanel
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'UPDATE_ITEM_FOLDER') {
      const { itemId, folderId } = message;
      if (itemId) {
        db.items.update(itemId, { folderId }).then(() => {
          chrome.runtime.sendMessage({ action: 'ITEM_FOLDER_UPDATED', itemId, folderId }).catch(() => {});
          sendResponse({ success: true });
        }).catch((err) => {
          sendResponse({ success: false, error: String(err) });
        });
        return true;
      }
    }

    if (message.action === 'GET_FOLDERS') {
      db.folders.orderBy('order').toArray().then((folders) => {
        sendResponse({ success: true, folders });
      }).catch((err) => {
        sendResponse({ success: false, error: String(err) });
      });
      return true;
    }

    if (message.action === 'CAPTURE_IMAGE') {
      const autoAnalyze = Boolean(message.autoAnalyze);
      // Synchronously open sidepanel while user gesture token is still active
      if (autoAnalyze && sender.tab?.id && chrome.sidePanel?.open) {
        chrome.sidePanel.open({ tabId: sender.tab.id }).catch(() => {});
      }

      // Do not pass tabId so in-page hover badge does not duplicate with bottom-right capsule
      captureAndSaveImage(
        message.src,
        message.sourceUrl || sender.tab?.url || '',
        message.pageTitle || sender.tab?.title || '',
        autoAnalyze
      )
        .then((item) => {
          sendResponse({ success: true, item });
        })
        .catch((err) => sendResponse({ success: false, error: String(err) }));
      return true; // async sendResponse
    }

    // AI 生图后台执行：侧边栏关闭后依然在 Background Service Worker 中平稳运行
    if (message.action === 'START_IMAGE_GENERATION') {
      const { taskId, params, startTime } = message;
      // 同步登记：该消息可能正是唤醒冷启动 SW 的事件，须先于启动自愈扫描占位
      const controller = new AbortController();
      activeGenerations.set(taskId, controller);
      getUserSettings().then((settings) => {

        setActiveGeneration({
          taskId,
          startTime: startTime || Date.now(),
          prompt: params?.prompt || '',
        }).catch(() => {});

        runBackgroundGeneration(taskId, params, settings, startTime || Date.now(), controller);
        sendResponse({ success: true, taskId });
      }).catch((err) => {
        activeGenerations.delete(taskId);
        sendResponse({ success: false, error: String(err) });
      });
      return true;
    }

    if (message.action === 'START_CANVAS_TEXT_GENERATION') {
      const requestId = String(message.requestId || '');
      const controller = new AbortController();
      activeCanvasTextRequests.set(requestId, controller);
      const keepAlive = setInterval(() => {
        chrome.runtime.getPlatformInfo().catch(() => {});
      }, 10_000);
      getUserSettings()
        .then((settings) =>
          completeChatWithAI(message.messages || [], settings, message.model, controller.signal)
        )
        .then((text) => sendResponse({ success: true, text }))
        .catch((error) =>
          sendResponse({
            success: false,
            error: error instanceof Error ? error.message : String(error),
          })
        )
        .finally(() => {
          clearInterval(keepAlive);
          activeCanvasTextRequests.delete(requestId);
        });
      return true;
    }

    if (message.action === 'CANCEL_CANVAS_TEXT_GENERATION') {
      activeCanvasTextRequests.get(String(message.requestId || ''))?.abort();
      sendResponse({ success: true });
      return false;
    }

    // 中断正在进行的生图请求
    if (message.action === 'CANCEL_IMAGE_GENERATION') {
      const { taskId } = message;
      const controller = activeGenerations.get(taskId);
      if (controller) {
        controller.abort();
        activeGenerations.delete(taskId);
      }
      clearActiveGeneration(taskId).catch(() => {});
      updateGenerationTask(taskId, {
        status: 'cancelled',
        error: '用户已中断生成',
      })
        .then(() => {
          sendResponse({ success: true });
        })
        .catch((err) => {
          sendResponse({ success: false, error: String(err) });
        });
      return true;
    }

    // 检查后台当前是否有生图任务正在运行
    if (message.action === 'CHECK_GENERATION_STATUS') {
      const { taskId } = message;
      if (taskId) {
        const isRunningInMemory = activeGenerations.has(taskId);
        if (isRunningInMemory) {
          sendResponse({ isRunning: true, taskId });
          return false;
        }

        // 容错：Service Worker 休眠重启后内存 Map 可能清空，以数据库任务为准当场判定并收敛悬挂
        checkGenerationLiveness(taskId)
          .then((isRunning) => sendResponse({ isRunning, taskId }))
          .catch(() => {
            sendResponse({ isRunning: false, taskId });
          });
        return true;
      } else {
        const activeIds = Array.from(activeGenerations.keys());
        sendResponse({ isRunning: activeIds.length > 0, taskIds: activeIds });
        return false;
      }
    }

    // 视觉反推后台执行：侧边栏关闭后依然平稳执行，杜绝任务中断与卡死
    if (message.action === 'START_IMAGE_ANALYSIS') {
      const { itemId, targetModel, customPrompt, startTime } = message;
      if (typeof itemId !== 'number') {
        sendResponse({ success: false, error: 'Invalid itemId' });
        return false;
      }

      if (activeAnalyses.has(itemId)) {
        sendResponse({ success: true, itemId, alreadyRunning: true });
        return false;
      }

      getUserSettings().then(async (settings) => {
        const controller = new AbortController();
        activeAnalyses.set(itemId, controller);

        await setActiveAnalysis({
          itemId,
          startTime: startTime || Date.now(),
          model: targetModel || settings.model,
        }).catch(() => {});

        await db.items.update(itemId, { status: 'analyzing' }).catch(() => {});

        runBackgroundAnalysis(itemId, settings, targetModel, customPrompt, startTime || Date.now(), controller);
        sendResponse({ success: true, itemId });
      }).catch((err) => {
        sendResponse({ success: false, error: String(err) });
      });
      return true;
    }

    // 中断正在进行的视觉反推任务
    if (message.action === 'CANCEL_IMAGE_ANALYSIS') {
      const { itemId } = message;
      if (typeof itemId === 'number') {
        const controller = activeAnalyses.get(itemId);
        if (controller) {
          controller.abort();
          activeAnalyses.delete(itemId);
        }
        clearActiveAnalysis(itemId).catch(() => {});
        db.items.update(itemId, { status: 'pending' })
          .then(() => {
            chrome.runtime.sendMessage({ action: 'ANALYSIS_CANCELLED', itemId }).catch(() => {});
            sendResponse({ success: true });
          })
          .catch((err) => {
            sendResponse({ success: false, error: String(err) });
          });
        return true;
      }
    }

    // 检查后台当前是否有反推任务正在运行
    if (message.action === 'CHECK_ANALYSIS_STATUS') {
      const { itemId } = message;
      if (typeof itemId === 'number') {
        const isRunningInMemory = activeAnalyses.has(itemId);
        if (isRunningInMemory) {
          sendResponse({ isRunning: true, itemId });
          return false;
        }

        // 容错：Service Worker 休眠重启后向持久化 Storage 核对有效窗口 (3分钟)
        getActiveAnalysis()
          .then((active) => {
            const isStillActive = Boolean(
              active &&
              active.itemId === itemId &&
              Date.now() - (active.startTime || Date.now()) < 180000
            );
            sendResponse({ isRunning: isStillActive, itemId });
          })
          .catch(() => {
            sendResponse({ isRunning: false, itemId });
          });
        return true;
      } else {
        const activeItemIds = Array.from(activeAnalyses.keys());
        sendResponse({ isRunning: activeItemIds.length > 0, itemIds: activeItemIds });
        return false;
      }
    }
  });

  // 启动时自动纠正历史上因扩展关闭而卡死在 analyzing 的悬挂任务
  reconcileStaleAnalyzingItems().catch(() => {});
  reconcileStaleGeneratingTasks().catch(() => {});
});

// 内存中维护正在运行中的反推任务 Controller
const activeAnalyses = new Map<number, AbortController>();
const BACKGROUND_BOOT_TIME = Date.now();
const STALE_GENERATION_ERROR = '后台进程已重启，生成任务中断，请重新生成';
const FOREGROUND_TIMEOUT_ERROR = '生成任务超时未完成（页面可能已关闭），请重新生成';

/**
 * 启动时自愈：核对数据库中所有 analyzing 状态的 item，清理悬挂任务
 */
async function reconcileStaleAnalyzingItems() {
  try {
    const analyzingItems = await db.items.where('status').equals('analyzing').toArray();
    if (analyzingItems.length === 0) return;

    const active = await getActiveAnalysis();
    for (const it of analyzingItems) {
      const isRunning = Boolean(
        active &&
        active.itemId === it.id &&
        Date.now() - (active.startTime || 0) < 180000
      );
      if (!isRunning && it.id) {
        console.warn(`[PicPocket Background] 自愈重置悬挂反推任务: item #${it.id}`);
        await db.items.update(it.id, { status: 'pending' });
      }
    }
  } catch (err) {
    console.error('Failed to reconcile stale analyzing items in background:', err);
  }
}

/**
 * 启动时自愈：Service Worker 冷启动意味着内存中的生图请求已全部丢失，
 * 仍处于 generating 的任务不可能再完成，立即标记失败，避免前台空转到 5 分钟兜底窗口
 */
async function reconcileStaleGeneratingTasks() {
  try {
    const generatingTasks = await db.generationTasks.where('status').equals('generating').toArray();
    if (generatingTasks.length === 0) return;

    for (const task of generatingTasks) {
      await settleIfStale(task);
    }
  } catch (err) {
    console.error('Failed to reconcile stale generating tasks in background:', err);
  }
}

/**
 * 判定单个 generating 任务是否已悬挂；若是则纠正为 failed 并广播结束。
 * 启动自愈与前台存活探针共用。返回 true 表示任务已被收敛为失败。
 */
async function settleIfStale(task: GenerationBatchTask): Promise<boolean> {
  const verdict = classifyGeneratingTask(task, {
    now: Date.now(),
    bootTime: BACKGROUND_BOOT_TIME,
    isActiveInMemory: activeGenerations.has(task.id),
  });
  if (verdict === 'keep') return false;
  const error = verdict === 'timed-out' ? FOREGROUND_TIMEOUT_ERROR : STALE_GENERATION_ERROR;
  console.warn(`[PicPocket Background] 自愈重置悬挂生图任务: ${task.id} (${verdict})`);
  await updateGenerationTask(task.id, { status: 'failed', error });
  await clearActiveGeneration(task.id);
  chrome.runtime.sendMessage({
    action: 'IMAGE_GENERATION_FINISHED',
    taskId: task.id,
    status: 'failed',
    error,
  }).catch(() => {});
  return true;
}

/**
 * 回答前台「任务是否仍在运行」：内存中存在即运行；否则以数据库任务为准当场判定，
 * 已丢失的任务立即收敛，避免 SW 被探针唤醒后仍按 Storage 窗口回报「运行中」。
 */
async function checkGenerationLiveness(taskId: string): Promise<boolean> {
  if (activeGenerations.has(taskId)) return true;
  const task = await db.generationTasks.get(taskId);
  if (task) {
    if (task.status !== 'generating') return false;
    return !(await settleIfStale(task));
  }
  // 任务记录缺失（入库失败等）时回退到 Storage 有效窗口核对
  const active = await getActiveGeneration();
  return Boolean(
    active && active.taskId === taskId && Date.now() - (active.startTime || Date.now()) < GENERATION_ACTIVE_WINDOW_MS
  );
}

async function runBackgroundAnalysis(
  itemId: number,
  settings: UserSettings,
  targetModel: string | undefined,
  customPrompt: string | undefined,
  _startTime: number,
  controller: AbortController
) {
  const keepAliveInterval = setInterval(() => {
    if (typeof chrome !== 'undefined' && chrome.runtime?.getPlatformInfo) {
      chrome.runtime.getPlatformInfo().catch(() => {});
    }
  }, 10000);

  try {
    const item = await db.items.get(itemId);
    if (!item || !item.originalBlob) {
      throw new Error('未找到对应图片或图片数据已损坏');
    }

    const modelToUse = targetModel || settings.model;
    const activePrompt = customPrompt?.trim() || getSystemPrompt(settings.language || 'zh');

    const result = await analyzeImageWithAI(
      item.originalBlob,
      settings,
      modelToUse,
      activePrompt,
      controller.signal
    );

    if (controller.signal.aborted) {
      return;
    }

    const promptRecord: PromptResult = {
      itemId,
      model: result.model,
      subject: result.subject,
      style: result.style,
      lighting: result.lighting,
      composition: result.composition,
      masterPrompt: result.masterPrompt,
      textSlots: result.textSlots,
      templatePrompt: result.templatePrompt,
      latencyMs: result.latencyMs,
      createdAt: Date.now(),
    };

    const existing = await db.prompts.where('itemId').equals(itemId).first();
    if (existing?.id) {
      await db.prompts.put({ ...promptRecord, id: existing.id });
      promptRecord.id = existing.id;
    } else {
      const promptId = await db.prompts.add(promptRecord);
      promptRecord.id = promptId as number;
    }

    await db.items.update(itemId, { status: 'analyzed', tags: withAnalyzedTag(item.tags) });

    chrome.runtime.sendMessage({
      action: 'ANALYSIS_COMPLETED',
      itemId,
      prompt: promptRecord,
    }).catch(() => {});
  } catch (err: any) {
    if (controller.signal.aborted) {
      return;
    }
    console.error(`[Background Analysis Error for item #${itemId}]:`, err);
    await db.items.update(itemId, { status: 'failed' }).catch(() => {});
    chrome.runtime.sendMessage({
      action: 'ANALYSIS_FAILED',
      itemId,
      error: err?.message || '反推解析失败',
    }).catch(() => {});
  } finally {
    clearInterval(keepAliveInterval);
    activeAnalyses.delete(itemId);
    await clearActiveAnalysis(itemId).catch(() => {});
  }
}

// 内存中维护正在运行中的生成任务 Controller，支持秒级物理中断
const activeGenerations = new Map<string, AbortController>();
const activeCanvasTextRequests = new Map<string, AbortController>();

async function runBackgroundGeneration(
  taskId: string,
  params: ImageGenerationParams,
  settings: UserSettings,
  startTime: number,
  controller: AbortController
) {
  // MV3 Service Worker 异步保活心跳：每 10 秒调用一次轻量级 API 维持 SW 活跃状态
  const keepAliveInterval = setInterval(() => {
    if (typeof chrome !== 'undefined' && chrome.runtime?.getPlatformInfo) {
      chrome.runtime.getPlatformInfo().catch(() => {});
    }
  }, 10000);

  try {
    const report = await generateImagesWithReport(params, settings, controller.signal);
    // 请求完成、画廊写入与用户点击取消可能交错：已取消的任务不得被覆盖回 success
    const committed = await finalizeGenerationTaskSuccess({
      taskId,
      prompt: params.prompt,
      images: report.images,
      latencyMs: Date.now() - startTime,
      autoSaveToGallery: settings.autoSaveGeneratedToGallery,
      partialFailure: toPartialFailure(report),
      signal: controller.signal,
    });
    if (!committed) {
      throw Object.assign(new Error('aborted'), { name: 'AbortError' });
    }

    chrome.runtime.sendMessage({
      action: 'IMAGE_GENERATION_FINISHED',
      taskId,
      status: 'success',
    }).catch(() => {});
  } catch (err: any) {
    const isAborted = controller.signal.aborted || err?.name === 'AbortError';
    if (isAborted) {
      await updateGenerationTask(taskId, {
        status: 'cancelled',
        error: '用户已中断生成',
      });
      chrome.runtime.sendMessage({
        action: 'IMAGE_GENERATION_FINISHED',
        taskId,
        status: 'cancelled',
      }).catch(() => {});
    } else {
      const errMsg = err?.message || String(err);
      await updateGenerationTask(taskId, {
        status: 'failed',
        error: errMsg,
      });
      chrome.runtime.sendMessage({
        action: 'IMAGE_GENERATION_FINISHED',
        taskId,
        status: 'failed',
        error: errMsg,
      }).catch(() => {});
    }
  } finally {
    clearInterval(keepAliveInterval);
    activeGenerations.delete(taskId);
    clearActiveGeneration(taskId).catch(() => {});
  }
}

async function captureAndSaveImage(
  src: string,
  sourceUrl: string,
  pageTitle: string,
  autoAnalyze = false,
  tabId?: number
) {
  let blob: Blob;
  if (src.startsWith('data:')) {
    blob = dataUrlToBlob(src);
  } else {
    try {
      const res = await fetch(src);
      if (!res.ok) throw new Error(`Fetch failed: ${res.statusText}`);
      blob = await res.blob();
    } catch (err) {
      console.error('Failed to fetch image in background:', err);
      throw err;
    }
  }
  const { thumbnailBlob, width, height, aspectRatio } = await createThumbnail(blob);

  // 1. 读取当前活跃文件夹
  const activeFolder = await getActiveFolder();
  let targetFolderId: number | undefined = undefined;
  let targetFolderName = '';

  if (activeFolder && typeof activeFolder.id === 'number') {
    // 校验该文件夹是否真实存在于数据库中
    const folderExists = await db.folders.get(activeFolder.id);
    if (folderExists) {
      targetFolderId = activeFolder.id;
      targetFolderName = folderExists.name;
    }
  }

  const id = (await db.items.add({
    originalBlob: blob,
    thumbnailBlob,
    sourceUrl,
    pageTitle,
    width,
    height,
    aspectRatio,
    createdAt: Date.now(),
    // 「已反推」标签在反推真正成功后才追加，避免失败/未启动时标签失真
    tags: [CAPTURE_TAGS.WEB_CAPTURE],
    status: autoAnalyze ? 'analyzing' : 'pending',
    folderId: targetFolderId,
  })) as number;

  // 2. 如果开启了 autoAnalyze，Background 立即无缝启动反推长任务，无需等待 Sidepanel 挂载！
  if (autoAnalyze) {
    // 记录 pending item id，让冷启动的侧边栏挂载时能立刻对齐并打开该 item 的详情抽屉
    await setPendingAutoAnalyzeItemId(id).catch(() => {});

    // 同步设置 active_analysis
    const settings = await getUserSettings();
    const startTime = Date.now();
    const controller = new AbortController();
    activeAnalyses.set(id, controller);

    await setActiveAnalysis({
      itemId: id,
      startTime,
      model: settings.model,
    }).catch(() => {});

    // 启动后台反推（网络长连接与保活心跳）
    runBackgroundAnalysis(id, settings, settings.model, undefined, startTime, controller);
  }

  // 3. 通知前台 Sidepanel（如果已打开）
  chrome.runtime.sendMessage({
    action: 'ITEM_ADDED',
    id,
    autoAnalyze,
    folderId: targetFolderId,
    folderName: targetFolderName,
  }).catch(() => {});

  // 4. 通知当前网页 Tab 弹出胶囊通知，告知用户保存到了什么文件夹，以及是否正在反推
  if (tabId) {
    db.folders.orderBy('order').toArray().then((folders) => {
      chrome.tabs.sendMessage(tabId, {
        action: 'SHOW_QUICK_FILING_CAPSULE',
        itemId: id,
        folders,
        pageTitle,
        currentFolderId: targetFolderId ?? null,
        currentFolderName: targetFolderName,
        isAnalyzing: autoAnalyze,
      }).catch(() => {});
    });
  }

  return { id, width, height, folderId: targetFolderId, folderName: targetFolderName };
}

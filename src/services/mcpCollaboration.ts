import { db, saveGeneratedImageToGallery } from '../db';
import type {
  UserSettings,
  McpSettings,
  CollaborationLogItem,
  ImageAspectRatio,
  FolderItem,
} from '../types';
import { generateImagesWithAI, resolveImageApiConfig, convertImageUrlToDataUrl } from './imageGenerator';
import { blobToDataUrl } from '../utils/imageCompression';
import { getUserSettings, DEFAULT_MCP_SETTINGS } from '../utils/storage';
import { ASSET_SOURCE_TAGS, ASSET_SOURCE_URLS } from '../utils/itemHelpers';

export interface McpToolResponse {
  isError: boolean;
  content: Array<{ type: 'text'; text: string }>;
}

export interface McpPermissions {
  read: boolean;
  write: boolean;
  generate: boolean;
}

const CANVAS_MCP_SNAPSHOT_KEY = 'picpocket_canvas_mcp_snapshot_v1';
const CANVAS_MCP_COMMAND_KEY = 'picpocket_canvas_mcp_command_v1';
const CANVAS_MCP_ACK_KEY = 'picpocket_canvas_mcp_ack_v1';
const CANVAS_MCP_PRESENCE_KEY = 'picpocket_canvas_mcp_presence_v1';
let canvasCommandQueue: Promise<void> = Promise.resolve();

async function executeGetCanvasState(permissions: McpPermissions): Promise<McpToolResponse> {
  if (!permissions.read) {
    return {
      isError: true,
      content: [{ type: 'text', text: '【权限拦截 / Permission Denied】: 请启用 PicPocket MCP Read 权限。' }],
    };
  }
  const data = await chrome.storage.local.get(CANVAS_MCP_SNAPSHOT_KEY);
  const snapshot = data[CANVAS_MCP_SNAPSHOT_KEY];
  return {
    isError: !snapshot,
    content: [{
      type: 'text',
      text: snapshot
        ? JSON.stringify(snapshot)
        : '【画布未打开】: 请先打开 PicPocket 画布后重试。',
    }],
  };
}

async function executeCreateCanvasNodeUnlocked(
  args: { type?: 'image' | 'text'; prompt?: string; imageUrl?: string; text?: string; title?: string },
  permissions: McpPermissions
): Promise<McpToolResponse> {
  if (!permissions.write) {
    return {
      isError: true,
      content: [{ type: 'text', text: '【权限拦截 / Permission Denied】: 请启用 PicPocket MCP Write 权限。' }],
    };
  }
  const type = args.type || 'image';
  if (type === 'text' && !(args.text || '').trim()) {
    return { isError: true, content: [{ type: 'text', text: 'text is required for a text node' }] };
  }
  if (type === 'image' && !(args.prompt || args.imageUrl)) {
    return { isError: true, content: [{ type: 'text', text: 'prompt or imageUrl is required for an image node' }] };
  }
  const presenceData = await chrome.storage.local.get(CANVAS_MCP_PRESENCE_KEY);
  const presence = presenceData[CANVAS_MCP_PRESENCE_KEY] as { updatedAt?: number } | undefined;
  if (!presence?.updatedAt || Date.now() - presence.updatedAt > 5_000) {
    return {
      isError: true,
      content: [{ type: 'text', text: '【画布未打开】: 请先打开 PicPocket 画布后重试。' }],
    };
  }
  const commandId = `canvas-command-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  await chrome.storage.local.set({
    [CANVAS_MCP_COMMAND_KEY]: { ...args, type, commandId, createdAt: Date.now() },
  });
  for (let attempt = 0; attempt < 50; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    const ackData = await chrome.storage.local.get(CANVAS_MCP_ACK_KEY);
    const ack = ackData[CANVAS_MCP_ACK_KEY] as { commandId?: string; error?: string } | undefined;
    if (ack?.commandId === commandId) {
      await chrome.storage.local.remove(CANVAS_MCP_ACK_KEY);
      return {
        isError: Boolean(ack.error),
        content: [{ type: 'text', text: ack.error || JSON.stringify({ created: true, commandId }) }],
      };
    }
  }
  const commandData = await chrome.storage.local.get(CANVAS_MCP_COMMAND_KEY);
  const pendingCommand = commandData[CANVAS_MCP_COMMAND_KEY] as { commandId?: string } | undefined;
  if (pendingCommand?.commandId === commandId) {
    await chrome.storage.local.remove(CANVAS_MCP_COMMAND_KEY);
  }
  return {
    isError: true,
    content: [{ type: 'text', text: '【画布命令超时】: 画布没有确认该操作，命令已取消。' }],
  };
}

function executeCreateCanvasNode(
  args: { type?: 'image' | 'text'; prompt?: string; imageUrl?: string; text?: string; title?: string },
  permissions: McpPermissions
): Promise<McpToolResponse> {
  const result = canvasCommandQueue.then(
    () => executeCreateCanvasNodeUnlocked(args, permissions),
    () => executeCreateCanvasNodeUnlocked(args, permissions)
  );
  canvasCommandQueue = result.then(() => undefined, () => undefined);
  return result;
}

export async function resolveTargetFolderId(
  folderId?: number,
  folderName?: string
): Promise<number | null> {
  if (folderId !== undefined && folderId !== null) {
    return folderId;
  }
  if (folderName && folderName.trim()) {
    const trimmed = folderName.trim();
    const existing = await db.folders.where('name').equals(trimmed).first();
    if (existing) {
      return existing.id!;
    }
    const maxOrder = await db.folders.orderBy('order').last();
    return await db.folders.add({
      name: trimmed,
      parentId: null,
      order: (maxOrder?.order ?? 0) + 1,
      createdAt: Date.now(),
    });
  }
  return null;
}

// ----------------------------------------------------------------------
// 1. Core Tool Handlers with Actionable Feedback & Permission Guard
// ----------------------------------------------------------------------


export async function executeSearchPromptsAndAssets(
  args: { query?: string; tags?: string[]; type?: 'all' | 'prompts' | 'inspirations'; limit?: number },
  permissions: McpPermissions
): Promise<McpToolResponse> {
  if (!permissions.read) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: '【权限拦截 / Permission Denied】: 当前 PicPocket 插件已关闭「允许读取资产与提示词 (Read)」权限。请提醒用户在 Chrome 侧边栏右上角打开「AI 协同」抽屉，勾选启用此权限后再试。',
        },
      ],
    };
  }

  const query = (args.query || '').trim().toLowerCase();
  const filterTags = (args.tags || []).map((t) => t.trim().toLowerCase()).filter(Boolean);
  const limit = Math.max(1, Math.min(50, args.limit || 10));
  const searchType = args.type || 'all';

  const results: Array<Record<string, any>> = [];

  // Search Prompts in promptItems
  if (searchType === 'all' || searchType === 'prompts') {
    const promptItems = await db.promptItems.toArray();
    for (const p of promptItems) {
      const matchQuery =
        !query ||
        p.title.toLowerCase().includes(query) ||
        p.prompt.toLowerCase().includes(query) ||
        (p.tags && p.tags.some((t) => t.toLowerCase().includes(query)));

      const matchTags =
        filterTags.length === 0 ||
        (p.tags && filterTags.some((ft) => p.tags.some((t) => t.toLowerCase().includes(ft))));

      if (matchQuery && matchTags) {
        results.push({
          kind: 'PromptItem',
          id: p.id,
          title: p.title,
          prompt: p.prompt,
          tags: p.tags,
          category: p.category,
        });
      }
      if (results.length >= limit) break;
    }
  }

  // Search Inspiration Items in items
  if (results.length < limit && (searchType === 'all' || searchType === 'inspirations')) {
    const items = await db.items.toArray();
    for (const it of items) {
      const matchQuery =
        !query ||
        (it.pageTitle && it.pageTitle.toLowerCase().includes(query)) ||
        (it.tags && it.tags.some((t) => t.toLowerCase().includes(query)));

      const matchTags =
        filterTags.length === 0 ||
        (it.tags && filterTags.some((ft) => it.tags.some((t) => t.toLowerCase().includes(ft))));

      if (matchQuery && matchTags) {
        const promptRec = await db.prompts.where('itemId').equals(it.id!).first();
        results.push({
          kind: 'InspirationItem',
          id: it.id,
          title: it.pageTitle || '无标题素材',
          tags: it.tags,
          dimensions: `${it.width || 0}×${it.height || 0}`,
          masterPrompt: promptRec?.masterPrompt || '',
          blocks: {
            subject: promptRec?.subject,
            style: promptRec?.style,
            lighting: promptRec?.lighting,
            composition: promptRec?.composition,
          },
        });
      }
      if (results.length >= limit) break;
    }
  }


  return {
    isError: false,
    content: [
      {
        type: 'text',
        text: `【检索成功】: 找到 ${results.length} 条匹配素材/提示词：\n\n${JSON.stringify(results, null, 2)}`,
      },
    ],
  };
}

export async function executeManageFolders(
  args: { action?: 'list' | 'create'; name?: string; parentId?: number },
  permissions: McpPermissions
): Promise<McpToolResponse> {
  const action = args.action || 'list';

  if (action === 'list') {
    if (!permissions.read) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: '【权限拦截 / Permission Denied】: 查看文件夹列表需要开启「读取资产 (Read)」权限。请在插件侧边栏协同抽屉中开启。',
          },
        ],
      };
    }
    const folders = await db.folders.orderBy('order').toArray();
    return {
      isError: false,
      content: [
        {
          type: 'text',
          text: `【文件夹列表】: 共 ${folders.length} 个文件夹：\n\n${JSON.stringify(
            folders.map((f) => ({ id: f.id, name: f.name, parentId: f.parentId })),
            null,
            2
          )}`,
        },
      ],
    };
  }

  if (action === 'create') {
    if (!permissions.write) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: '【权限拦截 / Permission Denied】: 当前 PicPocket 插件已关闭「允许创建文件夹与写入 (Write)」权限。请提醒用户在侧边栏右上角打开「AI 协同」抽屉，勾选启用此权限。',
          },
        ],
      };
    }
    const name = (args.name || '').trim();
    if (!name) {
      return {
        isError: true,
        content: [{ type: 'text', text: '【参数错误】: 创建文件夹必须提供 name (文件夹名称)。' }],
      };
    }

    const maxOrderFolder = await db.folders.orderBy('order').last();
    const nextOrder = (maxOrderFolder?.order ?? 0) + 1;

    const folderId = await db.folders.add({
      name,
      parentId: args.parentId ?? null,
      order: nextOrder,
      createdAt: Date.now(),
    });

    return {
      isError: false,
      content: [
        {
          type: 'text',
          text: `【创建文件夹成功】: 文件夹已创建，名称:「${name}」，Folder ID: ${folderId}${
            args.parentId ? `，父文件夹 ID: ${args.parentId}` : ''
          }`,
        },
      ],
    };
  }

  return {
    isError: true,
    content: [{ type: 'text', text: `【参数错误】: 未知操作 action="${action}"，仅支持 "list" 或 "create"。` }],
  };
}

function resolveDimensions(aspectRatio?: ImageAspectRatio): { width: number; height: number } {
  switch (aspectRatio) {
    case '16:9':
      return { width: 1280, height: 720 };
    case '9:16':
      return { width: 720, height: 1280 };
    case '4:3':
      return { width: 1024, height: 768 };
    case '3:4':
      return { width: 768, height: 1024 };
    case '21:9':
      return { width: 1344, height: 576 };
    case '2:3':
      return { width: 768, height: 1152 };
    case '1:1':
    default:
      return { width: 1024, height: 1024 };
  }
}

export async function executeSaveAsset(
  args: {
    imageUrl?: string;
    dataUrl?: string;
    prompt?: string;
    title?: string;
    aspectRatio?: ImageAspectRatio;
    folderId?: number;
    folderName?: string;
    tags?: string[];
  },
  permissions: McpPermissions
): Promise<McpToolResponse> {
  if (!permissions.write) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: '【权限拦截 / Permission Denied】: 当前 PicPocket 插件已关闭「允许写入资产与提示词 (Write)」权限。请提醒用户在侧边栏右上角打开「AI 协同」抽屉开启权限。',
        },
      ],
    };
  }

  const rawUrl = args.dataUrl || args.imageUrl;
  if (!rawUrl) {
    return {
      isError: true,
      content: [{ type: 'text', text: '【参数错误】: 保存资产必须提供 imageUrl 或 dataUrl。' }],
    };
  }

  const finalDataUrl = await convertImageUrlToDataUrl(rawUrl);
  const promptText = (args.prompt || '').trim();
  const title = (args.title || '').trim() || (promptText.length > 30 ? `${promptText.slice(0, 30)}...` : 'AI 协同资产');

  const targetFolderId = await resolveTargetFolderId(args.folderId, args.folderName);
  const targetRatio = args.aspectRatio || '1:1';
  const dimensions = resolveDimensions(targetRatio);

  const generatedImage = {
    id: `mcp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    dataUrl: finalDataUrl,
    prompt: promptText,
    aspectRatio: targetRatio,
    createdAt: Date.now(),
    model: 'external-agent',
    width: dimensions.width,
    height: dimensions.height,
  };

  const itemId = await saveGeneratedImageToGallery(generatedImage, title);
  if (targetFolderId !== null) {
    await db.items.update(itemId, { folderId: targetFolderId });
  }
  const current = await db.items.get(itemId);
  const combinedTags = Array.from(
    new Set([...(current?.tags || []), ...(args.tags || []), targetRatio, ASSET_SOURCE_TAGS.AGENT_COLLAB])
  );
  await db.items.update(itemId, { tags: combinedTags, sourceUrl: ASSET_SOURCE_URLS.MCP_COLLABORATION });

  return {
    isError: false,
    content: [
      {
        type: 'text',
        text: `【保存成功】: 素材已保存至本地图库！Item ID: ${itemId}，标题:「${title}」${
          targetFolderId ? `，已归入文件夹 ID: ${targetFolderId}` : ''
        }`,
      },
    ],
  };
}

export async function executeSavePrompt(
  args: {
    prompt: string;
    title?: string;
    category?: string;
    tags?: string[];
    description?: string;
    folderId?: number;
    folderName?: string;
  },
  permissions: McpPermissions
): Promise<McpToolResponse> {
  if (!permissions.write) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: '【权限拦截 / Permission Denied】: 当前 PicPocket 插件已关闭「允许写入资产与提示词 (Write)」权限。请提醒用户在侧边栏右上角打开「AI 协同」抽屉开启权限。',
        },
      ],
    };
  }

  const promptText = (args.prompt || '').trim();
  if (!promptText) {
    return {
      isError: true,
      content: [{ type: 'text', text: '【参数错误】: 保存提示词必须提供非空的 prompt 文本。' }],
    };
  }

  const title =
    (args.title || '').trim() ||
    (promptText.length > 25 ? `${promptText.slice(0, 25)}...` : 'Agent 提示词');
  const targetFolderId = await resolveTargetFolderId(args.folderId, args.folderName);
  const now = new Date().toISOString();
  const id = `custom-mcp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  await db.promptItems.add({
    id,
    sourceId: 'local-custom',
    category: args.category || ASSET_SOURCE_TAGS.AGENT_SETTLED,
    title,
    prompt: promptText,
    description: args.description || '由本地 AI Agent 保存入库',
    tags: args.tags || [ASSET_SOURCE_TAGS.AGENT_SETTLED],
    isCustom: true,
    createdAt: now,
    updatedAt: now,
  });

  return {
    isError: false,
    content: [
      {
        type: 'text',
        text: `【提示词保存成功】: 提示词已存入本地提示词库！ID: ${id}，标题:「${title}」，分类:「${
          args.category || 'Agent'
        }」${targetFolderId ? `，关联文件夹 ID: ${targetFolderId}` : ''}`,
      },
    ],
  };
}

export async function executeUpdateTags(
  args: {
    itemId?: number;
    promptId?: string;
    tags?: string[];
    mode?: 'append' | 'replace';
  },
  permissions: McpPermissions
): Promise<McpToolResponse> {
  if (!permissions.write) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: '【权限拦截 / Permission Denied】: 当前 PicPocket 插件已关闭「允许写入资产与提示词 (Write)」权限。请提醒用户在侧边栏右上角打开「AI 协同」抽屉开启权限。',
        },
      ],
    };
  }

  const tags = Array.isArray(args.tags)
    ? args.tags.map((t) => String(t).trim()).filter(Boolean)
    : [];
  if (tags.length === 0) {
    return {
      isError: true,
      content: [{ type: 'text', text: '【参数错误】: 请提供非空的标签列表 tags。' }],
    };
  }

  const mode = args.mode || 'append';

  if (args.itemId) {
    const item = await db.items.get(Number(args.itemId));
    if (!item) {
      return {
        isError: true,
        content: [{ type: 'text', text: `【未找到资产】: ID 为 ${args.itemId} 的画廊资产不存在。` }],
      };
    }
    const currentTags = item.tags || [];
    const newTags = mode === 'replace' ? tags : Array.from(new Set([...currentTags, ...tags]));
    await db.items.update(item.id!, { tags: newTags });
    return {
      isError: false,
      content: [
        {
          type: 'text',
          text: `【更新标签成功】: 资产 ID ${item.id} 标签已更新为 [${newTags.join(', ')}]。`,
        },
      ],
    };
  }

  if (args.promptId) {
    const promptItem = await db.promptItems.get(String(args.promptId));
    if (!promptItem) {
      return {
        isError: true,
        content: [{ type: 'text', text: `【未找到提示词】: ID 为 "${args.promptId}" 的提示词不存在。` }],
      };
    }
    const currentTags = promptItem.tags || [];
    const newTags = mode === 'replace' ? tags : Array.from(new Set([...currentTags, ...tags]));
    await db.promptItems.update(promptItem.id, { tags: newTags, updatedAt: new Date().toISOString() });
    return {
      isError: false,
      content: [
        {
          type: 'text',
          text: `【更新标签成功】: 提示词 ID "${promptItem.id}" 标签已更新为 [${newTags.join(', ')}]。`,
        },
      ],
    };
  }

  return {
    isError: true,
    content: [{ type: 'text', text: '【参数错误】: 必须指定 itemId (数字) 或 promptId (字符串) 之一。' }],
  };
}

export async function executeGenerateAndSaveAsset(
  args: {
    prompt: string;
    aspectRatio?: ImageAspectRatio;
    folderId?: number;
    folderName?: string;
    negativePrompt?: string;
    model?: string;
    referenceAssetId?: number | string;
    referenceImageUrl?: string;
    referenceImageDataUrl?: string;
  },
  permissions: McpPermissions,
  settings: UserSettings
): Promise<McpToolResponse> {
  const startTime = Date.now();

  if (!permissions.generate) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: '【权限拦截 / Permission Denied】: 当前 PicPocket 插件未开启「允许 Agent 调用生图 (Generate)」权限（默认防误刷算力）。请提醒用户在 Chrome 侧边栏右上角打开「AI 协同」抽屉，勾选启用此权限后重试。',
        },
      ],
    };
  }

  const prompt = (args.prompt || '').trim();
  if (!prompt) {
    return {
      isError: true,
      content: [{ type: 'text', text: '【参数错误】: 生图提示词 prompt 不能为空。' }],
    };
  }

  const aspectRatio: ImageAspectRatio = args.aspectRatio || '1:1';

  // Check API config
  const apiConfig = resolveImageApiConfig(settings);
  if (!apiConfig.apiKey) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: '【配置缺失 / Config Missing】: 未配置有效生图 API Key。请提示用户在 PicPocket 侧边栏「设置」中配置生图 API Key 或激活会员。',
        },
      ],
    };
  }

  // Resolve reference image (img2img) if specified
  let resolvedReferenceDataUrl: string | undefined;
  let referenceNote = '';

  if (args.referenceAssetId !== undefined && args.referenceAssetId !== null && String(args.referenceAssetId).trim() !== '') {
    const rawAssetId = String(args.referenceAssetId).trim();
    const assetIdNum = Number(rawAssetId);
    if (isNaN(assetIdNum) || !Number.isInteger(assetIdNum) || assetIdNum <= 0) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: `【参数错误】: referenceAssetId 必须为有效数字 ID，当前为: "${args.referenceAssetId}"。`,
          },
        ],
      };
    }

    const item = await db.items.get(assetIdNum);
    if (!item) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: `【参考图未找到 / Asset Not Found】: 资产库中不存在 ID 为 ${assetIdNum} 的素材。请先调用 search_prompts_and_assets 检索确认素材 ID。`,
          },
        ],
      };
    }

    if (!item.originalBlob) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: `【参考图数据损坏 / Asset Corrupted】: 资产 ID 为 ${assetIdNum} 的原始图片数据缺失。`,
          },
        ],
      };
    }

    resolvedReferenceDataUrl = await blobToDataUrl(item.originalBlob);
    referenceNote = `资产 ID: ${assetIdNum}${item.pageTitle ? ` (「${item.pageTitle}」)` : ''}`;
  } else {
    const rawRefUrl = (args.referenceImageUrl || args.referenceImageDataUrl || '').trim();
    if (rawRefUrl) {
      resolvedReferenceDataUrl = await convertImageUrlToDataUrl(rawRefUrl);
      referenceNote = rawRefUrl.startsWith('data:')
        ? 'Base64 数据 (Inline DataURL)'
        : `外部图片 (${rawRefUrl.length > 50 ? `${rawRefUrl.slice(0, 50)}...` : rawRefUrl})`;
    }
  }

  try {
    const images = await generateImagesWithAI(
      {
        prompt,
        aspectRatio,
        model: args.model || apiConfig.model,
        count: 1,
        negativePrompt: args.negativePrompt,
        sendAsReferenceImage: Boolean(resolvedReferenceDataUrl),
        referenceImageDataUrl: resolvedReferenceDataUrl,
      },
      settings
    );

    if (!images || images.length === 0 || !images[0]) {
      throw new Error('生图服务未返回有效图片结果');
    }

    const firstImage = images[0];

    // Resolve target folder
    const targetFolderId = await resolveTargetFolderId(args.folderId, args.folderName);

    const itemId = await saveGeneratedImageToGallery(firstImage);
    if (targetFolderId !== null) {
      await db.items.update(itemId, { folderId: targetFolderId });
    }
    const current = await db.items.get(itemId);
    const combinedTags = Array.from(
      new Set([
        ...(current?.tags || []),
        aspectRatio,
        ASSET_SOURCE_TAGS.AGENT_COLLAB,
        ...(resolvedReferenceDataUrl ? ['img2img'] : []),
      ])
    );
    await db.items.update(itemId, {
      tags: combinedTags,
      sourceUrl: ASSET_SOURCE_URLS.MCP_COLLABORATION,
    });

    const durationMs = Date.now() - startTime;

    return {
      isError: false,
      content: [
        {
          type: 'text',
          text: `【生图成功】: 成功生成图像并保存至本地图库！\n• 尺寸/比例: ${firstImage.width}×${firstImage.height} (${aspectRatio})\n• 耗时: ${durationMs}ms\n• Item ID: ${itemId}${
            referenceNote ? `\n• 参考图: ${referenceNote}` : ''
          }\n• 目标文件夹: ${
            targetFolderId ? `ID ${targetFolderId}` : '未归档'
          }\n• 提示词: ${prompt}`,
        },
      ],
    };

  } catch (err: any) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: `【生图执行失败 / Generation Failed】: ${err.message || String(err)}`,
        },
      ],
    };
  }
}

// ----------------------------------------------------------------------
// 2. Client Connection Manager for Local WebSocket
// ----------------------------------------------------------------------

export type McpConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

class McpCollaborationManager {
  private ws: WebSocket | null = null;
  private state: McpConnectionState = 'disconnected';
  private logs: CollaborationLogItem[] = [];
  private stateListeners: Set<(state: McpConnectionState) => void> = new Set();
  private logListeners: Set<(logs: CollaborationLogItem[]) => void> = new Set();
  private reconnectTimer: any = null;
  private isExplicitlyStopped = false;

  public getState(): McpConnectionState {
    return this.state;
  }

  public getLogs(): CollaborationLogItem[] {
    return [...this.logs];
  }

  public clearLogs(): void {
    this.logs = [];
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      chrome.storage.local.set({ mcp_recent_logs: [] }).catch(() => {});
    }
    this.notifyLogs();
  }

  public subscribeState(listener: (state: McpConnectionState) => void): () => void {
    this.stateListeners.add(listener);
    listener(this.state);
    return () => this.stateListeners.delete(listener);
  }

  public subscribeLogs(listener: (logs: CollaborationLogItem[]) => void): () => void {
    this.logListeners.add(listener);
    listener(this.getLogs());
    return () => this.logListeners.delete(listener);
  }

  public async start(): Promise<void> {
    this.isExplicitlyStopped = false;
    await this.connect();
  }

  public stop(): void {
    this.isExplicitlyStopped = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.setState('disconnected');
  }

  public async restart(): Promise<void> {
    this.stop();
    await this.start();
  }

  private setState(state: McpConnectionState): void {
    this.state = state;
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      chrome.storage.local.set({ mcp_active_state: state }).catch(() => {});
    }
    for (const listener of this.stateListeners) {
      try {
        listener(state);
      } catch (err) {
        console.error('[mcpCollaboration] stateListener error:', err);
      }
    }
  }

  private addLog(log: Omit<CollaborationLogItem, 'id' | 'timestamp'>): void {
    const item: CollaborationLogItem = {
      ...log,
      id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: Date.now(),
    };
    this.logs = [item, ...this.logs.slice(0, 99)]; // Keep latest 100
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      chrome.storage.local.set({ mcp_recent_logs: this.logs }).catch(() => {});
    }
    this.notifyLogs();
  }

  private notifyLogs(): void {
    const list = this.getLogs();
    for (const listener of this.logListeners) {
      try {
        listener(list);
      } catch (err) {
        console.error('[mcpCollaboration] logListener error:', err);
      }
    }
  }

  private async connect(): Promise<void> {
    if (this.isExplicitlyStopped) return;
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    const settings = await getUserSettings();
    const mcpConfig: McpSettings = settings.mcpSettings || DEFAULT_MCP_SETTINGS;

    if (!mcpConfig.enabled) {

      this.setState('disconnected');
      return;
    }

    this.setState('connecting');

    try {
      const wsUrl = `ws://127.0.0.1:${mcpConfig.port || 18088}`;
      const ws = new WebSocket(wsUrl);
      this.ws = ws;

      ws.onopen = () => {
        // Send handshake
        ws.send(
          JSON.stringify({
            type: 'register',
            token: mcpConfig.authToken,
            client: 'PicPocket Chrome Extension',
          })
        );
      };

      ws.onmessage = async (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'registered') {
            if (msg.success) {
              this.setState('connected');
            } else {
              this.setState('error');
            }
            return;
          }
          if (msg.type === 'tool_call') {
            await this.handleIncomingToolCall(msg);
          }
        } catch (err) {
          console.error('[mcpCollaboration] WS message parse error:', err);
        }
      };

      ws.onerror = () => {
        this.setState('error');
      };

      ws.onclose = () => {
        this.setState('disconnected');
        this.ws = null;
        if (!this.isExplicitlyStopped) {
          // Schedule reconnect every 4s
          this.reconnectTimer = setTimeout(() => {
            this.connect();
          }, 4000);
        }
      };
    } catch (err) {
      this.setState('error');
      if (!this.isExplicitlyStopped) {
        this.reconnectTimer = setTimeout(() => {
          this.connect();
        }, 4000);
      }
    }
  }

  private async handleIncomingToolCall(msg: {
    id: string;
    name: string;
    arguments?: Record<string, any>;
    clientName?: string;
  }): Promise<void> {
    const startTime = Date.now();
    const settings = await getUserSettings();
    const permissions: McpPermissions =
      settings.mcpSettings?.permissions || DEFAULT_MCP_SETTINGS.permissions;
    const clientName = msg.clientName || 'AI Agent';


    let result: McpToolResponse;

    try {
      switch (msg.name) {
        case 'search_prompts_and_assets':
          result = await executeSearchPromptsAndAssets(msg.arguments || {}, permissions);
          break;
        case 'manage_folders':
          result = await executeManageFolders(msg.arguments || {}, permissions);
          break;
        case 'save_asset':
          result = await executeSaveAsset(msg.arguments || {}, permissions);
          break;
        case 'save_prompt':
          result = await executeSavePrompt(msg.arguments as any || {}, permissions);
          break;
        case 'update_tags':
          result = await executeUpdateTags(msg.arguments as any || {}, permissions);
          break;
        case 'generate_and_save_asset':
          result = await executeGenerateAndSaveAsset(msg.arguments as any || {}, permissions, settings);
          break;
        case 'get_canvas_state':
          result = await executeGetCanvasState(permissions);
          break;
        case 'create_canvas_node':
          result = await executeCreateCanvasNode(msg.arguments || {}, permissions);
          break;
        default:
          result = {
            isError: true,
            content: [{ type: 'text', text: `【未知工具】: 不支持工具 "${msg.name}"` }],
          };
      }
    } catch (err: any) {
      result = {
        isError: true,
        content: [{ type: 'text', text: `【执行异常】: ${err.message || String(err)}` }],
      };
    }

    const durationMs = Date.now() - startTime;
    const isBlocked = result.isError && result.content[0]?.text.includes('权限拦截');

    this.addLog({
      clientName,
      toolName: msg.name,
      status: isBlocked ? 'blocked' : result.isError ? 'error' : 'success',
      durationMs,
      summary: result.content[0]?.text.slice(0, 80) || '',
      detail: result.content[0]?.text,
    });

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({
          type: 'tool_result',
          id: msg.id,
          result,
        })
      );
    }
  }
}

export const mcpManager = new McpCollaborationManager();

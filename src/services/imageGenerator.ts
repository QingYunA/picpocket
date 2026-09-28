import type {
  ImageAspectRatio,
  ImageDimension,
  ImageGenerationParams,
  GeneratedImage,
  GenerationBatchTask,
  UserSettings,
  Language,
} from '../types';

export const ASPECT_RATIO_CONFIGS: Record<ImageAspectRatio, ImageDimension> = {
  '1:1': { width: 1024, height: 1024, size: '1024x1024' },
  '16:9': { width: 1792, height: 1024, size: '1792x1024' },
  '9:16': { width: 1024, height: 1792, size: '1024x1792' },
  '4:3': { width: 1024, height: 768, size: '1024x768' },
  '3:4': { width: 768, height: 1024, size: '768x1024' },
  '21:9': { width: 1792, height: 768, size: '1792x768' },
  '2:3': { width: 768, height: 1152, size: '768x1152' },
};

export function ratioToDimension(ratio: ImageAspectRatio): ImageDimension {
  return ASPECT_RATIO_CONFIGS[ratio] || ASPECT_RATIO_CONFIGS['1:1'];
}

import { sanitizeHttpHeaderToken, sanitizeHttpUrl } from '../utils/sanitize';
import { getModelCapability } from '../config/modelCapabilities';
import { hostedImageModel } from '../config/hostedModels';
import { imageChannelMode } from '../config/channelMode';
import { hostedCreditError, hostedHeaders, readCreditBalance, resolveChannelCredential } from './hostedAccount';
import { getTranslation } from '../i18n';
import { DEFAULT_HOSTED_PROXY_URL, licenseUsableFor, syncRemainingQuota, syncDualRemainingQuota } from './billing';
import { prepareReferenceImageForAi, dataUrlToFile } from '../utils/imageCompression';
import { formatSafeErrorMessage } from '../utils/errorMessage';
import { GENERATION_REQUEST_TIMEOUT_MS, withRequestTimeout } from '../utils/requestTimeout';
export { sanitizeHttpHeaderToken, sanitizeHttpUrl };

/**
 * 解析生图调用的凭据。当前渠道是 PicPocket 时走托管通道：有效兑换码优先，否则已登录账号按积分计费；
 * 自己的渠道只用自己的 Key（没填时 apiKey 为空，由调用方提示）。
 * accountSignedIn 由调用方提供（界面用 useAuth，后台用 getAccountAccessToken）。
 */
export function resolveImageApiConfig(settings: UserSettings, channelId?: string, accountSignedIn = false): {
  apiKey: string;
  baseUrl: string;
  model: string;
  isProManaged?: boolean;
  licenseKey?: string;
} {
  const channel = channelId ? settings.imageChannels?.find((item) => item.id === channelId) : undefined;
  const rawKey = (channel ? (channel.apiKey || settings.apiKey) : (settings.imageApiKey || settings.apiKey) || '').trim();
  let apiKey = sanitizeHttpHeaderToken(rawKey);

  let rawBaseUrl = (channel ? channel.baseUrl : settings.imageBaseUrl || settings.baseUrl || 'https://api.openai.com/v1').trim();
  let model = (channel ? channel.model : settings.imageModel || 'dall-e-3').trim();

  const licenseUsable = licenseUsableFor(settings, 'image-generation');
  let isProManaged = false;
  let licenseKey: string | undefined;

  if (imageChannelMode(settings, channelId).kind === 'picpocket') {
    apiKey = '';
    rawBaseUrl = settings.hostedProxyUrl || DEFAULT_HOSTED_PROXY_URL;
    model = hostedImageModel(settings.hostedImageModel);
    isProManaged = licenseUsable || accountSignedIn;
    licenseKey = licenseUsable ? settings.proMembership?.licenseKey : undefined;
  }

  const baseUrl = sanitizeHttpUrl(rawBaseUrl);
  return { apiKey, baseUrl, model, isProManaged, licenseKey };
}

export async function parseImageResponsePayload(
  data: Record<string, unknown> | null | undefined
): Promise<string[]> {
  if (!data) throw new Error('API 返回了空响应');
  const errorObj = data.error as { message?: string } | undefined;
  if (errorObj?.message) throw new Error(errorObj.message);

  const list = data.data as Array<{ b64_json?: string; url?: string }> | undefined;
  if (!Array.isArray(list) || list.length === 0) {
    const errorMsg = (data.msg as string) || errorObj?.message || 'API 未返回任何图像数据';
    throw new Error(errorMsg);
  }

  const results: string[] = [];
  for (const item of list) {
    if (item.b64_json) {
      const b64 = item.b64_json;
      const dataUrl = b64.startsWith('data:') ? b64 : `data:image/png;base64,${b64}`;
      results.push(dataUrl);
    } else if (item.url) {
      results.push(item.url);
    }
  }

  if (results.length === 0) {
    throw new Error('未能从响应中解析出有效的图片 URL 或 Base64 数据');
  }

  return results;
}

export async function convertImageUrlToDataUrl(url: string): Promise<string> {
  if (url.startsWith('data:')) return url;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Image URL responded ${res.status}`);
    const blob = await res.blob();
    // 仅拦截明显的错误页载荷；部分 CDN 对正常图片返回 application/octet-stream，需放行
    if (/^(text\/|application\/(json|xml))/i.test(blob.type)) {
      throw new Error(`Image URL returned an error payload: ${blob.type}`);
    }
    if (typeof FileReader !== 'undefined') {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    }
    // Service Worker 环境兼容降级：使用 ArrayBuffer 纯内存解码生成 Base64 DataURL
    const buffer = await blob.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]!);
    }
    const base64 = btoa(binary);
    const mimeType = blob.type || 'image/png';
    return `data:${mimeType};base64,${base64}`;
  } catch (err) {
    console.warn('[imageGenerator] Failed to fetch image URL into DataURL, returning raw url:', err);
    return url;
  }
}

/**
 * 执行单次生图请求（底层强制 n: 1）
 * 100% 对齐 Infinite Canvas 的 requestGeneration 与 requestEdit 机制：
 * - 纯文生图：POST ${baseUrl}/images/generations，标准 JSON，绝不带 image 字段；
 * - 参考图生图：POST ${baseUrl}/images/edits，使用 FormData 传递纯内存二进制 File，绝不传 Base64 JSON，彻底免疫 413；
 * - 异常拦截：全面接入 formatSafeErrorMessage，彻底抹杀 HTML 源码。
 */
async function singleGenerateImagesWithAI(
  params: ImageGenerationParams,
  settings: UserSettings,
  signal?: AbortSignal
): Promise<GeneratedImage[]> {
  return withRequestTimeout(
    signal,
    GENERATION_REQUEST_TIMEOUT_MS,
    `生图请求超时（超过 ${Math.round(GENERATION_REQUEST_TIMEOUT_MS / 1000)} 秒未响应），请稍后重试`,
    (requestSignal) => runSingleGeneration(params, settings, requestSignal)
  );
}

async function runSingleGeneration(
  params: ImageGenerationParams,
  settings: UserSettings,
  signal: AbortSignal
): Promise<GeneratedImage[]> {
  const mode = imageChannelMode(settings, params.channelId);
  const { credential } = await resolveChannelCredential(mode, settings, 'image-generation');
  const { apiKey, baseUrl, model: defaultModel, isProManaged } = resolveImageApiConfig(settings, params.channelId, Boolean(credential));
  const useAccountCredits = credential?.kind === 'account';
  const model = isProManaged
    ? hostedImageModel(params.model, settings.hostedImageModel)
    : (params.model || defaultModel).trim();

  const selectedChannel = mode.kind === 'picpocket'
    ? undefined
    : params.channelId
      ? settings.imageChannels?.find((channel) => channel.id === params.channelId)
      : settings.imageChannels?.find((channel) => channel.id === settings.activeImageChannelId) || settings.imageChannels?.[0];
  if (params.channelId && mode.kind !== 'picpocket' && (!selectedChannel || !((selectedChannel.models || [selectedChannel.model]).includes(model)))) {
    throw new Error('所选生图模型已不在该渠道中，请重新选择');
  }
  if (selectedChannel && !selectedChannel.baseUrl.trim()) {
    throw new Error('请先为所选生图渠道配置接口地址');
  }
  if (settings.imageChannels && !isProManaged && (!settings.imageChannels.length || !selectedChannel?.model?.trim())) {
    throw new Error('请先在设置中添加生图渠道并选择模型');
  }

  if (!isProManaged && !apiKey) {
    throw new Error(getTranslation(settings.language || 'zh', 'billing.hostedErrors.needCredentials'));
  }

  // 终极前置断言：杜绝 non ISO-8859-1 code point 传入 fetch headers
  if (apiKey && /[^\x20-\x7E]/.test(apiKey)) {
    throw new Error('API Key 格式无效（包含中文字符或非 ASCII 编码），请在设置中重新粘贴纯英文 Key');
  }

  const prompt = params.prompt.trim();
  if (!prompt) {
    throw new Error('提示词不能为空');
  }

  const dimension = ratioToDimension(params.aspectRatio);

  let finalPrompt = prompt;
  if (params.negativePrompt && params.negativePrompt.trim()) {
    finalPrompt = `${prompt} --no ${params.negativePrompt.trim()}`;
  }

  let activeRef = params.referenceImageDataUrl || (params.referenceImages && params.referenceImages[0]);
  const hasReference = Boolean(params.sendAsReferenceImage && activeRef);

  let endpoint = '';
  let requestBody: BodyInit;
  const headers: Record<string, string> = {};

  if (credential) {
    Object.assign(headers, hostedHeaders(credential, 'image-generation'));
  } else if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  if (hasReference) {
    // 100% 对齐 Infinite Canvas 的 requestEdit 逻辑：
    // 1. 端点：POST ${baseUrl}/images/edits (标准 OpenAI 图生图端点)
    // 2. 载荷：FormData (multipart/form-data) 纯内存二进制，杜绝 Base64 膨胀与 Nginx 413
    const preprocessedRef = await prepareReferenceImageForAi(activeRef!);
    const file = dataUrlToFile(preprocessedRef, 'reference.png');

    endpoint = isProManaged ? baseUrl : `${baseUrl}/images/edits`;
    const formData = new FormData();
    formData.append('model', model);
    formData.append('prompt', finalPrompt);
    formData.append('n', '1');
    if (dimension.size) {
      formData.append('size', dimension.size);
    }
    if (params.quality && params.quality !== 'auto') {
      formData.append('quality', params.quality);
    }
    if (params.transparent) {
      formData.append('background', 'transparent');
    }
    formData.append('image', file);
    // 注意：不手动添加 Content-Type，让 fetch 自动生成带 boundary 的 multipart/form-data
    requestBody = formData;
  } else {
    // 纯文生图：POST ${baseUrl}/images/generations (标准 JSON，绝不带 image 字段)
    endpoint = isProManaged ? baseUrl : `${baseUrl}/images/generations`;
    headers['Content-Type'] = 'application/json';
    const payload: Record<string, any> = {
      model,
      prompt: finalPrompt,
      n: 1,
      size: dimension.size,
      response_format: 'b64_json',
    };
    if (params.quality && params.quality !== 'auto') {
      payload.quality = params.quality;
    }
    if (params.transparent) {
      payload.background = 'transparent';
    }
    requestBody = JSON.stringify(payload);
  }

  return sendGenerationRequest(endpoint, headers, requestBody, signal, {
    prompt,
    aspectRatio: params.aspectRatio,
    dimension,
    useAccountCredits,
    language: settings.language || 'zh',
  });
}

async function sendGenerationRequest(
  endpoint: string,
  headers: Record<string, string>,
  requestBody: BodyInit,
  signal: AbortSignal,
  ctx: {
    prompt: string;
    aspectRatio: ImageGenerationParams['aspectRatio'];
    dimension: ReturnType<typeof ratioToDimension>;
    useAccountCredits: boolean;
    language: Language;
  }
): Promise<GeneratedImage[]> {
  const { prompt, dimension, useAccountCredits, language } = ctx;
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      signal,
      headers,
      body: requestBody,
    });
  } catch (netErr: any) {
    if (signal.aborted || netErr?.name === 'AbortError') {
      throw netErr;
    }
    throw new Error(formatSafeErrorMessage(netErr));
  }

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    const creditError = useAccountCredits ? hostedCreditError(response.status, errText, language) : null;
    if (creditError) throw creditError;
    const cleanError = formatSafeErrorMessage(errText, response.status);
    throw new Error(`生图请求失败 (${response.status}): ${cleanError}`);
  }
  if (useAccountCredits) await readCreditBalance(response.headers);

  const visionQuotaHeader = response.headers?.get?.('X-Remaining-Vision-Quota');
  const imageQuotaHeader = response.headers?.get?.('X-Remaining-Image-Quota');
  const quotaHeader = response.headers?.get?.('X-Remaining-Quota');
  if (visionQuotaHeader || imageQuotaHeader || quotaHeader) {
    const visionRemaining = visionQuotaHeader ? parseInt(visionQuotaHeader, 10) : undefined;
    const imageRemaining = imageQuotaHeader ? parseInt(imageQuotaHeader, 10) : undefined;
    const generalRemaining = quotaHeader ? parseInt(quotaHeader, 10) : undefined;
    syncDualRemainingQuota({
      visionRemaining: typeof visionRemaining === 'number' && !isNaN(visionRemaining) ? visionRemaining : undefined,
      imageRemaining: typeof imageRemaining === 'number' && !isNaN(imageRemaining) ? imageRemaining : undefined,
      generalRemaining: typeof generalRemaining === 'number' && !isNaN(generalRemaining) ? generalRemaining : undefined,
    }).catch(() => {});
  }

  const resJson = await response.json();
  const rawUrls = await parseImageResponsePayload(resJson);

  const images: GeneratedImage[] = [];
  const now = Date.now();

  for (let i = 0; i < rawUrls.length; i++) {
    const raw = rawUrls[i];
    if (!raw) continue;
    const dataUrl = raw.startsWith('data:') ? raw : await convertImageUrlToDataUrl(raw);
    images.push({
      id: `${now}_${i}_${Math.random().toString(36).slice(2, 7)}`,
      dataUrl,
      prompt,
      aspectRatio: ctx.aspectRatio,
      width: dimension.width,
      height: dimension.height,
      createdAt: now,
    });
  }

  return images;
}

/**
 * AI 生成图片核心对外入口
 * 
 * 100% 对齐 Infinite Canvas 的并发多图调度模型 (Promise.all 并发池)：
 * - 当 count > 1 时（支持 2~10 张并发），在客户端通过 Promise.all 并行发起独立的单张请求；
 * - 每个请求独立向服务端传递 count: 1 (n: 1)，耗时仅 20~30 秒，彻底消灭 Cloudflare 100 秒 524 超时；
 * - 具备高韧性局部容错：只要有任何一张成功，成功图片即刻返回落地，绝不全军覆没！
 */
export interface GenerationReport {
  images: GeneratedImage[];
  requestedCount: number;
  failedCount: number;
  firstErrorMessage?: string;
}

export async function generateImagesWithAI(
  params: ImageGenerationParams,
  settings: UserSettings,
  signal?: AbortSignal
): Promise<GeneratedImage[]> {
  const report = await generateImagesWithReport(params, settings, signal);
  return report.images;
}

/**
 * 与 generateImagesWithAI 相同，但额外返回局部失败统计，供任务历史向用户提示「N 张中 M 张失败」
 */
export async function generateImagesWithReport(
  params: ImageGenerationParams,
  settings: UserSettings,
  signal?: AbortSignal
): Promise<GenerationReport> {
  const model = (params.model || settings.imageModel || 'dall-e-3').trim();
  const capability = getModelCapability(model);
  const requestedCount = Math.max(1, Math.min(capability.maxCount || 10, params.count || 1));

  // 单张请求：直接执行
  if (requestedCount <= 1) {
    const images = await singleGenerateImagesWithAI({ ...params, count: 1 }, settings, signal);
    return { images, requestedCount, failedCount: 0 };
  }

  // 多图请求（2~10 张并发）：100% 对齐 Infinite Canvas 的 Promise.all 并行单张分发
  const tasks = Array.from({ length: requestedCount }, () =>
    singleGenerateImagesWithAI({ ...params, count: 1 }, settings, signal)
  );

  const settled = await Promise.allSettled(tasks);
  const successfulImages: GeneratedImage[] = [];
  let firstError: Error | null = null;
  let failedCount = 0;

  for (const item of settled) {
    if (item.status === 'fulfilled') {
      successfulImages.push(...item.value);
    } else {
      failedCount++;
      if (!firstError) {
        firstError = item.reason instanceof Error ? item.reason : new Error(String(item.reason));
      }
    }
  }

  // 只要有任何一张图片成功，就返回成功的图片集合（支持局部容错），同时保留失败统计
  if (successfulImages.length > 0) {
    return {
      images: successfulImages,
      requestedCount,
      failedCount,
      firstErrorMessage: firstError ? formatSafeErrorMessage(firstError.message) : undefined,
    };
  }

  // 全部失败时抛出第一个具体错误
  throw firstError || new Error('多图生成失败，请稍后重试');
}

/** 将生成报告转换为任务历史中的局部失败提示字段（全部成功时返回 undefined） */
export function toPartialFailure(report: GenerationReport): GenerationBatchTask['partialFailure'] {
  if (report.failedCount <= 0) return undefined;
  return {
    failed: report.failedCount,
    requested: report.requestedCount,
    message: report.firstErrorMessage,
  };
}


import { saveGeneratedImageToGallery, updateGenerationTask } from '../db';

export interface ForegroundGenerationInput {
  taskId: string;
  params: ImageGenerationParams;
  settings: UserSettings;
  startTime: number;
  signal: AbortSignal;
}

export interface ForegroundGenerationResult {
  images: GeneratedImage[];
  latencyMs: number;
}

/**
 * 前台降级生图（Service Worker 不可达时）：标记执行方、支持中断并写回成功结果。
 * 被中断时返回 null，任务的 cancelled 状态由取消方负责写入。
 */
export async function runForegroundGenerationTask(
  input: ForegroundGenerationInput
): Promise<ForegroundGenerationResult | null> {
  const { taskId, params, settings, startTime, signal } = input;
  // 标记失败时后台冷启动自愈可能把本任务误判为悬挂，需留痕便于排查
  await updateGenerationTask(taskId, { executor: 'foreground' }).catch((err) => {
    console.warn('[imageGenerator] Failed to mark task as foreground-executed:', err);
  });

  let report: GenerationReport;
  try {
    report = await generateImagesWithReport(params, settings, signal);
  } catch (err) {
    if (signal.aborted) return null;
    throw err;
  }

  const latencyMs = Date.now() - startTime;
  const committed = await finalizeGenerationTaskSuccess({
    taskId,
    prompt: params.prompt,
    images: report.images,
    latencyMs,
    autoSaveToGallery: settings.autoSaveGeneratedToGallery,
    partialFailure: toPartialFailure(report),
    signal,
  });
  return committed ? { images: report.images, latencyMs } : null;
}

export interface FinalizeGenerationInput {
  taskId: string;
  prompt: string;
  images: GeneratedImage[];
  latencyMs: number;
  autoSaveToGallery?: boolean;
  partialFailure?: GenerationBatchTask['partialFailure'];
  /** 用户取消信号：一旦中断即停止后续画廊写入，且不再把任务写为 success */
  signal?: AbortSignal;
}

/**
 * 统一处理生图成功后的图片画廊持久化与任务状态更新，杜绝重复代码。
 * 返回是否已写入 success；过程中被取消时返回 false，任务状态交由取消方负责。
 */
export async function finalizeGenerationTaskSuccess(input: FinalizeGenerationInput): Promise<boolean> {
  const { taskId, prompt, images, latencyMs, autoSaveToGallery, partialFailure, signal } = input;
  if (signal?.aborted) return false;

  if (autoSaveToGallery) {
    for (const img of images) {
      if (signal?.aborted) return false;
      try {
        await saveGeneratedImageToGallery(img, prompt);
        img.savedToGallery = true;
      } catch (e) {
        console.warn('Auto save to gallery failed:', e);
      }
    }
  }

  // 画廊写入期间用户可能已取消：已取消的任务不得被覆盖回 success
  if (signal?.aborted) return false;
  await updateGenerationTask(taskId, {
    images,
    status: 'success',
    latencyMs,
    partialFailure,
  });
  return true;
}

import type { GenerationBatchTask, ImageAspectRatio, ImageGenerationParams } from '../types';

/** 一次生图请求所需的全部表单参数（不含参考图，参考图由 resolveTaskReferences 异步加载） */
export interface GenerationFormRequest {
  prompt: string;
  aspectRatio: ImageAspectRatio;
  model: string;
  count: number;
  quality: NonNullable<ImageGenerationParams['quality']>;
  negativePrompt: string;
  sendAsReferenceImage: boolean;
}

/**
 * 为局部失败的任务构造「只重试失败张数」的请求，沿用原任务的全部生成参数。
 * 旧任务未记录 generationOptions 时回退到与表单一致的默认值（画质 auto、无负面提示词、
 * 作为参考图发送）；若原任务当时关闭了「作为参考图发送」，旧任务的重试行为会与原任务不同。
 * 无可重试张数时返回 null。
 */
export function buildRetryRequest(task: GenerationBatchTask): GenerationFormRequest | null {
  const failed = task.partialFailure?.failed ?? 0;
  if (failed <= 0) return null;
  const options = task.generationOptions;
  return {
    prompt: task.prompt,
    aspectRatio: task.aspectRatio,
    model: task.model,
    count: failed,
    quality: options?.quality ?? 'auto',
    negativePrompt: options?.negativePrompt ?? '',
    sendAsReferenceImage: options?.sendAsReferenceImage ?? true,
  };
}

export interface ReferenceLoaders {
  getMany: (assetIds: string[]) => Promise<string[]>;
  getOne: (assetId: string) => Promise<string | null | undefined>;
}

export interface ResolvedTaskReferences {
  images: string[];
  assetIds: string[];
  /** 是否取回了任务记录的全部参考图；为 false 时重试结果将与原任务不一致 */
  complete: boolean;
}

/**
 * 按任务记录的三种历史格式还原参考图：去重池多图 → 旧版单图 ID → 内联 DataURL。
 * 供「复用参数」与「重试失败张数」共用。
 */
export async function resolveTaskReferences(
  task: Pick<GenerationBatchTask, 'referenceAssetIds' | 'referenceAssetId' | 'referenceImageDataUrl'>,
  loaders: ReferenceLoaders
): Promise<ResolvedTaskReferences> {
  if (task.referenceAssetIds?.length) {
    const images = await loaders.getMany(task.referenceAssetIds);
    if (images.length > 0) {
      return {
        images,
        assetIds: task.referenceAssetIds,
        complete: images.length === task.referenceAssetIds.length,
      };
    }
  }
  if (task.referenceAssetId) {
    const image = await loaders.getOne(task.referenceAssetId);
    if (image) return { images: [image], assetIds: [task.referenceAssetId], complete: true };
  }
  if (task.referenceImageDataUrl) {
    return { images: [task.referenceImageDataUrl], assetIds: [], complete: true };
  }
  // 记录过参考图却一张也取不回（已被清理），视为不完整
  const expectedAny = Boolean(task.referenceAssetIds?.length || task.referenceAssetId);
  return { images: [], assetIds: [], complete: !expectedAny };
}

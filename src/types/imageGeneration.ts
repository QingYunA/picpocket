export type ImageAspectRatio = '1:1' | '16:9' | '9:16' | '4:3' | '3:4' | '21:9' | '2:3';

export interface ImageDimension {
  width: number;
  height: number;
  size: string; // e.g. '1024x1024'
}

export interface ImageGenerationParams {
  prompt: string;
  aspectRatio: ImageAspectRatio;
  model?: string;
  channelId?: string;
  count?: number; // 1 ~ 4
  quality?: 'auto' | 'standard' | 'hd';
  negativePrompt?: string;
  referenceImageDataUrl?: string;
  referenceImages?: string[];
  sendAsReferenceImage?: boolean;
  transparent?: boolean;
}

export interface GeneratedImage {
  id: string;
  dataUrl: string;
  prompt: string;
  aspectRatio: ImageAspectRatio;
  width: number;
  height: number;
  createdAt: number;
  savedToGallery?: boolean;
  savedToPrompts?: boolean;
  model?: string;
}

export interface GenerationBatchTask {
  id: string;
  prompt: string;
  aspectRatio: ImageAspectRatio;
  model: string;
  referenceAssetId?: string;
  referenceAssetIds?: string[];
  referenceImageDataUrl?: string;
  images: GeneratedImage[];
  status: 'generating' | 'success' | 'failed' | 'cancelled';
  error?: string;
  /** 发起时的其余生成参数，用于「重试失败张数」原样重放（旧任务可能缺失） */
  generationOptions?: {
    quality?: ImageGenerationParams['quality'];
    negativePrompt?: string;
    sendAsReferenceImage?: boolean;
  };
  /** 多图并发时部分张数失败的统计，任务整体仍为 success */
  partialFailure?: {
    failed: number;
    requested: number;
    message?: string;
  };
  /**
   * 实际执行方。前台降级（Service Worker 不可达）时为 foreground，
   * 后台冷启动自愈不得把前台仍在执行的任务误判为悬挂
   */
  executor?: 'background' | 'foreground';
  latencyMs?: number;
  createdAt: number;
}

/** 后台（或存活探针合成）发给前台的生成结束消息 */
export interface GenerationFinishedMessage {
  action: 'IMAGE_GENERATION_FINISHED';
  taskId: string | null;
  status: Exclude<GenerationBatchTask['status'], 'generating'>;
  error?: string;
}

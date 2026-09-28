/**
 * 托管（积分 / 兑换码）模式可选的模型，与服务端 ai-proxy 的托管目录保持一致；
 * 服务端只放行这些模型，路由与计价都在服务端完成。
 */
export const HOSTED_VISION_MODELS = [
  'deepseek-flash',
  'qwen3.7-plus',
  'gemini-3.8-flash',
  'gpt-6-sol',
  'claude-sonnet-5',
  'gemini-3.1-pro',
  'glm-5.3-flash',
  'kimi-k3',
  'minimax-m3',
] as const;

export const HOSTED_IMAGE_MODELS = [
  'gpt-image-2.5-sunburst',
  'gpt-image-2.5-flare',
  'gpt-image-2',
  'grok-imagine-image-2.0',
  'nano-banana-pro',
  'seedream-5-pro',
] as const;

export const DEFAULT_HOSTED_VISION_MODEL = 'deepseek-flash';
export const DEFAULT_HOSTED_IMAGE_MODEL = 'gpt-image-2.5-sunburst';

function pick(catalog: readonly string[], fallback: string, candidates: Array<string | undefined>): string {
  for (const candidate of candidates) {
    const id = candidate?.trim().toLowerCase();
    if (id && catalog.includes(id)) return id;
  }
  return fallback;
}

/** 按顺序取第一个在托管目录里的反推模型，都不在时用默认模型（自备 Key 的模型名不会被发往托管网关） */
export function hostedVisionModel(...candidates: Array<string | undefined>): string {
  return pick(HOSTED_VISION_MODELS, DEFAULT_HOSTED_VISION_MODEL, candidates);
}

/** 按顺序取第一个在托管目录里的生图模型，都不在时用默认模型 */
export function hostedImageModel(...candidates: Array<string | undefined>): string {
  return pick(HOSTED_IMAGE_MODELS, DEFAULT_HOSTED_IMAGE_MODEL, candidates);
}

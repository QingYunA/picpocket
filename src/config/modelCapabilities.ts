export interface ModelCapability {
  id: string;
  maxCount: number;
  supportsImageToImage: boolean;
  notes?: string;
}

export const KNOWN_MODEL_CAPABILITIES: Record<string, Partial<ModelCapability>> = {
  'dall-e-3': {
    maxCount: 1,
    supportsImageToImage: false,
    notes: 'OpenAI DALL-E 3 仅支持生成 1 张图片，且不支持参考图生图',
  },
  'dall-e-2': {
    maxCount: 4,
    supportsImageToImage: true,
  },
  'flux': {
    maxCount: 4,
    supportsImageToImage: true,
  },
  'midjourney': {
    maxCount: 4,
    supportsImageToImage: true,
  },
  'stable-diffusion': {
    maxCount: 4,
    supportsImageToImage: true,
  },
  'sdxl': {
    maxCount: 4,
    supportsImageToImage: true,
  },
  'kolors': {
    maxCount: 4,
    supportsImageToImage: true,
  },
  'gpt-image': {
    maxCount: 4,
    supportsImageToImage: true,
  },
  'grok': {
    maxCount: 4,
    supportsImageToImage: true,
  },
};

/**
 * 获取指定模型的能力约束（若未特别收录则采用安全默认值）
 */
export function getModelCapability(modelName: string): ModelCapability {
  if (!modelName) {
    return {
      id: '',
      maxCount: 4,
      supportsImageToImage: true,
    };
  }

  const lower = modelName.toLowerCase();
  for (const [key, cap] of Object.entries(KNOWN_MODEL_CAPABILITIES)) {
    if (lower.includes(key)) {
      return {
        id: modelName,
        maxCount: cap.maxCount ?? 4,
        supportsImageToImage: cap.supportsImageToImage ?? true,
        notes: cap.notes,
      };
    }
  }

  return {
    id: modelName,
    maxCount: 4,
    supportsImageToImage: true,
  };
}

/**
 * 已知不支持传入图片的纯文本模型（用户误选用于视觉反推时需前置预警或拦截）
 */
export const KNOWN_TEXT_ONLY_MODELS = [
  'deepseek-chat',
  'deepseek-reasoner',
  'deepseek-v3',
  'deepseek-r1',
  'gpt-3.5-turbo',
  'text-davinci',
  'qwen-turbo',
  'qwen-plus',
  'qwen-max',
  'chatglm',
];

export function isKnownTextOnlyModel(modelName: string): boolean {
  if (!modelName) return false;
  const lower = modelName.toLowerCase().trim();
  // 若显式包含 vision, flash, vl 等多模态标识，绝非纯文本模型
  if (lower.includes('vision') || lower.includes('flash') || lower.includes('vl')) {
    return false;
  }
  return KNOWN_TEXT_ONLY_MODELS.some((m) => lower === m || lower.includes(m));
}



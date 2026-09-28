import type { PromptResult, UserSettings, Language, TextElementSlot, ReversePromptPreset } from '../types';
import { sanitizeHttpHeaderToken, sanitizeHttpUrl } from '../utils/sanitize';
import { prepareVisionImageForAi } from '../utils/imageCompression';
import { DEFAULT_HOSTED_PROXY_URL, buildHostedProxyHeaders, isProExpired, syncRemainingQuota, syncDualRemainingQuota } from './billing';
import { accountHostedHeaders, getAccountAccessToken, hostedCreditError, readCreditBalance } from './hostedAccount';
import { ANALYSIS_REQUEST_TIMEOUT_MS, withRequestTimeout } from '../utils/requestTimeout';

export interface StructuredPromptOutput {
  subject: string[];
  style: string[];
  lighting: string[];
  composition: string[];
  masterPrompt: string;
  textSlots?: TextElementSlot[];
  templatePrompt?: string;
}

export const PRESET_DECONSTRUCT_TEXT_ID = 'deconstruct-text';
export const PRESET_PURE_AESTHETICS_ID = 'pure-aesthetics';

export function getSystemPromptForDeconstructText(language: Language = 'zh'): string {
  const isEn = language === 'en';
  const langDesc = isEn ? 'English' : 'Chinese';
  return `You are a world-class Visual Prompt Reverse Engineer & Graphic Design Art Director specializing in decomposing images, posters, comics, and banners for generative AI (Midjourney v6.1, FLUX.1, Ideogram 2.0).

When given an image, you MUST analyze and decompose its visual content, typography, and aesthetic dimensions.
Return a STRICT JSON object containing these 7 keys in this EXACT logical order:

1. "subject": Array of 2-5 concise ${langDesc} descriptive keywords detailing primary characters, actions, scenes, or objects (excluding the text itself).
2. "style": Array of 2-4 concise ${langDesc} keywords detailing art medium, genre, rendering style (e.g. ${isEn ? '["Japanese manga", "anime cel-shading", "digital comic art"]' : '["日系四格漫画", "赛璐璐平涂", "二次元条漫插画"]'}).
3. "lighting": Array of 2-3 concise ${langDesc} keywords detailing atmosphere, lighting, and palette (e.g. ${isEn ? '["bright daylight", "vibrant pastel palette"]' : '["明亮日系色调", "清新高饱和配色"]'}).
4. "composition": Array of 2-3 concise ${langDesc} keywords detailing camera angle and layout (e.g. ${isEn ? '["four-panel grid layout", "dialogue balloon composition"]' : '["四宫格分镜排版", "对白气泡框排版"]'}).
5. "textSlots": Array of 1-4 objects for the most prominent typography/headlines detected in the image. (Clean single-line text without literal "\\n", avoid duplicates).
   Each object MUST contain:
   - "id": string like "headline" or "slot_1"
   - "role": "headline" | "subheadline" | "body_text" | "badge_slogan" | "other"
   - "originalText": exact text string verbatim from the image (single line, no "\\n")
   - "fontStyle": concise ${langDesc} typography description (e.g. "${isEn ? 'bold anime sans-serif with gradient stroke' : '日漫粗黑艺术字带渐变黄色描边'}")
   - "layoutPlacement": concise ${langDesc} location (e.g. "${isEn ? 'top centered banner' : '顶部居中横幅'}")
6. "masterPrompt": A comprehensive, high-aesthetic English prompt synthesizing subject, style, lighting, composition, and typography in quotes into a single cohesive paragraph ready for Midjourney or FLUX.
7. "templatePrompt": An English prompt skeleton identical to masterPrompt, but with text contents replaced by their placeholder tokens "{{slot_id}}".

Example output:
\`\`\`json
{
  "subject": ["${isEn ? 'anime girl with cat ears' : '金发猫耳二次元少女'}", "${isEn ? 'four-panel comic' : '四格漫画分镜'}"],
  "style": ["${isEn ? 'Japanese manga' : '日漫赛璐璐插画'}", "${isEn ? 'vibrant anime art' : '萌系条漫插画'}"],
  "lighting": ["${isEn ? 'bright clean daylight' : '明亮日系光影'}"],
  "composition": ["${isEn ? 'four-grid panel layout' : '四宫格条漫排版'}"],
  "textSlots": [
    {
      "id": "headline",
      "role": "headline",
      "originalText": "${isEn ? 'New Feature Guide' : 'Grok娘带你看X新功能'}",
      "fontStyle": "${isEn ? 'bold anime typography with stroke' : '粗体日漫艺术字带黄色描边'}",
      "layoutPlacement": "${isEn ? 'top centered banner' : '顶部居中大标题'}"
    }
  ],
  "masterPrompt": "Four-panel Japanese anime manga comic strip featuring an anime girl with cat ears, vibrant cel shading style, bright clean lighting, four-grid panel layout, with prominent headline banner \"${isEn ? 'New Feature Guide' : 'Grok娘带你看X新功能'}\" at top.",
  "templatePrompt": "Four-panel Japanese anime manga comic strip featuring an anime girl with cat ears, vibrant cel shading style, bright clean lighting, four-grid panel layout, with prominent headline banner \"{{headline}}\" at top."
}
\`\`\`

Output ONLY the JSON object. Do not include markdown conversational text outside the codeblock.`;
}

export function getSystemPromptForPureAesthetics(language: Language = 'zh'): string {
  const isEn = language === 'en';

  if (isEn) {
    return `You are a world-class Visual Prompt Reverse Engineer & Generative Art Director specializing in forensic image deconstruction for next-generation diffusion models (FLUX.1, Midjourney v6.1, SDXL, Ideogram 2.0).

Analyze the input image thoroughly and deconstruct all discernible visual, spatial, and artistic dimensions into structured, high-density building blocks, followed by an evocative, cohesive Master Prompt.

Return a STRICT, parseable JSON object with these keys:

1. "subject": An array of rich, descriptive feature phrases (in English) detailing primary subjects, characters, actions, micro-expressions, garments, layered clothing textures, and distinctive material attributes. (Adapt item count naturally to the image's inherent complexity. Never output flat single words like "girl" or "car"; use dense semantic chunks like "thoughtful young woman with wispy auburn hair and subtle freckles across the nose bridge", "vintage tailored wool trench coat with brass buttons").
2. "style": An array of precise phrases (in English) capturing the exact artistic medium, genre, rendering technique, aesthetic school, or master artist homage (e.g., "35mm analog street photography", "subtle film grain texture", "cyberpunk concept art with gouache brushstrokes", "cinematic editorial color grade").
3. "lighting": An array of evocative phrases (in English) identifying key light sources, ambient falloff, shadow density, color temperature, and atmospheric light effects (e.g., "golden hour rim light accentuating silhouettes", "diffused softbox illumination", "volumetric Tyndall beams cutting through mist", "cool cyan ambient shadows contrasting warm amber key").
4. "composition": An array of technical phrases (in English) defining camera optics, shot scale, vantage angle, framing geometry, and depth of field (e.g., "close-up eye-level portrait", "85mm f/1.4 shallow depth of field with creamy circular bokeh", "low-angle dynamic Dutch tilt", "strict rule of thirds with negative headroom space").
5. "masterPrompt": A seamless, vivid, cinematic English paragraph (typically 80-150 words) engineered specifically for FLUX.1 (T5 text encoder) and Midjourney v6.1.
   Master Prompt Engineering Standards:
   - Front-load the core subject, action, and key visual anchor.
   - Weave subject, garment, environmental spatial depth, lighting mood, camera optics, and typography into a fluid, human-like descriptive narrative prose.
   - If the image contains prominent text, embed it naturally in quotes (e.g., 'with bold typography "..." centered at top').
   - BAN generic buzzwords and AI slop: DO NOT use "photorealistic", "hyperrealistic", "masterpiece", "8k", "trending on artstation", "ultra high res", or "Unreal Engine".
   - Convey quality through tangible photographic and artistic language (authentic optical qualities, film stock, natural surface imperfections, tactile textures).
   - If appropriate for photography, append technical specs like "shot on 35mm film, Kodak Portra 400 --v 6.1 --style raw" or camera/lens parameters.

Strict Output Rules:
- Return ONLY the JSON object.
- NO conversational markdown, NO preambles, NO explanation outside the JSON.`;
  }

  return `你是一位世界顶级的 AI 视觉反推工程师兼生图艺术总监，精通将任何图像高保真反解为适用于新一代生成模型（FLUX.1、Midjourney v6.1、SDXL、Ideogram 2.0）的高维提示词。

请深入解构输入画面的全部视觉与空间维度，提取高信息密度的特征维度，并重构成一段极具画面美感与细节张力的 Master Prompt。

必须返回且仅返回一个严格合法的 JSON 对象，包含以下核心键：

1. "subject": 丰富详实的中文特征短语数组，根据画面复杂度自适应提取，详尽刻画核心主体、动态姿态、微表情、发型特征、穿搭层叠结构与材质纹理。（严禁输出“女人”、“汽车”等孤立空洞的名词；必须使用高信息密度的描述短语，例如：“略带从容微笑的齐肩黑发东亚女性”、“复古质感的高领粗针织米白毛衣”、“微风拂动的发丝与清晰可见的真实皮肤纹理”）。
2. "style": 精准的中文风格与媒介短语数组，准确定位艺术媒介、流派风格、渲染技法或艺术风格（例如：“35mm 胶片街头纪实摄影”、“细腻胶片颗粒感”、“赛博朋克概念设计与厚涂笔触”、“电影质感冷暖分级调色”）。
3. "lighting": 精细的中文光影与氛围短语数组，解析主光源方向、阴影层次、环境色调与丁达尔大气效应（例如：“侧逆光打亮发丝轮廓”、“漫反射柔光箱带来通透面部明暗过渡”、“窗隙倾泻而下的丁达尔光束”、“冷暖对冲的环境光漫射”）。
4. "composition": 专业的中文镜头与构图短语数组，阐述机位视角、景别、镜头焦段、光圈景深及构图法则（例如：“中景平视肖像”、“85mm f/1.4 浅景深与奶油般背景虚化”、“低机位微仰角英雄视点”、“经典三分法构图与极具呼吸感的留白”）。
5. "masterPrompt": 一段专供 FLUX.1 或 Midjourney v6.1 一键生图的完整自然语言英文连贯段落（80~150 词）。
   Master Prompt 的构建规范：
   - 核心主体与核心动态必须前置（Front-loading）；
   - 以自然叙事散文（Narrative Prose）的方式将主体细节、服饰质感、空间进深、光影氛围与镜头规格天衣无缝地融为一体；
   - 若画面包含显著文字，请使用双引号自然融入排版描述（例如：prominent typography "..." centered at top）；
   - 坚决杜绝低级 AI 噪词：严禁出现 "photorealistic", "hyperrealistic", "masterpiece", "8k", "trending on artstation", "ultra high res", "Unreal Engine 5"；
   - 通过真实的摄影物理属性（如 "Kodak Portra 400", "natural skin imperfections", "subtle chromatic aberration", "tactile fabric weave"）来自然呈现极致画质；
   - 摄影类画面文末可自然补充如 "shot on 35mm film, Hasselblad, natural lighting --v 6.1 --style raw" 等关键参数。

输出硬性要求：
- 只能输出纯 JSON，严禁在 JSON 前后输出任何对话文字或解释性 Markdown。`;
}

export const BUILTIN_REVERSE_PROMPT_PRESETS: ReversePromptPreset[] = [
  {
    id: PRESET_PURE_AESTHETICS_ID,
    nameZh: '纯视觉生图复刻',
    nameEn: 'Pure Visual Reproduction',
    descZh: '专为摄影大片、艺术插画与概念设计打造，深度解构微观细节、光影物理、镜头光学与高保真生图',
    descEn: 'High-density visual deconstruction for photography, illustration, and cinematic prompt synthesis',
    systemPromptZh: getSystemPromptForPureAesthetics('zh'),
    systemPromptEn: getSystemPromptForPureAesthetics('en'),
    isBuiltin: true,
  },
];

export function getSystemPrompt(
  language: Language = 'zh',
  presetId: string = PRESET_PURE_AESTHETICS_ID,
  customPrompt?: string
): string {
  if (customPrompt && customPrompt.trim()) {
    return customPrompt.trim();
  }
  return getSystemPromptForPureAesthetics(language);
}

export const DEFAULT_SYSTEM_PROMPT = getSystemPrompt('zh', PRESET_PURE_AESTHETICS_ID);

/**
 * 工业级容错 JSON 修复与解析器
 * 专门应对多模态大模型可能出现的：未闭合截断、思维链夹杂、未转义引号、尾随逗号等问题
 */
export function repairAndParseJson(input: string): any {
  if (!input || !input.trim()) return null;

  // 1. 尝试直接标准解析
  try {
    return JSON.parse(input);
  } catch {}

  // 2. 清洗尾随逗号 (例如 [1, 2,] 或 {"a": 1,})
  let text = input.replace(/,\s*([\]}])/g, '$1').trim();
  try {
    return JSON.parse(text);
  } catch {}

  // 3. 栈状态机补全未闭合的括号与引号
  let inString = false;
  let isEscaped = false;
  const stack: string[] = [];

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (isEscaped) {
      isEscaped = false;
      continue;
    }
    if (char === '\\') {
      isEscaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (!inString) {
      if (char === '{' || char === '[') {
        stack.push(char);
      } else if (char === '}') {
        if (stack.length && stack[stack.length - 1] === '{') stack.pop();
      } else if (char === ']') {
        if (stack.length && stack[stack.length - 1] === '[') stack.pop();
      }
    }
  }

  // 若处于未闭合的字符串中，先补上引号
  if (inString) {
    text += '"';
  }

  // 清除末尾悬空的未闭合/未完成键名（如 `,"boundingP"` 或 `"key":`）
  text = text.replace(/,\s*"[^"]*"\s*$/g, '');
  text = text.replace(/:\s*$/g, ': null');
  text = text.replace(/,\s*$/g, '');

  // 逆序补齐未闭合的括号
  while (stack.length > 0) {
    const top = stack.pop();
    if (top === '{') text += '}';
    else if (top === '[') text += ']';
  }

  // 再次清洗尾随逗号并尝试解析
  text = text.replace(/,\s*([\]}])/g, '$1');
  try {
    return JSON.parse(text);
  } catch {}

  // 4. 正则字段抢救模式（Regex Field Harvester）
  // 即使整体 JSON 严重损毁，也尽最大努力从文本中抢救已经生成的字段
  const harvested: Record<string, any> = {};

  // 4.1 抢救文案槽位 textSlots
  const originalTextMatches = Array.from(input.matchAll(/"originalText"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/gi));
  if (originalTextMatches.length > 0) {
    harvested.textSlots = originalTextMatches.map((m, idx) => {
      const rawMatch = m[1] || '';
      const textVal = rawMatch.replace(/\\"/g, '"');
      return {
        id: `slot_${idx + 1}`,
        role: 'headline',
        originalText: textVal,
      };
    });
  }

  // 4.2 抢救主提示词 masterPrompt
  const masterMatch = input.match(/"masterPrompt"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/i);
  if (masterMatch && masterMatch[1]) {
    harvested.masterPrompt = masterMatch[1].replace(/\\"/g, '"');
  }

  // 4.3 抢救画面主体 subject
  const subjectMatch = input.match(/"subject"\s*:\s*\[([\s\S]*?)\]/i);
  if (subjectMatch && subjectMatch[1]) {
    harvested.subject = Array.from(subjectMatch[1].matchAll(/"([^"]+)"/g)).map((m) => m[1]);
  }

  // 4.4 抢救艺术风格 style
  const styleMatch = input.match(/"style"\s*:\s*\[([\s\S]*?)\]/i);
  if (styleMatch && styleMatch[1]) {
    harvested.style = Array.from(styleMatch[1].matchAll(/"([^"]+)"/g)).map((m) => m[1]);
  }

  if (Object.keys(harvested).length > 0) {
    return harvested;
  }

  return null;
}

export function extractJsonFromModelOutput(rawText: string): string | null {
  if (!rawText || !rawText.trim()) return null;

  // 1. 移除模型可能输出的思维链标签 <think>...</think>
  let textWithoutThinking = rawText.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  textWithoutThinking = textWithoutThinking.replace(/<thought>[\s\S]*?<\/thought>/gi, '').trim();

  const candidates = [textWithoutThinking, rawText].filter(Boolean);

  for (const text of candidates) {
    // 2. 尝试从 ```json ... ``` 代码块中提取（支持未闭合的代码块）
    const markdownMatch = text.match(/```(?:json)?\s*([\s\S]*?)(?:```|$)/i);
    if (markdownMatch && markdownMatch[1]) {
      const codeContent = markdownMatch[1].trim();
      const first = codeContent.indexOf('{');
      if (first !== -1) {
        const last = codeContent.lastIndexOf('}');
        return last > first ? codeContent.slice(first, last + 1) : codeContent.slice(first);
      }
    }

    // 3. 尝试从文本中定位最外层的 {
    const firstBrace = text.indexOf('{');
    if (firstBrace !== -1) {
      const lastBrace = text.lastIndexOf('}');
      return lastBrace > firstBrace ? text.slice(firstBrace, lastBrace + 1).trim() : text.slice(firstBrace).trim();
    }
  }

  return null;
}

export function parseStructuredPromptResponse(
  rawText: string,
  language: Language = 'zh',
  modelName?: string
): StructuredPromptOutput {
  const isEn = language === 'en';
  const extracted = extractJsonFromModelOutput(rawText);
  let parsed = extracted ? repairAndParseJson(extracted) : null;

  // 如果提取解析失败或解析结果缺少关键字段，在 rawText 全文上执行正则字段抢救并合并
  const rawSalvaged = repairAndParseJson(rawText);
  if (rawSalvaged && typeof rawSalvaged === 'object') {
    parsed = { ...rawSalvaged, ...(parsed || {}) };
  }

  if (parsed && typeof parsed === 'object') {
    let rawSlots: any[] = [];
    if (Array.isArray(parsed.textSlots)) {
      rawSlots = parsed.textSlots;
    } else if (parsed.originalText) {
      // 容错：模型仅输出了单个 slot 对象或被截取为单 slot
      rawSlots = [parsed];
    }

    const seenTexts = new Set<string>();
    const textSlots: TextElementSlot[] = rawSlots
      .map((slot: any, idx: number) => {
        const rawTextStr = String(slot.originalText || slot.text || '')
          .replace(/\\n/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        const userTextStr = String(slot.userText || rawTextStr)
          .replace(/\\n/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        return {
          id: String(slot.id || `slot_${idx + 1}`),
          role: ['headline', 'subheadline', 'body_text', 'badge_slogan', 'other'].includes(slot.role)
            ? slot.role
            : 'headline',
          originalText: rawTextStr,
          userText: userTextStr,
          fontStyle: slot.fontStyle ? String(slot.fontStyle).trim() : undefined,
          colorAndEffects: slot.colorAndEffects ? String(slot.colorAndEffects).trim() : undefined,
          layoutPlacement: slot.layoutPlacement ? String(slot.layoutPlacement).trim() : undefined,
          casing: slot.casing ? String(slot.casing).trim() : undefined,
        };
      })
      .filter((slot: TextElementSlot) => {
        if (!slot.originalText) return false;
        // 自动去重：避免模型重复输出同一标题
        if (seenTexts.has(slot.originalText)) return false;
        seenTexts.add(slot.originalText);
        return true;
      });

    let subject = Array.isArray(parsed.subject)
      ? parsed.subject.map(String).filter(Boolean)
      : [String(parsed.subject || '')].filter(Boolean);
    let style = Array.isArray(parsed.style)
      ? parsed.style.map(String).filter(Boolean)
      : [String(parsed.style || '')].filter(Boolean);
    const lighting = Array.isArray(parsed.lighting)
      ? parsed.lighting.map(String).filter(Boolean)
      : [String(parsed.lighting || '')].filter(Boolean);
    const composition = Array.isArray(parsed.composition)
      ? parsed.composition.map(String).filter(Boolean)
      : [String(parsed.composition || '')].filter(Boolean);

    // 智能兜底：若模型漏掉主体，优先使用提取出的首个文案作为主体描述，杜绝大片留白
    if (subject.length === 0 && textSlots.length > 0 && textSlots[0]?.originalText) {
      subject = [textSlots[0].originalText];
    }
    // 智能兜底：若模型漏掉画风，自动赋予视觉插画基础积木，杜绝“0个风格特征”
    if (style.length === 0 && textSlots.length > 0) {
      style = isEn ? ['Graphic Design Poster', 'Digital Illustration'] : ['平面海报设计', '数码插画'];
    }

    let masterPrompt = String(parsed.masterPrompt || '').trim();
    if (!masterPrompt && textSlots.length > 0) {
      const textSummary = textSlots.map((s) => `"${s.originalText}"`).join(', ');
      const subSummary = subject.join(', ');
      masterPrompt = `Visual poster design featuring ${subSummary || 'typography'}, with prominent text ${textSummary}`;
    }

    let templatePrompt = parsed.templatePrompt ? String(parsed.templatePrompt) : undefined;
    if (!templatePrompt && masterPrompt && textSlots.length > 0) {
      let templated = masterPrompt;
      for (const slot of textSlots) {
        if (slot.originalText && templated.includes(slot.originalText)) {
          templated = templated.replace(slot.originalText, `{{${slot.id}}}`);
        }
      }
      if (templated !== masterPrompt) {
        templatePrompt = templated;
      }
    }

    const hasAnyContent =
      textSlots.length > 0 ||
      subject.length > 0 ||
      style.length > 0 ||
      lighting.length > 0 ||
      composition.length > 0 ||
      masterPrompt.length > 0;

    if (hasAnyContent) {
      return {
        subject,
        style,
        lighting,
        composition,
        masterPrompt,
        textSlots: textSlots.length > 0 ? textSlots : undefined,
        templatePrompt,
      };
    }
  }

  // 检查是否包含模型典型的“拒绝看图/纯文本模型”回答
  const lower = rawText.toLowerCase();
  const rejectionSignatures = [
    '无法查看图片',
    '无法识别图片',
    '不能查看图片',
    '看不到图片',
    '无法直接浏览图片',
    '纯文本模型',
    '语言模型，无法',
    '无法处理图像',
    '作为一个文本',
    'i cannot see images',
    'cannot view images',
    'text-based ai',
    'unable to process image',
    'cannot see the image',
  ];
  if (rejectionSignatures.some((sig) => rawText.includes(sig) || lower.includes(sig))) {
    throw new Error(
      isEn
        ? `Model "${modelName || 'Current model'}" cannot process images. Please check permissions or switch model.`
        : `当前模型「${modelName || '所选模型'}」未开启看图权限或不支持图片输入，请检查模型多模态能力。`
    );
  }

  // 检查是否为破损的 JSON 结构（绝对不要当作自然语言塞入 subject！）
  const cleanText = rawText.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  const looksLikeJson = cleanText.startsWith('{') || cleanText.startsWith('[') || cleanText.includes('"textSlots"') || cleanText.includes('"masterPrompt"');
  if (looksLikeJson) {
    throw new Error(
      isEn
        ? `Model returned an incomplete or damaged JSON structure. Please click "Re-analyze" to try again.`
        : `模型输出的数据结构不完整或受损，请点击右侧「重新反推」再试一次。`
    );
  }

  // 如果模型返回了一段有意义的自然语言文本描述（而不是结构化 JSON）
  if (cleanText.length >= 10) {
    return {
      subject: [cleanText.slice(0, 60)],
      style: [],
      lighting: [],
      composition: [],
      masterPrompt: cleanText,
    };
  }

  throw new Error(
    isEn
      ? `Failed to parse structured prompt from model output. Please try again.`
      : `模型返回的数据未能成功解析为提示词，请重试或检查模型输出。`
  );
}

/**
 * Reassemble or update the Master Prompt dynamically based on user-edited text slots
 * and visual subject modifications.
 */
export function assembleMasterPrompt(options: {
  promptResult: {
    subject?: string[];
    style?: string[];
    lighting?: string[];
    composition?: string[];
    masterPrompt?: string;
    textSlots?: TextElementSlot[];
    templatePrompt?: string;
  };
  userTextMap?: Record<string, string>;
  customSubject?: string;
}): string {
  const {
    promptResult,
    userTextMap = {},
    customSubject,
  } = options;
  const textSlots = promptResult.textSlots || [];
  const template = promptResult.templatePrompt;

  const defaultSubStr = (promptResult.subject?.join(', ') || '').trim();
  const isSubjectEdited =
    customSubject !== undefined && customSubject.trim() !== '' && customSubject.trim() !== defaultSubStr;

  // 1. If we have a templatePrompt and textSlots, do dynamic slot replacement
  if (template && textSlots.length > 0) {
    let replaced = template;
    for (const slot of textSlots) {
      const newText = (userTextMap[slot.id] ?? slot.userText ?? slot.originalText ?? '').trim();
      const placeholderRegex = new RegExp(`\\{\\{\\s*${slot.id}\\s*\\}\\}`, 'g');
      replaced = replaced.replace(placeholderRegex, newText);
    }
    // Also replace verbatim original text occurrences in quotes if slot token wasn't present
    for (const slot of textSlots) {
      const newText = (userTextMap[slot.id] ?? slot.userText ?? slot.originalText ?? '').trim();
      if (slot.originalText && slot.originalText !== newText) {
        replaced = replaced.split(`"${slot.originalText}"`).join(`"${newText}"`);
      }
    }

    // 若用户修改了主体描述，同步前置融入模板提示词
    if (isSubjectEdited && customSubject) {
      replaced = `${customSubject.trim()}, ${replaced}`;
    }

    return replaced;
  }

  // 2. High-Fidelity Master Prompt Mode (Pure Visual Reproduction or LLM dense narrative)
  const master = (promptResult.masterPrompt || '').trim();

  // If a high-density master prompt exists, treat it as the primary baseline for generative models
  if (master) {
    if (!isSubjectEdited) {
      return master;
    }
    return `${customSubject!.trim()}, ${master}`;
  }

  // 3. Fallback: Synthesize from components when no masterPrompt exists
  const sub = (customSubject !== undefined ? customSubject : defaultSubStr).trim();
  const textClauses = textSlots
    .map((slot) => {
      const text = (userTextMap[slot.id] ?? slot.userText ?? slot.originalText ?? '').trim();
      if (!text) return '';
      const styleDesc = slot.fontStyle ? `in ${slot.fontStyle}` : '';
      const placeDesc = slot.layoutPlacement ? `at ${slot.layoutPlacement}` : '';
      return `the text "${text}" ${styleDesc} ${placeDesc}`.replace(/\s+/g, ' ').trim();
    })
    .filter(Boolean);

  const styles = promptResult.style || [];
  const lightings = promptResult.lighting || [];
  const comps = promptResult.composition || [];

  const parts: string[] = [];
  if (sub) parts.push(sub);
  if (textClauses.length > 0) parts.push(`featuring ${textClauses.join(', and ')}`);
  if (styles.length > 0) parts.push(styles.join(', '));
  if (lightings.length > 0) parts.push(lightings.join(', '));
  if (comps.length > 0) parts.push(comps.join(', '));

  return parts.join(', ');
}

/**
 * Format structured dimensions into a clean, human-readable list for copying
 */
export function formatStructuredPromptList(options: {
  textSlots?: TextElementSlot[];
  userTextMap?: Record<string, string>;
  subject?: string[] | string;
  selectedStyles?: Set<string> | string[];
  selectedLighting?: Set<string> | string[];
  selectedComposition?: Set<string> | string[];
  language?: Language;
}): string {
  const {
    textSlots = [],
    userTextMap = {},
    subject,
    selectedStyles,
    selectedLighting,
    selectedComposition,
    language = 'zh',
  } = options;
  const isEn = language === 'en';
  const blocks: string[] = [];

  // 1. Text Slots
  if (textSlots.length > 0) {
    const textLines = textSlots.map((slot) => {
      const text = (userTextMap[slot.id] ?? slot.userText ?? slot.originalText ?? '').trim();
      const meta = [slot.fontStyle, slot.colorAndEffects, slot.layoutPlacement].filter(Boolean).join(' · ');
      return meta ? `"${text}" (${meta})` : `"${text}"`;
    });
    blocks.push(`${isEn ? '【Copywriting & Text】' : '【画面文案】'}\n${textLines.join('\n')}`);
  }

  // 2. Art Style
  const styles = selectedStyles ? Array.from(selectedStyles) : [];
  if (styles.length > 0) {
    blocks.push(`${isEn ? '【Art Style】' : '【艺术风格】'}\n${styles.join(', ')}`);
  }

  // 3. Composition
  const comps = selectedComposition ? Array.from(selectedComposition) : [];
  if (comps.length > 0) {
    blocks.push(`${isEn ? '【Composition】' : '【画面构图】'}\n${comps.join(', ')}`);
  }

  // 4. Lighting
  const lightings = selectedLighting ? Array.from(selectedLighting) : [];
  if (lightings.length > 0) {
    blocks.push(`${isEn ? '【Lighting & Color】' : '【光影色彩】'}\n${lightings.join(', ')}`);
  }

  // 5. Subject
  const subStr = Array.isArray(subject) ? subject.join(', ') : (subject || '').trim();
  if (subStr) {
    blocks.push(`${isEn ? '【Visual Subject】' : '【画面主体】'}\n${subStr}`);
  }

  return blocks.join('\n\n');
}

export function blobToBase64(blob: Blob): Promise<string> {
  if (typeof FileReader === 'undefined') {
    return blob.arrayBuffer().then((buf) => {
      const b64 = Buffer.from(buf).toString('base64');
      const mime = blob.type || 'image/png';
      return `data:${mime};base64,${b64}`;
    });
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      resolve(result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export type ChatCompletionMessage = {
  role: 'system' | 'user' | 'assistant';
  content: unknown;
};

function assertVisionChannelConfigured(settings: UserSettings, isProManaged: boolean): void {
  if (settings.visionChannels && !isProManaged && (!settings.visionChannels.length || !settings.model.trim())) {
    throw new Error('请先在设置中添加视觉反推渠道并选择模型');
  }
}

export async function completeChatWithAI(
  messages: ChatCompletionMessage[],
  settings: UserSettings,
  targetModel?: string,
  signal?: AbortSignal
): Promise<string> {
  const apiKey = sanitizeHttpHeaderToken((settings.apiKey || '').trim());
  const licenseActive = Boolean(settings.proMembership?.isPro && !isProExpired(settings.proMembership));
  const accountToken = !apiKey && !licenseActive ? await getAccountAccessToken() : null;
  const isProManaged = !apiKey && (licenseActive || Boolean(accountToken));
  assertVisionChannelConfigured(settings, isProManaged);
  if (!apiKey && !isProManaged) {
    throw new Error('未配置视觉模型 API Key');
  }
  const endpoint = isProManaged
    ? (settings.hostedProxyUrl || DEFAULT_HOSTED_PROXY_URL)
    : `${sanitizeHttpUrl(settings.baseUrl || 'https://api.openai.com/v1')}/chat/completions`;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (isProManaged && licenseActive && settings.proMembership?.licenseKey) {
    Object.assign(headers, buildHostedProxyHeaders(settings.proMembership.licenseKey, 'vision'));
  } else if (isProManaged && accountToken) {
    Object.assign(headers, accountHostedHeaders(accountToken, 'vision'));
  } else {
    headers.Authorization = `Bearer ${apiKey}`;
  }
  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    signal,
    body: JSON.stringify({
      model: targetModel || settings.model,
      messages,
      temperature: 0.2,
      max_tokens: 8192,
    }),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    const creditError = accountToken ? hostedCreditError(response.status, detail) : null;
    if (creditError) throw creditError;
    throw new Error(`API 请求失败 (${response.status}): ${detail || response.statusText}`);
  }
  if (accountToken) await readCreditBalance(response.headers);
  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  const text = typeof content === 'string'
    ? content
    : Array.isArray(content)
      ? content.map((item: any) => typeof item === 'string' ? item : item?.text || '').join('\n')
      : '';
  if (!text.trim()) throw new Error('模型未返回文本内容');
  return text.trim();
}

export async function analyzeImageWithAI(
  imageBlob: Blob,
  settings: UserSettings,
  targetModel?: string,
  systemPromptOverride?: string,
  signal?: AbortSignal
): Promise<Omit<PromptResult, 'id' | 'itemId' | 'createdAt'>> {
  return withRequestTimeout(
    signal,
    ANALYSIS_REQUEST_TIMEOUT_MS,
    `视觉反推请求超时（超过 ${Math.round(ANALYSIS_REQUEST_TIMEOUT_MS / 1000)} 秒未响应），请稍后重试或更换模型`,
    (requestSignal) =>
      runImageAnalysis(imageBlob, settings, targetModel, systemPromptOverride, requestSignal)
  );
}

async function runImageAnalysis(
  imageBlob: Blob,
  settings: UserSettings,
  targetModel: string | undefined,
  systemPromptOverride: string | undefined,
  signal: AbortSignal
): Promise<Omit<PromptResult, 'id' | 'itemId' | 'createdAt'>> {
  const startTime = performance.now();
  // 仅在外发边界做瞬态压缩（反推专用：最长边 1280px），库内原图保持不变（ADR 0007）
  const base64Url = await prepareVisionImageForAi(imageBlob);

  const rawKey = (settings.apiKey || '').trim();
  let apiKey = sanitizeHttpHeaderToken(rawKey);
  let rawBaseUrl = (settings.baseUrl || 'https://api.deepseek.com/v1').trim();
  let model = (targetModel || settings.model || 'deepseek-chat').trim();

  const isProActive = Boolean(
    settings.proMembership?.isPro && !isProExpired(settings.proMembership)
  );

  const accountToken = !apiKey && !isProActive ? await getAccountAccessToken() : null;
  const isProManaged = !apiKey && (isProActive || Boolean(accountToken));
  const licenseKey = isProManaged && isProActive ? settings.proMembership?.licenseKey : undefined;
  assertVisionChannelConfigured(settings, isProManaged);

  if (!isProManaged && !apiKey) {
    throw new Error('未配置视觉反推 API Key，请在设置中配置凭据，或登录账号使用积分托管');
  }

  if (apiKey && /[^\x20-\x7E]/.test(apiKey)) {
    throw new Error('API Key 格式无效（包含中文字符或非 ASCII 编码），请在设置中重新粘贴纯英文 Key');
  }

  const endpoint = isProManaged
    ? (settings.hostedProxyUrl || DEFAULT_HOSTED_PROXY_URL)
    : `${sanitizeHttpUrl(rawBaseUrl)}/chat/completions`;

  const activeSystemPrompt =
    systemPromptOverride ||
    getSystemPrompt(settings.language || 'zh', settings.reversePromptPresetId, settings.customReversePrompt);

  const payload = {
    model,
    messages: [
      {
        role: 'system',
        content: activeSystemPrompt,
      },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'Please reverse-engineer this image into structured prompt dimensions and provide the master prompt.',
          },
          {
            type: 'image_url',
            image_url: {
              url: base64Url,
              detail: 'high',
            },
          },
        ],
      },
    ],
    temperature: 0.2,
    max_tokens: 8192,
  };

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (isProManaged && licenseKey) {
    Object.assign(headers, buildHostedProxyHeaders(licenseKey, 'vision'));
  } else if (isProManaged && accountToken) {
    Object.assign(headers, accountHostedHeaders(accountToken, 'vision'));
  } else if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  return sendAnalysisRequest(endpoint, headers, payload, signal, {
    useAccountCredits: Boolean(isProManaged && !licenseKey && accountToken),
    isProManaged,
    language: settings.language || 'zh',
    model,
    startTime,
  });
}

async function sendAnalysisRequest(
  endpoint: string,
  headers: Record<string, string>,
  payload: unknown,
  signal: AbortSignal,
  ctx: { isProManaged: boolean; useAccountCredits: boolean; language: Language; model: string; startTime: number }
): Promise<Omit<PromptResult, 'id' | 'itemId' | 'createdAt'>> {
  const { isProManaged, useAccountCredits, model, startTime } = ctx;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    signal,
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    const creditError = useAccountCredits ? hostedCreditError(response.status, errText) : null;
    if (creditError) throw creditError;
    let parsedMessage = '';
    try {
      const errObj = JSON.parse(errText);
      parsedMessage = errObj.error?.message || errObj.msg || errObj.error || '';
    } catch {}

    if (response.status === 401 || response.status === 403) {
      if (isProManaged) {
        throw new Error(parsedMessage || '官方算力托管额度已用尽或激活码已失效，请在设置中续费或切换为自备 Key');
      }
    }
    throw new Error(`API 请求失败 (${response.status}): ${parsedMessage || errText || response.statusText}`);
  }

  if (useAccountCredits) await readCreditBalance(response.headers);
  const visionQuotaHeader = response.headers?.get?.('X-Remaining-Vision-Quota');
  const imageQuotaHeader = response.headers?.get?.('X-Remaining-Image-Quota');
  const quotaHeader = response.headers?.get?.('X-Remaining-Quota');
  if (visionQuotaHeader || imageQuotaHeader || quotaHeader) {
    const vNum = visionQuotaHeader ? parseInt(visionQuotaHeader, 10) : undefined;
    const iNum = imageQuotaHeader ? parseInt(imageQuotaHeader, 10) : undefined;
    const gNum = quotaHeader ? parseInt(quotaHeader, 10) : undefined;
    syncDualRemainingQuota({
      visionRemaining: typeof vNum === 'number' && !isNaN(vNum) ? vNum : undefined,
      imageRemaining: typeof iNum === 'number' && !isNaN(iNum) ? iNum : undefined,
      generalRemaining: typeof gNum === 'number' && !isNaN(gNum) ? gNum : undefined,
    }).catch(() => {});
  }

  const data = await response.json();
  const message = data.choices?.[0]?.message;

  const contentStr =
    typeof message?.content === 'string'
      ? message.content
      : Array.isArray(message?.content)
      ? message.content.map((c: any) => (typeof c === 'string' ? c : c?.text || '')).join('\n')
      : '';
  const reasoningStr =
    typeof message?.reasoning_content === 'string' ? message.reasoning_content : '';

  let rawContent = '';
  if (contentStr.trim() && reasoningStr.trim()) {
    rawContent = `<think>${reasoningStr.trim()}</think>\n${contentStr.trim()}`;
  } else {
    rawContent = contentStr.trim() || reasoningStr.trim();
  }

  const parsed = parseStructuredPromptResponse(rawContent, ctx.language, model);
  const latencyMs = Math.round(performance.now() - startTime);

  return {
    model: model,
    subject: parsed.subject,
    style: parsed.style,
    lighting: parsed.lighting,
    composition: parsed.composition,
    masterPrompt: parsed.masterPrompt,
    textSlots: parsed.textSlots,
    templatePrompt: parsed.templatePrompt,
    latencyMs,
  };
}

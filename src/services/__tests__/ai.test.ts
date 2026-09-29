import { describe, it, expect, vi } from 'vitest';
import {
  parseStructuredPromptResponse,
  getSystemPrompt,
  analyzeImageWithAI,
  completeChatWithAI,
  assembleMasterPrompt,
  formatStructuredPromptList,
  PRESET_DECONSTRUCT_TEXT_ID,
  PRESET_PURE_AESTHETICS_ID,
} from '../ai';
import type { UserSettings } from '../../types';
import { ANALYSIS_REQUEST_TIMEOUT_MS } from '../../utils/requestTimeout';

describe('vision channel requests', () => {
  it('does not send a request using an old model when the active channel has none', async () => {
    const settings: UserSettings = {
      apiKey: 'test-key', baseUrl: 'https://private.example/v1', model: '',
      autoAnalyzeOnCapture: false, language: 'zh',
      visionChannels: [{ id: 'custom', name: 'Custom', providerId: 'custom', apiKey: 'test-key', baseUrl: 'https://private.example/v1', model: '' }],
      activeVisionChannelId: 'custom',
    };
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    try {
      await expect(completeChatWithAI([], settings, 'old-model')).rejects.toThrow(/添加视觉反推渠道并选择模型/);
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });
});

describe('AI Service - parseStructuredPromptResponse', () => {
  it('should cleanly parse raw JSON string', () => {
    const raw = JSON.stringify({
      subject: ['猫', '机械零件'],
      style: ['虚幻引擎5'],
      lighting: ['体积光'],
      composition: ['特写'],
      masterPrompt: 'Mechanical cat with gears, UE5 render, volumetric lighting, macro shot'
    });

    const parsed = parseStructuredPromptResponse(raw);
    expect(parsed.subject).toEqual(['猫', '机械零件']);
    expect(parsed.style).toEqual(['虚幻引擎5']);
    expect(parsed.masterPrompt).toContain('Mechanical cat');
  });

  it('should cleanly parse JSON wrapped in markdown codeblocks', () => {
    const rawWithMarkdown = `
Here is the visual prompt breakdown:
\`\`\`json
{
  "subject": ["未来飞行汽车", "发光排气管"],
  "style": ["赛博朋克 2077"],
  "lighting": ["霓虹反射", "雨夜地面倒影"],
  "composition": ["广角俯拍", "对角线构图"],
  "masterPrompt": "Futuristic flying car, glowing thrusters, cyberpunk 2077 aesthetic, wet neon reflections, wide overhead diagonal angle"
}
\`\`\`
Hope this helps!
`;
    const parsed = parseStructuredPromptResponse(rawWithMarkdown);
    expect(parsed.subject).toEqual(['未来飞行汽车', '发光排气管']);
    expect(parsed.style).toEqual(['赛博朋克 2077']);
    expect(parsed.composition).toEqual(['广角俯拍', '对角线构图']);
  });

  it('should cleanly strip <think>...</think> chain-of-thought tags and parse JSON', () => {
    const rawWithThinking = `
<think>
Let's analyze this image carefully.
The subject is Grok-chan with anime cat ears.
There is a title "Grok娘带你看X新功能".
I should structure this into the required JSON schema.
</think>
\`\`\`json
{
  "textSlots": [
    {
      "id": "slot_1",
      "role": "headline",
      "originalText": "Grok娘带你看X新功能",
      "fontStyle": "漫画艺术字"
    }
  ],
  "subject": ["Grok娘", "金发双马尾猫娘"],
  "style": ["二次元四格漫画"],
  "lighting": ["明亮日系色调"],
  "composition": ["四宫格排版"],
  "masterPrompt": "Four-panel anime comic strip featuring Grok-chan with cat ears and headline \\"Grok娘带你看X新功能\\""
}
\`\`\`
`;
    const parsed = parseStructuredPromptResponse(rawWithThinking);
    expect(parsed.textSlots?.[0]?.originalText).toBe('Grok娘带你看X新功能');
    expect(parsed.subject).toContain('Grok娘');
    expect(parsed.style).toContain('二次元四格漫画');
  });

  it('should throw clear error when model explicitly refuses image input', () => {
    const refusalText = '抱歉，作为一个纯文本模型，我无法直接查看或处理图片。';
    expect(() => parseStructuredPromptResponse(refusalText, 'zh', 'deepseek-chat')).toThrow(
      '未开启看图权限或不支持图片输入'
    );
  });

  it('should gracefully handle non-JSON descriptive text without fake filler keywords', () => {
    const rawText = "This is a beautiful portrait of a girl with sunlight streaming through leaves, shot on 35mm film.";
    const parsed = parseStructuredPromptResponse(rawText);
    expect(parsed.masterPrompt).toBe(rawText);
    expect(parsed.subject.length).toBeGreaterThanOrEqual(1);
    expect(parsed.style).toEqual([]);
  });

  it('should adapt system prompt instructions for zh and en locales', () => {
    const defaultZh = getSystemPrompt('zh');
    expect(defaultZh).toContain('丰富详实的中文特征短语数组');
    expect(defaultZh).toContain('FLUX.1、Midjourney v6.1');

    const zhPrompt = getSystemPrompt('zh', PRESET_PURE_AESTHETICS_ID);
    expect(zhPrompt).toContain('丰富详实的中文特征短语数组');
    expect(zhPrompt).toContain('FLUX.1、Midjourney v6.1');

    const enPrompt = getSystemPrompt('en', PRESET_PURE_AESTHETICS_ID);
    expect(enPrompt).toContain('forensic image deconstruction');
    expect(enPrompt).toContain('engineered specifically for FLUX.1');
    expect(enPrompt).toContain('BAN generic buzzwords and AI slop');

    const deconstructZh = getSystemPrompt('zh', PRESET_DECONSTRUCT_TEXT_ID);
    expect(deconstructZh).toContain('丰富详实的中文特征短语数组');
    expect(deconstructZh).not.toContain('"textSlots"');
  });

  it('should prioritize targetModel override in analyzeImageWithAI', async () => {
    const originalFetch = globalThis.fetch;
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                subject: ['测试主体'],
                style: ['测试风格'],
                lighting: ['测试光影'],
                composition: ['测试构图'],
                masterPrompt: 'Test master prompt',
              }),
            },
          },
        ],
      }),
    });
    globalThis.fetch = mockFetch as any;

    const mockSettings: UserSettings = {
      apiKey: 'sk-test-vision-key',
      baseUrl: 'https://api.openai.com/v1',
      model: 'default-vision-model',
      autoAnalyzeOnCapture: false,
      language: 'zh',
    };

    const dummyBlob = new Blob(['dummy'], { type: 'image/png' });

    try {
      const res = await analyzeImageWithAI(dummyBlob, mockSettings, 'Qwen/Qwen2.5-VL-72B-Instruct');
      expect(res.masterPrompt).toBe('Test master prompt');
      const callArgs = mockFetch.mock.calls[0]!;
      expect(callArgs).toBeDefined();
      const requestBody = JSON.parse(callArgs[1].body as string);
      expect(requestBody.model).toBe('Qwen/Qwen2.5-VL-72B-Instruct');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('should parse textSlots and templatePrompt when present', () => {
    const raw = JSON.stringify({
      textSlots: [
        {
          id: 'slot_headline',
          role: 'headline',
          originalText: '怎么让AI每天自动替我找选题',
          fontStyle: '手写毛笔涂鸦风',
          colorAndEffects: '红黑配色',
          layoutPlacement: '顶部中央大字',
        },
      ],
      subject: ['小黄人', '办公桌'],
      style: ['漫画分镜风格'],
      lighting: ['明亮日光'],
      composition: ['正面特写'],
      masterPrompt: 'Poster with headline "怎么让AI每天自动替我找选题", cartoon style',
      templatePrompt: 'Poster with headline "{{slot_headline}}", cartoon style',
    });

    const parsed = parseStructuredPromptResponse(raw);
    expect(parsed.textSlots).toBeDefined();
    expect(parsed.textSlots?.length).toBe(1);
    expect(parsed.textSlots?.[0]?.originalText).toBe('怎么让AI每天自动替我找选题');
    expect(parsed.templatePrompt).toBe('Poster with headline "{{slot_headline}}", cartoon style');
  });

  it('should successfully repair and parse truncated model JSON with unclosed keys', () => {
    // 模拟真实模型输出被截断在末尾键名处的情况
    const truncatedOutput = `
\`\`\`json
{
  "textSlots": [
    {
      "id": "headline",
      "role": "headline",
      "originalText": "Grok娘带你看X新功能",
      "fontStyle": "bold anime stylized sans-serif with gradient yellow stroke",
      "layout": "top centered large banner",
      "boundingP
`;
    const parsed = parseStructuredPromptResponse(truncatedOutput);
    expect(parsed.textSlots).toBeDefined();
    expect(parsed.textSlots?.[0]?.originalText).toBe('Grok娘带你看X新功能');
    expect(parsed.masterPrompt).toContain('Grok娘带你看X新功能');
    expect(parsed.subject).not.toContain('{');
  });

  it('should rescue fields via Regex Field Harvester when JSON syntax is deeply damaged', () => {
    const severelyDamaged = `
Some reasoning...
"textSlots": [
  { "id": "slot_1", "originalText": "爆款文案抢先看" }
],
"masterPrompt": "Cyberpunk poster with text \\"爆款文案抢先看\\""
Random corrupted output trailing...
`;
    const parsed = parseStructuredPromptResponse(severelyDamaged);
    expect(parsed.textSlots?.[0]?.originalText).toBe('爆款文案抢先看');
    expect(parsed.masterPrompt).toContain('Cyberpunk poster');
  });

  it('should clean literal newlines, deduplicate identical textSlots, and backfill subject/style', () => {
    const rawWithDuplicates = `{
      "textSlots": [
        { "id": "slot_1", "role": "headline", "originalText": "新功能\\\\n小课堂" },
        { "id": "slot_2", "role": "headline", "originalText": "新功能\\\\n小课堂" }
      ]
    }`;
    const parsed = parseStructuredPromptResponse(rawWithDuplicates, 'zh');
    expect(parsed.textSlots?.length).toBe(1);
    expect(parsed.textSlots?.[0]?.originalText).toBe('新功能 小课堂');
    expect(parsed.subject).toContain('新功能 小课堂');
    expect(parsed.style.length).toBeGreaterThan(0);
    expect(parsed.masterPrompt).toContain('新功能 小课堂');
  });
});

describe('AI Service - assembleMasterPrompt and formatStructuredPromptList', () => {
  it('should replace text in templatePrompt with user modified text', () => {
    const assembled = assembleMasterPrompt({
      promptResult: {
        textSlots: [
          {
            id: 'slot_headline',
            role: 'headline',
            originalText: '旧文案',
          },
        ],
        templatePrompt: 'Graphic poster with headline "{{slot_headline}}" in bold letters, retro 70s style',
        masterPrompt: 'Graphic poster with headline "旧文案" in bold letters, retro 70s style',
      },
      userTextMap: {
        slot_headline: '新替换文案',
      },
    });

    expect(assembled).toBe('Graphic poster with headline "新替换文案" in bold letters, retro 70s style');
  });

  it('should replace text in templatePrompt and prepend customSubject if both modified', () => {
    const assembled = assembleMasterPrompt({
      promptResult: {
        subject: ['黄色运动鞋'],
        textSlots: [
          {
            id: 'slot_headline',
            role: 'headline',
            originalText: '50% OFF',
          },
        ],
        style: ['minimalist'],
        templatePrompt: 'Banner with text "{{slot_headline}}"',
        masterPrompt: 'Banner with text "50% OFF"',
      },
      userTextMap: {
        slot_headline: 'NEW ARRIVAL',
      },
      customSubject: '红色皮靴',
    });

    expect(assembled).toBe('红色皮靴, Banner with text "NEW ARRIVAL"');
  });

  it('should prepend customSubject to templatePrompt when user edits subject in text slots mode', () => {
    const assembled = assembleMasterPrompt({
      promptResult: {
        subject: ['原版黄色购物袋'],
        textSlots: [
          {
            id: 'slot_1',
            role: 'headline',
            originalText: 'BIG SALE',
          },
        ],
        templatePrompt: 'Poster with text "{{slot_1}}"',
        masterPrompt: 'Poster with text "BIG SALE"',
      },
      userTextMap: {
        slot_1: 'SUMMER VIBES',
      },
      customSubject: '全新科技感智能手表',
    });

    expect(assembled).toBe('全新科技感智能手表, Poster with text "SUMMER VIBES"');
  });

  it('should format structured dimensions into a clean markdown list', () => {
    const formatted = formatStructuredPromptList({
      textSlots: [
        {
          id: 'slot_1',
          role: 'headline',
          originalText: '大促来了',
          fontStyle: '3D金色字',
          layoutPlacement: '顶部',
        },
      ],
      subject: ['购物袋', '礼盒'],
      selectedStyles: ['电商海报', '高光渲染'],
      selectedComposition: ['居中构图'],
      language: 'zh',
    });

    expect(formatted).toContain('【画面文案】');
    expect(formatted).toContain('"大促来了" (3D金色字 · 顶部)');
    expect(formatted).toContain('【艺术风格】');
    expect(formatted).toContain('电商海报, 高光渲染');
    expect(formatted).toContain('【画面构图】');
    expect(formatted).toContain('居中构图');
    expect(formatted).toContain('【画面主体】');
    expect(formatted).toContain('购物袋, 礼盒');
  });

  it('should support unified adaptive reverse prompt and custom prompt', () => {
    const defaultPrompt = getSystemPrompt('zh');
    expect(defaultPrompt).not.toContain('"textSlots"');
    expect(defaultPrompt).toContain('丰富详实的中文特征短语数组');

    const pureAestheticsZh = getSystemPrompt('zh', PRESET_PURE_AESTHETICS_ID);
    expect(pureAestheticsZh).not.toContain('"textSlots"');
    expect(pureAestheticsZh).toContain('丰富详实的中文特征短语数组');

    const custom = getSystemPrompt('zh', 'custom', 'My custom system prompt');
    expect(custom).toBe('My custom system prompt');
  });

  it('should preserve masterPrompt verbatim in pure aesthetics mode when no modifications were made', () => {
    const naturalMasterPrompt =
      'A cinematic 35mm film photograph of a contemplative woman with auburn hair in golden sunlight, Kodak Portra 400 --v 6.1';
    const assembled = assembleMasterPrompt({
      promptResult: {
        subject: ['从容沉思的红发女性', '温暖日光照射'],
        style: ['35mm 胶片摄影'],
        lighting: ['暖金色自然侧光'],
        composition: ['中景平视'],
        masterPrompt: naturalMasterPrompt,
      },
    });

    expect(assembled).toBe(naturalMasterPrompt);
  });

  it('should prepend customSubject to masterPrompt when user edits subject in pure visual mode', () => {
    const naturalMasterPrompt = 'A portrait of an astronaut on Mars, orange dust atmosphere';
    const assembled = assembleMasterPrompt({
      promptResult: {
        subject: ['火星宇航员'],
        style: ['科幻概念艺术'],
        masterPrompt: naturalMasterPrompt,
      },
      customSubject: 'A young female robotic engineer',
    });

    expect(assembled).toBe('A young female robotic engineer, A portrait of an astronaut on Mars, orange dust atmosphere');
  });
});

describe('analyzeImageWithAI cancellation & timeout', () => {
  const settings: UserSettings = {
    apiKey: 'sk-test-vision-key',
    baseUrl: 'https://api.openai.com/v1',
    model: 'vision-model',
    autoAnalyzeOnCapture: false,
    language: 'zh',
  };
  const blob = new Blob(['dummy'], { type: 'image/png' });

  function hangingFetch() {
    return vi.fn((_url: string, init: RequestInit) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => {
          reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
        });
      })
    );
  }

  it('aborts the underlying fetch when the caller signal is aborted', async () => {
    const originalFetch = globalThis.fetch;
    const mockFetch = hangingFetch();
    globalThis.fetch = mockFetch as any;
    const controller = new AbortController();
    try {
      const pending = analyzeImageWithAI(blob, settings, undefined, undefined, controller.signal);
      await vi.waitFor(() => expect(mockFetch).toHaveBeenCalled());
      expect(mockFetch.mock.calls[0]![1].signal).toBeInstanceOf(AbortSignal);
      controller.abort();
      await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('rejects with a readable timeout error when the request hangs', async () => {
    vi.useFakeTimers();
    const originalFetch = globalThis.fetch;
    globalThis.fetch = hangingFetch() as any;
    try {
      const pending = analyzeImageWithAI(blob, settings);
      const assertion = expect(pending).rejects.toThrow(/超时/);
      await vi.advanceTimersByTimeAsync(ANALYSIS_REQUEST_TIMEOUT_MS + 10);
      await assertion;
    } finally {
      globalThis.fetch = originalFetch;
      vi.useRealTimers();
    }
  });
});

describe('hosted vision model selection', () => {
  const hostedSettings: UserSettings = {
    apiKey: '', baseUrl: '', model: 'deepseek-chat',
    autoAnalyzeOnCapture: false, language: 'zh',
    hostedVisionModel: 'gemini-3.8-flash',
    proMembership: { isPro: true, licenseKey: 'PP-PRO-YEAR-123456', expiresAt: Date.now() + 100000, plan: 'yearly' },
  };

  const mockChatFetch = () =>
    vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers(),
      json: async () => ({ choices: [{ message: { content: 'ok' } }] }),
    });

  it('sends the saved hosted model instead of a bring-your-own model name', async () => {
    const originalFetch = globalThis.fetch;
    const mockFetch = mockChatFetch();
    globalThis.fetch = mockFetch as any;
    try {
      await completeChatWithAI([{ role: 'user', content: 'hi' }], hostedSettings, 'deepseek-chat');
      const [url, init] = mockFetch.mock.calls[0]!;
      expect(url).toContain('/functions/v1/ai-proxy');
      expect(JSON.parse(init.body as string).model).toBe('gemini-3.8-flash');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('honours an explicitly requested hosted model', async () => {
    const originalFetch = globalThis.fetch;
    const mockFetch = mockChatFetch();
    globalThis.fetch = mockFetch as any;
    try {
      await completeChatWithAI([{ role: 'user', content: 'hi' }], hostedSettings, 'kimi-k3');
      expect(JSON.parse(mockFetch.mock.calls[0]![1].body as string).model).toBe('kimi-k3');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe('vision channel without a key', () => {
  it('asks for the key instead of silently using PicPocket credits', async () => {
    const originalFetch = globalThis.fetch;
    const mockFetch = vi.fn();
    globalThis.fetch = mockFetch as any;
    const settings: UserSettings = {
      apiKey: '', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat',
      autoAnalyzeOnCapture: false, language: 'zh',
      visionChannels: [{ id: 'ds', name: 'DeepSeek', providerId: 'deepseek-official', apiKey: '', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' }],
      activeVisionChannelId: 'ds',
      proMembership: { isPro: true, licenseKey: 'PP-PRO-YEAR-123456', expiresAt: Date.now() + 100000, plan: 'yearly' },
    };
    try {
      await expect(completeChatWithAI([{ role: 'user', content: 'hi' }], settings)).rejects.toThrow(/DeepSeek.*API Key/);
      expect(mockFetch).not.toHaveBeenCalled();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ratioToDimension,
  resolveImageApiConfig,
  parseImageResponsePayload,
  generateImagesWithAI,
  generateImagesWithReport,
  convertImageUrlToDataUrl,
} from '../imageGenerator';
import type { UserSettings, ImageGenerationParams } from '@/types';
import { GENERATION_REQUEST_TIMEOUT_MS } from '@/utils/requestTimeout';

describe('imageGenerator resilience', () => {
  const settings: UserSettings = {
    apiKey: 'sk-test',
    baseUrl: 'https://api.example.com/v1',
    model: 'vision',
    autoAnalyzeOnCapture: false,
    language: 'zh',
    imageApiKey: 'sk-image',
    imageBaseUrl: 'https://img.example.com/v1',
    imageModel: 'flux',
  };
  const okResponse = () => ({
    ok: true,
    status: 200,
    headers: new Headers(),
    json: async () => ({ data: [{ b64_json: 'aGVsbG8=' }] }),
  });
  const failResponse = () => ({
    ok: false,
    status: 500,
    headers: new Headers(),
    text: async () => 'upstream exploded',
  });

  it('reports how many images failed when only part of a batch succeeds', async () => {
    const originalFetch = globalThis.fetch;
    let call = 0;
    globalThis.fetch = vi.fn(async () => (call++ === 0 ? okResponse() : failResponse())) as any;
    try {
      const report = await generateImagesWithReport(
        { prompt: 'a cat', aspectRatio: '1:1', count: 3, model: 'flux' } as ImageGenerationParams,
        settings
      );
      expect(report.images).toHaveLength(1);
      expect(report.requestedCount).toBe(3);
      expect(report.failedCount).toBe(2);
      expect(report.firstErrorMessage).toMatch(/500/);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('times out a hanging generation request with a readable error', async () => {
    vi.useFakeTimers();
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn((_url: string, init: RequestInit) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () =>
          reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))
        );
      })
    ) as any;
    try {
      const pending = generateImagesWithAI(
        { prompt: 'a cat', aspectRatio: '1:1', count: 1, model: 'flux' } as ImageGenerationParams,
        settings
      );
      const assertion = expect(pending).rejects.toThrow(/超时/);
      await vi.advanceTimersByTimeAsync(GENERATION_REQUEST_TIMEOUT_MS + 10);
      await assertion;
    } finally {
      globalThis.fetch = originalFetch;
      vi.useRealTimers();
    }
  });

  it('keeps the remote url instead of storing an error page as image data', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async () => ({
      ok: false,
      status: 403,
      blob: async () => new Blob(['<html>denied</html>'], { type: 'text/html' }),
    })) as any;
    try {
      const url = 'https://cdn.example.com/expired.png';
      await expect(convertImageUrlToDataUrl(url)).resolves.toBe(url);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe('imageGenerator service', () => {
  const mockSettings: UserSettings = {
    apiKey: 'sk-test-chat-key',
    baseUrl: 'https://api.openai.com/v1',
    model: 'deepseek-chat',
    autoAnalyzeOnCapture: false,
    language: 'zh',
    imageApiKey: 'sk-test-image-key',
    imageBaseUrl: 'https://api.cheaperinference.com/v1',
    imageModel: 'grok-imagine',
  };

  it('correctly maps all aspect ratios to dimensions', () => {
    expect(ratioToDimension('1:1')).toEqual({ width: 1024, height: 1024, size: '1024x1024' });
    expect(ratioToDimension('16:9')).toEqual({ width: 1792, height: 1024, size: '1792x1024' });
    expect(ratioToDimension('9:16')).toEqual({ width: 1024, height: 1792, size: '1024x1792' });
    expect(ratioToDimension('4:3')).toEqual({ width: 1024, height: 768, size: '1024x768' });
    expect(ratioToDimension('3:4')).toEqual({ width: 768, height: 1024, size: '768x1024' });
    expect(ratioToDimension('21:9')).toEqual({ width: 1792, height: 768, size: '1792x768' });
    expect(ratioToDimension('2:3')).toEqual({ width: 768, height: 1152, size: '768x1152' });
  });

  it('correctly resolves image API config with fallback to primary settings', () => {
    const config = resolveImageApiConfig(mockSettings);
    expect(config.apiKey).toBe('sk-test-image-key');
    expect(config.baseUrl).toBe('https://api.cheaperinference.com/v1');
    expect(config.model).toBe('grok-imagine');

    const fallbackSettings: UserSettings = {
      apiKey: 'sk-fallback-key',
      baseUrl: 'https://api.deepseek.com/v1',
      model: 'deepseek-chat',
      autoAnalyzeOnCapture: false,
      language: 'zh',
    };
    const fallbackConfig = resolveImageApiConfig(fallbackSettings);
    expect(fallbackConfig.apiKey).toBe('sk-fallback-key');
    expect(fallbackConfig.baseUrl).toBe('https://api.deepseek.com/v1');
    expect(fallbackConfig.model).toBe('dall-e-3');
  });

  it('routes a canvas-selected model to its own channel credentials', () => {
    const settings = {
      ...mockSettings,
      imageChannels: [
        { id: 'a', name: 'A', providerId: 'custom', apiKey: 'key-a', baseUrl: 'https://a.example/v1', model: 'model-a', models: ['model-a'] },
        { id: 'b', name: 'B', providerId: 'custom', apiKey: 'key-b', baseUrl: 'https://b.example/v1', model: 'model-b', models: ['model-b'] },
      ],
      activeImageChannelId: 'a',
    };
    expect(resolveImageApiConfig(settings, 'b')).toMatchObject({ apiKey: 'key-b', baseUrl: 'https://b.example/v1' });
  });

  it('sends a selected channel model to that channel endpoint', async () => {
    const channel = { id: 'b', name: 'B', providerId: 'custom', apiKey: 'key-b', baseUrl: 'https://b.example/v1', model: 'model-b1', models: ['model-b1', 'model-b2'] };
    const settings = { ...mockSettings, imageChannels: [channel], activeImageChannelId: 'b' };
    const originalFetch = globalThis.fetch;
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: [{ b64_json: 'image-data' }] }) });
    globalThis.fetch = mockFetch as any;
    try {
      await generateImagesWithAI({ prompt: 'A city', aspectRatio: '1:1', channelId: 'b', model: 'model-b2' }, settings);
      expect(mockFetch).toHaveBeenCalledWith('https://b.example/v1/images/generations', expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer key-b' }),
      }));
      expect(JSON.parse(mockFetch.mock.calls[0]![1].body).model).toBe('model-b2');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('parses b64_json payload into dataUrl', async () => {
    const payload = {
      data: [{ b64_json: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==' }],
    };
    const images = await parseImageResponsePayload(payload);
    expect(images.length).toBe(1);
    expect(images[0]!.startsWith('data:image/png;base64,')).toBe(true);
  });

  it('parses direct url payload', async () => {
    const payload = {
      data: [{ url: 'https://example.com/sample.png' }],
    };
    const images = await parseImageResponsePayload(payload);
    expect(images.length).toBe(1);
    expect(images[0]!).toBe('https://example.com/sample.png');
  });

  it('throws descriptive error if api key is missing', async () => {
    const emptySettings: UserSettings = {
      apiKey: '',
      baseUrl: '',
      model: '',
      autoAnalyzeOnCapture: false,
      language: 'zh',
    };
    const params: ImageGenerationParams = {
      prompt: 'A futuristic city',
      aspectRatio: '1:1',
    };
    await expect(generateImagesWithAI(params, emptySettings)).rejects.toThrow(/API Key/i);
  });

  it('does not send a request from an incomplete image channel', async () => {
    const channel = {
      id: 'custom', name: 'Custom', providerId: 'custom', apiKey: 'channel-key',
      baseUrl: 'https://custom.example/v1', model: '',
    };
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    try {
      await expect(generateImagesWithAI(
        { prompt: 'A city', aspectRatio: '1:1', model: 'old-model' },
        { ...mockSettings, imageChannels: [channel], activeImageChannelId: channel.id, imageModel: '', imageBaseUrl: channel.baseUrl, imageApiKey: channel.apiKey }
      )).rejects.toThrow(/添加生图渠道并选择模型/);
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it('successfully makes OpenAI-compatible request and returns GeneratedImages', async () => {
    const originalFetch = globalThis.fetch;
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [{ b64_json: 'fake_base64_content' }],
      }),
    });
    globalThis.fetch = mockFetch as any;

    const params: ImageGenerationParams = {
      prompt: 'A tiny cute robot',
      aspectRatio: '16:9',
      count: 1,
    };

    try {
      const results = await generateImagesWithAI(params, mockSettings);
      expect(results.length).toBe(1);
      expect(results[0]!.prompt).toBe('A tiny cute robot');
      expect(results[0]!.aspectRatio).toBe('16:9');
      expect(results[0]!.width).toBe(1792);
      expect(results[0]!.height).toBe(1024);
      expect(results[0]!.dataUrl).toBe('data:image/png;base64,fake_base64_content');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.cheaperinference.com/v1/images/generations',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer sk-test-image-key',
          }),
        })
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('routes to Pro managed gateway when user has active Pro membership without own key', () => {
    const proSettings: UserSettings = {
      apiKey: '',
      baseUrl: '',
      model: '',
      autoAnalyzeOnCapture: false,
      language: 'zh',
      proMembership: {
        isPro: true,
        licenseKey: 'PP-PRO-YEAR-123456',
        expiresAt: Date.now() + 100000,
        plan: 'yearly',
      },
    };
    const config = resolveImageApiConfig(proSettings);
    expect(config.isProManaged).toBe(true);
    expect(config.licenseKey).toBe('PP-PRO-YEAR-123456');
    expect(config.baseUrl).toContain('/functions/v1/ai-proxy');
    expect(config.model).toBe('gpt-image-2.5-sunburst');
  });

  it('sends the chosen hosted model to the gateway instead of a bring-your-own model name', async () => {
    const originalFetch = globalThis.fetch;
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers(),
      json: async () => ({ data: [{ b64_json: 'hosted_output' }] }),
    });
    globalThis.fetch = mockFetch as any;
    const hostedSettings: UserSettings = {
      apiKey: '',
      baseUrl: '',
      model: '',
      autoAnalyzeOnCapture: false,
      language: 'zh',
      imageModel: 'dall-e-3',
      hostedImageModel: 'seedream-5-pro',
      proMembership: { isPro: true, licenseKey: 'PP-PRO-YEAR-123456', expiresAt: Date.now() + 100000, plan: 'yearly' },
    };

    try {
      await generateImagesWithAI({ prompt: 'A lighthouse', aspectRatio: '1:1', model: 'dall-e-3' }, hostedSettings);
      const [url, init] = mockFetch.mock.calls[0]!;
      expect(url).toContain('/functions/v1/ai-proxy');
      expect(JSON.parse(init.body as string).model).toBe('seedream-5-pro');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('includes reference image in FormData and targets /images/edits endpoint', async () => {
    const originalFetch = globalThis.fetch;
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [{ b64_json: 'fake_ref_output' }],
      }),
    });
    globalThis.fetch = mockFetch as any;

    const params: ImageGenerationParams = {
      prompt: 'Cyberpunk landscape',
      aspectRatio: '1:1',
      sendAsReferenceImage: true,
      referenceImageDataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    };

    try {
      await generateImagesWithAI(params, mockSettings);
      const callArgs = mockFetch.mock.calls[0]!;
      expect(callArgs).toBeDefined();
      expect(callArgs[0]).toBe('https://api.cheaperinference.com/v1/images/edits');
      const formData = callArgs[1].body as FormData;
      expect(formData).toBeInstanceOf(FormData);
      expect(formData.get('model')).toBe('grok-imagine');
      expect(formData.get('n')).toBe('1');
      expect(formData.get('image')).toBeInstanceOf(File);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('sanitizes tainted user keys containing Chinese text or Bearer prefix', () => {
    const taintedSettings: UserSettings = {
      ...mockSettings,
      imageApiKey: '这是生图Key: ci_live_f2699e54ac59895398e90ff231f9f9cb2541c1829b73567c，请妥善保管',
      imageBaseUrl: 'https://api.cheaperinference.com/v1///',
    };
    const config = resolveImageApiConfig(taintedSettings);
    expect(config.apiKey).toBe('ci_live_f2699e54ac59895398e90ff231f9f9cb2541c1829b73567c');
    expect(config.baseUrl).toBe('https://api.cheaperinference.com/v1');
    expect(/[^\x21-\x7E]/.test(config.apiKey)).toBe(false);
  });

  it('respects params.model and quality parameter overrides', async () => {
    const originalFetch = globalThis.fetch;
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [{ b64_json: 'fake_custom_model_output' }],
      }),
    });
    globalThis.fetch = mockFetch as any;

    const params: ImageGenerationParams = {
      prompt: 'Watercolor sunset',
      aspectRatio: '21:9',
      model: 'black-forest-labs/FLUX.1-schnell',
      quality: 'hd',
    };

    try {
      await generateImagesWithAI(params, mockSettings);
      const callArgs = mockFetch.mock.calls[0]!;
      expect(callArgs).toBeDefined();
      const requestBody = JSON.parse(callArgs[1].body as string);
      expect(requestBody.model).toBe('black-forest-labs/FLUX.1-schnell');
      expect(requestBody.quality).toBe('hd');
      expect(requestBody.size).toBe('1792x768');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('correctly passes AbortSignal to fetch and supports request cancellation', async () => {
    const originalFetch = globalThis.fetch;
    const controller = new AbortController();
    const mockFetch = vi.fn().mockImplementation((_url, options) => {
      // fetch 收到的是「调用方取消 + 请求超时」合并后的派生 signal，需跟随调用方中断
      expect(options.signal).toBeInstanceOf(AbortSignal);
      expect(options.signal.aborted).toBe(false);
      controller.abort();
      expect(options.signal.aborted).toBe(true);
      return Promise.resolve({
        ok: true,
        json: async () => ({ data: [{ b64_json: 'test' }] }),
      });
    });
    globalThis.fetch = mockFetch as any;

    try {
      await generateImagesWithAI(
        { prompt: 'test abort', aspectRatio: '1:1' },
        mockSettings,
        controller.signal
      );
      expect(mockFetch).toHaveBeenCalledTimes(1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('清洗 HTTP 413 网关错误，提供友好中文提示且杜绝 HTML 源码泄漏', async () => {
    const originalFetch = globalThis.fetch;
    const nginxHtmlError = `<html>
<head><title>413 Request Entity Too Large</title></head>
<body>
<center><h1>413 Request Entity Too Large</h1></center>
<hr><center>nginx/1.26.1</center>
</body>
</html>
<!-- a padding to disable MSIE and Chrome friendly error page -->`;

    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 413,
      statusText: 'Payload Too Large',
      text: async () => nginxHtmlError,
    });
    globalThis.fetch = mockFetch as any;

    try {
      await expect(
        generateImagesWithAI(
          { prompt: 'test 413', aspectRatio: '1:1', sendAsReferenceImage: true, referenceImageDataUrl: 'data:image/png;base64,huge' },
          mockSettings
        )
      ).rejects.toThrow(/413.*参考图体积超出/);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('清洗 502/504 等网关返回的原始 HTML 页面，杜绝 HTML 标签进入错误提示', async () => {
    const originalFetch = globalThis.fetch;
    const gatewayHtml = '<html><body>502 Bad Gateway nginx</body></html>';

    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      statusText: 'Bad Gateway',
      text: async () => gatewayHtml,
    });
    globalThis.fetch = mockFetch as any;

    try {
      await expect(
        generateImagesWithAI({ prompt: 'test 502', aspectRatio: '1:1' }, mockSettings)
      ).rejects.toThrow(/502.*网关错误/);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('当选择 count = 2 时，使用 Promise.all 并发发起 2 次独立的单张生成请求 (n: 1)', async () => {
    const originalFetch = globalThis.fetch;
    let callIndex = 0;
    const mockFetch = vi.fn().mockImplementation(() => {
      callIndex++;
      return Promise.resolve({
        ok: true,
        json: async () => ({
          data: [{ b64_json: `fake_output_${callIndex}` }],
        }),
      });
    });
    globalThis.fetch = mockFetch as any;

    try {
      const results = await generateImagesWithAI(
        { prompt: 'Cyberpunk city', aspectRatio: '1:1', count: 2 },
        mockSettings
      );
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(results.length).toBe(2);
      // 验证每次调用的 body 均包含 n: 1
      for (const call of mockFetch.mock.calls) {
        const body = JSON.parse(call[1].body as string);
        expect(body.n).toBe(1);
      }
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('多图并发生成时支持局部成功容错：若 1 成功 1 失败，依然返回成功的图片', async () => {
    const originalFetch = globalThis.fetch;
    let callCount = 0;
    const mockFetch = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            data: [{ b64_json: 'success_image_data' }],
          }),
        });
      } else {
        return Promise.resolve({
          ok: false,
          status: 500,
          text: async () => 'Internal Error',
        });
      }
    });
    globalThis.fetch = mockFetch as any;

    try {
      const results = await generateImagesWithAI(
        { prompt: 'Dual test', aspectRatio: '1:1', count: 2 },
        mockSettings
      );
      expect(results.length).toBe(1);
      expect(results[0]!.dataUrl).toContain('success_image_data');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

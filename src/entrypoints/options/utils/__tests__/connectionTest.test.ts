import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { testApiEndpoint } from '../connectionTest';

describe('testApiEndpoint connection probe', () => {
  const mockT = (key: string) => {
    const dict: Record<string, string> = {
      'settings.enterKeyFirst': '请先输入 API Key',
      'settings.testSuccess': '连接成功！API 服务正常响应',
      'settings.authFailed': '认证失败，请检查 API Key',
      'settings.testFailed': '连接失败: ',
    };
    return dict[key] || key;
  };

  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('should return failed immediately if API key is empty or whitespace', async () => {
    const result = await testApiEndpoint('https://api.deepseek.com/v1', '', mockT);
    expect(result.status).toBe('failed');
    expect(result.message).toBe('请先输入 API Key');
    expect(result.latency).toBeNull();
  });

  it('should return success and calculate latency when endpoint returns 200 OK', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
    } as Response);

    const result = await testApiEndpoint('https://api.deepseek.com/v1', 'sk-valid-key-12345', mockT);
    expect(result.status).toBe('success');
    expect(result.message).toBe('连接成功！API 服务正常响应');
    expect(result.latency).toBeTypeOf('number');
    expect(result.latency).toBeGreaterThanOrEqual(0);
  });

  it('should strictly return failed on 401 or 403 Unauthorized and NOT report success', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
    } as Response);

    const result = await testApiEndpoint('https://api.deepseek.com/v1', 'sk-invalid-key', mockT);
    expect(result.status).toBe('failed');
    expect(result.message).toContain('认证失败');
    expect(result.message).toContain('401');
  });

  it('should return failed on 404 or 500 server errors', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    } as Response);

    const result = await testApiEndpoint('https://api.example.com/v1', 'sk-valid-key', mockT);
    expect(result.status).toBe('failed');
    expect(result.message).toContain('HTTP 404');
  });

  it('should return failed on network fetch exceptions or abort timeout', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Failed to fetch (CORS/Network error)'));

    const result = await testApiEndpoint('https://api.unreachable.com', 'sk-valid-key', mockT);
    expect(result.status).toBe('failed');
    expect(result.message).toContain('Failed to fetch');
  });
});

import { sanitizeHttpHeaderToken, sanitizeHttpUrl } from '@/utils/sanitize';

export interface ConnectionTestResult {
  status: 'idle' | 'testing' | 'success' | 'failed';
  message: string;
  latency: number | null;
}

/**
 * 通用 AI 模型端点连通性测试探针
 * 
 * 严格遵从 HTTP 状态码标准：
 * - res.ok (200~299): 连通成功并记录毫秒级网络往返延迟
 * - 401 / 403: 明确判定为认证/API Key 无效失败，杜绝误报 success
 * - 其余非 2xx: 报告具体 HTTP 状态码与描述
 * - 网络故障/超时: 10s AbortController 超时保护并降级呈现错误
 */
export async function testApiEndpoint(
  baseUrl: string,
  apiKey: string,
  t: (key: any) => string
): Promise<ConnectionTestResult> {
  const cleanKey = sanitizeHttpHeaderToken(apiKey);
  const cleanUrl = sanitizeHttpUrl(baseUrl);

  if (!cleanKey) {
    return {
      status: 'failed',
      message: t('settings.enterKeyFirst'),
      latency: null,
    };
  }

  const startTime = performance.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);

  try {
    const endpoint = `${cleanUrl}/models`;
    const res = await fetch(endpoint, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${cleanKey}`,
      },
      signal: controller.signal,
    });
    clearTimeout(timer);

    const latency = Math.round(performance.now() - startTime);

    if (res.ok) {
      return {
        status: 'success',
        message: t('settings.testSuccess'),
        latency,
      };
    }

    if (res.status === 401 || res.status === 403) {
      return {
        status: 'failed',
        message: `${t('settings.authFailed')} (${res.status})`,
        latency,
      };
    }

    return {
      status: 'failed',
      message: `${t('settings.testFailed')}HTTP ${res.status} ${res.statusText || ''}`.trim(),
      latency,
    };
  } catch (err: any) {
    clearTimeout(timer);
    const latency = Math.round(performance.now() - startTime);
    const isTimeout = err?.name === 'AbortError';
    const errDesc = isTimeout ? 'Timeout (10s)' : (err?.message || String(err));
    return {
      status: 'failed',
      message: `${t('settings.testFailed')}${errDesc}`,
      latency,
    };
  }
}

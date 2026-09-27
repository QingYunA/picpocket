export interface FetchModelsOptions {
  baseUrl: string;
  apiKey?: string;
  signal?: AbortSignal;
}

/**
 * Normalizes a base URL to ensure clean endpoint querying.
 */
export function normalizeBaseUrl(rawUrl: string): string {
  let url = rawUrl.trim();
  if (!url) return '';
  if (!/^https?:\/\//i.test(url)) {
    url = `https://${url}`;
  }
  return url.replace(/\/+$/, '');
}

/**
 * Fetches available model IDs from an OpenAI-compatible /models endpoint.
 */
export async function fetchAvailableModels({
  baseUrl,
  apiKey,
  signal,
}: FetchModelsOptions): Promise<string[]> {
  const normalized = normalizeBaseUrl(baseUrl);
  if (!normalized) {
    throw new Error('请输入有效的 Base URL 接口基地址');
  }

  const endpoint = `${normalized}/models`;
  const headers: Record<string, string> = {
    Accept: 'application/json',
  };

  if (apiKey?.trim()) {
    headers.Authorization = `Bearer ${apiKey.trim()}`;
  }

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'GET',
      headers,
      signal,
    });
  } catch (err: any) {
    if (err.name === 'AbortError') {
      throw new Error('请求已取消');
    }
    throw new Error(`连接接口失败: ${err.message || '网络无法连接'}`);
  }

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new Error(`身份验证失败 (${response.status})：请检查 API Key 是否正确填写且具备权限`);
    }
    if (response.status === 404) {
      throw new Error(`端点未找到 (404)：服务商可能未开放 /models 列表接口，可直接手动输入模型`);
    }
    throw new Error(`获取模型列表失败: HTTP ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  const modelIds: string[] = [];

  // 1. Standard OpenAI shape: { data: [ { id: "model-name" } ] }
  if (Array.isArray(data?.data)) {
    for (const item of data.data) {
      if (typeof item === 'string' && item.trim()) {
        modelIds.push(item.trim());
      } else if (item && typeof item.id === 'string' && item.id.trim()) {
        modelIds.push(item.id.trim());
      }
    }
  }
  // 2. Google / alternative shape: { models: [ { id / name: "model-name" } ] }
  else if (Array.isArray(data?.models)) {
    for (const item of data.models) {
      if (typeof item === 'string' && item.trim()) {
        modelIds.push(item.trim());
      } else if (item && typeof item.id === 'string' && item.id.trim()) {
        modelIds.push(item.id.trim());
      } else if (item && typeof item.name === 'string' && item.name.trim()) {
        modelIds.push(item.name.replace(/^models\//, '').trim());
      }
    }
  }
  // 3. Raw array of models: [ "model-1" ] or [ { id: "model-1" } ]
  else if (Array.isArray(data)) {
    for (const item of data) {
      if (typeof item === 'string' && item.trim()) {
        modelIds.push(item.trim());
      } else if (item && typeof item.id === 'string' && item.id.trim()) {
        modelIds.push(item.id.trim());
      }
    }
  }

  const unique = Array.from(new Set(modelIds)).sort((a, b) => a.localeCompare(b));
  if (unique.length === 0) {
    throw new Error('接口未返回任何可用模型，请手动输入模型名称');
  }

  return unique;
}

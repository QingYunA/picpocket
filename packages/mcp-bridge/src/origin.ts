/**
 * WebSocket 握手来源校验。必须解析出 hostname 后精确比较：
 * 用 includes('localhost') 判断时，https://localhost.evil.com 这类外部站点也会通过，
 * 进而凭公开的默认 Token 抢占扩展连接、窃取 Agent 的工具调用。
 */
const LOCAL_DEV_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

export function isAllowedBridgeOrigin(origin: string | undefined, expectedExtensionId?: string): boolean {
  if (!origin) return false;
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }

  if (url.protocol === 'chrome-extension:') {
    return !expectedExtensionId || url.hostname.toLowerCase() === expectedExtensionId.toLowerCase();
  }
  if (url.protocol === 'http:' || url.protocol === 'https:') {
    return LOCAL_DEV_HOSTS.has(url.hostname);
  }
  return false;
}
